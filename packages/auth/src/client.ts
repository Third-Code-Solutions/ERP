import { createBrowserClient } from '@supabase/ssr'
import { supabaseAuthCookieOptions } from './cookie-options'

type SupabaseBrowserClient = ReturnType<typeof createBrowserClient>

/**
 * The session cookies have to stay readable by page scripts: @supabase/ssr
 * stores the session in cookies and the browser client refreshes the token from
 * them, so `httpOnly` cannot be set here. `secure` is set through
 * `supabaseAuthCookieOptions` (the library pins only `maxAge` — see
 * `DEFAULT_COOKIE_OPTIONS` in @supabase/ssr).
 *
 * "Keep me signed in" is deliberately NOT expressed here: the library
 * overwrites `cookieOptions.maxAge` with its own 400-day value in both the
 * browser and server storage adapters, so the choice is recorded and enforced
 * in apps/web/src/lib/session-persistence.ts instead.
 */
let cached: SupabaseBrowserClient | null = null

export function createSupabaseBrowserClient(): SupabaseBrowserClient {
  if (cached) return cached

  cached = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: supabaseAuthCookieOptions() }
  )

  return cached
}
