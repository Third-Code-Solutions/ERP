import { z } from 'zod'

const authenticationClaims = z.object({
  sub: z.string().uuid(),
  amr: z.array(z.object({
    method: z.string(),
    timestamp: z.number().int().nonnegative(),
  })),
})

const interactiveMethods = new Set(['password', 'otp', 'totp', 'oauth', 'sso/saml', 'magiclink'])

/** Call only after Auth getUser has verified this exact token, never on an untrusted JWT. */
export function verifiedAuthenticationTime(token: string, verifiedUserId: string): number | undefined {
  try {
    const segments = token.split('.')
    if (segments.length !== 3 || !segments[1]) return undefined
    const parsed = authenticationClaims.safeParse(
      JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'))
    )
    if (!parsed.success || parsed.data.sub !== verifiedUserId) return undefined
    const timestamps = parsed.data.amr
      .filter(({ method }) => interactiveMethods.has(method))
      .map(({ timestamp }) => timestamp)
    return timestamps.length ? Math.max(...timestamps) : undefined
  } catch {
    return undefined
  }
}

export function isRecentAuthentication(timestamp: number | undefined, now = Date.now()): boolean {
  if (timestamp === undefined || !Number.isFinite(timestamp)) return false
  const age = now / 1000 - timestamp
  return age >= 0 && age <= 15 * 60
}
