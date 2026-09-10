import { describe, expect, it } from 'vitest'
import {
  createQualityHoldPointCommandSchema,
  qualityHoldPointAcceptCommandSchema,
  qualityHoldPointListQuerySchema,
  qualityHoldPointRowSchema,
} from './quality-hold-points'

const PROJECT_ID = '33333333-3333-4333-8333-333333333333'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '55555555-5555-4555-8555-555555555555'

describe('quality hold point contracts', () => {
  it('normalizes bounded list filters and boolean query values', () => {
    expect(qualityHoldPointListQuerySchema.parse({ holdPoint: 'false', limit: '10' })).toEqual({
      holdPoint: false,
      page: 1,
      limit: 10,
    })
  })

  it('requires a tenant-safe create command with a real inspection date', () => {
    const parsed = createQualityHoldPointCommandSchema.parse({
      projectId: PROJECT_ID,
      clientRequestId: REQUEST_ID,
      title: 'Concrete pour inspection',
      description: 'Verify reinforcement and embeds before the pour.',
      discipline: 'Structural',
      location: 'Level 2 slab',
      planReference: 'S-201 detail 4',
      holdPoint: true,
      inspectionDate: '2026-09-12',
      assignedTo: USER_ID,
    })
    expect(parsed.holdPoint).toBe(true)
    expect(() =>
      createQualityHoldPointCommandSchema.parse({
        projectId: PROJECT_ID,
        clientRequestId: REQUEST_ID,
        title: 'Concrete pour inspection',
        description: 'Verify reinforcement and embeds before the pour.',
        discipline: '',
        location: '',
        planReference: '',
        holdPoint: true,
        inspectionDate: '2026-02-30',
        assignedTo: null,
      }),
    ).toThrow()
  })

  it('keeps acceptance commands explicit and row status bounded', () => {
    expect(qualityHoldPointAcceptCommandSchema.parse({
      expectedVersion: 2,
      findings: 'No nonconformities.',
      acceptanceNotes: 'Accepted for the next work package.',
    })).toMatchObject({ expectedVersion: 2 })
    expect(() => qualityHoldPointRowSchema.parse({ status: 'unknown' })).toThrow()
  })
})
