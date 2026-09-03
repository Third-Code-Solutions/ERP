import { describe, expect, it } from 'vitest'
import {
  opportunityStageTransitionCommandSchema,
  opportunityStageTransitionResultSchema,
} from './opportunity-stage-transition'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('opportunity stage transition contract', () => {
  it('accepts only the strict stage command', () => {
    expect(
      opportunityStageTransitionCommandSchema.parse({
        newStage: 'won',
        reason: 'Signed commercial package',
      })
    ).toEqual({ newStage: 'won', reason: 'Signed commercial package' })
    expect(
      opportunityStageTransitionCommandSchema.safeParse({
        newStage: 'won',
        tenantId: UUID,
      }).success
    ).toBe(false)
  })

  it('accepts commercial edits that must commit atomically with the stage', () => {
    expect(
      opportunityStageTransitionCommandSchema.parse({
        newStage: 'contract',
        tcvCents: '12345678',
        gpCents: '-250000',
        closingDate: '2026-10-31T00:00:00.000Z',
      })
    ).toEqual({
      newStage: 'contract',
      tcvCents: '12345678',
      gpCents: '-250000',
      closingDate: '2026-10-31T00:00:00.000Z',
    })
  })

  it.each([
    { newStage: 'contract', tcvCents: '-1' },
    { newStage: 'contract', tcvCents: '9007199254740992' },
    { newStage: 'contract', gpCents: '9007199254740992' },
    { newStage: 'contract', gpCents: '-9007199254740992' },
    { newStage: 'contract', tcvCents: 1 },
    { newStage: 'contract', closingDate: '2026-10-31' },
    { newStage: 'contract', closingDate: 'not-a-date' },
  ])('rejects an invalid commercial edit: %j', (command) => {
    expect(opportunityStageTransitionCommandSchema.safeParse(command).success).toBe(
      false
    )
  })

  it('serializes a nullable conversion result for non-terminal stages', () => {
    expect(
      opportunityStageTransitionResultSchema.parse({
        ok: true,
        opportunityId: UUID,
        tenantId: UUID,
        fromStage: 'lead',
        toStage: 'site_survey',
        projectId: null,
        checklistId: null,
        convertedToProject: false,
      })
    ).toMatchObject({ toStage: 'site_survey', convertedToProject: false })
    expect(
      opportunityStageTransitionResultSchema.safeParse({
        ok: true,
        opportunityId: UUID,
        tenantId: UUID,
        fromStage: 'lead',
        toStage: 'site_survey',
        projectId: null,
        checklistId: null,
        convertedToProject: false,
        tenantOverride: UUID,
      }).success
    ).toBe(false)
  })
})
