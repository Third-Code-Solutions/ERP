import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  documents,
  opportunities,
  users,
} from '@third-code-erp/database/schema'
import {
  inspectionPhotoCommandSchema,
  inspectionPhotoResultSchema,
  type InspectionPhotoCommand,
  type InspectionPhotoResult,
} from '@third-code-erp/shared-types'
import { and, eq } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type {
  ErpPrincipal,
  ErpRole,
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
          eq(users.tenant_id, principal.tenantId)
        )
      )
      .limit(1)
      .for('update')
    const role = membership?.role as ErpRole | undefined
    if (!membership || !role || !roleHasCapability(role, 'site_inspection.submit')) {
      throw new ForbiddenException()
    }
    return {
      userId: principal.userId,
      tenantId: membership.tenantId,
      role,
      email: membership.email,
    }
  }
}
