import { describe, expect, it } from 'vitest'
import {
  qualityHoldPointPunchlistHandoffCommandSchema,
  qualityHoldPointPunchlistHandoffResultSchema,
} from './quality-hold-points'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const IWR_ID = '44444444-4444-4444-8444-444444444444'
const HANDOFF_ID = '66666666-6666-4666-8666-666666666666'
const ITEM_ID = '77777777-7777-4777-8777-777777777777'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'
const DOCUMENT_ID = '88888888-8888-4888-8888-888888888888'

describe('quality hold point punchlist handoff contracts', () => {
  it('bounds a handoff to at least one item and normalizes optional fields', () => {
    const parsed = qualityHoldPointPunchlistHandoffCommandSchema.parse({
      clientRequestId: REQUEST_ID,
      planDocumentId: DOCUMENT_ID,
      items: [{ description: 'Repair failed waterproofing at the north wall.' }],
    })
    expect(parsed.items).toEqual([{
      description: 'Repair failed waterproofing at the north wall.',
      location: null,
      trade: null,
      priority: 'medium',
      dueDate: null,
      assignedToUserId: null,
      assignedToText: null,
    }])
    expect(() => qualityHoldPointPunchlistHandoffCommandSchema.parse({
      clientRequestId: REQUEST_ID,
      items: [],
    })).toThrow()
  })

  it('returns linked item rows together with immutable source rejection evidence', () => {
    const result = qualityHoldPointPunchlistHandoffResultSchema.parse({
      clientRequestId: REQUEST_ID,
      projectId: PROJECT_ID,
      qualityHoldPointId: IWR_ID,
      handoffId: HANDOFF_ID,
      created: true,
      changed: true,
      source: {
        qualityHoldPointId: IWR_ID,
        iwrNumber: 'IWR-0007',
        findings: 'Membrane blistering at the north wall.',
        rejectionReason: 'Repair and resubmit before concealment.',
        planDocumentId: DOCUMENT_ID,
      },
      items: [{
        id: ITEM_ID,
        projectId: PROJECT_ID,
        description: 'Repair failed waterproofing at the north wall.',
        location: null,
        trade: 'Waterproofing',
        priority: 'high',
        status: 'open',
        dueDate: null,
        assignedToUserId: null,
        assignedToText: null,
        createdAt: '2026-09-11T01:00:00.000Z',
        createdBy: '11111111-1111-4111-8111-111111111111',
        sourceHandoffId: HANDOFF_ID,
      }],
    })
    expect(result.items[0]?.sourceHandoffId).toBe(HANDOFF_ID)
    expect(result.source.rejectionReason).toContain('Repair')
    expect(result.clientRequestId).toBe(REQUEST_ID)
    const { clientRequestId: _requestId, ...unbound } = result
    expect(qualityHoldPointPunchlistHandoffResultSchema.safeParse(unbound).success).toBe(false)
  })
})
