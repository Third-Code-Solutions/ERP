import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import { ConfigService } from '@nestjs/config'
import {
  assetMaintenanceCreateRequests,
  assetMaintenanceRecords,
  assets,
  auditLog,
  db,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq, sql } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../src/database/database.service'
import { AssetMaintenanceService } from '../src/assets/asset-maintenance.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')

function transactionBoundDatabase(transaction: DatabaseTransaction): DatabaseService {
  const client = new Proxy({} as Database, {
    get(_target, property) {
      if (property === 'transaction') {
        return async (callback: (scopedTransaction: DatabaseTransaction) => unknown) =>
          callback(transaction)
      }
      const value = Reflect.get(transaction as unknown as object, property)
      return typeof value === 'function' ? value.bind(transaction) : value
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

suite('asset maintenance database integration', () => {
  it('commits once, replays idempotently, isolates tenants, audits, and protects service tables', async () => {
    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const adminA = randomUUID()
      const viewerA = randomUUID()
      const adminB = randomUUID()
      const assetA = randomUUID()
      const assetB = randomUUID()
      const suffix = randomUUID().slice(0, 12)

      await transaction.insert(tenants).values([
        { id: tenantA, name: 'Maintenance A', slug: `maintenance-a-${suffix}` },
        { id: tenantB, name: 'Maintenance B', slug: `maintenance-b-${suffix}` },
      ])
      await transaction.insert(users).values([
        {
          id: adminA,
          tenant_id: tenantA,
          email: `maintenance-admin-a-${suffix}@integration.test`,
          full_name: 'Maintenance Admin A',
          role: 'admin',
        },
        {
          id: viewerA,
          tenant_id: tenantA,
          email: `maintenance-viewer-a-${suffix}@integration.test`,
          full_name: 'Maintenance Viewer A',
          role: 'viewer',
        },
        {
          id: adminB,
          tenant_id: tenantB,
          email: `maintenance-admin-b-${suffix}@integration.test`,
          full_name: 'Maintenance Admin B',
          role: 'admin',
        },
      ])
      await transaction.insert(assets).values([
        {
          id: assetA,
          tenant_id: tenantA,
          asset_tag: `EQ-A-${suffix}`,
          name: 'Tenant A crane',
          kind: 'equipment',
          status: 'active',
          location: 'Site A',
          commissioned_on: '2026-01-01',
          created_by: adminA,
        },
        {
          id: assetB,
          tenant_id: tenantB,
          asset_tag: `EQ-B-${suffix}`,
          name: 'Tenant B crane',
          kind: 'equipment',
          status: 'active',
          location: 'Site B',
          commissioned_on: '2026-01-01',
          created_by: adminB,
        },
      ])

      const config = {
        get: vi.fn((key: string, fallback: unknown) => {
          if (key === 'ERP_ASSET_MAINTENANCE_READS_ENABLED') return true
          if (key === 'ERP_ASSET_MAINTENANCE_READS_TENANT_IDS') return [tenantA]
          if (key === 'ERP_ASSET_MAINTENANCE_CREATE_WRITES_ENABLED') return true
          if (key === 'ERP_ASSET_MAINTENANCE_CREATE_WRITES_TENANT_IDS') return [tenantA]
          return fallback
        }),
      }
      const service = new AssetMaintenanceService(
        config as unknown as ConfigService,
        transactionBoundDatabase(transaction),
        new AuditService()
      )
      const principalA: ErpPrincipal = {
        userId: adminA,
        tenantId: tenantA,
        role: 'admin',
        email: `maintenance-admin-a-${suffix}@integration.test`,
      }
      const viewerPrincipal: ErpPrincipal = {
        userId: viewerA,
        tenantId: tenantA,
        role: 'viewer',
        email: `maintenance-viewer-a-${suffix}@integration.test`,
      }

      const command = {
        maintenanceType: 'inspection' as const,
        summary: 'Annual safety inspection',
        performedOn: '2026-01-15',
        nextDueOn: '2027-01-15',
        vendorName: 'Replay Service',
        costCents: 125_000,
        notes: 'All guards passed',
      }
      const first = await service.create(assetA, command, principalA, 'maintenance-replay-1')
      const replay = await service.create(assetA, command, principalA, 'maintenance-replay-1')
      expect(replay).toEqual(first)
      await expect(
        service.create(
          assetA,
          { ...command, summary: 'Different command' },
          principalA,
          'maintenance-replay-1'
        )
      ).rejects.toThrow('already used with a different')
      await expect(
        service.create(assetA, command, viewerPrincipal, 'maintenance-viewer-1')
      ).rejects.toThrow()

      const history = await service.list(assetA, { page: 1, limit: 50 }, principalA)
      expect(history).toMatchObject({ tenantId: tenantA, assetId: assetA, total: 1 })
      expect(history.rows[0]).toMatchObject({
        id: first.id,
        summary: 'Annual safety inspection',
        costCents: 125_000,
      })
      const due = await service.maintenanceDue(
        { asOf: '2027-01-01', daysAhead: 30, page: 1, limit: 50 },
        principalA
      )
      expect(due).toMatchObject({
        tenantId: tenantA,
        asOf: '2027-01-01',
        daysAhead: 30,
        total: 1,
        rows: [
          expect.objectContaining({
            assetId: assetA,
            nextDueOn: '2027-01-15',
            daysUntilDue: 14,
            dueState: 'due_soon',
          }),
        ],
      })
      await expect(
        service.list(assetB, { page: 1, limit: 50 }, principalA)
      ).rejects.toThrow('Asset not found')

      const requestRows = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(assetMaintenanceCreateRequests)
        .where(and(eq(assetMaintenanceCreateRequests.tenant_id, tenantA), eq(assetMaintenanceCreateRequests.state, 'succeeded')))
      expect(Number(requestRows[0]?.count)).toBe(1)
      const auditRows = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLog)
        .where(and(eq(auditLog.tenant_id, tenantA), eq(auditLog.entity_type, 'asset_maintenance_record')))
      expect(Number(auditRows[0]?.count)).toBe(1)

      const securityRows = await transaction.execute(sql`
        select
          c.relrowsecurity as "rowSecurity",
          c.relforcerowsecurity as "forceRowSecurity",
          has_table_privilege('authenticated', 'public.asset_maintenance_records', 'SELECT') as "authenticatedCanSelect",
          has_table_privilege('anon', 'public.asset_maintenance_records', 'SELECT') as "anonCanSelect"
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'asset_maintenance_records'
      `)
      expect((securityRows as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
        rowSecurity: true,
        forceRowSecurity: true,
        authenticatedCanSelect: false,
        anonCanSelect: false,
      })
      const recordRows = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(assetMaintenanceRecords)
        .where(eq(assetMaintenanceRecords.id, first.id))
      expect(Number(recordRows[0]?.count)).toBe(1)
    })
  })
})
