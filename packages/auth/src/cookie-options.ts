/**
 * Options for every Supabase auth cookie the app writes or removes (SEC-14).
 * @supabase/ssr merges them into each session cookie; it pins `maxAge` itself
 * but leaves `secure` unset, so `secure` must be passed or the cookies also
 * travel over plain HTTP. One source for the browser, server, middleware and
 * auth-callback clients. Next inlines `NODE_ENV` at build time; a function lets
 * tests set it. Never add `maxAge`: the middleware spreads these into cookie
 * removals, where a `maxAge` would replace the expiry and keep the cookie.
 */
export function supabaseAuthCookieOptions(): {
  path: '/'
  sameSite: 'lax'
  secure: boolean
} {
  return {
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  }
}
