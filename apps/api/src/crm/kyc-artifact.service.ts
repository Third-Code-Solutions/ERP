import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { accounts, accountKycArtifacts, documents, opportunities, projects, tenants, users } from '@third-code-erp/database/schema'
import {
  accountKycDocumentQuerySchema, accountKycDocumentResultSchema,
  kycArtifactCreateCommandSchema, kycArtifactCreateResultSchema,
  type AccountKycDocumentQuery, type AccountKycDocumentResult, type AccountKycDocumentRow,
  type KycArtifactCreateCommand, type KycArtifactCreateResult,
} from '@third-code-erp/shared-types'
import { and, desc, eq, ilike, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { AuditService } from '../audit/audit.service'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService, type DatabaseTransaction } from '../database/database.service'

// Each populated relationship must resolve within the tenant to this account.
// Only an opportunity with no direct account may inherit its project's account.
// Shared by options and the final locked mutation recheck; no broad OR fallback.
function eligibleDocument(tenantId: string, accountId: string): SQL {
  return sql`${documents.tenant_id} = ${tenantId}
    and (${documents.project_id} is not null or ${documents.opportunity_id} is not null)
    and (${documents.project_id} is null or exists (
      select 1 from public.projects kp where kp.id = ${documents.project_id}
      and kp.tenant_id = ${tenantId} and kp.account_id = ${accountId} and kp.deleted_at is null
    ))
    and (${documents.opportunity_id} is null or exists (
      select 1 from public.opportunities ko where ko.id = ${documents.opportunity_id}
      and ko.tenant_id = ${tenantId}
      and (ko.account_id = ${accountId} or (ko.account_id is null and exists (
        select 1 from public.projects kip where kip.id = ko.project_id
        and kip.tenant_id = ${tenantId} and kip.account_id = ${accountId} and kip.deleted_at is null
      )))
      and (ko.project_id is null or exists (
        select 1 from public.projects kcp where kcp.id = ko.project_id
        and kcp.tenant_id = ${tenantId} and kcp.account_id = ${accountId} and kcp.deleted_at is null
      ))
    ))`
}

@Injectable()
export class KycArtifactService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(accountIdInput: string, input: AccountKycDocumentQuery, principal: ErpPrincipal): Promise<AccountKycDocumentResult> {
    const accountId = z.string().uuid().parse(accountIdInput).toLowerCase()
    const query = accountKycDocumentQuerySchema.parse(input)
    // One snapshot keeps count, page and selected resolution coherent.
    return this.database.client.transaction(async (tx) => {
      const actor = await this.authorize(tx, principal)
      await this.requireAccount(tx, accountId, actor.tenantId)
      const eligibility = eligibleDocument(actor.tenantId, accountId)
      const term = query.q.replace(/[\\%_]/g, (value) => `\\${value}`)
      const where = query.q ? and(eligibility, ilike(documents.file_name, `%${term}%`)) : eligibility
      const rows = await this.documentRows(tx, accountId, where!, query.limit, (query.page - 1) * query.limit)
      const [count] = await tx.select({ total: sql<number>`count(*)::int` }).from(documents).where(where)
      const selected = query.selectedDocumentId
        ? await this.documentRows(tx, accountId, and(eligibility, eq(documents.id, query.selectedDocumentId))!, 1, 0)
        : []
      const total = Number(count?.total ?? 0)
      return accountKycDocumentResultSchema.parse({ accountId, tenantId: actor.tenantId, rows, selectedDocument: selected[0] ?? null, page: query.page, limit: query.limit, total, totalPages: Math.max(1, Math.ceil(total / query.limit)) })
    }, { isolationLevel: 'repeatable read', accessMode: 'read only' })
  }

  async create(accountIdInput: string, input: KycArtifactCreateCommand, principal: ErpPrincipal): Promise<KycArtifactCreateResult> {
    const accountId = z.string().uuid().parse(accountIdInput).toLowerCase()
    const command = kycArtifactCreateCommandSchema.parse(input)
    return this.database.client.transaction(async (tx) => {
      const actor = await this.authorize(tx, principal, true)
      await this.audit.stampActor(tx, actor)
      // Serialize only this retry identity before entity locks. Account SHARE
      // must stay compatible with conversion's opportunity→account SHARE order.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'kyc-artifact:' + actor.tenantId + ':' + command.clientRequestId}, 0))`)
      await this.requireAccount(tx, accountId, actor.tenantId, true)
      const [existing] = await tx.select().from(accountKycArtifacts).where(and(eq(accountKycArtifacts.id, command.clientRequestId), eq(accountKycArtifacts.tenant_id, actor.tenantId))).limit(1)
      if (existing) {
        if (existing.account_id !== accountId || existing.document_id !== command.documentId || existing.artifact_type !== command.artifactType || existing.notes !== command.notes || existing.uploaded_by !== actor.userId) throw new ConflictException('Artifact request identity was already used with different data')
        return kycArtifactCreateResultSchema.parse({ artifactId: existing.id, tenantId: actor.tenantId, accountId, documentId: existing.document_id, changed: false })
      }
      if (command.documentId) await this.lockEligibleDocument(tx, command.documentId, accountId, actor.tenantId)
      if (!await this.audit.tryLockTenantChain(tx, actor.tenantId)) throw new ConflictException('Another update is in progress. Retry with the same request ID.')
      const [created] = await tx.insert(accountKycArtifacts).values({ id: command.clientRequestId, tenant_id: actor.tenantId, account_id: accountId, document_id: command.documentId, artifact_type: command.artifactType, notes: command.notes, uploaded_by: actor.userId }).onConflictDoNothing({ target: accountKycArtifacts.id }).returning({ id: accountKycArtifacts.id })
      if (!created) throw new ConflictException('Artifact request identity is unavailable')
      await this.audit.writeSemantic(tx, { tenantId: actor.tenantId, actorId: actor.userId, entityType: 'account_kyc_artifact', entityId: created.id, action: 'create', diff: { source: 'kyc_artifact_core_authority', account_id: accountId, document_id: command.documentId, artifact_type: command.artifactType } })
      return kycArtifactCreateResultSchema.parse({ artifactId: created.id, tenantId: actor.tenantId, accountId, documentId: command.documentId, changed: true })
    })
  }

  private async documentRows(tx: DatabaseTransaction, accountId: string, where: SQL, limit: number, offset: number): Promise<AccountKycDocumentRow[]> {
    const rows = await tx.select({
      documentId: documents.id, tenantId: documents.tenant_id, fileName: documents.file_name,
      documentType: documents.document_type, mimeType: documents.mime_type, createdAt: documents.created_at,
      projectId: sql<string | null>`coalesce(${documents.project_id}, ${opportunities.project_id})`,
      projectName: sql<string | null>`(select kpn.name from public.projects kpn where kpn.id = coalesce(${documents.project_id}, ${opportunities.project_id}) and kpn.tenant_id = ${documents.tenant_id})`,
      opportunityId: documents.opportunity_id, opportunityStage: opportunities.stage, opportunityType: opportunities.opportunity_type,
    }).from(documents).leftJoin(opportunities, and(eq(opportunities.id, documents.opportunity_id), eq(opportunities.tenant_id, documents.tenant_id))).where(where).orderBy(desc(documents.created_at), desc(documents.id)).limit(limit).offset(offset)
    return rows.map((row) => ({ ...row, accountId, createdAt: row.createdAt.toISOString() }))
  }

  private async lockEligibleDocument(tx: DatabaseTransaction, documentId: string, accountId: string, tenantId: string): Promise<void> {
    const scope = and(eq(documents.id, documentId), eq(documents.tenant_id, tenantId))
    const [initial] = await tx.select({ projectId: documents.project_id, opportunityId: documents.opportunity_id }).from(documents).where(scope).limit(1)
    if (!initial) throw new NotFoundException('Eligible account document not found')
    const projectIds = new Set<string>(initial.projectId ? [initial.projectId] : [])
    if (initial.opportunityId) {
      const [opportunity] = await tx.select({ projectId: opportunities.project_id }).from(opportunities).where(and(eq(opportunities.id, initial.opportunityId), eq(opportunities.tenant_id, tenantId))).limit(1).for('share')
      if (!opportunity) throw new NotFoundException('Eligible account document not found')
      if (opportunity.projectId) projectIds.add(opportunity.projectId)
    }
    for (const projectId of [...projectIds].sort()) {
      const [project] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId))).limit(1).for('share')
      if (!project) throw new NotFoundException('Eligible account document not found')
    }
    const [locked] = await tx.select({ projectId: documents.project_id, opportunityId: documents.opportunity_id }).from(documents).where(scope).limit(1).for('share')
    if (!locked) throw new NotFoundException('Eligible account document not found')
    if (locked.projectId !== initial.projectId || locked.opportunityId !== initial.opportunityId) throw new ConflictException('Document ownership changed. Retry with the same request ID.')
    const [eligible] = await tx.select({ id: documents.id }).from(documents).where(and(scope, eligibleDocument(tenantId, accountId))).limit(1)
    if (!eligible) throw new NotFoundException('Eligible account document not found')
  }

  private async requireAccount(tx: DatabaseTransaction, accountId: string, tenantId: string, lock = false): Promise<void> {
    const query = tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.id, accountId), eq(accounts.tenant_id, tenantId))).limit(1)
    const [account] = await (lock ? query.for('share') : query)
    if (!account) throw new NotFoundException('Account not found')
  }

  private async authorize(tx: DatabaseTransaction, principal: ErpPrincipal, lock = false): Promise<ErpPrincipal> {
    const query = tx.select({ tenantId: users.tenant_id, role: users.role, email: users.email, accountStatus: users.account_status, tenantStatus: tenants.status }).from(users).innerJoin(tenants, eq(tenants.id, users.tenant_id)).where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId))).limit(1)
    const [membership] = await (lock ? query.for('share') : query)
    if (!membership || membership.accountStatus !== 'active' || membership.tenantStatus !== 'active' || !roleHasCapability(membership.role, 'account.create')) throw new ForbiddenException()
    return { userId: principal.userId, tenantId: membership.tenantId, role: membership.role, email: membership.email }
  }
}
