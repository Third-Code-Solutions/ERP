import { z } from 'zod'

export const RECOVERY_MARKER_COOKIE = 'abi-ops-password-recovery'
export const RECOVERY_MARKER_MAX_AGE_SECONDS = 10 * 60
const RECOVERY_EVENT_MAX_AGE_SECONDS = 60 * 60

const recoveryBindingSchema = z.object({
  userId: z.string().uuid(),
  sessionId: z.string().uuid(),
  accessToken: z.string().min(1),
  recoverySentAt: z.string().datetime({ offset: true }),
})

const recoveryMarkerSchema = z.string().regex(/^[a-f0-9]{64}$/)

type RecoveryBindingInput = z.input<typeof recoveryBindingSchema>

function isRecentRecovery(recoverySentAt: string, now: number): boolean {
  const sentAt = Date.parse(recoverySentAt)
  if (!Number.isFinite(sentAt)) return false
  const age = now - sentAt
  return age >= -60_000 && age <= RECOVERY_EVENT_MAX_AGE_SECONDS * 1_000
}

export async function createRecoveryMarker(
  input: RecoveryBindingInput,
  now: number = Date.now()
): Promise<string | null> {
  const parsed = recoveryBindingSchema.safeParse(input)
  if (!parsed.success || !isRecentRecovery(parsed.data.recoverySentAt, now)) {
    return null
  }

  const material = [
    parsed.data.userId,
    parsed.data.sessionId,
    parsed.data.recoverySentAt,
    parsed.data.accessToken,
  ].join('\u001f')
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(material)
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
}

export async function recoveryMarkerMatches(
  marker: string | undefined,
  input: RecoveryBindingInput,
  now: number = Date.now()
): Promise<boolean> {
  const parsedMarker = recoveryMarkerSchema.safeParse(marker)
  if (!parsedMarker.success) return false
  const expected = await createRecoveryMarker(input, now)
  if (!expected || expected.length !== parsedMarker.data.length) return false

  let difference = 0
  for (let index = 0; index < expected.length; index += 1) {
    difference |=
      expected.charCodeAt(index) ^ parsedMarker.data.charCodeAt(index)
  }
  return difference === 0
}
