import { describe, expect, it } from 'vitest'
import {
  accountKycQueueResultSchema,
  accountDetailResultSchema,
  accountListQuerySchema,
  accountListResultSchema,
} from './accounts'

const ACCOUNT_ID = '33333333-3333-4333-8333-333333333333'
const TENANT_ID = '22222222-2222-4222-8222-222222222222'

describe('account ERP API contracts', () => {
  it('normalizes bounded collection filters and defaults', () => {
    expect(
      accountListQuerySchema.parse({
        q: '  Acme  ',
        industry: 'office',
        kycStatus: 'approved',
        page: '2',
        limit: '50',
      })
    ).toEqual({
      q: 'Acme',
      industry: 'office',
      kycStatus: 'approved',
      sort: 'created_at',
      order: 'desc',
      page: 2,
      limit: 50,
    })
  })

  it('rejects unknown fields and limits over the collection cap', () => {
    expect(() => accountListQuerySchema.parse({ limit: 101 })).toThrow()
    expect(() => accountListQuerySchema.parse({ cursor: 'nope' })).toThrow()
  })

  it('validates tenant-scoped account rows and the result envelope', () => {
    expect(
      accountListResultSchema.parse({
        rows: [
          {
            id: ACCOUNT_ID,
            tenantId: TENANT_ID,
            name: 'Acme Office',
            industry: 'office',
            billingAddress: null,
            primaryEmail: 'hello@example.test',
            primaryPhone: null,
            kycStatus: 'approved',
            createdAt: '2026-08-04T00:00:00.000Z',
            updatedAt: '2026-08-04T01:00:00.000Z',
            createdBy: null,
            opportunityCount: 2,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      })
    ).toHaveProperty('rows[0].tenantId', TENANT_ID)
  })

  it('validates a bounded tenant-scoped KYC queue envelope', () => {
    const parsed = accountKycQueueResultSchema.parse({
      rows: [
        {
          id: ACCOUNT_ID,
          tenantId: TENANT_ID,
          name: 'Acme Office',
          industry: 'office',
          createdAt: '2026-08-04T00:00:00.000Z',
          artifactCount: 3,
        },
      ],
      total: 201,
      limit: 200,
      truncated: true,
    })
    expect(parsed.rows[0]?.tenantId).toBe(TENANT_ID)
    expect(parsed.truncated).toBe(true)
  })

  it('rejects a KYC queue envelope with an invalid cap', () => {
    expect(() =>
      accountKycQueueResultSchema.parse({
        rows: [],
        total: 0,
        limit: 100,
        truncated: false,
      })
    ).toThrow()
  })

  it('validates a tenant-owned account detail graph', () => {
    const timestamp = '2026-08-04T00:00:00.000Z'
    const parsed = accountDetailResultSchema.safeParse({
      account: {
        id: ACCOUNT_ID,
        tenantId: TENANT_ID,
        name: 'Acme Office',
        industry: 'office',
        billingAddress: null,
        primaryEmail: null,
        primaryPhone: null,
        kycStatus: 'approved',
        createdAt: timestamp,
        updatedAt: timestamp,
        createdBy: null,
        opportunityCount: 1,
        kycNotes: null,
        kycDecidedAt: null,
        kycDecidedBy: null,
        cnpsScoreX10: null,
      },
      contacts: [],
      kycArtifacts: [],
      opportunities: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          tenantId: TENANT_ID,
          accountId: ACCOUNT_ID,
          projectId: null,
          stage: 'lead',
          tcvCents: 100,
          gpCents: 20,
          probability: 10,
          weightedTcvCents: 10,
          areaSqm: null,
          opportunityType: null,
          closingDate: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      ],
      projects: [],
    })
    expect(parsed.success).toBe(true)
  })

  it('rejects invalid detail ownership metadata', () => {
    const parsed = accountDetailResultSchema.safeParse({
      account: {
        id: ACCOUNT_ID,
        tenantId: 'not-a-uuid',
      },
      contacts: [],
      kycArtifacts: [],
      opportunities: [],
      projects: [],
    })
    expect(parsed.success).toBe(false)
  })
})
