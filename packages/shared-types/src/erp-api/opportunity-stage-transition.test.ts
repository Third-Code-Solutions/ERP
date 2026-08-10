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
