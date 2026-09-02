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
  // In prod the nonce path is strict and uses 'strict-dynamic' so the
  // nonced framework bootstrap can chain-load route chunks without each
  // needing its own nonce. http: + https: are CSP3 fallbacks ignored by
  // browsers that honor 'strict-dynamic'.
  const isDev = process.env.NODE_ENV !== 'production'
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-eval' 'unsafe-inline' 'nonce-${nonce}'`
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'`
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

  return [
    "default-src 'self'",
    scriptSrc,
    // Next.js / next-themes inject inline <style> tags without a nonce. Keep
    // 'unsafe-inline' on style-src — modern browsers do not yet treat it as
    // unsafe in the way they treat inline scripts.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com",
    `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.inngest.com https://api.openai.com https://vitals.vercel-insights.com${localSupabaseConnectSrc}`,
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
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
  response.headers.set('x-nonce', nonce)
  response.headers.set('Content-Security-Policy', csp)
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

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Monitoring probes must not depend on Supabase Auth session refresh or the
  // per-instance request limiter. /api/ready performs its own database check.
  if (pathname === '/api/health' || pathname === '/api/ready') {
    return NextResponse.next()
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const nonce = generateNonce()
  const csp = buildCSP(nonce)

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
  if (user && pathname.startsWith('/auth') && !isPasswordRecoveryRoute) {
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

  // Security headers on every rendered response
  return applySecurityHeaders(supabaseResponse, nonce, csp)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
