import { describe, expect, it } from 'vitest'
import {
  claimTransitionCommandReceiptSchema,
  claimTransitionCommandSchema,
  claimTransitionPayload,
  claimTransitionResultSchema,
} from './claim-transition'

const CLAIM_ID = '44444444-4444-4444-8444-444444444444'
const REQUEST_ID = '66666666-6666-4666-8666-666666666666'
const DOCUMENT_ID = '55555555-5555-4555-8555-555555555555'
const INVOICE_ID = '77777777-7777-4777-8777-777777777777'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('claim transition command contract', () => {
  it('accepts normalized transition commands and excludes caller authority', () => {
    const command = claimTransitionCommandSchema.parse({
      action: 'certify',
      clientRequestId: REQUEST_ID.toUpperCase(),
      certificateDocumentId: DOCUMENT_ID.toUpperCase(),
    })
    expect(command).toEqual({
      action: 'certify',
      clientRequestId: REQUEST_ID,
      certificateDocumentId: DOCUMENT_ID,
    })
    expect(claimTransitionCommandSchema.safeParse({ ...command, tenantId: TENANT_ID }).success).toBe(false)
    expect(claimTransitionPayload(CLAIM_ID.toUpperCase(), command)).toBe(
      JSON.stringify({ operation: 'transition', claimId: CLAIM_ID, action: 'certify', certificateDocumentId: DOCUMENT_ID }),
    )
  })

  it('bounds reasons and rejects malformed linked records', () => {
    expect(claimTransitionCommandSchema.safeParse({ action: 'reject', clientRequestId: REQUEST_ID, reason: '  no  ' }).success).toBe(false)
    expect(claimTransitionCommandSchema.safeParse({ action: 'certify', clientRequestId: REQUEST_ID, certificateDocumentId: 'bad' }).success).toBe(false)
    expect(claimTransitionCommandSchema.safeParse({ action: 'link_invoice', clientRequestId: REQUEST_ID, invoiceId: INVOICE_ID, actorId: ACTOR_ID }).success).toBe(false)
  })

  it('accepts a strict replayable receipt and result', () => {
    const receipt = claimTransitionCommandReceiptSchema.parse({
      schemaVersion: 1,
      operation: 'transition',
      tenantId: TENANT_ID,
      actorId: ACTOR_ID,
      claimId: CLAIM_ID,
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      payloadHash: 'a'.repeat(64),
      action: 'submit',
      fromStatus: 'draft',
      toStatus: 'submitted',
      changedAt: '2026-09-20T08:00:00.000Z',
    })
    expect(claimTransitionResultSchema.parse({ claimId: CLAIM_ID, changed: false, receipt })).toEqual({ claimId: CLAIM_ID, changed: false, receipt })
    expect(claimTransitionCommandReceiptSchema.safeParse({ ...receipt, payloadHash: 'A'.repeat(64) }).success).toBe(false)
  })
})
