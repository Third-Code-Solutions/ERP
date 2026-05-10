import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Rate limiting — in-memory sliding window per IP (Edge-compatible)
// For production, replace with Upstash Redis or Vercel KV.
// ---------------------------------------------------------------------------
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_UNAUTH   = 100     // requests per window, unauthenticated
const RATE_LIMIT_AUTH     = 1_000   // requests per window, authenticated

// Edge-compatible map (resets on cold start; acceptable for MVP rate limiting)
const requestCounts = new Map<string, { count: number; windowStart: number }>()

function isRateLimited(ip: string, authenticated: boolean): boolean {
  const limit = authenticated ? RATE_LIMIT_AUTH : RATE_LIMIT_UNAUTH
  const now = Date.now()
  const entry = requestCounts.get(ip)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestCounts.set(ip, { count: 1, windowStart: now })
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
  // In prod the nonce path is strict.
  const isDev = process.env.NODE_ENV !== 'production'
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-eval' 'unsafe-inline' 'nonce-${nonce}'`
    : `script-src 'self' 'nonce-${nonce}'`

  return [
    "default-src 'self'",
    scriptSrc,
    // 'self' covers next/font self-hosted fonts. fonts.googleapis.com is allowed
    // for any external <link> that slips in (e.g. browser extensions); the CSP
    // is informational rather than restrictive on style sources here.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.inngest.com https://api.openai.com",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "upgrade-insecure-requests",
  ].join('; ')
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const nonce = generateNonce()

  // Supabase session refresh (must happen before auth checks)
  let supabaseResponse = NextResponse.next({ request })

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
          supabaseResponse = NextResponse.next({ request })
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
  if (isRateLimited(ip, !!user)) {
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

  // Attach nonce to request headers so server components can read it
  supabaseResponse.headers.set('x-nonce', nonce)

  // Security headers on every response
  supabaseResponse.headers.set('Content-Security-Policy', buildCSP(nonce))
  supabaseResponse.headers.set('X-Content-Type-Options', 'nosniff')
  supabaseResponse.headers.set('X-Frame-Options', 'DENY')
  supabaseResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  supabaseResponse.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  supabaseResponse.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')

  return supabaseResponse
}

function isProtectedRoute(pathname: string): boolean {
  const protectedPrefixes = [
    '/projects',
    '/pipeline',
    '/bom',
    '/invoices',
    '/purchase-orders',
    '/documents',
    '/reports',
    '/settings',
    '/procurement',
  ]
  return protectedPrefixes.some((prefix) => pathname.startsWith(prefix))
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
