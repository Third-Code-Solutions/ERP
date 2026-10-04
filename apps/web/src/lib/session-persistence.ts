/**
 * "Keep me signed in" — recorded here, enforced in middleware.
 *
 * The choice cannot be expressed through the auth cookies themselves:
 * @supabase/ssr pins their `maxAge` to a 400-day default and overwrites any
 * `cookieOptions.maxAge` the caller passes (see `createStorageFromOptions` and
 * `applyServerStorage` in @supabase/ssr 0.6.x). That is why the login form's
 * checkbox previously changed nothing. So the answer travels in its own cookie
 * pair, and the server — not the cookie lifetime — decides when the session is
 * over.
 *
 * `erp-session` — the durable record of the choice. It deliberately outlives
 *   the browser session: it is what lets the server tell "this session was
 *   meant to end when the browser closed" apart from "this session was meant to
 *   last seven days".
 * `erp-session-live` — session-scoped, written without a Max-Age. It exists
 *   only while the browser that signed in is still open, so its absence on a
 *   later visit is precisely the signal that a non-remembered session is over.
 *
 * Neither cookie carries a secret or grants anything on its own; they only
 * describe an intent, and a session that fails this check is signed out rather
 * than trusted.
 */
export const SESSION_CHOICE_COOKIE = 'erp-session'
export const SESSION_LIVE_COOKIE = 'erp-session-live'

export const REMEMBERED_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60

/**
 * The record must outlive the browser session it describes, otherwise a
 * non-remembered session stops being enforced the first time the browser
 * restarts. It matches the lifetime the library gives the auth cookies so the
 * two never disagree about whether a record exists.
 */
const CHOICE_RECORD_MAX_AGE_SECONDS = 400 * 24 * 60 * 60

export type SessionChoice =
  | { kind: 'remember'; expiresAt: number }
  | { kind: 'session' }

export function parseSessionChoice(
  value: string | undefined
): SessionChoice | null {
  if (!value) return null
  if (value === 'session') return { kind: 'session' }

  const [prefix, expiresAt] = value.split('.')
  if (prefix !== 'remember') return null

  const parsed = Number(expiresAt)
  if (!Number.isFinite(parsed) || parsed <= 0) return null

  return { kind: 'remember', expiresAt: parsed }
}

export function serializeSessionChoice(choice: SessionChoice): string {
  return choice.kind === 'remember' ? `remember.${choice.expiresAt}` : 'session'
}

/**
 * A session is over when the record says so: a non-remembered session whose
 * browser-scoped companion cookie is gone, or a remembered session past its
 * seventh day.
 */
export function isSessionChoiceExpired(
  choice: SessionChoice,
  liveCookiePresent: boolean
): boolean {
  if (choice.kind === 'session') return !liveCookiePresent
  return Date.now() >= choice.expiresAt
}

/**
 * Client-side counterpart, called by the login form before it authenticates.
 * `document.cookie` is used directly because the write has to happen before
 * sign-in — the auth cookies are written by the library during
 * `signInWithPassword`, so there is no response to attach a header to.
 */
export function rememberSessionChoice(
  remember: boolean,
  now: number = Date.now()
): void {
  if (typeof document === 'undefined') return

  const choice: SessionChoice = remember
    ? { kind: 'remember', expiresAt: now + REMEMBERED_SESSION_MAX_AGE_SECONDS * 1000 }
    : { kind: 'session' }

  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  document.cookie = `${SESSION_CHOICE_COOKIE}=${serializeSessionChoice(choice)}; Path=/; SameSite=Lax; Max-Age=${CHOICE_RECORD_MAX_AGE_SECONDS}${secure}`

  // No Max-Age: the browser drops this one when it closes, which is what makes
  // a non-remembered session non-persistent.
  document.cookie = `${SESSION_LIVE_COOKIE}=1; Path=/; SameSite=Lax${secure}`
}
