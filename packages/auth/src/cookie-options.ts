/**
 * Options for every Supabase auth cookie the app writes or removes (SEC-14).
 * @supabase/ssr merges them into each session cookie; it pins `maxAge` itself
 * but leaves `secure` unset, so `secure` must be passed or the cookies also
 * travel over plain HTTP. One source for the browser, server, middleware and
 * auth-callback clients. A function, so `NODE_ENV` is read when it is used.
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
