import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common'
import {
  bomPortalTokens,
  boms,
  certificatesOfCompletion,
  documents,
  notifications,
  projects,
  users,
  variationOrders,
} from '@third-code-erp/database/schema'
import {
  docuSealWebhookCommandSchema,
  docuSealWebhookResultSchema,
  type DocuSealWebhookCommand,
  type DocuSealWebhookResult,
} from '@third-code-erp/shared-types'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'
import {
  DocuSealArtifactStorage,
  docuSealArtifactObjectKey,
} from './docuseal-artifact.storage'
import { DocuSealProviderService } from './docuseal-provider.service'
import { lockProjectDocumentStorageForCreate } from './document-storage-quota'

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

type NonBomDocuSealTarget = Readonly<{
  entityType: 'variation_order' | 'certificate_of_completion'
  entityId: string
  tenantId: string
  projectId: string
  projectName: string
  signedAt: Date | null
}>

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

    if (!preflightToken) return this.handleNonBomCompletion(parsedCommand)

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

      await lockProjectDocumentStorageForCreate(
        transaction,
        { tenantId: token.tenantId, projectId: bom.projectId },
        signedDocument.sizeBytes
      )

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

  private async handleNonBomCompletion(
    command: DocuSealWebhookCommand
  ): Promise<DocuSealWebhookResult> {
    const [variationOrder, certificate] = await Promise.all([
      this.database.client
        .select({
          id: variationOrders.id,
          tenantId: variationOrders.tenant_id,
          projectId: variationOrders.project_id,
          projectName: projects.name,
          signedAt: variationOrders.signed_at,
        })
        .from(variationOrders)
        .innerJoin(
          projects,
          and(
            eq(projects.id, variationOrders.project_id),
            eq(projects.tenant_id, variationOrders.tenant_id)
          )
        )
        .where(eq(variationOrders.docuseal_submission_id, command.submissionId))
        .limit(1),
      this.database.client
        .select({
          id: certificatesOfCompletion.id,
          tenantId: certificatesOfCompletion.tenant_id,
          projectId: certificatesOfCompletion.project_id,
          projectName: projects.name,
          signedAt: certificatesOfCompletion.signed_at,
        })
        .from(certificatesOfCompletion)
        .innerJoin(
          projects,
          and(
            eq(projects.id, certificatesOfCompletion.project_id),
            eq(projects.tenant_id, certificatesOfCompletion.tenant_id)
          )
        )
        .where(
          eq(certificatesOfCompletion.docuseal_submission_id, command.submissionId)
        )
        .limit(1),
    ])

    const variation = variationOrder[0]
    const coc = certificate[0]
    if (variation && coc) {
      // Submission IDs are globally assigned by the provider. Treat a corrupt
      // cross-entity duplicate as unhandled rather than selecting a tenant by
      // query order or applying an irreversible signing transition.
      return emptyResult()
    }

    const target: NonBomDocuSealTarget | null = variation
      ? { ...variation, entityType: 'variation_order', entityId: variation.id }
      : coc
        ? {
            ...coc,
            entityType: 'certificate_of_completion',
            entityId: coc.id,
          }
        : null
    if (!target) return emptyResult()

    if (target.signedAt) {
      return docuSealWebhookResultSchema.parse({
        received: true,
        handled: true,
        duplicate: true,
        tenantId: target.tenantId,
        bomId: null,
        projectId: target.projectId,
        projectName: target.projectName,
        tcvCents: null,
        signedDocument: null,
      })
    }

    const downloadedPdf = await this.provider.downloadCompletedPdf(command.submissionId)
    const objectKey = docuSealArtifactObjectKey({
      tenantId: target.tenantId,
      projectId: target.projectId,
      submissionId: command.submissionId,
    })
    await this.artifactStorage.upload(objectKey, downloadedPdf.bytes)

    return this.database.client.transaction(async (transaction) => {
      const lockedTarget = await this.lockNonBomTarget(
        transaction,
        target.entityType,
        command.submissionId
      )
      if (!lockedTarget) return emptyResult()
      if (lockedTarget.signedAt) {
        return docuSealWebhookResultSchema.parse({
          received: true,
          handled: true,
          duplicate: true,
          tenantId: lockedTarget.tenantId,
          bomId: null,
          projectId: lockedTarget.projectId,
          projectName: lockedTarget.projectName,
          tcvCents: null,
          signedDocument: null,
        })
      }

      const signedDocument = {
        name: downloadedPdf.name,
        storagePath: objectKey,
        sizeBytes: downloadedPdf.bytes.length,
      }
      await lockProjectDocumentStorageForCreate(
        transaction,
        { tenantId: lockedTarget.tenantId, projectId: lockedTarget.projectId },
        signedDocument.sizeBytes
      )

      const [document] = await transaction
        .insert(documents)
        .values({
          tenant_id: lockedTarget.tenantId,
          project_id: lockedTarget.projectId,
          uploaded_by: null,
          document_type: 'other',
          file_name: signedDocument.name,
          storage_path: signedDocument.storagePath,
          mime_type: 'application/pdf',
          size_bytes: signedDocument.sizeBytes,
          description: `DocuSeal-signed ${lockedTarget.entityType} (submission ${command.submissionId})`,
        })
        .returning({ id: documents.id })
      if (!document) {
        throw new InternalServerErrorException(
          'Signed DocuSeal document record was not created'
        )
      }

      const now = new Date()
      if (lockedTarget.entityType === 'variation_order') {
        await transaction
          .update(variationOrders)
          .set({ status: 'signed', signed_at: now, signed_document_id: document.id })
          .where(
            and(
              eq(variationOrders.id, lockedTarget.entityId),
              eq(variationOrders.tenant_id, lockedTarget.tenantId),
              isNull(variationOrders.signed_at)
            )
          )
      } else {
        await transaction
          .update(certificatesOfCompletion)
          .set({
            status: 'signed',
            signed_at: now,
            signed_document_id: document.id,
            warranty_period_starts_at: now,
            warranty_period_ends_at: new Date(now.getTime() + 365 * 86_400_000),
          })
          .where(
            and(
              eq(certificatesOfCompletion.id, lockedTarget.entityId),
              eq(certificatesOfCompletion.tenant_id, lockedTarget.tenantId),
              isNull(certificatesOfCompletion.signed_at)
            )
          )
      }

      const recipients = await transaction
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
          and(
            eq(users.tenant_id, lockedTarget.tenantId),
            inArray(users.role, DOCUSEAL_NOTIFICATION_ROLES)
          )
        )
      if (recipients.length > 0) {
        const subject =
          lockedTarget.entityType === 'variation_order'
            ? `Client signed variation order — ${lockedTarget.projectName}`
            : `Client signed certificate of completion — ${lockedTarget.projectName}`
        await transaction.insert(notifications).values(
          recipients.map((recipient) => ({
            tenant_id: lockedTarget.tenantId,
            recipient_user_id: recipient.id,
            recipient_email: recipient.email,
            channel: 'in_app' as const,
            subject,
            body:
              lockedTarget.entityType === 'variation_order'
                ? 'DocuSeal recorded the client signature for a variation order.'
                : 'DocuSeal recorded the certificate signature and started the one-year warranty period.',
            link_url: `/projects/${lockedTarget.projectId}`,
          }))
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: lockedTarget.tenantId,
        actorId: null,
        entityType: lockedTarget.entityType,
        entityId: lockedTarget.entityId,
        action: 'status_change',
        diff: {
          source: 'docuseal_webhook_nest_authority',
          submission_id: command.submissionId,
          signed_document_name: signedDocument.name,
          signed_document_storage_path: signedDocument.storagePath,
          signed_document_size_bytes: signedDocument.sizeBytes,
          ...(lockedTarget.entityType === 'certificate_of_completion'
            ? { warranty_period_days: 365 }
            : {}),
        },
      })

      return docuSealWebhookResultSchema.parse({
        received: true,
        handled: true,
        duplicate: false,
        tenantId: lockedTarget.tenantId,
        bomId: null,
        projectId: lockedTarget.projectId,
        projectName: lockedTarget.projectName,
        tcvCents: null,
        signedDocument,
      })
    })
  }

  private async lockNonBomTarget(
    transaction: DatabaseTransaction,
    entityType: NonBomDocuSealTarget['entityType'],
    submissionId: string
  ): Promise<NonBomDocuSealTarget | null> {
    if (entityType === 'variation_order') {
      const [target] = await transaction
        .select({
          id: variationOrders.id,
          tenantId: variationOrders.tenant_id,
          projectId: variationOrders.project_id,
          projectName: projects.name,
          signedAt: variationOrders.signed_at,
        })
        .from(variationOrders)
        .innerJoin(
          projects,
          and(
            eq(projects.id, variationOrders.project_id),
            eq(projects.tenant_id, variationOrders.tenant_id)
          )
        )
        .where(eq(variationOrders.docuseal_submission_id, submissionId))
        .limit(1)
        .for('update')
      return target
        ? { ...target, entityType, entityId: target.id }
        : null
    }

    const [target] = await transaction
      .select({
        id: certificatesOfCompletion.id,
        tenantId: certificatesOfCompletion.tenant_id,
        projectId: certificatesOfCompletion.project_id,
        projectName: projects.name,
        signedAt: certificatesOfCompletion.signed_at,
      })
      .from(certificatesOfCompletion)
      .innerJoin(
        projects,
        and(
          eq(projects.id, certificatesOfCompletion.project_id),
          eq(projects.tenant_id, certificatesOfCompletion.tenant_id)
        )
      )
      .where(eq(certificatesOfCompletion.docuseal_submission_id, submissionId))
      .limit(1)
      .for('update')
    return target
      ? { ...target, entityType, entityId: target.id }
      : null
  }
}
