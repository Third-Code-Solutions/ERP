import { describe, expect, it } from 'vitest'
import { opportunityDetailResultSchema } from './opportunities'

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
})
