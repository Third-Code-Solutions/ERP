import { describe, expect, it } from 'vitest'
import { createRfiPendingEnvelope, rfiScopeKey, sameRfiScope } from './rfi-offline-store'

const scope = {
  actorId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  tenantId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  opportunityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  inspectionId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
}
const submissionId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

describe('RFI offline command validation', () => {
  it.each(['', ' ', 'x', ' x ', 'x'.repeat(2001)])('rejects invalid submitted description %s', description => {
    expect(() => createRfiPendingEnvelope(scope, { description, priority: 'minor' }, submissionId)).toThrow()
  })
  it('stores the normalized server command and exact supplied clock', () => {
    expect(createRfiPendingEnvelope(scope, { description: '  Confirm clearance  ', priority: 'major' }, submissionId, 123)).toEqual({ scope, scopeKey: rfiScopeKey(scope), submissionId, description: 'Confirm clearance', priority: 'major', createdAt: 123, updatedAt: 123 })
  })
  it('rejects malformed scope/key and nonfinite time', () => {
    expect(() => rfiScopeKey({ ...scope, actorId: 'invalid' })).toThrow()
    expect(() => createRfiPendingEnvelope(scope, { description: 'Valid', priority: 'minor' }, 'invalid')).toThrow()
    expect(() => createRfiPendingEnvelope(scope, { description: 'Valid', priority: 'minor' }, submissionId, Infinity)).toThrow()
  })
  it('separates every scope dimension', () => {
    for (const key of ['actorId', 'tenantId', 'opportunityId', 'inspectionId'] as const) {
      const different = { ...scope, [key]: submissionId }
      expect(sameRfiScope(scope, different)).toBe(false)
      expect(rfiScopeKey(scope)).not.toBe(rfiScopeKey(different))
    }
  })
})
