import { createHash } from 'node:crypto'
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
  projectSubmittalDocuments,
  projectSubmittals,
  projects,
  tenants,
  users,
} from '@third-code-erp/database/schema'
import {
  projectDocumentListQuerySchema,
  projectDocumentListResultSchema,
  projectDocumentRowSchema,
  projectSubmittalDocumentLinkCommandSchema,
  projectSubmittalDocumentLinkResultSchema,
  projectSubmittalDocumentLinkRowSchema,
  projectSubmittalDocumentListResultSchema,
  projectSubmittalDocumentUnlinkCommandSchema,
  projectSubmittalDocumentUnlinkResultSchema,
  type ProjectDocumentListQuery,
  type ProjectDocumentListResult,
  type ProjectSubmittalDocumentLinkCommand,
  type ProjectSubmittalDocumentLinkResult,
  type ProjectSubmittalDocumentLinkRow,
  type ProjectSubmittalDocumentListResult,
  type ProjectSubmittalDocumentUnlinkCommand,
  type ProjectSubmittalDocumentUnlinkResult,
} from '@third-code-erp/shared-types'
import {
  ERP_ROLES,
  roleHasCapability,
  type ErpCapability,
} from '@third-code-erp/shared-types/authorization'
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service'

const projectDocumentSelection = {
  id: documents.id,
  projectId: documents.project_id,
  fileName: documents.file_name,
  documentType: documents.document_type,
  mimeType: documents.mime_type,
  sizeBytes: documents.size_bytes,
  description: documents.description,
  createdAt: documents.created_at,
}

const linkSelection = {
  id: projectSubmittalDocuments.id,
  projectId: projectSubmittalDocuments.project_id,
  submittalId: projectSubmittalDocuments.submittal_id,
  documentId: projectSubmittalDocuments.document_id,
  role: projectSubmittalDocuments.role,
  caption: projectSubmittalDocuments.caption,
  fileName: documents.file_name,
  documentType: documents.document_type,
  mimeType: documents.mime_type,
  sizeBytes: documents.size_bytes,
  description: documents.description,
  linkedBy: projectSubmittalDocuments.linked_by,
  createdAt: projectSubmittalDocuments.created_at,
}

type ProjectDocumentDbRow = {
  id: string
  projectId: string
  fileName: string
  documentType: string
  mimeType: string
  sizeBytes: number
  description: string | null
  createdAt: Date
}

type LinkDbRow = {
  id: string
  projectId: string
  submittalId: string
  documentId: string
  role: string
  caption: string
  fileName: string
  documentType: string
  mimeType: string
  sizeBytes: number
  description: string | null
  linkedBy: string
  createdAt: Date
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function requestHash(command: ProjectSubmittalDocumentLinkCommand): string {
  return createHash('sha256')
    .update(canonicalJson({ action: 'link', command }))
    .digest('hex')
}

function serializeProjectDocument(row: ProjectDocumentDbRow) {
  return projectDocumentRowSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
  })
}

function serializeLink(row: LinkDbRow): ProjectSubmittalDocumentLinkRow {
  return projectSubmittalDocumentLinkRowSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
  })
}

@Injectable()
export class ProjectSubmittalDocumentsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listProjectDocuments(
    projectId: string,
    query: ProjectDocumentListQuery,
    principal: ErpPrincipal,
  ): Promise<ProjectDocumentListResult> {
    const filters = projectDocumentListQuerySchema.parse(query)
    const [membership] = await this.database.client
      .select({ role: users.role })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenant_id))
      .where(and(
        eq(users.id, principal.userId),
        eq(users.tenant_id, principal.tenantId),
        eq(users.account_status, 'active'),
        eq(tenants.status, 'active'),
      ))
      .limit(1)
    const role = z.enum(ERP_ROLES).safeParse(membership?.role)
    if (!role.success || !roleHasCapability(role.data, 'project.submittal.read')) throw new ForbiddenException()
    const [project] = await this.database.client
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, projectId),
          eq(projects.tenant_id, principal.tenantId),
          isNull(projects.deleted_at),
        ),
      )
      .limit(1)
    if (!project) throw new NotFoundException('Project not found')

    const predicate = and(
      eq(documents.tenant_id, principal.tenantId),
      eq(documents.project_id, projectId),
      filters.documentType
        ? eq(documents.document_type, filters.documentType)
        : undefined,
    )
    const [rows, totals] = await Promise.all([
      this.database.client
        .select(projectDocumentSelection)
        .from(documents)
        .where(predicate)
        .orderBy(desc(documents.created_at), asc(documents.id))
        .limit(filters.limit)
        .offset((filters.page - 1) * filters.limit),
      this.database.client
        .select({ total: count() })
        .from(documents)
        .where(predicate),
    ])
    const total = Number(totals[0]?.total ?? 0)
    return projectDocumentListResultSchema.parse({
      projectId,
      rows: rows.map((row) => serializeProjectDocument(row as ProjectDocumentDbRow)),
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    })
  }

  async list(
    projectId: string,
    submittalId: string,
    principal: ErpPrincipal,
  ): Promise<ProjectSubmittalDocumentListResult> {
    await this.requireMembership(principal, 'project.submittal.read')
    await this.assertSubmittal(projectId, submittalId, principal)
    const rows = await this.database.client
      .select(linkSelection)
      .from(projectSubmittalDocuments)
      .innerJoin(
        documents,
        and(
          eq(documents.id, projectSubmittalDocuments.document_id),
          eq(documents.tenant_id, projectSubmittalDocuments.tenant_id),
        ),
      )
      .where(
        and(
          eq(projectSubmittalDocuments.tenant_id, principal.tenantId),
          eq(projectSubmittalDocuments.project_id, projectId),
          eq(projectSubmittalDocuments.submittal_id, submittalId),
        ),
      )
      .orderBy(desc(projectSubmittalDocuments.created_at), asc(projectSubmittalDocuments.id))
    return projectSubmittalDocumentListResultSchema.parse({
      projectId,
      submittalId,
      rows: rows.map((row) => serializeLink(row as LinkDbRow)),
    })
  }

  async link(
    projectId: string,
    submittalId: string,
    command: ProjectSubmittalDocumentLinkCommand,
    principal: ErpPrincipal,
  ): Promise<ProjectSubmittalDocumentLinkResult> {
    const input = projectSubmittalDocumentLinkCommandSchema.parse(command)
    const hash = requestHash(input)
    const result = await this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(
        transaction,
        principal,
        'project.submittal.manage',
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const submittal = await this.lockSubmittal(
        transaction,
        projectId,
        submittalId,
        authorizedPrincipal.tenantId,
      )
      if (!submittal) throw new NotFoundException('Project submittal not found')
      if (submittal.version !== input.expectedVersion) {
        throw new ConflictException('Submittal changed; refresh before linking a document')
      }
      if (submittal.status === 'approved') {
        throw new ConflictException('Approved project submittals are immutable')
      }

      const [replay] = await transaction
        .select()
        .from(projectSubmittalDocuments)
        .where(
          and(
            eq(projectSubmittalDocuments.tenant_id, authorizedPrincipal.tenantId),
            eq(projectSubmittalDocuments.client_request_id, input.clientRequestId),
          ),
        )
        .limit(1)
      if (replay) {
        if (replay.request_hash !== hash) {
          throw new ConflictException('Client request id was already used with different document link data')
        }
        const link = await this.readLink(
          transaction,
          replay.id,
          projectId,
          submittalId,
          authorizedPrincipal.tenantId,
        )
        if (!link) throw new InternalServerErrorException('Document link replay is missing')
        return { projectId, submittalId, changed: false, submittalVersion: submittal.version, link }
      }

      const [document] = await transaction
        .select({ id: documents.id })
        .from(documents)
        .where(
          and(
            eq(documents.id, input.documentId),
            eq(documents.tenant_id, authorizedPrincipal.tenantId),
            eq(documents.project_id, projectId),
          ),
        )
        .limit(1)
      if (!document) throw new NotFoundException('Project document not found')

      const [duplicate] = await transaction
        .select({ id: projectSubmittalDocuments.id })
        .from(projectSubmittalDocuments)
        .where(
          and(
            eq(projectSubmittalDocuments.tenant_id, authorizedPrincipal.tenantId),
            eq(projectSubmittalDocuments.project_id, projectId),
            eq(projectSubmittalDocuments.submittal_id, submittalId),
            eq(projectSubmittalDocuments.document_id, input.documentId),
            eq(projectSubmittalDocuments.role, input.role),
          ),
        )
        .limit(1)
      if (duplicate) {
        throw new ConflictException('This document is already linked for that submittal role')
      }

      const [created] = await transaction
        .insert(projectSubmittalDocuments)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          project_id: projectId,
          submittal_id: submittalId,
          document_id: input.documentId,
          role: input.role,
          caption: input.caption,
          linked_by: authorizedPrincipal.userId,
          client_request_id: input.clientRequestId,
          request_hash: hash,
        })
        .returning({ id: projectSubmittalDocuments.id })
      if (!created) throw new InternalServerErrorException('Document link was not created')

      const [updatedSubmittal] = await transaction
        .update(projectSubmittals)
        .set({ version: submittal.version + 1, updated_at: new Date() })
        .where(
          and(
            eq(projectSubmittals.id, submittalId),
            eq(projectSubmittals.project_id, projectId),
            eq(projectSubmittals.tenant_id, authorizedPrincipal.tenantId),
            eq(projectSubmittals.version, submittal.version),
          ),
        )
        .returning({ version: projectSubmittals.version })
      if (!updatedSubmittal) throw new ConflictException('Submittal changed; refresh before linking a document')
      const link = await this.readLink(
        transaction,
        created.id,
        projectId,
        submittalId,
        authorizedPrincipal.tenantId,
      )
      if (!link) throw new InternalServerErrorException('Document link was not readable after creation')
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'project_submittal_document',
        entityId: created.id,
        action: 'create',
        diff: {
          project_id: projectId,
          submittal_id: submittalId,
          document_id: input.documentId,
          role: input.role,
        },
      })
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'project_submittal',
        entityId: submittalId,
        action: 'update',
        diff: {
          project_id: projectId,
          operation: 'link_document',
          document_link_id: created.id,
          from_version: submittal.version,
          to_version: updatedSubmittal.version,
        },
      })
      return { projectId, submittalId, changed: true, submittalVersion: updatedSubmittal.version, link }
    })
    return projectSubmittalDocumentLinkResultSchema.parse(result)
  }

  async unlink(
    projectId: string,
    submittalId: string,
    linkId: string,
    command: ProjectSubmittalDocumentUnlinkCommand,
    principal: ErpPrincipal,
  ): Promise<ProjectSubmittalDocumentUnlinkResult> {
    const input = projectSubmittalDocumentUnlinkCommandSchema.parse(command)
    const result = await this.database.client.transaction(async (transaction) => {
      const authorizedPrincipal = await this.requireMembershipOn(
        transaction,
        principal,
        'project.submittal.manage',
      )
      await this.audit.stampActor(transaction, authorizedPrincipal)
      const submittal = await this.lockSubmittal(
        transaction,
        projectId,
        submittalId,
        authorizedPrincipal.tenantId,
      )
      if (!submittal) throw new NotFoundException('Project submittal not found')
      if (submittal.version !== input.expectedVersion) {
        throw new ConflictException('Submittal changed; refresh before unlinking a document')
      }
      if (submittal.status === 'approved') {
        throw new ConflictException('Approved project submittals are immutable')
      }
      const [link] = await transaction
        .select({ id: projectSubmittalDocuments.id, documentId: projectSubmittalDocuments.document_id })
        .from(projectSubmittalDocuments)
        .where(
          and(
            eq(projectSubmittalDocuments.id, linkId),
            eq(projectSubmittalDocuments.tenant_id, authorizedPrincipal.tenantId),
            eq(projectSubmittalDocuments.project_id, projectId),
            eq(projectSubmittalDocuments.submittal_id, submittalId),
          ),
        )
        .limit(1)
      if (!link) throw new NotFoundException('Project submittal document link not found')
      const [deleted] = await transaction
        .delete(projectSubmittalDocuments)
        .where(
          and(
            eq(projectSubmittalDocuments.id, linkId),
            eq(projectSubmittalDocuments.tenant_id, authorizedPrincipal.tenantId),
            eq(projectSubmittalDocuments.project_id, projectId),
            eq(projectSubmittalDocuments.submittal_id, submittalId),
          ),
        )
        .returning({ id: projectSubmittalDocuments.id })
      if (!deleted) throw new ConflictException('Document link changed; refresh before unlinking')
      const [updatedSubmittal] = await transaction
        .update(projectSubmittals)
        .set({ version: submittal.version + 1, updated_at: new Date() })
        .where(
          and(
            eq(projectSubmittals.id, submittalId),
            eq(projectSubmittals.project_id, projectId),
            eq(projectSubmittals.tenant_id, authorizedPrincipal.tenantId),
            eq(projectSubmittals.version, submittal.version),
          ),
        )
        .returning({ version: projectSubmittals.version })
      if (!updatedSubmittal) throw new ConflictException('Submittal changed; refresh before unlinking a document')
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'project_submittal_document',
        entityId: linkId,
        action: 'delete',
        diff: {
          project_id: projectId,
          submittal_id: submittalId,
          document_id: link.documentId,
        },
      })
      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'project_submittal',
        entityId: submittalId,
        action: 'update',
        diff: {
          project_id: projectId,
          operation: 'unlink_document',
          document_link_id: linkId,
          from_version: submittal.version,
          to_version: updatedSubmittal.version,
        },
      })
      return { projectId, submittalId, changed: true, submittalVersion: updatedSubmittal.version, linkId }
    })
    return projectSubmittalDocumentUnlinkResultSchema.parse(result)
  }

  private async assertSubmittal(
    projectId: string,
    submittalId: string,
    principal: ErpPrincipal,
  ): Promise<void> {
    const [row] = await this.database.client
      .select({ id: projectSubmittals.id })
      .from(projectSubmittals)
      .where(
        and(
          eq(projectSubmittals.id, submittalId),
          eq(projectSubmittals.project_id, projectId),
          eq(projectSubmittals.tenant_id, principal.tenantId),
        ),
      )
      .limit(1)
    if (!row) throw new NotFoundException('Project submittal not found')
  }

  private async lockSubmittal(
    transaction: DatabaseTransaction,
    projectId: string,
    submittalId: string,
    tenantId: string,
  ): Promise<{ version: number; status: string } | undefined> {
    const [row] = await transaction
      .select({ version: projectSubmittals.version, status: projectSubmittals.status })
      .from(projectSubmittals)
      .where(
        and(
          eq(projectSubmittals.id, submittalId),
          eq(projectSubmittals.project_id, projectId),
          eq(projectSubmittals.tenant_id, tenantId),
        ),
      )
      .limit(1)
      .for('update')
    return row
  }

  private async readLink(
    transaction: DatabaseTransaction,
    linkId: string,
    projectId: string,
    submittalId: string,
    tenantId: string,
  ): Promise<ProjectSubmittalDocumentLinkRow | undefined> {
    const [row] = await transaction
      .select(linkSelection)
      .from(projectSubmittalDocuments)
      .innerJoin(
        documents,
        and(
          eq(documents.id, projectSubmittalDocuments.document_id),
          eq(documents.tenant_id, projectSubmittalDocuments.tenant_id),
        ),
      )
      .where(
        and(
          eq(projectSubmittalDocuments.id, linkId),
          eq(projectSubmittalDocuments.tenant_id, tenantId),
          eq(projectSubmittalDocuments.project_id, projectId),
          eq(projectSubmittalDocuments.submittal_id, submittalId),
        ),
      )
      .limit(1)
    return row ? serializeLink(row as LinkDbRow) : undefined
  }

  private async requireMembership(
    principal: ErpPrincipal,
    capability: ErpCapability,
  ): Promise<ErpPrincipal> {
    return this.requireMembershipOn(this.database.client, principal, capability)
  }

  private async requireMembershipOn(
    client: DatabaseService['client'] | DatabaseTransaction,
    principal: ErpPrincipal,
    capability: ErpCapability,
  ): Promise<ErpPrincipal> {
    const [membership] = await client
      .select({ tenantId: users.tenant_id, role: users.role, email: users.email })
      .from(users)
      .where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId)))
      .limit(1)
    const role = z.enum(ERP_ROLES).safeParse(membership?.role)
    if (!membership || !role.success || !roleHasCapability(role.data, capability)) {
      throw new ForbiddenException()
    }
    return {
      userId: principal.userId,
      tenantId: membership.tenantId,
      role: role.data,
      email: membership.email,
    }
  }
}
