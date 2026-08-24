import 'reflect-metadata'

import { randomUUID } from 'node:crypto'
import {
  auditLog,
  bomPortalTokens,
  boms,
  db,
  documents,
  notifications,
  projects,
  tenants,
  users,
  type Database,
} from '@third-code-erp/database'
import { and, eq } from 'drizzle-orm'
import { describe, expect, it, vi } from 'vitest'
import { AuditService } from '../src/audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../src/database/database.service'
import { DocuSealWebhookService } from '../src/documents/docuseal-webhook.service'
import {
  docuSealArtifactObjectKey,
  type DocuSealArtifactStorage,
} from '../src/documents/docuseal-artifact.storage'
import type { DocuSealProviderService } from '../src/documents/docuseal-provider.service'

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

suite('DocuSeal webhook database authority', () => {
  it('commits the signing evidence atomically, rejects a tenant-mismatched BOM, and replays safely', async () => {
    let probeTenantId = ''

    await alwaysRollback(async (transaction) => {
      const tenantA = randomUUID()
      const tenantB = randomUUID()
      const userA = randomUUID()
      const userB = randomUUID()
      const salesA = randomUUID()
      const bomA = randomUUID()
      const bomB = randomUUID()
      const projectA = randomUUID()
      const projectB = randomUUID()
      const suffix = randomUUID().slice(0, 12)
      probeTenantId = tenantA

      await transaction.insert(tenants).values([
        {
          id: tenantA,
          name: 'DocuSeal Integration A',
          slug: `docuseal-a-${suffix}`,
        },
        {
          id: tenantB,
          name: 'DocuSeal Integration B',
          slug: `docuseal-b-${suffix}`,
        },
      ])
      await transaction.insert(users).values([
        {
          id: userA,
          tenant_id: tenantA,
          email: `docuseal-admin-a-${suffix}@integration.test`,
          full_name: 'DocuSeal Admin A',
          role: 'admin',
        },
        {
          id: salesA,
          tenant_id: tenantA,
          email: `docuseal-sales-a-${suffix}@integration.test`,
          full_name: 'DocuSeal Sales A',
          role: 'sales',
        },
        {
          id: userB,
          tenant_id: tenantB,
          email: `docuseal-admin-b-${suffix}@integration.test`,
          full_name: 'DocuSeal Admin B',
          role: 'admin',
        },
      ])
      await transaction.insert(projects).values([
        {
          id: projectA,
          tenant_id: tenantA,
          name: 'DocuSeal Project A',
          client: 'Client A',
          status: 'active',
          project_type: 'fit_out',
          created_by: userA,
        },
        {
          id: projectB,
          tenant_id: tenantB,
          name: 'DocuSeal Project B',
          client: 'Client B',
          status: 'active',
          project_type: 'fit_out',
          created_by: userB,
        },
      ])
      await transaction.insert(boms).values([
        {
          id: bomA,
          tenant_id: tenantA,
          project_id: projectA,
          created_by: userA,
          status: 'draft',
          tcv_cents: 125_000,
        },
        {
          id: bomB,
          tenant_id: tenantB,
          project_id: projectB,
          created_by: userB,
          status: 'draft',
          tcv_cents: 275_000,
        },
      ])
      await transaction.insert(bomPortalTokens).values([
        {
          tenant_id: tenantA,
          bom_id: bomA,
          token_hash: 'a'.repeat(64),
          expires_at: new Date('2030-01-01T00:00:00.000Z'),
          docuseal_submission_id: `submission-${suffix}`,
        },
        {
          tenant_id: tenantA,
          bom_id: bomB,
          token_hash: 'b'.repeat(64),
          expires_at: new Date('2030-01-01T00:00:00.000Z'),
          docuseal_submission_id: `foreign-${suffix}`,
        },
      ])

      const provider = {
        downloadCompletedPdf: vi.fn().mockResolvedValue({
          name: 'signed.pdf',
          bytes: Buffer.from('%PDF-1.7\nsigned', 'ascii'),
        }),
      } as unknown as DocuSealProviderService
      const artifactStorage = {
        upload: vi.fn().mockResolvedValue(undefined),
      } as unknown as DocuSealArtifactStorage
      const service = new DocuSealWebhookService(
        transactionBoundDatabase(transaction),
        new AuditService(),
        provider,
        artifactStorage
      )
      const command = {
        event: 'submission.completed' as const,
        submissionId: `submission-${suffix}`,
        documents: [
          {
            url: 'https://sign.example.test/signed.pdf',
            name: 'signed.pdf',
          },
        ],
      }

      const first = await service.handle(command)
      const replay = await service.handle(command)
      const foreign = await service.handle({
        ...command,
        submissionId: `foreign-${suffix}`,
      })

      expect(first).toMatchObject({
        received: true,
        handled: true,
        duplicate: false,
        tenantId: tenantA,
        bomId: bomA,
        projectId: projectA,
      })
      expect(replay).toMatchObject({
        received: true,
        handled: true,
        duplicate: true,
      })
      expect(foreign).toMatchObject({
        received: true,
        handled: false,
        duplicate: false,
        tenantId: tenantA,
        bomId: bomB,
      })

      const [lockedBomA] = await transaction
        .select({ status: boms.status, lockedAt: boms.locked_at })
        .from(boms)
        .where(and(eq(boms.id, bomA), eq(boms.tenant_id, tenantA)))
      const [untouchedBomB] = await transaction
        .select({ status: boms.status, lockedAt: boms.locked_at })
        .from(boms)
        .where(and(eq(boms.id, bomB), eq(boms.tenant_id, tenantB)))
      const signedDocuments = await transaction
        .select({
          id: documents.id,
          storagePath: documents.storage_path,
          sizeBytes: documents.size_bytes,
        })
        .from(documents)
        .where(
          and(
            eq(documents.tenant_id, tenantA),
            eq(documents.project_id, projectA)
          )
        )
      const inAppNotifications = await transaction
        .select({ recipientId: notifications.recipient_user_id })
        .from(notifications)
        .where(eq(notifications.tenant_id, tenantA))
      const auditRows = await transaction
        .select({ id: auditLog.id })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.tenant_id, tenantA),
            eq(auditLog.entity_type, 'bom'),
            eq(auditLog.entity_id, bomA),
            eq(auditLog.action, 'lock')
          )
        )

      expect(lockedBomA).toMatchObject({ status: 'locked' })
      expect(lockedBomA?.lockedAt).toBeInstanceOf(Date)
      expect(untouchedBomB).toMatchObject({ status: 'draft', lockedAt: null })
      expect(signedDocuments).toEqual([
        expect.objectContaining({
          storagePath: docuSealArtifactObjectKey({
            tenantId: tenantA,
            projectId: projectA,
            submissionId: `submission-${suffix}`,
          }),
          sizeBytes: Buffer.byteLength('%PDF-1.7\nsigned', 'ascii'),
        }),
      ])
      expect(provider.downloadCompletedPdf).toHaveBeenCalledOnce()
      expect(artifactStorage.upload).toHaveBeenCalledOnce()
      expect(inAppNotifications).toEqual(
        expect.arrayContaining([
          { recipientId: userA },
          { recipientId: salesA },
        ])
      )
      expect(inAppNotifications).toHaveLength(2)
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
