import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}))

const coreMocks = vi.hoisted(() => ({
  getProjectThroughCoreApi: vi.fn(),
  getProjectsThroughCoreApi: vi.fn(),
  projectReadsUseCoreApi: vi.fn(),
  projectListsUseCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
  },
}))

vi.mock('./erp-core-client', () => coreMocks)

import { getProject, getProjectsFiltered } from './project-queries'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

describe('getProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coreMocks.projectReadsUseCoreApi.mockReturnValue(false)
    coreMocks.projectListsUseCoreApi.mockReturnValue(false)
    mocks.select.mockReturnValue({ from: mocks.from })
    mocks.from.mockReturnValue({ where: mocks.where })
    mocks.where.mockReturnValue({ limit: mocks.limit })
  })

  it('queries by tenant and Project ID together', async () => {
    const row = { id: PROJECT_ID, tenant_id: TENANT_ID }
    mocks.limit.mockResolvedValue([row])

    await expect(getProject(TENANT_ID, PROJECT_ID)).resolves.toBe(row)

    const condition = mocks.where.mock.calls[0]?.[0]
    const query = new PgDialect().sqlToQuery(condition)
    expect(query.sql).toContain('"projects"."tenant_id" = $1')
    expect(query.sql).toContain('"projects"."id" = $2')
    expect(query.params).toEqual([TENANT_ID, PROJECT_ID])
    expect(mocks.limit).toHaveBeenCalledWith(1)
  })

  it('returns null when no same-tenant Project exists', async () => {
    mocks.limit.mockResolvedValue([])

    await expect(getProject(TENANT_ID, PROJECT_ID)).resolves.toBeNull()
  })

  it('uses the tenant-gated Nest read contract when enabled', async () => {
    coreMocks.projectReadsUseCoreApi.mockReturnValue(true)
    coreMocks.getProjectThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        id: PROJECT_ID,
        tenantId: TENANT_ID,
        name: 'Core Project',
        client: 'Core Client',
        status: 'active',
        projectType: 'mep',
        totalSqm: 250,
        location: 'Makati',
        notes: null,
        createdAt: '2026-08-04T00:00:00.000Z',
        updatedAt: '2026-08-04T01:00:00.000Z',
        accountId: null,
        createdBy: null,
      },
    })

    await expect(getProject(TENANT_ID, PROJECT_ID)).resolves.toMatchObject({
      id: PROJECT_ID,
      tenant_id: TENANT_ID,
      name: 'Core Project',
      project_type: 'mep',
      created_at: new Date('2026-08-04T00:00:00.000Z'),
      updated_at: new Date('2026-08-04T01:00:00.000Z'),
    })
    expect(coreMocks.getProjectThroughCoreApi).toHaveBeenCalledWith(PROJECT_ID)
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('fails closed when the Nest read returns another tenant', async () => {
    coreMocks.projectReadsUseCoreApi.mockReturnValue(true)
    coreMocks.getProjectThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        id: PROJECT_ID,
        tenantId: '99999999-9999-4999-8999-999999999999',
        name: 'Wrong Tenant',
        client: 'Hidden Client',
        status: 'active',
        projectType: 'mep',
        totalSqm: null,
        location: null,
        notes: null,
        createdAt: '2026-08-04T00:00:00.000Z',
        updatedAt: '2026-08-04T00:00:00.000Z',
        accountId: null,
        createdBy: null,
      },
    })

    await expect(getProject(TENANT_ID, PROJECT_ID)).rejects.toThrow(
      'invalid tenant scope'
    )
  })

  it('uses the tenant-gated Nest list contract when enabled', async () => {
    coreMocks.projectListsUseCoreApi.mockReturnValue(true)
    coreMocks.getProjectsThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        rows: [
          {
            id: PROJECT_ID,
            tenantId: TENANT_ID,
            name: 'Core Project',
            client: 'Core Client',
            status: 'active',
            projectType: 'mep',
            totalSqm: 250,
            location: 'Makati',
            notes: null,
            createdAt: '2026-08-04T00:00:00.000Z',
            updatedAt: '2026-08-04T01:00:00.000Z',
            accountId: null,
            createdBy: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    })

    await expect(
      getProjectsFiltered(TENANT_ID, {
        q: 'Core',
        status: 'active',
        type: 'mep',
        sort: 'name',
        order: 'asc',
        page: 1,
        limit: 20,
      })
    ).resolves.toMatchObject({
      total: 1,
      rows: [
        expect.objectContaining({
          id: PROJECT_ID,
          tenant_id: TENANT_ID,
          project_type: 'mep',
        }),
      ],
    })
    expect(coreMocks.getProjectsThroughCoreApi).toHaveBeenCalledWith({
      q: 'Core',
      status: 'active',
      projectType: 'mep',
      sort: 'name',
      order: 'asc',
      page: 1,
      limit: 20,
    })
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('fails closed when the Nest list returns another tenant', async () => {
    coreMocks.projectListsUseCoreApi.mockReturnValue(true)
    coreMocks.getProjectsThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        rows: [
          {
            id: PROJECT_ID,
            tenantId: '99999999-9999-4999-8999-999999999999',
            name: 'Wrong Tenant',
            client: 'Hidden Client',
            status: 'active',
            projectType: 'mep',
            totalSqm: null,
            location: null,
            notes: null,
            createdAt: '2026-08-04T00:00:00.000Z',
            updatedAt: '2026-08-04T00:00:00.000Z',
            accountId: null,
            createdBy: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
    })

    await expect(
      getProjectsFiltered(TENANT_ID, { page: 1, limit: 20 })
    ).rejects.toThrow('invalid tenant scope')
  })
})
