import { describe, expect, it } from 'vitest'

import {
  isSessionChoiceExpired,
  parseSessionChoice,
  serializeSessionChoice,
} from './session-persistence'

describe('session persistence choice', () => {
  it('treats a missing or unreadable record as no choice at all', () => {
    expect(parseSessionChoice(undefined)).toBeNull()
    expect(parseSessionChoice('')).toBeNull()
    expect(parseSessionChoice('garbage')).toBeNull()
    expect(parseSessionChoice('remember.not-a-number')).toBeNull()
    expect(parseSessionChoice('remember.0')).toBeNull()
    expect(parseSessionChoice('session.1')).toBeNull()
  })

  it('round-trips both choices', () => {
    expect(parseSessionChoice(serializeSessionChoice({ kind: 'session' }))).toEqual(
      { kind: 'session' }
    )
    const remembered = { kind: 'remember' as const, expiresAt: 1_800_000_000_000 }
    expect(parseSessionChoice(serializeSessionChoice(remembered))).toEqual(
      remembered
    )
  })

  it('ends a non-remembered session once the browser-scoped cookie is gone', () => {
    const choice = { kind: 'session' as const }

    expect(isSessionChoiceExpired(choice, true)).toBe(false)
    expect(isSessionChoiceExpired(choice, false)).toBe(true)
  })

  it('ends a remembered session on its seventh day, regardless of the browser', () => {
    const now = Date.now()

    expect(
      isSessionChoiceExpired(
        { kind: 'remember', expiresAt: now + 60_000 },
        true
      )
    ).toBe(false)
    expect(
      isSessionChoiceExpired(
        { kind: 'remember', expiresAt: now - 60_000 },
        true
      )
    ).toBe(true)
  })
})
