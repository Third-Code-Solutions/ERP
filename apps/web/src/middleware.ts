import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { requestRateLimitKey } from '@/lib/request-rate-limit'
import { isProtectedRoute } from '@/lib/protected-route'

// ---------------------------------------------------------------------------
// Rate limiting — in-memory sliding window per IP (Edge-compatible)
// For production, replace with Upstash Redis or Vercel KV.
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_UNAUTH   = 100     // requests per window, unauthenticated
const RATE_LIMIT_AUTH     = 1_000   // requests per window, authenticated

// Edge-compatible map (resets on cold start; acceptable for MVP rate limiting)
const requestCounts = new Map<string, { count: number; windowStart: number }>()

function isRateLimited(key: string, authenticated: boolean): boolean {
  const limit = authenticated ? RATE_LIMIT_AUTH : RATE_LIMIT_UNAUTH
  const now = Date.now()
  const entry = requestCounts.get(key)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestCounts.set(key, { count: 1, windowStart: now })
    return false
  }

  entry.count += 1
  if (entry.count > limit) return true
  return false
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

  return [
    "default-src 'self'",
    scriptSrc,
    // Next.js / next-themes inject inline <style> tags without a nonce. Keep
    // 'unsafe-inline' on style-src — modern browsers do not yet treat it as
    // unsafe in the way they treat inline scripts.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://api.fontshare.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com https://cdn.fontshare.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.inngest.com https://api.openai.com https://vitals.vercel-insights.com",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join('; ')
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
  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  })

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
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          })
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options)
          }
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Rate limiting
  if (isRateLimited(requestRateLimitKey(ip, user?.id), !!user)) {
    return new NextResponse('Too Many Requests', {
      status: 429,
      headers: {
        'Retry-After': '60',
        'X-RateLimit-Limit': String(user ? RATE_LIMIT_AUTH : RATE_LIMIT_UNAUTH),
        'Content-Type': 'text/plain',
      },
    })
  }

  // Auth redirects
  if (user && pathname.startsWith('/auth')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (!user && pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  if (!user && isProtectedRoute(pathname)) {
    return NextResponse.redirect(new URL('/auth/login', request.url))
  }

  // Security headers on every rendered response
  supabaseResponse.headers.set('x-nonce', nonce)
  supabaseResponse.headers.set('Content-Security-Policy', csp)
  supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff')
  supabaseResponse.headers.set('X-Frame-Options', 'DENY')
  supabaseResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  supabaseResponse.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  supabaseResponse.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
