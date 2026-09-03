import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  boms,
  deliverySchedules,
  invoices,
  opportunities,
  progressUpdates,
  purchaseOrders,
} from '@third-code-erp/database/schema'

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
}))

const coreMocks = vi.hoisted(() => ({
  getProjectThroughCoreApi: vi.fn(),
  getProjectCommandCenterThroughCoreApi: vi.fn(),
  getProjectsThroughCoreApi: vi.fn(),
  projectCommandCenterReadsUseCoreApi: vi.fn(),
  projectReadsUseCoreApi: vi.fn(),
  projectListsUseCoreApi: vi.fn(),
}))

vi.mock('@third-code-erp/database', () => ({
  db: {
    select: mocks.select,
  },
}))

vi.mock('./erp-core-client', () => coreMocks)

import {
  getProject,
  getProjectCommandCenter,
  getProjectOverviewData,
  getProjectsFiltered,
} from './project-queries'

const TENANT_ID = '22222222-2222-4222-8222-222222222222'
const PROJECT_ID = '33333333-3333-4333-8333-333333333333'

function requireSql(value: SQL | undefined, label: string): SQL {
  expect(value, label).toBeDefined()
  if (!value) throw new Error(`Missing ${label}`)
  return value
}

describe('getProject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coreMocks.projectReadsUseCoreApi.mockReturnValue(false)
    coreMocks.projectListsUseCoreApi.mockReturnValue(false)
    coreMocks.projectCommandCenterReadsUseCoreApi.mockReturnValue(false)
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

describe('getProjectCommandCenter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    coreMocks.projectCommandCenterReadsUseCoreApi.mockReturnValue(true)
  })

  it('uses the tenant-gated Nest command center contract when enabled', async () => {
    coreMocks.getProjectCommandCenterThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        tenantId: TENANT_ID,
        projectId: PROJECT_ID,
        pendingTasks: 2,
        overdueTasks: 1,
        documents: 3,
        pendingDecisions: 1,
        openPunchlist: 2,
        activeDeliveries: 1,
        progressPercent: 42,
        progressWeekEnding: '2026-08-10T00:00:00.000Z',
      },
    })

    await expect(
      getProjectCommandCenter(TENANT_ID, PROJECT_ID)
    ).resolves.toEqual({
      pendingTasks: 2,
      overdueTasks: 1,
      documents: 3,
      pendingDecisions: 1,
      openPunchlist: 2,
      activeDeliveries: 1,
      progressPercent: 42,
      progressWeekEnding: '2026-08-10T00:00:00.000Z',
    })
    expect(coreMocks.getProjectCommandCenterThroughCoreApi).toHaveBeenCalledWith(
      PROJECT_ID
    )
    expect(mocks.select).not.toHaveBeenCalled()
  })

  it('fails closed when Core returns another project scope', async () => {
    coreMocks.getProjectCommandCenterThroughCoreApi.mockResolvedValue({
      ok: true,
      data: {
        tenantId: '99999999-9999-4999-8999-999999999999',
        projectId: PROJECT_ID,
        pendingTasks: 0,
        overdueTasks: 0,
        documents: 0,
        pendingDecisions: 0,
        openPunchlist: 0,
        activeDeliveries: 0,
        progressPercent: null,
        progressWeekEnding: null,
      },
    })

    await expect(
      getProjectCommandCenter(TENANT_ID, PROJECT_ID)
    ).rejects.toThrow('invalid tenant scope')
  })

  it('skips every delivery read when the domain policy denies it', async () => {
    const queriedTables: unknown[] = []
    mocks.from.mockImplementation((table: unknown) => {
      queriedTables.push(table)
      if (table === progressUpdates) {
        return {
          where: () => ({
            orderBy: () => ({ limit: async () => [] }),
          }),
        }
      }
      return { where: async () => [] }
    })

    await expect(
      getProjectCommandCenter(TENANT_ID, PROJECT_ID, new Date(), {
        includeDelivery: false,
      }),
    ).resolves.toMatchObject({ activeDeliveries: null })

    expect(coreMocks.projectCommandCenterReadsUseCoreApi).not.toHaveBeenCalled()
    expect(coreMocks.getProjectCommandCenterThroughCoreApi).not.toHaveBeenCalled()
    expect(queriedTables).not.toContain(deliverySchedules)
    expect(queriedTables).not.toContain(purchaseOrders)
  })

  it('tenant- and project-scopes an allowed delivery read', async () => {
    coreMocks.projectCommandCenterReadsUseCoreApi.mockReturnValue(false)
    let joinCondition: SQL | undefined
    let deliveryCondition: SQL | undefined

    mocks.from.mockImplementation((table: unknown) => {
      if (table === deliverySchedules) {
        return {
          innerJoin: (_joinedTable: unknown, condition: SQL) => {
            joinCondition = condition
            return {
              where: async (whereCondition: SQL) => {
                deliveryCondition = whereCondition
                return []
              },
            }
          },
        }
      }
      if (table === progressUpdates) {
        return {
          where: () => ({
            orderBy: () => ({ limit: async () => [] }),
          }),
        }
      }
      return { where: async () => [] }
    })

    await expect(
      getProjectCommandCenter(TENANT_ID, PROJECT_ID, new Date(), {
        includeDelivery: true,
      }),
    ).resolves.toMatchObject({ activeDeliveries: 0 })

    const dialect = new PgDialect()
    const joinQuery = dialect.sqlToQuery(
      requireSql(joinCondition, 'delivery join condition'),
    )
    expect(joinQuery.sql).toContain('"purchase_orders"."tenant_id" = $1')
    expect(joinQuery.sql).toContain('"purchase_orders"."project_id" = $2')
    expect(joinQuery.params).toEqual([TENANT_ID, PROJECT_ID])

    const deliveryQuery = dialect.sqlToQuery(
      requireSql(deliveryCondition, 'delivery filter condition'),
    )
    expect(deliveryQuery.sql).toContain('"delivery_schedules"."tenant_id" = $1')
    expect(deliveryQuery.params).toContain(TENANT_ID)
  })
})

describe('getProjectOverviewData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.select.mockReturnValue({ from: mocks.from })
  })

  it('does not create queries for denied overview domains', async () => {
    const queriedTables: unknown[] = []
    mocks.from.mockImplementation((table: unknown) => {
      queriedTables.push(table)
      return { where: async () => [] }
    })

    await expect(
      getProjectOverviewData(TENANT_ID, PROJECT_ID, {
        opportunity: true,
        bom: false,
        purchaseOrders: false,
        billing: false,
      }),
    ).resolves.toEqual({
      opportunities: [],
      latestBom: null,
      poCommittedCents: null,
      invoiceBilledCents: null,
    })

    expect(queriedTables).toEqual([opportunities])
    expect(queriedTables).not.toContain(boms)
    expect(queriedTables).not.toContain(purchaseOrders)
    expect(queriedTables).not.toContain(invoices)
  })

  it('tenant- and project-scopes every granted domain query', async () => {
    const conditions = new Map<unknown, SQL>()
    mocks.from.mockImplementation((table: unknown) => {
      if (table === boms) {
        return {
          where: (condition: SQL) => {
            conditions.set(table, condition)
            return {
              orderBy: () => ({ limit: async () => [] }),
            }
          },
        }
      }
      return {
        where: async (condition: SQL) => {
          conditions.set(table, condition)
          return []
        },
      }
    })

    await getProjectOverviewData(TENANT_ID, PROJECT_ID, {
      opportunity: true,
      bom: true,
      purchaseOrders: true,
      billing: true,
    })

    const dialect = new PgDialect()
    for (const [table, tableName] of [
      [opportunities, 'opportunities'],
      [boms, 'boms'],
      [purchaseOrders, 'purchase_orders'],
      [invoices, 'invoices'],
    ] as const) {
      const query = dialect.sqlToQuery(
        requireSql(conditions.get(table), `${tableName} condition`),
      )
      expect(query.sql).toContain(`"${tableName}"."project_id"`)
      expect(query.sql).toContain(`"${tableName}"."tenant_id"`)
      expect(query.params).toContain(PROJECT_ID)
      expect(query.params).toContain(TENANT_ID)
    }
  })
})
