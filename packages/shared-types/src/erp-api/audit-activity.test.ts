import { describe, expect, it } from 'vitest'
import {
  auditActivityQuerySchema,
  auditActivityResultSchema,
} from './audit-activity'

describe('audit activity contracts', () => {
  it('applies bounded pagination defaults', () => {
    expect(auditActivityQuerySchema.parse({})).toEqual({
      page: 1,
      limit: 25,
    })
    expect(() => auditActivityQuerySchema.parse({ limit: 101 })).toThrow()
  })

  it('rejects malformed hash-chain rows', () => {
    expect(() =>
      auditActivityResultSchema.parse({
        tenantId: '22222222-2222-4222-8222-222222222222',
        rows: [
          {
            id: '1',
            tenantId: '22222222-2222-4222-8222-222222222222',
            actorId: null,
            entityType: 'project',
            entityId: '33333333-3333-4333-8333-333333333333',
            action: 'create',
            prevHash: 'bad',
            hash: 'a'.repeat(64),
            createdAt: '2026-08-05T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 25,
        totalPages: 1,
      })
    ).toThrow()
  })
})
