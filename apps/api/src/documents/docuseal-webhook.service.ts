import { Inject, Injectable } from '@nestjs/common'
import {
  bomPortalTokens,
  boms,
  documents,
  notifications,
  projects,
  users,
} from '@third-code-erp/database/schema'
import {
  docuSealWebhookCommandSchema,
  docuSealWebhookResultSchema,
  type DocuSealWebhookCommand,
  type DocuSealWebhookResult,
} from '@third-code-erp/shared-types'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'
import {
  DocuSealArtifactStorage,
  docuSealArtifactObjectKey,
} from './docuseal-artifact.storage'
import { DocuSealProviderService } from './docuseal-provider.service'

function emptyResult(): DocuSealWebhookResult {
  return {
    received: true,
    handled: false,
    duplicate: false,
    tenantId: null,
    bomId: null,
    projectId: null,
    projectName: null,
    tcvCents: null,
    signedDocument: null,
  }
}

const DOCUSEAL_NOTIFICATION_ROLES = [
  'sales',
  'commercial',
  'admin',
  'owner',
] as const

@Injectable()
export class DocuSealWebhookService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DocuSealProviderService)
    private readonly provider: DocuSealProviderService,
    @Inject(DocuSealArtifactStorage)
    private readonly artifactStorage: DocuSealArtifactStorage
  ) {}

  async handle(
    command: DocuSealWebhookCommand
  ): Promise<DocuSealWebhookResult> {
    const parsedCommand = docuSealWebhookCommandSchema.parse(command)
    if (parsedCommand.event !== 'submission.completed') {
      return emptyResult()
    }

    // Resolve tenant/project context and reject known replays before any
    // external call. The transaction below re-locks both rows authoritatively.
    const [preflightToken] = await this.database.client
      .select({
        id: bomPortalTokens.id,
        tenantId: bomPortalTokens.tenant_id,
        bomId: bomPortalTokens.bom_id,
        usedAt: bomPortalTokens.used_at,
      })
      .from(bomPortalTokens)
      .where(
        eq(bomPortalTokens.docuseal_submission_id, parsedCommand.submissionId)
      )
      .limit(1)

    if (!preflightToken) return emptyResult()

    const [preflightBom] = await this.database.client
      .select({
        id: boms.id,
        projectId: boms.project_id,
        tenantId: boms.tenant_id,
        lockedAt: boms.locked_at,
        tcvCents: boms.tcv_cents,
        projectName: projects.name,
      })
      .from(boms)
      .innerJoin(
        projects,
        and(
          eq(projects.id, boms.project_id),
          eq(projects.tenant_id, boms.tenant_id)
        )
      )
      .where(
        and(
          eq(boms.id, preflightToken.bomId),
          eq(boms.tenant_id, preflightToken.tenantId)
        )
      )
      .limit(1)

    if (!preflightBom) {
      return docuSealWebhookResultSchema.parse({
        ...emptyResult(),
        tenantId: preflightToken.tenantId,
        bomId: preflightToken.bomId,
      })
    }

    if (preflightToken.usedAt) {
      return docuSealWebhookResultSchema.parse({
        received: true,
        handled: true,
        duplicate: true,
        tenantId: preflightToken.tenantId,
        bomId: preflightBom.id,
        projectId: preflightBom.projectId,
        projectName: preflightBom.projectName,
        tcvCents: preflightBom.tcvCents,
        signedDocument: null,
      })
    }

    const downloadedPdf = await this.provider.downloadCompletedPdf(
      parsedCommand.submissionId
    )
    const objectKey = docuSealArtifactObjectKey({
      tenantId: preflightToken.tenantId,
      projectId: preflightBom.projectId,
      submissionId: parsedCommand.submissionId,
    })
    await this.artifactStorage.upload(objectKey, downloadedPdf.bytes)
    // Never delete this deterministic object after a database error: another
    // concurrent delivery may already have committed a document row that owns
    // the same key. An unlinked object is safe to overwrite on a later replay
    // and can be reconciled without risking deletion of signed evidence.
    return this.database.client.transaction(async (transaction) => {
      const [token] = await transaction
        .select({
          id: bomPortalTokens.id,
          tenantId: bomPortalTokens.tenant_id,
          bomId: bomPortalTokens.bom_id,
          usedAt: bomPortalTokens.used_at,
        })
        .from(bomPortalTokens)
        .where(
          eq(bomPortalTokens.docuseal_submission_id, parsedCommand.submissionId)
        )
        .limit(1)
        .for('update')

      if (!token) {
        return emptyResult()
      }

      const [bom] = await transaction
        .select({
          id: boms.id,
          projectId: boms.project_id,
          tenantId: boms.tenant_id,
          lockedAt: boms.locked_at,
          tcvCents: boms.tcv_cents,
          projectName: projects.name,
        })
        .from(boms)
        .innerJoin(
          projects,
          and(
            eq(projects.id, boms.project_id),
            eq(projects.tenant_id, boms.tenant_id)
          )
        )
        .where(
          and(eq(boms.id, token.bomId), eq(boms.tenant_id, token.tenantId))
        )
        .limit(1)
        .for('update')

      if (!bom) {
        return docuSealWebhookResultSchema.parse({
          ...emptyResult(),
          tenantId: token.tenantId,
          bomId: token.bomId,
        })
      }

      if (token.usedAt) {
        return docuSealWebhookResultSchema.parse({
          received: true,
          handled: true,
          duplicate: true,
          tenantId: token.tenantId,
          bomId: bom.id,
          projectId: bom.projectId,
          projectName: bom.projectName,
          tcvCents: bom.tcvCents,
          signedDocument: null,
        })
      }

      const signedDocument = {
        name: downloadedPdf.name,
        storagePath: objectKey,
        sizeBytes: downloadedPdf.bytes.length,
      }
      const baseResult = {
        received: true as const,
        handled: true,
        duplicate: false,
        tenantId: token.tenantId,
        bomId: bom.id,
        projectId: bom.projectId,
        projectName: bom.projectName,
        tcvCents: bom.tcvCents,
        signedDocument,
      }

      const now = new Date()
      await transaction
        .update(bomPortalTokens)
        .set({ used_at: now })
        .where(
          and(
            eq(bomPortalTokens.id, token.id),
            eq(bomPortalTokens.tenant_id, token.tenantId),
            isNull(bomPortalTokens.used_at)
          )
        )

      await transaction.insert(documents).values({
        tenant_id: token.tenantId,
        project_id: bom.projectId,
        uploaded_by: null,
        document_type: 'contract',
        file_name: signedDocument.name,
        storage_path: signedDocument.storagePath,
        mime_type: 'application/pdf',
        size_bytes: signedDocument.sizeBytes,
        description: `DocuSeal-signed BOM (submission ${parsedCommand.submissionId})`,
      })

      await transaction
        .update(boms)
        .set({
          status: 'locked',
          locked_at: bom.lockedAt ?? now,
          updated_at: now,
        })
        .where(and(eq(boms.id, bom.id), eq(boms.tenant_id, token.tenantId)))

      const recipients = await transaction
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
          and(
            eq(users.tenant_id, token.tenantId),
            inArray(users.role, DOCUSEAL_NOTIFICATION_ROLES)
          )
        )

      if (recipients.length > 0) {
        await transaction.insert(notifications).values(
          recipients.map((recipient) => ({
            tenant_id: token.tenantId,
            recipient_user_id: recipient.id,
            recipient_email: recipient.email,
            channel: 'in_app' as const,
            subject: `Client signed BOM — ${bom.projectName}`,
            body: `DocuSeal recorded signature for the BOM. TCV: ₱${(
              bom.tcvCents / 100
            ).toLocaleString('en-PH', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}.`,
            link_url: `/projects/${bom.projectId}/bom`,
          }))
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: token.tenantId,
        actorId: null,
        entityType: 'bom',
        entityId: bom.id,
        action: 'lock',
        diff: {
          source: 'docuseal_webhook_nest_authority',
          submission_id: parsedCommand.submissionId,
          signed_document_name: signedDocument.name,
          signed_document_storage_path: signedDocument.storagePath,
          signed_document_size_bytes: signedDocument.sizeBytes,
          signed_document_present: true,
        },
      })

      return docuSealWebhookResultSchema.parse(baseResult)
    })
  }
}
