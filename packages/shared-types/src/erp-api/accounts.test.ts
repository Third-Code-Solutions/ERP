import { describe, expect, it } from 'vitest'
import {
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
})
