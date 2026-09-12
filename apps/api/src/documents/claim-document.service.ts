import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  documents,
  progressClaimDocuments,
  progressClaims,
  projects,
  tenants,
  users,
} from '@third-code-erp/database/schema'
import {
  claimDocumentAttachCommandSchema,
  claimDocumentAttachResultSchema,
  type ClaimDocumentAttachCommand,
  type ClaimDocumentAttachResult,
} from '@third-code-erp/shared-types'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { AuditService } from '../audit/audit.service'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { DatabaseService, type DatabaseTransaction } from '../database/database.service'

@Injectable()
export class ClaimDocumentService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async attach(
    claimIdInput: string,
    input: ClaimDocumentAttachCommand,
    principal: ErpPrincipal,
  ): Promise<ClaimDocumentAttachResult> {
    const claimId = z.string().uuid().parse(claimIdInput).toLowerCase()
    const command = claimDocumentAttachCommandSchema.parse(input)
    return this.database.client.transaction(async (transaction) => {
      const actor = await this.authorize(transaction, principal)
      await this.audit.stampActor(transaction, actor)
      // Claim transitions UPDATE this row; hold its current status through commit.
      const [claim] = await transaction
        .select({
          id: progressClaims.id,
          projectId: progressClaims.project_id,
          status: progressClaims.status,
        })
        .from(progressClaims)
        .where(and(
          eq(progressClaims.id, claimId),
          eq(progressClaims.tenant_id, actor.tenantId),
        ))
        .limit(1)
        .for('update')
      if (!claim) throw new NotFoundException('Claim not found')

      const [existing] = await transaction
        .select()
        .from(progressClaimDocuments)
        .where(and(
          eq(progressClaimDocuments.id, command.clientRequestId),
          eq(progressClaimDocuments.tenant_id, actor.tenantId),
        ))
        .limit(1)
      if (existing) {
        if (
          existing.claim_id !== claimId ||
          existing.document_id !== command.documentId ||
          existing.kind !== command.kind ||
          existing.caption !== command.caption ||
          existing.uploaded_by !== actor.userId
        ) {
          throw new ConflictException('Attachment request identity was already used with different data')
        }
        // A committed append remains a success after a subsequent terminal transition.
        return claimDocumentAttachResultSchema.parse({
          attachmentId: existing.id,
          tenantId: actor.tenantId,
          projectId: claim.projectId,
          claimId,
          documentId: existing.document_id,
          changed: false,
        })
      }
      if (['paid', 'rejected', 'cancelled'].includes(claim.status)) {
        throw new ConflictException('Documents cannot be attached to a paid, rejected or cancelled claim')
      }

      // Retirement locks only the project, never a claim/document. Lock project
      // before document so its soft-deletion cannot race this new attachment.
      const [project] = await transaction
        .select({ id: projects.id })
        .from(projects)
        .where(and(
          eq(projects.id, claim.projectId),
          eq(projects.tenant_id, actor.tenantId),
          isNull(projects.deleted_at),
        ))
        .limit(1)
        .for('share')
      if (!project) throw new NotFoundException('Active claim project not found')
      const [document] = await transaction
        .select({ id: documents.id })
        .from(documents)
        .where(and(
          eq(documents.id, command.documentId),
          eq(documents.tenant_id, actor.tenantId),
          eq(documents.project_id, claim.projectId),
        ))
        .limit(1)
        .for('share')
      if (!document) throw new NotFoundException('Document not found in the claim project')

      // Delete-request insertion can already hold the tenant audit lock while
      // waiting for this document. Never wait on that chain with our share lock:
      // abort before any write and let the caller retry this same request ID.
      if (!await this.audit.tryLockTenantChain(transaction, actor.tenantId)) {
        throw new ConflictException('Another update is in progress. Retry with the same request ID.')
      }

      const [attachment] = await transaction
        .insert(progressClaimDocuments)
        .values({
          id: command.clientRequestId,
          tenant_id: actor.tenantId,
          claim_id: claimId,
          document_id: document.id,
          kind: command.kind,
          caption: command.caption,
          uploaded_by: actor.userId,
        })
        .onConflictDoNothing({ target: progressClaimDocuments.id })
        .returning({ id: progressClaimDocuments.id })
      // A UUID collision outside this claim/tenant must not disclose the occupying row.
      if (!attachment) throw new ConflictException('Attachment request identity is unavailable')
      await this.audit.writeSemantic(transaction, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        entityType: 'progress_claim_document',
        entityId: attachment.id,
        action: 'create',
        diff: {
          source: 'claim_document_core_authority',
          claim_id: claimId,
          project_id: claim.projectId,
          document_id: document.id,
          kind: command.kind,
        },
      })
      return claimDocumentAttachResultSchema.parse({
        attachmentId: attachment.id,
        tenantId: actor.tenantId,
        projectId: claim.projectId,
        claimId,
        documentId: document.id,
        changed: true,
      })
    })
  }

  private async authorize(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal,
  ): Promise<ErpPrincipal> {
    const [membership] = await transaction
      .select({
        tenantId: users.tenant_id,
        role: users.role,
        email: users.email,
        accountStatus: users.account_status,
        tenantStatus: tenants.status,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenant_id))
      .where(and(
        eq(users.id, principal.userId),
        eq(users.tenant_id, principal.tenantId),
      ))
      .limit(1)
      .for('share')
    const role = membership?.role as ErpRole | undefined
    if (
      !membership || !role ||
      membership.accountStatus !== 'active' ||
      membership.tenantStatus !== 'active' ||
      !roleHasCapability(role, 'document.manage')
    ) throw new ForbiddenException()
    return { userId: principal.userId, tenantId: membership.tenantId, role, email: membership.email }
  }
}
