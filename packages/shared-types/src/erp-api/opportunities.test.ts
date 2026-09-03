import { describe, expect, it } from 'vitest'
import {
  opportunityCreationCommandSchema,
  opportunityCreationResultSchema,
  opportunityDetailResultSchema,
} from './opportunities'

const OPPORTUNITY_ID = '44444444-4444-4444-8444-444444444444'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'
const TIMESTAMP = '2026-08-05T00:00:00.000Z'

describe('opportunity ERP API contracts', () => {
  it('validates a bounded tenant-scoped opportunity detail result', () => {
    const parsed = opportunityDetailResultSchema.parse({
      opportunity: {
        id: OPPORTUNITY_ID,
        tenantId: TENANT_ID,
        stage: 'lead',
        tcvCents: 100_000,
        gpCents: 20_000,
        probability: 10,
        weightedTcvCents: 10_000,
        areaSqm: 100,
        opportunityType: 'fit-out',
        closingDate: TIMESTAMP,
        accountId: ACCOUNT_ID,
        projectId: null,
        accountName: 'Acme Office',
        projectName: null,
      },
      progress: {
        latestPprfVersion: 2,
        latestInspection: {
          id: '55555555-5555-4555-8555-555555555555',
          status: 'submitted',
        },
        designCount: 3,
        approvedDesignCount: 1,
        openChangeRequestCount: 2,
      },
    })

    expect(parsed.opportunity.tenantId).toBe(TENANT_ID)
    expect(parsed.progress.latestPprfVersion).toBe(2)
  })

  it('rejects unknown fields and invalid progress counts', () => {
    expect(() =>
      opportunityDetailResultSchema.parse({
        opportunity: {},
        progress: {
          latestPprfVersion: null,
          latestInspection: null,
          designCount: -1,
          approvedDesignCount: 0,
          openChangeRequestCount: 0,
          extra: true,
        },
      })
    ).toThrow()
  })

  it('accepts a strict Project-led creation command with safe signed money', () => {
    const command = {
      projectId: '11111111-1111-4111-8111-111111111111',
      stage: 'opportunity_creation' as const,
      tcvCents: '9007199254740991',
      gpCents: '-9007199254740991',
      closingDate: '2026-09-03T00:00:00+08:00',
      areaSqm: 120,
      opportunityType: 'Fit-out',
      remarks: 'Project-detail workflow',
    }

    expect(opportunityCreationCommandSchema.parse(command)).toEqual(command)
    expect(
      opportunityCreationCommandSchema.parse({ projectId: command.projectId })
    ).toMatchObject({
      projectId: command.projectId,
      stage: 'opportunity_creation',
      tcvCents: '0',
      gpCents: '0',
    })
  })

  it.each([
    [
      'unsafe TCV',
      {
        projectId: OPPORTUNITY_ID,
        stage: 'opportunity_creation',
        tcvCents: '9007199254740992',
      },
    ],
    [
      'unsafe GP',
      {
        projectId: OPPORTUNITY_ID,
        stage: 'opportunity_creation',
        gpCents: '9007199254740992',
      },
    ],
    [
      'negative TCV',
      { projectId: OPPORTUNITY_ID, stage: 'opportunity_creation', tcvCents: '-1' },
    ],
    [
      'date without an offset',
      {
        projectId: OPPORTUNITY_ID,
        stage: 'opportunity_creation',
        closingDate: '2026-09-03',
      },
    ],
    ['gated initial stage', { projectId: OPPORTUNITY_ID, stage: 'design' }],
    [
      'browser-owned tenant',
      {
        projectId: OPPORTUNITY_ID,
        stage: 'opportunity_creation',
        tenantId: TENANT_ID,
      },
    ],
  ])('rejects %s', (_label, command) => {
    expect(opportunityCreationCommandSchema.safeParse(command).success).toBe(
      false
    )
  })

  it('requires the exact persisted, tenant-scoped creation result', () => {
    const result = {
      ok: true as const,
      opportunityId: OPPORTUNITY_ID,
      tenantId: TENANT_ID,
      projectId: '11111111-1111-4111-8111-111111111111',
      accountId: null,
      repId: '55555555-5555-4555-8555-555555555555',
      stage: 'opportunity_creation' as const,
      probability: 10,
      tcvCents: '10005',
      gpCents: '-2000',
      weightedTcvCents: '1001',
      closingDate: '2026-09-02T16:00:00.000Z',
      areaSqm: 120,
      opportunityType: 'Fit-out',
      remarks: null,
      createdAt: TIMESTAMP,
    }

    expect(opportunityCreationResultSchema.parse(result)).toEqual(result)
    expect(
      opportunityCreationResultSchema.safeParse({ ...result, extra: true }).success
    ).toBe(false)
  })
})
