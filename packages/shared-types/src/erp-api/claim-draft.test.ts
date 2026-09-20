import { describe, expect, it } from 'vitest'
import { createClaimDraftCommandSchema, claimDraftPayload } from './claim-draft'

const command = { projectId: 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA', clientRequestId: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB', milestonePct: 50, amountCents: 12345, description: '' }
describe('claim draft contracts', () => {
  it('normalizes UUIDs and empty description without altering meaningful text', () => {
    expect(createClaimDraftCommandSchema.parse(command)).toEqual({ ...command, projectId: command.projectId.toLowerCase(), clientRequestId: command.clientRequestId.toLowerCase(), description: null })
    expect(createClaimDraftCommandSchema.parse({ ...command, description: ' scoped work ' }).description).toBe(' scoped work ')
  })
  it.each([0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1, Infinity, '123'])('rejects unsafe cents %s', amountCents => {
    expect(createClaimDraftCommandSchema.safeParse({ ...command, amountCents }).success).toBe(false)
  })
  it('hashes semantic fields without request identity', () => {
    expect(claimDraftPayload(command)).toBe(claimDraftPayload({ ...command, clientRequestId: command.projectId, description: null }))
    expect(claimDraftPayload(command)).not.toBe(claimDraftPayload({ ...command, amountCents: 12346 }))
  })
})
