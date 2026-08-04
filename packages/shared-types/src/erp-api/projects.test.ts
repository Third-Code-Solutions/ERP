import { describe, expect, it } from 'vitest'
import {
  createProjectCommandSchema,
  projectCreationResultSchema,
  projectListQuerySchema,
  projectListResultSchema,
  projectReadResultSchema,
} from './projects'

describe('project core API contract', () => {
  it('normalizes bounded project list query defaults', () => {
    expect(projectListQuerySchema.parse({})).toEqual({
      sort: 'created_at',
      order: 'desc',
      page: 1,
      limit: 20,
    })
    expect(
      projectListQuerySchema.parse({
        q: '  hotel ',
        status: 'active',
        projectType: 'fit_out',
        sort: 'name',
        order: 'asc',
        page: '2',
        limit: '50',
      })
    ).toMatchObject({
      q: 'hotel',
      status: 'active',
      projectType: 'fit_out',
      sort: 'name',
      order: 'asc',
      page: 2,
      limit: 50,
    })
  })

  it('rejects unbounded or unknown project list query fields', () => {
    expect(() => projectListQuerySchema.parse({ limit: '101' })).toThrow()
    expect(() => projectListQuerySchema.parse({ cursor: 'secret' })).toThrow()
  })

  it('validates the tenant-scoped paginated result envelope', () => {
    const result = projectListResultSchema.parse({
      rows: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    })
    expect(result.totalPages).toBe(1)
  })

  it('normalizes omitted create fields to safe defaults', () => {
    expect(
      createProjectCommandSchema.parse({
        name: '  Site Alpha  ',
        client: '  Acme  ',
      })
    ).toEqual({
      name: 'Site Alpha',
      client: 'Acme',
      status: 'lead',
      projectType: null,
      totalSqm: null,
      location: null,
      notes: null,
    })
  })

  it('rejects snake_case or unknown create fields at the API boundary', () => {
    expect(
      createProjectCommandSchema.safeParse({
        name: 'Site Alpha',
        client: 'Acme',
        project_type: 'mep',
      }).success
    ).toBe(false)
  })

  it('requires server timestamps in creation responses', () => {
    const result = projectCreationResultSchema.safeParse({
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: '22222222-2222-4222-8222-222222222222',
      name: 'Site Alpha',
      client: 'Acme',
      status: 'lead',
      projectType: null,
      totalSqm: null,
      location: null,
      notes: null,
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
    })

    expect(result.success).toBe(true)
  })

  it('keeps project read ownership metadata explicit', () => {
    const result = projectReadResultSchema.safeParse({
      id: '33333333-3333-4333-8333-333333333333',
      tenantId: '22222222-2222-4222-8222-222222222222',
      name: 'Site Alpha',
      client: 'Acme',
      status: 'active',
      projectType: 'mep',
      totalSqm: 250,
      location: 'Makati',
      notes: null,
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
      accountId: null,
      createdBy: '11111111-1111-4111-8111-111111111111',
    })

    expect(result.success).toBe(true)
  })
})
