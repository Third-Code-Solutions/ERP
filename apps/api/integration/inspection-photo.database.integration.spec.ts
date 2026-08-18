import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import {
  accounts,
  auditLog,
  db,
  documents,
  opportunities,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { InspectionPhotoService } from '../src/documents/inspection-photo.service'

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

suite('Inspection photo database authority', () => {
  it('commits pre-project evidence and audit atomically, conceals foreign opportunities, and replays safely', async () => {
    let probeTenantId = ''

    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const commercialA = randomUUID()
      const commercialB = randomUUID()
      const accountA = randomUUID()
      const accountB = randomUUID()
      const opportunityA = randomUUID()
      const opportunityB = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      probeTenantId = tenantA

      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Inspection Photo Integration A',
          slug: `inspection-photo-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Inspection Photo Integration B',
          slug: `inspection-photo-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: commercialA,
          tenant_id: tenantA,
          email: `inspection-photo-a-${suffix}@integration.test`,
          full_name: 'Inspection Commercial A',
          role: 'commercial',
        },
        {
          id: commercialB,
          tenant_id: tenantB,
          email: `inspection-photo-b-${suffix}@integration.test`,
          full_name: 'Inspection Commercial B',
          role: 'commercial',
        },
      ])
      await transaction.insert(accounts).values([
        {
          id: accountA,
          tenant_id: tenantA,
          name: 'Inspection Account A',
          industry: 'office',
          kyc_status: 'approved',
          created_by: commercialA,
        },
        {
          id: accountB,
          tenant_id: tenantB,
          name: 'Inspection Account B',
          industry: 'industrial',
          kyc_status: 'approved',
          created_by: commercialB,
        },
      ])
      await transaction.insert(opportunities).values([
        {
          id: opportunityA,
          tenant_id: tenantA,
          account_id: accountA,
          rep_id: commercialA,
          stage: 'site_survey',
          tcv_cents: 0,
          gp_cents: 0,
          probability: 0,
          weighted_tcv_cents: 0,
        },
        {
          id: opportunityB,
          tenant_id: tenantB,
          account_id: accountB,
          rep_id: commercialB,
          stage: 'site_survey',
          tcv_cents: 0,
          gp_cents: 0,
          probability: 0,
          weighted_tcv_cents: 0,
        },
      ])

      const principal: ErpPrincipal = {
        userId: commercialA,
        tenantId: tenantA,
        role: 'commercial',
        email: `inspection-photo-a-${suffix}@integration.test`,
      }
      const storagePath = `${tenantA}/opportunities/${opportunityA}/inspection/evidence.jpg`
      const service = new InspectionPhotoService(
        transactionBoundDatabase(transaction),
        new AuditService()
      )
      const command = {
        opportunityId: opportunityA,
        storagePath,
        fileName: 'evidence.jpg',
        mimeType: 'image/jpeg' as const,
        sizeBytes: 1_024,
        caption: 'North elevation',
      }

      const first = await service.create(command, principal)
      const replay = await service.create(command, principal)
      await expect(
        service.create(
          {
            ...command,
            opportunityId: opportunityB,
            storagePath: `${tenantA}/opportunities/${opportunityB}/inspection/foreign.jpg`,
          },
          principal
        )
      ).rejects.toThrow('Opportunity not found')

      expect(first).toMatchObject({
        tenantId: tenantA,
        opportunityId: opportunityA,
        projectId: null,
        storagePath,
      })
      expect(replay).toEqual(first)

      const photoDocuments = await transaction
        .select({
          id: documents.id,
          projectId: documents.project_id,
          opportunityId: documents.opportunity_id,
          storagePath: documents.storage_path,
          uploadedBy: documents.uploaded_by,
        })
        .from(documents)
        .where(
          and(
            eq(documents.tenant_id, tenantA),
            eq(documents.opportunity_id, opportunityA),
            eq(documents.storage_path, storagePath)
          )
        )
      const auditRows = await transaction
        .select({
          entityId: auditLog.entity_id,
          action: auditLog.action,
          diff: auditLog.diff,
        })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenantA),
            eq(auditLog.entity_type, 'document'),
            eq(auditLog.action, 'create')
          )
        )

      expect(photoDocuments).toEqual([
        {
          id: first.documentId,
          projectId: null,
          opportunityId: opportunityA,
          storagePath,
          uploadedBy: commercialA,
        },
      ])
      expect(auditRows).toEqual([
        expect.objectContaining({
          entityId: first.documentId,
          action: 'create',
          diff: expect.objectContaining({
            source: 'site_inspection_photo_core_authority',
            opportunity_id: opportunityA,
            project_id: null,
          }),
        }),
      ])
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, probeTenantId))
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 30_000)
})
