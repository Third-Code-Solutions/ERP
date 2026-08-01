import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import {
  auditLog,
  cadEvidenceCommitRequests,
  db,
  documents,
  projects,
  scopeItems,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { CadEvidenceCommitService } from '../src/cad/cad-evidence-commit.service'

const integrationEnabled =
  Boolean(process.env.DATABASE_URL) &&
  process.env.ERP_API_INTEGRATION_EXPECTED === '1'
const suite = integrationEnabled ? describe : describe.skip
const ROLLBACK = Symbol('rollback')

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

suite('CAD evidence commit database integration', () => {
  it('commits tenant-scoped replacement, exact totals, audit, idempotency, and rollback', async () => {
    let probeTenantId = ''
    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const userA = randomUUID()
      const userB = randomUUID()
      const projectA = randomUUID()
      const projectB = randomUUID()
      const documentA = randomUUID()
      const documentB = randomUUID()
      const existingItem = randomUUID()
      const unrelatedItem = randomUUID()
      const otherTenantItem = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      probeTenantId = tenantA

      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'CAD Integration A',
          slug: `cad-integration-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'CAD Integration B',
          slug: `cad-integration-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: userA,
          tenant_id: tenantA,
          email: `cad-a-${suffix}@integration.test`,
          full_name: 'CAD A',
          role: 'design',
        },
        {
          id: userB,
          tenant_id: tenantB,
          email: `cad-b-${suffix}@integration.test`,
          full_name: 'CAD B',
          role: 'design',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'CAD Project A',
          client: 'CAD Client A',
          status: 'active',
          project_type: 'mep',
          created_by: userA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          name: 'CAD Project B',
          client: 'CAD Client B',
          status: 'active',
          project_type: 'mep',
          created_by: userB,
        },
      ])
      await transaction.insert(documents).values([
        {
          id: documentA,
          tenant_id: tenantA,
          project_id: projectA,
          uploaded_by: userA,
          document_type: 'dxf',
          file_name: 'plan-a.dxf',
          storage_path: `cad/${tenantA}/plan-a.dxf`,
          mime_type: 'application/dxf',
          size_bytes: 10,
        },
        {
          id: documentB,
          tenant_id: tenantB,
          project_id: projectB,
          uploaded_by: userB,
          document_type: 'dxf',
          file_name: 'plan-b.dxf',
          storage_path: `cad/${tenantB}/plan-b.dxf`,
          mime_type: 'application/dxf',
          size_bytes: 10,
        },
      ])
      await transaction.insert(scopeItems).values([
        {
          id: existingItem,
          tenant_id: tenantA,
          project_id: projectA,
          created_by: userA,
          code: 'OLD',
          description: 'Old extracted line',
          unit: 'pcs',
          quantity: 1,
          unit_cost_cents: 100,
          line_total_cents: 100,
          notes: `auto-extracted; document:${documentA}`,
        },
        {
          id: unrelatedItem,
          tenant_id: tenantA,
          project_id: projectA,
          created_by: userA,
          code: 'KEEP',
          description: 'Manual line stays',
          unit: 'pcs',
          quantity: 1,
          unit_cost_cents: 200,
          line_total_cents: 200,
          notes: 'manual estimate',
        },
        {
          id: otherTenantItem,
          tenant_id: tenantB,
          project_id: projectB,
          created_by: userB,
          code: 'B',
          description: 'Other tenant line',
          unit: 'pcs',
          quantity: 1,
          unit_cost_cents: 300,
          line_total_cents: 300,
          notes: `auto-extracted; document:${documentB}`,
        },
      ])

      const principal: ErpPrincipal = {
        userId: userA,
        tenantId: tenantA,
        role: 'design',
        email: `cad-a-${suffix}@integration.test`,
      }
      const config = {
        get: vi.fn((key: string, fallback?: unknown) => {
          if (key === 'ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED') return true
          if (key === 'ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS') {
            return [tenantA]
          }
          return fallback
        }),
      }
      const service = new CadEvidenceCommitService(
        config as never,
        transactionBoundDatabase(transaction),
        new AuditService()
      )
      const command = {
        projectId: projectA,
        workerResponse: {
          document_id: documentA,
          scope_items: [
            {
              code: 'WALL',
              description: 'Partition wall',
              unit: 'sqm',
              quantity: 12,
              unit_cost_cents: 1250,
              notes: 'CAD line',
            },
            {
              code: null,
              description: 'Door set',
              unit: 'set',
              quantity: 2,
              unit_cost_cents: 25000,
              notes: null,
            },
          ],
          count: 2,
          warnings: [],
          parsed_format: 'dxf',
          source_format: 'dxf',
        },
      } as const

      const committed = await service.commit(
        documentA,
        command,
        principal,
        'cad-integration-1'
      )
      await expect(
        service.commit(documentA, command, principal, 'cad-integration-1')
      ).resolves.toEqual(committed)
      await expect(
        service.commit(
          documentA,
          {
            ...command,
            workerResponse: {
              ...command.workerResponse,
              scope_items: [
                {
                  ...command.workerResponse.scope_items[0],
                  unit_cost_cents: 1300,
                },
                command.workerResponse.scope_items[1],
              ],
            },
          },
          principal,
          'cad-integration-1'
        )
      ).rejects.toMatchObject({ status: 409 })
      await expect(
        service.commit(documentB, { ...command, projectId: projectB, workerResponse: { ...command.workerResponse, document_id: documentB } }, principal, 'cad-cross-tenant')
      ).rejects.toMatchObject({ status: 404 })

      const tenantALines = await transaction
        .select()
        .from(scopeItems)
        .where(
          and(
            eq(scopeItems.tenant_id, tenantA),
            eq(scopeItems.project_id, projectA)
          )
        )
      const tenantBLines = await transaction
        .select()
        .from(scopeItems)
        .where(
          and(
            eq(scopeItems.tenant_id, tenantB),
            eq(scopeItems.project_id, projectB)
          )
        )
      const requests = await transaction
        .select()
        .from(cadEvidenceCommitRequests)
        .where(
          and(
            eq(cadEvidenceCommitRequests.tenant_id, tenantA),
            eq(
              cadEvidenceCommitRequests.idempotency_key,
              'cad-integration-1'
            )
          )
        )
      const semanticAudit = await transaction
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenantA),
            eq(auditLog.entity_id, documentA),
            eq(auditLog.action, 'update')
          )
        )

      expect(committed).toMatchObject({
        documentId: documentA,
        projectId: projectA,
        tenantId: tenantA,
        scopeItemsCreated: 2,
        sourceFormat: 'dxf',
        status: 'committed',
      })
      expect(tenantALines).toHaveLength(3)
      expect(
        tenantALines.find((line) => line.id === existingItem)
      ).toBeUndefined()
      expect(
        tenantALines.find((line) => line.id === unrelatedItem)?.description
      ).toBe('Manual line stays')
      expect(
        tenantALines
          .filter((line) => line.notes?.includes(`document:${documentA}`))
          .map((line) => line.line_total_cents)
      ).toEqual([15_000, 50_000])
      expect(tenantBLines).toHaveLength(1)
      expect(requests).toHaveLength(1)
      expect(requests[0]?.state).toBe('succeeded')
      expect(requests[0]?.scope_item_count).toBe(2)
      expect(semanticAudit).toHaveLength(1)
      expect(semanticAudit[0]?.actor_id).toBe(userA)
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, probeTenantId))
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 30_000)
})
