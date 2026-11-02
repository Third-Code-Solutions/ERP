import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import {
  consumeRequestRateLimit as consumeLocalRequestRateLimit,
  requestRateLimitKey,
  requestRateLimitPolicy,
  storeLocalRequestRateLimitEntry,
} from '@/lib/request-rate-limit'
import {
  consumeDistributedRateLimit,
  distributedRateLimitConfiguration,
} from '@/lib/distributed-request-rate-limit'
import { isProtectedRoute } from '@/lib/protected-route'
import {
  isInvalidRefreshTokenError,
  isSupabaseAuthCookieName,
} from '@/lib/supabase-session-recovery'
import {
  recoveryMarkerMatches,
  RECOVERY_MARKER_COOKIE,
} from '@/lib/auth-recovery-binding'
import {
  isSessionChoiceExpired,
  parseSessionChoice,
  SESSION_CHOICE_COOKIE,
  SESSION_LIVE_COOKIE,
} from '@/lib/session-persistence'

// ---------------------------------------------------------------------------
// Local limiter — compatibility only when distributed enforcement is disabled.
// It resets per Edge isolate and must never be represented as global protection.
// ---------------------------------------------------------------------------
const localRequestCounts = new Map<
  string,
  { count: number; windowStart: number }
>()

type RateLimitDecision =
  | {
      outcome: 'allowed' | 'limited'
      count: number
      retryAfterSeconds: number
    }
  | { outcome: 'unavailable' }

async function consumeRateLimit(
  key: string,
  policy: ReturnType<typeof requestRateLimitPolicy>
): Promise<RateLimitDecision> {
  const distributedConfiguration = distributedRateLimitConfiguration()
  if (distributedConfiguration.mode === 'invalid') {
    return { outcome: 'unavailable' }
  }

  if (distributedConfiguration.mode === 'configured') {
    const result = await consumeDistributedRateLimit(
      distributedConfiguration,
      key,
      policy
    )
    if (result.outcome === 'unavailable') return result
    return result
  }

  const result = consumeLocalRequestRateLimit(
    localRequestCounts.get(key),
    policy
  )
  storeLocalRequestRateLimitEntry(localRequestCounts, key, result.entry)
  return {
    outcome: result.limited ? 'limited' : 'allowed',
    count: result.entry.count,
    retryAfterSeconds: result.limited
      ? Math.max(1, Math.ceil(policy.windowMs / 1_000))
      : 0,
  }
}

function rateLimitHeaders(
  policy: ReturnType<typeof requestRateLimitPolicy>,
  retryAfterSeconds: number,
  count?: number
): HeadersInit {
  const headers: Record<string, string> = {
    'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))),
    'RateLimit-Limit': String(policy.limit),
    'RateLimit-Reset': String(Math.max(1, Math.ceil(retryAfterSeconds))),
    'RateLimit-Scope': policy.bucket,
    'Cache-Control': 'private, no-store, max-age=0',
    'Content-Type': 'text/plain',
  }
  if (count !== undefined) {
    headers['RateLimit-Remaining'] = String(
      Math.max(0, policy.limit - count)
    )
  }
  return headers
}

// ---------------------------------------------------------------------------
// CSP nonce — per-request random value for inline scripts/styles
// ---------------------------------------------------------------------------
function generateNonce(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return btoa(String.fromCharCode(...array))
}

function buildCSP(nonce: string): string {
  // In dev we must allow eval + inline scripts for HMR/Fast Refresh.
  const isDev = process.env.NODE_ENV !== 'production'
  // 'strict-dynamic' lets the nonced framework bootstrap chain-load route
  // chunks without each needing its own nonce. Do NOT re-add bare `https:` or
  // `'unsafe-inline'` "for safety": any browser that honours a nonce already
  // ignores 'unsafe-inline', and a bare `https:` source would let every HTTPS
  // origin on the internet execute script wherever the nonce path is not
  // supported. The previous pair weakened the policy without protecting
  // anything.
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-eval' 'unsafe-inline' 'nonce-${nonce}'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
  let localSupabaseConnectSrc = ''
  if (isDev) {
    try {
      const supabaseUrl = new URL(
        process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
      )
      if (
        supabaseUrl.hostname === '127.0.0.1' ||
        supabaseUrl.hostname === 'localhost' ||
        supabaseUrl.hostname === '[::1]'
      ) {
        const websocketProtocol =
          supabaseUrl.protocol === 'https:' ? 'wss:' : 'ws:'
        localSupabaseConnectSrc =
          ` ${supabaseUrl.origin} ${websocketProtocol}//${supabaseUrl.host}`
      }
    } catch {
      // Invalid/missing local URL: retain the closed production-oriented CSP.
    }
  }
  let coreConnectSrc = ''
  try {
    const coreUrl = new URL(process.env.ERP_CORE_API_URL ?? '')
    const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(coreUrl.hostname)
    const allowedProtocol =
      (coreUrl.protocol === 'https:' && (!isLoopback || isDev)) ||
      (process.env.NODE_ENV === 'development' && isLoopback && coreUrl.protocol === 'http:')
    if (allowedProtocol && !coreUrl.username && !coreUrl.password && !/[\s;*]/.test(coreUrl.origin)) {
      // Uploads connect directly to Core; paths and credentials must never become CSP sources.
      coreConnectSrc = ` ${coreUrl.origin}`
    }
  } catch {
    // Missing/invalid installation configuration cannot widen browser connections.
  }

  return [
    "default-src 'self'",
    scriptSrc,
    // Next.js / next-themes inject inline <style> tags without a nonce. Keep
    // 'unsafe-inline' on style-src — modern browsers do not yet treat it as
    // unsafe in the way they treat inline scripts.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com",
    // Imagery is served from the platform itself: Supabase Storage objects,
    // data: URIs and generated blob previews. A bare `https:` source let any
    // host supply images to authenticated screens.
    "img-src 'self' data: blob: https://*.supabase.co",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com",
    // No browser-side code calls OpenAI: model traffic is server-only. The
    // origin was allowlisted in error and widened the exfiltration surface.
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.inngest.com https://vitals.vercel-insights.com${localSupabaseConnectSrc}${coreConnectSrc}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
    // Without a collector, violations are silent in production.
    'report-uri /api/csp-report',
    'report-to csp-endpoint',
  ].join('; ')
}

function buildSupabaseResponse(
  requestHeaders: Headers
): NextResponse {
  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

function applySecurityHeaders(
  response: NextResponse,
  nonce: string,
  csp: string
): NextResponse {
  // x-nonce is intentionally published: it is the same value the
  // Content-Security-Policy header already carries, so it discloses nothing an
  // attacker cannot read from the response they were served.
  response.headers.set('x-nonce', nonce)
  response.headers.set('Content-Security-Policy', csp)
  response.headers.set('Reporting-Endpoints', 'csp-endpoint="/api/csp-report"')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set(
    'Referrer-Policy',
    'strict-origin-when-cross-origin'
  )
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()'
  )
  // Coop/CORP: the console is never framed or embedded elsewhere, and it loads
  // no cross-origin opener-dependent resources. COEP is deliberately NOT set —
  // require-corp would block the Supabase-hosted objects authenticated screens
  // depend on, and credentialless buys nothing here.
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin')
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains'
  )
  return response
}

function redirectToLogin(
  request: NextRequest,
  staleAuthCookieNames: readonly string[],
  nonce: string,
  csp: string
): NextResponse {
  const redirect = NextResponse.redirect(
    new URL('/auth/login', request.url)
  )
  for (const name of staleAuthCookieNames) {
    redirect.cookies.delete(name)
  }
  return applySecurityHeaders(redirect, nonce, csp)
}

function platformAccessResponse(
  status: 403 | 503,
  nonce: string,
  csp: string
): NextResponse {
  const unavailable = status === 503
  const response = new NextResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${unavailable ? 'Platform console unavailable' : 'Platform access denied'}</title></head><body style="margin:0;background:#f4f1ea;color:#171a1f;font-family:system-ui,sans-serif"><main style="max-width:640px;margin:12vh auto;padding:40px"><p style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#7a6952">ABI OPS · Platform Control</p><h1>${unavailable ? 'The platform authority check is unavailable.' : 'This account does not have platform authority.'}</h1><p>${unavailable ? 'No privileged data was loaded. Retry after the identity service is healthy.' : 'Tenant roles, including owner and admin, cannot open the platform console.'}</p><a href="/dashboard" style="color:#8a4f2d">Return to your workspace</a></main></body></html>`,
    {
      status,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Type': 'text/html; charset=utf-8',
      },
    }
  )
  return applySecurityHeaders(response, nonce, csp)
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const nonce = generateNonce()
  const csp = buildCSP(nonce)

  // Monitoring probes must not depend on Supabase Auth session refresh or the
  // per-instance request limiter. /api/ready performs its own database check.
  // They still receive the security headers: probes that answered without HSTS
  // produced the inconsistent Strict-Transport-Security the QA audit flagged.
  if (pathname === '/api/health' || pathname === '/api/ready') {
    return applySecurityHeaders(NextResponse.next(), nonce, csp)
  }

  // Propagate nonce + CSP through REQUEST headers. Next.js inspects the
  // Content-Security-Policy request header during render and applies the
  // nonce to its own inline framework scripts. Without this, the rendered
  // <script nonce=…> never matches the CSP nonce in the response header
  // and the browser blocks every Next.js bootstrap script.
  //
  // We also forward the pathname so the (dashboard) layout can run a
  // role-aware path-level RBAC gate via canViewPath().
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('x-pathname', pathname)
  requestHeaders.set('Content-Security-Policy', csp)

  // Supabase session refresh (must happen before auth checks). The response
  // we return is rebuilt whenever Supabase writes refreshed auth cookies, so
  // we route every NextResponse.next() through this factory to guarantee the
  // modified request headers (including the nonce) survive each rebuild.
  let supabaseResponse = buildSupabaseResponse(requestHeaders)
  let staleAuthCookieNames: string[] = []

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Parameters<typeof supabaseResponse.cookies.set>[2] }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          supabaseResponse = buildSupabaseResponse(requestHeaders)
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>['data']['user'] =
    null
  try {
    const result = await supabase.auth.getUser()
    user = result.data.user
  } catch (error) {
    // A revoked/expired refresh token must not turn every request into a
    // server exception. Remove only Supabase auth cookies, then continue as
    // anonymous so protected routes still redirect through the normal gate.
    if (!isInvalidRefreshTokenError(error)) throw error

    staleAuthCookieNames = request.cookies
      .getAll()
      .map(({ name }) => name)
      .filter(isSupabaseAuthCookieName)
    for (const name of staleAuthCookieNames) {
      request.cookies.delete(name)
    }
    requestHeaders.set('cookie', request.cookies.toString())
    supabaseResponse = buildSupabaseResponse(requestHeaders)
    for (const name of staleAuthCookieNames) {
      supabaseResponse.cookies.delete(name)
    }
  }

  // "Keep me signed in" is enforced here, not by cookie lifetime: @supabase/ssr
  // pins the auth cookies to its own 400-day Max-Age and overwrites any
  // `cookieOptions.maxAge` a caller passes, so a session the user chose not to
  // remember would otherwise survive a browser restart. No record means the
  // session came from another flow (magic link, invitation, password recovery)
  // and is left alone.
  const sessionChoice = parseSessionChoice(
    request.cookies.get(SESSION_CHOICE_COOKIE)?.value
  )
  if (
    user &&
    sessionChoice &&
    isSessionChoiceExpired(
      sessionChoice,
      request.cookies.has(SESSION_LIVE_COOKIE)
    )
  ) {
    const expiredSessionCookieNames = request.cookies
      .getAll()
      .map(({ name }) => name)
      .filter(isSupabaseAuthCookieName)
    for (const name of expiredSessionCookieNames) {
      request.cookies.delete(name)
    }
    requestHeaders.set('cookie', request.cookies.toString())
    supabaseResponse = buildSupabaseResponse(requestHeaders)
    for (const name of expiredSessionCookieNames) {
      supabaseResponse.cookies.delete(name)
    }
    return redirectToLogin(
      request,
      [
        ...expiredSessionCookieNames,
        SESSION_CHOICE_COOKIE,
        SESSION_LIVE_COOKIE,
      ],
      nonce,
      csp
    )
  }

  // Rate limiting
  const rateLimitPolicy = requestRateLimitPolicy(pathname, !!user)
  const rateLimitKey = `${requestRateLimitKey(ip, user?.id)}:${rateLimitPolicy.bucket}`
  const rateLimitDecision = await consumeRateLimit(
    rateLimitKey,
    rateLimitPolicy
  )
  if (rateLimitDecision.outcome === 'unavailable') {
    const response = new NextResponse('Rate limit service unavailable', {
      status: 503,
      headers: rateLimitHeaders(rateLimitPolicy, 1),
    })
    return applySecurityHeaders(response, nonce, csp)
  }

  if (rateLimitDecision.outcome === 'limited') {
    const response = new NextResponse('Too Many Requests', {
      status: 429,
      headers: rateLimitHeaders(
        rateLimitPolicy,
        rateLimitDecision.retryAfterSeconds,
        rateLimitDecision.count
      ),
    })
    return applySecurityHeaders(response, nonce, csp)
  }

  // Password recovery is the one authenticated route inside the public auth
  // group. The callback establishes a short-lived recovery session before the
  // user can call updateUser(), so redirecting that session to the dashboard
  // would make password recovery impossible.
  const isPasswordRecoveryRoute = pathname === '/auth/update-password'
  let hasPasswordRecoveryMarker = false
  if (isPasswordRecoveryRoute && user?.recovery_sent_at) {
    try {
      const sessionResult = await supabase.auth.getSession()
      const accessToken = sessionResult.data.session?.access_token
      const claimsResult = accessToken
        ? await supabase.auth.getClaims(accessToken)
        : null
      const claims = claimsResult?.data?.claims
      if (
        accessToken &&
        claims?.sub === user.id &&
        typeof claims.session_id === 'string'
      ) {
        hasPasswordRecoveryMarker = await recoveryMarkerMatches(
          request.cookies.get(RECOVERY_MARKER_COOKIE)?.value,
          {
            userId: user.id,
            sessionId: claims.session_id,
            accessToken,
            recoverySentAt: user.recovery_sent_at,
          }
        )
      }
    } catch {
      hasPasswordRecoveryMarker = false
    }
  }

  if (isPasswordRecoveryRoute && (!user || !hasPasswordRecoveryMarker)) {
    if (!user) {
      return redirectToLogin(request, staleAuthCookieNames, nonce, csp)
    }
    return applySecurityHeaders(
      NextResponse.redirect(new URL('/settings/profile', request.url)),
      nonce,
      csp
    )
  }

  // Auth redirects
  if (user && pathname.startsWith('/auth') && !isPasswordRecoveryRoute && pathname !== '/auth/accept-invite') {
    return applySecurityHeaders(
      NextResponse.redirect(new URL('/dashboard', request.url)),
      nonce,
      csp
    )
  }

  if (!user && pathname.startsWith('/dashboard')) {
    return redirectToLogin(request, staleAuthCookieNames, nonce, csp)
  }

  if (!user && isProtectedRoute(pathname)) {
    return redirectToLogin(request, staleAuthCookieNames, nonce, csp)
  }

  if (user && (pathname === '/platform-admin' || pathname.startsWith('/platform-admin/'))) {
    if (
      !user.email ||
      !user.email_confirmed_at
    ) {
      return platformAccessResponse(403, nonce, csp)
    }
    const { data: isOwner, error: ownerError } = await supabase.rpc(
      'is_platform_owner'
    )
    if (ownerError) return platformAccessResponse(503, nonce, csp)
    if (isOwner !== true) return platformAccessResponse(403, nonce, csp)
    supabaseResponse.headers.set(
      'Cache-Control',
      'private, no-store, max-age=0'
    )
  }

  // Security headers on every rendered response
  return applySecurityHeaders(supabaseResponse, nonce, csp)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
