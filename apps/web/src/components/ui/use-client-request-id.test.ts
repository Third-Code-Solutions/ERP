import { describe, expect, it } from 'vitest'
import { nextClientRequestId } from './use-client-request-id'

const FIRST = '11111111-1111-4111-8111-111111111111'
const SECOND = '22222222-2222-4222-8222-222222222222'

describe('client request id lifecycle', () => {
  it('creates the first id on mount', () => {
    expect(nextClientRequestId('', { ok: true }, () => FIRST)).toBe(FIRST)
  })

  it('keeps the id while nothing has been saved', () => {
    expect(nextClientRequestId(FIRST, { ok: true }, () => SECOND)).toBe(FIRST)
  })

  it('keeps the id after a failed save so a retry stays idempotent', () => {
    expect(
      nextClientRequestId(FIRST, { ok: false }, () => SECOND),
    ).toBe(FIRST)
  })

  it('issues a fresh id after a successful save', () => {
    expect(
      nextClientRequestId(FIRST, { ok: true, success: 'RFI-0001 created.' }, () => SECOND),
    ).toBe(SECOND)
  })

  it('does not treat a failure that carries a message as a save', () => {
    expect(
      nextClientRequestId(FIRST, { ok: false, success: 'ignored' }, () => SECOND),
    ).toBe(FIRST)
  })

  it('generates a uuid when no generator is supplied', () => {
    expect(nextClientRequestId('', { ok: true })).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })
})
