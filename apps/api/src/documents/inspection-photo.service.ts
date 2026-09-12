import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  documents,
  opportunities,
  tenants,
  users,
} from '@third-code-erp/database/schema'
import {
  inspectionPhotoCommandSchema,
  inspectionPhotoResultSchema,
  type InspectionPhotoCommand,
  type InspectionPhotoResult,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { ERP_ROLES } from '@third-code-erp/shared-types/authorization'
import { z } from 'zod'
import { roleHasCapability } from '../auth/capability.guard'
import type {
  ErpPrincipal,
} from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

function expectedStoragePrefix(tenantId: string, opportunityId: string): string {
  return `${tenantId}/opportunities/${opportunityId}/inspection/`
}

@Injectable()
export class InspectionPhotoService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async create(
    input: InspectionPhotoCommand,
    principal: ErpPrincipal
  ): Promise<InspectionPhotoResult> {
    const command = inspectionPhotoCommandSchema.parse(input)

    return this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.authorize(transaction, principal)
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const [opportunity] = await transaction
        .select({ id: opportunities.id, projectId: opportunities.project_id })
        .from(opportunities)
        .where(
          and(
            eq(opportunities.id, command.opportunityId),
            eq(opportunities.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!opportunity) throw new NotFoundException('Opportunity not found')

      const prefix = expectedStoragePrefix(
        authorizedPrincipal.tenantId,
        opportunity.id
      )
      if (
        !command.storagePath.startsWith(prefix) ||
        command.storagePath.includes('..')
      ) {
        throw new ForbiddenException(
          'Inspection photo storage path is outside the tenant opportunity scope'
        )
      }

      const [existing] = await transaction
        .select({
          id: documents.id,
          projectId: documents.project_id,
          fileName: documents.file_name,
          storagePath: documents.storage_path,
          documentType: documents.document_type,
          mimeType: documents.mime_type,
          sizeBytes: documents.size_bytes,
          description: documents.description,
        })
        .from(documents)
        .where(
          and(
            eq(documents.tenant_id, authorizedPrincipal.tenantId),
            eq(documents.opportunity_id, opportunity.id),
            eq(documents.storage_path, command.storagePath)
          )
        )
        .limit(1)
        .for('share')
      if (existing) {
        if (
          existing.documentType !== 'image' ||
          existing.fileName !== command.fileName ||
          existing.mimeType !== command.mimeType ||
          existing.sizeBytes !== command.sizeBytes ||
          existing.description !== (command.caption || 'WO-12 site inspection photo')
        ) {
          throw new ConflictException('Inspection photo path was already registered with different metadata')
        }
        return inspectionPhotoResultSchema.parse({
          documentId: existing.id,
          tenantId: authorizedPrincipal.tenantId,
          opportunityId: opportunity.id,
          projectId: existing.projectId,
          storagePath: existing.storagePath,
          fileName: existing.fileName,
          status: 'created',
        })
      }

      const [document] = await transaction
        .insert(documents)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: opportunity.projectId,
          opportunity_id: opportunity.id,
          uploaded_by: authorizedPrincipal.userId,
          document_type: 'image',
          file_name: command.fileName,
          storage_path: command.storagePath,
          mime_type: command.mimeType,
          size_bytes: command.sizeBytes,
          description: command.caption || 'WO-12 site inspection photo',
        })
        .returning({ id: documents.id })
      if (!document) {
        throw new InternalServerErrorException(
          'Inspection photo document was not created'
        )
      }

      const result = inspectionPhotoResultSchema.parse({
        documentId: document.id,
        tenantId: authorizedPrincipal.tenantId,
        opportunityId: opportunity.id,
        projectId: opportunity.projectId,
        storagePath: command.storagePath,
        fileName: command.fileName,
        status: 'created',
      })

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'document',
        entityId: document.id,
        action: 'create',
        diff: {
          source: 'site_inspection_photo_core_authority',
          opportunity_id: opportunity.id,
          project_id: opportunity.projectId,
          size_bytes: command.sizeBytes,
          mime_type: command.mimeType,
        },
      })

      return result
    }).catch((error: unknown) => {
      // Drizzle wraps PostgreSQL failures; translate only after the transaction rolled back.
      let cause: unknown = error
      const seen = new Set<unknown>()
      while (cause instanceof Object && !seen.has(cause)) {
        seen.add(cause)
        if ('code' in cause && cause.code === '55P03') {
          throw new ConflictException('Inspection photo authority is changing; retry the same request')
        }
        cause = 'cause' in cause ? cause.cause : undefined
      }
      throw error
    })
  }

  private async authorize(
    transaction: DatabaseTransaction,
    principal: ErpPrincipal
  ): Promise<ErpPrincipal> {
    const [membership] = await transaction
      .select({
        tenantId: users.tenant_id,
        role: users.role,
        email: users.email,
      })
      .from(users)
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.tenant_id, principal.tenantId),
          eq(users.account_status, 'active')
        )
      )
      .limit(1)
      .for('share', { noWait: true })
    const role = z.enum(ERP_ROLES).safeParse(membership?.role)
    if (!membership || !role.success || !roleHasCapability(role.data, 'site_inspection.submit')) {
      throw new ForbiddenException()
    }
    const [tenant] = await transaction
      .select({ id: tenants.id })
      .from(tenants)
      .where(and(eq(tenants.id, principal.tenantId), eq(tenants.status, 'active')))
      .limit(1)
      .for('share', { noWait: true })
    if (!tenant) throw new ForbiddenException()
    return {
      userId: principal.userId,
      tenantId: membership.tenantId,
      role: role.data,
      email: membership.email,
    }
  }
}
