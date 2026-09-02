import { describe, expect, it } from 'vitest'

import {
  createRecoveryMarker,
  recoveryMarkerMatches,
} from './auth-recovery-binding'

const now = Date.parse('2026-09-02T10:00:00.000Z')
const binding = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  accessToken: 'test-recovery-access-token',
  recoverySentAt: '2026-09-02T09:55:00.000Z',
}

describe('recovery authorization binding', () => {
  it('creates a deterministic digest without exposing binding material', async () => {
    const marker = await createRecoveryMarker(binding, now)

    expect(marker).toMatch(/^[a-f0-9]{64}$/)
    expect(marker).not.toContain(binding.userId)
    expect(marker).not.toContain(binding.sessionId)
    expect(marker).not.toContain(binding.accessToken)
  })

  it('binds the marker to the exact user, session, token, and recovery event', async () => {
    const marker = await createRecoveryMarker(binding, now)
    expect(await recoveryMarkerMatches(marker ?? undefined, binding, now)).toBe(true)

    for (const changed of [
      { ...binding, userId: '33333333-3333-4333-8333-333333333333' },
      { ...binding, sessionId: '44444444-4444-4444-8444-444444444444' },
      { ...binding, accessToken: 'different-test-access-token' },
      { ...binding, recoverySentAt: '2026-09-02T09:54:00.000Z' },
    ]) {
      expect(await recoveryMarkerMatches(marker ?? undefined, changed, now)).toBe(false)
    }
  })

  it('rejects stale recovery evidence and fabricated markers', async () => {
    expect(
      await createRecoveryMarker(
        { ...binding, recoverySentAt: '2026-09-02T08:00:00.000Z' },
        now
      )
    ).toBeNull()
    expect(await recoveryMarkerMatches('fabricated', binding, now)).toBe(false)
  })
})
