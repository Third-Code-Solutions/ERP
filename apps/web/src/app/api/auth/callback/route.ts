import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'

import {
  createRecoveryMarker,
  RECOVERY_MARKER_COOKIE,
  RECOVERY_MARKER_MAX_AGE_SECONDS,
} from '@/lib/auth-recovery-binding'

import { resolveAuthCallbackPath } from './redirect'

// auth-js returns redirectType at runtime but omits it from the public exchange
// response type, so validate that recovery-only boundary explicitly.
const recoveryExchangeSchema = z.object({
  redirectType: z.literal('recovery'),
})

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = resolveAuthCallbackPath(searchParams.get('next'))

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Parameters<typeof cookieStore.set>[2] }[]) {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          },
        },
      }
    )

    let exchange: Awaited<ReturnType<typeof supabase.auth.exchangeCodeForSession>>
    try {
      exchange = await supabase.auth.exchangeCodeForSession(code)
    } catch {
      return NextResponse.redirect(
        new URL('/auth/login?error=auth_callback_failed', origin)
      )
    }

    if (!exchange.error) {
      const response = NextResponse.redirect(new URL(next, origin))
      if (next === '/auth/update-password') {
        if (!recoveryExchangeSchema.safeParse(exchange.data).success) {
          return NextResponse.redirect(new URL('/dashboard', origin))
        }

        const session = exchange.data.session
        const user = exchange.data.user
        let marker: string | null = null
        if (session && user?.recovery_sent_at) {
          try {
            const claimsResult = await supabase.auth.getClaims(
              session.access_token
            )
            const claims = claimsResult.data?.claims
            if (
              claims?.sub === user.id &&
              typeof claims.session_id === 'string'
            ) {
              marker = await createRecoveryMarker({
                userId: user.id,
                sessionId: claims.session_id,
                accessToken: session.access_token,
                recoverySentAt: user.recovery_sent_at,
              })
            }
          } catch {
            marker = null
          }
        }

        if (!marker) {
          return NextResponse.redirect(new URL('/dashboard', origin))
        }

        response.cookies.set(RECOVERY_MARKER_COOKIE, marker, {
          httpOnly: true,
          maxAge: RECOVERY_MARKER_MAX_AGE_SECONDS,
          path: '/auth/update-password',
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
        })
      }
      return response
    }
  }

  return NextResponse.redirect(
    new URL('/auth/login?error=auth_callback_failed', origin)
  )
}
