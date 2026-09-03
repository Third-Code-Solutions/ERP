import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  PLATFORM_OWNER_EMAIL,
  selectVerifiedOwner,
} from './bootstrap-platform-owner.mjs'

const owner = {
  id: '11111111-1111-4111-8111-111111111111',
  email: PLATFORM_OWNER_EMAIL,
  email_confirmed_at: '2026-09-04T00:00:00.000Z',
}

describe('platform owner bootstrap identity selection', () => {
  it('accepts exactly one verified fixed identity', () => {
    assert.equal(selectVerifiedOwner([owner]), owner)
  })

  it('rejects missing, duplicate, mismatched, and unverified identities', () => {
    assert.throws(() => selectVerifiedOwner([]), /exactly one/)
    assert.throws(() => selectVerifiedOwner([owner, { ...owner }]), /exactly one/)
    assert.throws(
      () => selectVerifiedOwner([{ ...owner, email: 'attacker@example.test' }]),
      /exactly one/
    )
    assert.throws(
      () => selectVerifiedOwner([{ ...owner, email_confirmed_at: null }]),
      /not provider-verified/
    )
  })
})
