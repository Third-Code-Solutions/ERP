import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import {
  assets,
  db,
  projects,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { AssetsService } from '../src/assets/assets.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')

type Row = Record<string, unknown>

async function executeRaw(
  transaction: DatabaseTransaction,
  statement: string
): Promise<Row[]> {
  return (await transaction.execute(sql.raw(statement))) as unknown as Row[]
}

function transactionBoundDatabase(
  transaction: DatabaseTransaction
): DatabaseService {
  const client = new Proxy({} as Database, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (
          callback: (scopedTransaction: DatabaseTransaction) => unknown
        ) => callback(transaction)
      }

      const value = Reflect.get(transaction as unknown as object, property)
      return typeof value === 'function'
        ? value.bind(transaction)
        : value
    },
  })

  return { client } as DatabaseService
}

async function alwaysRollback(
  callback: (transaction: DatabaseTransaction) => Promise<void>
): Promise<void> {
  try {
    await db.transaction(async (transaction) => {
      await callback(transaction)
      throw ROLLBACK
    })
  } catch (error) {
    if (error !== ROLLBACK) throw error
  }
}

function normalizeRow(row: Row) {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    assetTag: String(row.assetTag),
    name: String(row.name),
    kind: row.kind,
    status: row.status,
    serialNumber: row.serialNumber ? String(row.serialNumber) : null,
    manufacturer: row.manufacturer ? String(row.manufacturer) : null,
    model: row.model ? String(row.model) : null,
    assignedProjectId: row.assignedProjectId
      ? String(row.assignedProjectId)
      : null,
    assignedProjectName: row.assignedProjectName
      ? String(row.assignedProjectName)
      : null,
    location: row.location ? String(row.location) : null,
    commissionedOn: row.commissionedOn
      ? String(row.commissionedOn).slice(0, 10)
      : null,
    retiredOn: row.retiredOn ? String(row.retiredOn).slice(0, 10) : null,
    notes: row.notes ? String(row.notes) : null,
    createdBy: String(row.createdBy),
    createdAt: new Date(String(row.createdAt)).toISOString(),
    updatedAt: new Date(String(row.updatedAt)).toISOString(),
  }
}

suite('asset register read projection database integration', () => {
  it('matches direct tenant rows, project context, pagination, RLS, and audit evidence', async () => {
    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const actorA = randomUUID()
      const actorB = randomUUID()
      const projectA = randomUUID()
      const assetA1 = randomUUID()
      const assetA2 = randomUUID()
      const assetA3 = randomUUID()
      const assetB1 = randomUUID()
      const suffix = randomUUID().slice(0, 10)
      const observedAt = new Date('2026-08-06T01:00:00.000Z')

      await transaction.insert(tenants).values([
        { id: tenantA, name: 'Asset Replay A', slug: `asset-replay-a-${suffix}` },
        { id: tenantB, name: 'Asset Replay B', slug: `asset-replay-b-${suffix}` },
      ])
      await transaction.insert(users).values([
        {
          id: actorA,
          tenant_id: tenantA,
          email: `asset-a-${suffix}@probe.test`,
          full_name: 'Asset A',
          role: 'viewer',
        },
        {
          id: actorB,
          tenant_id: tenantB,
          email: `asset-b-${suffix}@probe.test`,
          full_name: 'Asset B',
          role: 'viewer',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'Asset Replay Project',
          client: 'Replay Client',
          status: 'active',
          project_type: 'mep',
          created_by: actorA,
          updated_at: observedAt,
        },
      ])
      await transaction.insert(assets).values([
        {
          id: assetA1,
          tenant_id: tenantA,
          asset_tag: 'EQ-001',
          name: 'Tower crane',
          kind: 'equipment',
          status: 'active',
          serial_number: `SER-A1-${suffix}`,
          manufacturer: 'Replay Works',
          model: 'TC-1',
          assigned_project_id: projectA,
          location: 'Site A',
          commissioned_on: '2026-01-01',
          created_by: actorA,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: assetA2,
          tenant_id: tenantA,
          asset_tag: 'TL-002',
          name: 'Laser level',
          kind: 'tool',
          status: 'maintenance',
          serial_number: `SER-A2-${suffix}`,
          manufacturer: 'Replay Works',
          model: 'LL-2',
          location: 'Workshop',
          commissioned_on: '2026-02-01',
          created_by: actorA,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: assetA3,
          tenant_id: tenantA,
          asset_tag: 'VH-003',
          name: 'Service van',
          kind: 'vehicle',
          status: 'retired',
          serial_number: `SER-A3-${suffix}`,
          manufacturer: 'Replay Works',
          model: 'SV-3',
          location: 'Archive',
          commissioned_on: '2025-01-01',
          retired_on: '2026-06-01',
          created_by: actorA,
          created_at: observedAt,
          updated_at: observedAt,
        },
        {
          id: assetB1,
          tenant_id: tenantB,
          asset_tag: 'EQ-001',
          name: 'Other tenant crane',
          kind: 'equipment',
          status: 'active',
          serial_number: `SER-B1-${suffix}`,
          manufacturer: 'Other Works',
          model: 'TC-X',
          location: 'Other site',
          commissioned_on: '2026-01-01',
          created_by: actorB,
          created_at: observedAt,
          updated_at: observedAt,
        },
      ])

      const principal: ErpPrincipal = {
        userId: actorA,
        tenantId: tenantA,
        role: 'viewer',
        email: `asset-a-${suffix}@probe.test`,
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_ASSET_READS_ENABLED') return true
          if (key === 'ERP_ASSET_READS_TENANT_IDS') return [tenantA]
          return fallback
        }),
      }
      const service = new AssetsService(
        config as never,
        transactionBoundDatabase(transaction)
      )

      const query = {
        q: undefined,
        kind: undefined,
        status: undefined,
        sort: 'asset_tag' as const,
        order: 'asc' as const,
        page: 1,
        limit: 2,
      }
      const result = await service.list(query, principal)
      const directRows = await executeRaw(transaction, `
        select
          asset.id,
          asset.tenant_id as "tenantId",
          asset.asset_tag as "assetTag",
          asset.name,
          asset.kind,
          asset.status,
          asset.serial_number as "serialNumber",
          asset.manufacturer,
          asset.model,
          asset.assigned_project_id as "assignedProjectId",
          project.name as "assignedProjectName",
          asset.location,
          asset.commissioned_on as "commissionedOn",
          asset.retired_on as "retiredOn",
          asset.notes,
          asset.created_by as "createdBy",
          asset.created_at as "createdAt",
          asset.updated_at as "updatedAt"
        from assets asset
        left join projects project
          on project.id = asset.assigned_project_id
         and project.tenant_id = asset.tenant_id
        where asset.tenant_id = '${tenantA}'
        order by asset.asset_tag asc, asset.id asc
        limit 2 offset 0
      `)
      const directCount = await executeRaw(transaction, `
        select count(*)::int as total
        from assets
        where tenant_id = '${tenantA}'
      `)

      expect(result).toMatchObject({
        total: 3,
        page: 1,
        limit: 2,
        totalPages: 2,
        rows: directRows.map(normalizeRow),
      })
      expect(Number(directCount[0]?.total)).toBe(result.total)
      expect(result.rows.map((row) => row.id)).not.toContain(assetB1)
      expect(result.rows[0]).toMatchObject({
        assetTag: 'EQ-001',
        assignedProjectId: projectA,
        assignedProjectName: 'Asset Replay Project',
      })

      const secondPage = await service.list(
        { ...query, page: 2, limit: 2 },
        principal
      )
      expect(secondPage.rows).toHaveLength(1)
      expect(secondPage.rows[0]).toMatchObject({
        id: assetA3,
        status: 'retired',
        retiredOn: '2026-06-01',
      })

      const searched = await service.list(
        { ...query, q: 'laser', limit: 20 },
        principal
      )
      expect(searched.total).toBe(1)
      expect(searched.rows[0]?.id).toBe(assetA2)

      const auditRows = await executeRaw(transaction, `
        select count(*)::int as total
        from audit_log
        where tenant_id = '${tenantA}'
          and entity_type = 'assets'
          and entity_id in ('${assetA1}', '${assetA2}', '${assetA3}')
      `)
      expect(Number(auditRows[0]?.total)).toBe(3)

      const securityRows = await executeRaw(transaction, `
        select
          c.relrowsecurity as "rowSecurity",
          c.relforcerowsecurity as "forceRowSecurity",
          has_table_privilege('authenticated', 'public.assets', 'SELECT') as "authenticatedCanSelect",
          has_table_privilege('anon', 'public.assets', 'SELECT') as "anonCanSelect"
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'assets'
      `)
      expect(securityRows[0]).toMatchObject({
        rowSecurity: true,
        forceRowSecurity: true,
        authenticatedCanSelect: false,
        anonCanSelect: false,
      })
    })
  })
})
