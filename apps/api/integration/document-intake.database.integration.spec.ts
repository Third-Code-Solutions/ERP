import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import {
  auditLog,
  db,
  documentIntakeRequests,
  documents,
  projects,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import type { ErpPrincipal } from '../src/auth/current-principal.decorator'
import { AuditService } from '../src/audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { DocumentIntakeService } from '../src/documents/document-intake.service'

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

suite('Document intake database integration', () => {
  it('enforces tenant/project storage scope and duplicate-key replay', async () => {
    let probeTenantId = ''

    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const userA = randomUUID()
      const userB = randomUUID()
      const projectA = randomUUID()
      const projectB = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      probeTenantId = tenantA

      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'Document Intake Integration A',
          slug: `document-intake-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'Document Intake Integration B',
          slug: `document-intake-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: userA,
          tenant_id: tenantA,
          email: `document-intake-a-${suffix}@integration.test`,
          full_name: 'Document Intake A',
          role: 'pm',
        },
        {
          id: userB,
          tenant_id: tenantB,
          email: `document-intake-b-${suffix}@integration.test`,
          full_name: 'Document Intake B',
          role: 'pm',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'Document Intake Project A',
          client: 'Client A',
          status: 'active',
          project_type: 'mep',
          created_by: userA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          name: 'Document Intake Project B',
          client: 'Client B',
          status: 'active',
          project_type: 'mep',
          created_by: userB,
        },
      ])

      const principalA: ErpPrincipal = {
        userId: userA,
        tenantId: tenantA,
        role: 'pm',
        email: `document-intake-a-${suffix}@integration.test`,
      }
      const service = new DocumentIntakeService(
        transactionBoundDatabase(transaction),
        new AuditService()
      )
      const command = {
        storagePath: `${tenantA}/${projectA}/drawing.pdf`,
        projectId: projectA,
        fileName: 'drawing.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1_024,
        description: 'Integration drawing',
      }

      const first = await service.create(
        command,
        principalA,
        'document-intake-integration'
      )
      const replay = await service.create(
        command,
        principalA,
        'document-intake-integration'
      )

      expect(first).toMatchObject({
        tenantId: tenantA,
        projectId: projectA,
        documentType: 'pdf',
        created: true,
      })
      expect(replay).toEqual({ ...first, created: false })

      await expect(
        service.create(
          { ...command, fileName: 'different.pdf' },
          principalA,
          'document-intake-integration'
        )
      ).rejects.toMatchObject({ status: 409 })

      await expect(
        service.create(
          {
            ...command,
            projectId: projectB,
            storagePath: `${tenantB}/${projectB}/foreign.pdf`,
          },
          principalA,
          'document-intake-foreign-project'
        )
      ).rejects.toMatchObject({ status: 404 })

      await expect(
        service.create(
          {
            ...command,
            storagePath: `${tenantB}/${projectB}/foreign.pdf`,
          },
          principalA,
          'document-intake-foreign-path'
        )
      ).rejects.toMatchObject({ status: 403 })

      const documentRows = await transaction
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.tenant_id, tenantA),
            eq(documents.project_id, projectA)
          )
        )
      const requestRows = await transaction
        .select()
        .from(documentIntakeRequests)
        .where(eq(documentIntakeRequests.tenant_id, tenantA))
      const auditRows = await transaction
        .select()
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenantA),
            eq(auditLog.entity_type, 'document'),
            eq(auditLog.entity_id, first.documentId),
            eq(auditLog.action, 'create')
          )
        )

      expect(documentRows).toHaveLength(1)
      expect(requestRows).toHaveLength(1)
      expect(requestRows[0]).toMatchObject({
        tenant_id: tenantA,
        project_id: projectA,
        state: 'succeeded',
      })
      expect(auditRows).toHaveLength(1)
    })

    const leaked = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.id, probeTenantId))
      .limit(1)
    expect(leaked).toHaveLength(0)
  }, 30_000)
})
