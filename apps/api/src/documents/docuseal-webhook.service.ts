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
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async handle(
    command: DocuSealWebhookCommand
  ): Promise<DocuSealWebhookResult> {
    const parsedCommand = docuSealWebhookCommandSchema.parse(command)
    if (parsedCommand.event !== 'submission.completed') {
      return emptyResult()
    }

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
          eq(
            bomPortalTokens.docuseal_submission_id,
            parsedCommand.submissionId
          )
        )
        .limit(1)
        .for('update')

      if (!token) return emptyResult()

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
          and(
            eq(boms.id, token.bomId),
            eq(boms.tenant_id, token.tenantId)
          )
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

      const signedDocument = parsedCommand.documents[0] ?? null
      const baseResult = {
        received: true as const,
        handled: true,
        duplicate: Boolean(token.usedAt),
        tenantId: token.tenantId,
        bomId: bom.id,
        projectId: bom.projectId,
        projectName: bom.projectName,
        tcvCents: bom.tcvCents,
        signedDocument,
      }

      if (token.usedAt) {
        return docuSealWebhookResultSchema.parse(baseResult)
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

      if (signedDocument) {
        await transaction.insert(documents).values({
          tenant_id: token.tenantId,
          project_id: bom.projectId,
          uploaded_by: null,
          document_type: 'contract',
          file_name:
            signedDocument.name ?? `bom-${bom.id}-signed.pdf`,
          storage_path: signedDocument.url,
          mime_type: 'application/pdf',
          size_bytes: 0,
          description: `DocuSeal-signed BOM (submission ${parsedCommand.submissionId})`,
        })
      }

      await transaction
        .update(boms)
        .set({
          status: 'locked',
          locked_at: bom.lockedAt ?? now,
          updated_at: now,
        })
        .where(
          and(
            eq(boms.id, bom.id),
            eq(boms.tenant_id, token.tenantId)
          )
        )

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
          signed_document_name: signedDocument?.name ?? null,
          signed_document_present: Boolean(signedDocument),
        },
      })

      return docuSealWebhookResultSchema.parse(baseResult)
    })
  }
}
