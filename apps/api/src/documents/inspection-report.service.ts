import { createHash } from 'node:crypto'
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { accounts, documents, opportunities, projects, siteInspectionPhotos, siteInspections, tenants, users } from '@third-code-erp/database/schema'
import { inspectionReportArchiveCommandSchema, inspectionReportArchiveResultSchema, type InspectionReportArchiveCommand, type InspectionReportArchiveResult } from '@third-code-erp/shared-types'
import { ERP_ROLES } from '@third-code-erp/shared-types/authorization'
import { buildInspectionReportHtml } from '@third-code-erp/shared-types/inspection-report'
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { AuditService } from '../audit/audit.service'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'
import { InspectionReportStorageService } from './inspection-report.storage'

@Injectable()
export class InspectionReportService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(InspectionReportStorageService) private readonly storage: Pick<InspectionReportStorageService, 'ensure'>,
  ) {}

  async archive(input: InspectionReportArchiveCommand, principal: ErpPrincipal): Promise<InspectionReportArchiveResult> {
    const parsed = inspectionReportArchiveCommandSchema.safeParse(input)
    if (!parsed.success) throw new BadRequestException('Invalid inspection report request')
    const command = parsed.data
    try {
      return await this.database.client.transaction(async tx => {
        const [actor] = await tx.select({ tenantId: users.tenant_id, role: users.role, email: users.email }).from(users)
          .where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId), eq(users.account_status, 'active'))).limit(1).for('share', { noWait: true })
        const role = z.enum(ERP_ROLES).safeParse(actor?.role)
        if (!actor || !role.success || !roleHasCapability(role.data, 'site_inspection.submit')) throw new ForbiddenException()
        const [tenant] = await tx.select({ name: tenants.name, bir_tin: tenants.bir_tin, pcab_license: tenants.pcab_license }).from(tenants)
          .where(and(eq(tenants.id, actor.tenantId), eq(tenants.status, 'active'))).limit(1).for('share', { noWait: true })
        if (!tenant) throw new ForbiddenException()
        const current = { ...principal, tenantId: actor.tenantId, role: role.data, email: actor.email }
        await this.audit.stampActor(tx, current)
        const [opportunity] = await tx.select({ id: opportunities.id, projectId: opportunities.project_id, accountId: opportunities.account_id }).from(opportunities)
          .where(and(eq(opportunities.id, command.opportunityId), eq(opportunities.tenant_id, actor.tenantId))).limit(1).for('update')
        if (!opportunity) throw new NotFoundException('Opportunity not found')
        const [inspection] = await tx.select().from(siteInspections)
          .where(and(eq(siteInspections.id, command.inspectionId), eq(siteInspections.opportunity_id, opportunity.id), eq(siteInspections.tenant_id, actor.tenantId))).limit(1).for('update')
        if (!inspection) throw new NotFoundException('Inspection not found')
        if (inspection.status === 'draft' || !inspection.submitted_at || !Number.isFinite(inspection.submitted_at.getTime()) || !inspection.submitted_by) {
          throw new ConflictException('Inspection has no valid submitted findings to archive')
        }
        const result = (documentId: string, replayed: boolean): InspectionReportArchiveResult => inspectionReportArchiveResultSchema.parse({ tenantId: actor.tenantId, opportunityId: opportunity.id, inspectionId: inspection.id, documentId, status: 'archived', replayed })
        if (inspection.pdf_document_id) {
          const [receipt] = await tx.select({ id: documents.id, type: documents.document_type, mime: documents.mime_type }).from(documents)
            .where(and(eq(documents.id, inspection.pdf_document_id), eq(documents.tenant_id, actor.tenantId), eq(documents.opportunity_id, opportunity.id))).limit(1).for('share')
          if (!receipt || receipt.type !== 'other' || receipt.mime?.split(';')[0]?.trim().toLowerCase() !== 'text/html') throw new ConflictException('Inspection report receipt does not match its opportunity or report type')
          return result(receipt.id, true)
        }
        const [inspector] = await tx.select({ full_name: users.full_name, email: users.email }).from(users)
          .where(and(eq(users.id, inspection.submitted_by), eq(users.tenant_id, actor.tenantId))).limit(1).for('share', { noWait: true })
        if (!inspector) throw new ConflictException('The original inspection author cannot be verified')
        const photos = await tx.select({ id: siteInspectionPhotos.id, document_id: siteInspectionPhotos.document_id, caption: siteInspectionPhotos.caption }).from(siteInspectionPhotos)
          .where(and(eq(siteInspectionPhotos.tenant_id, actor.tenantId), eq(siteInspectionPhotos.inspection_id, inspection.id))).orderBy(asc(siteInspectionPhotos.created_at), asc(siteInspectionPhotos.id))
        const [project] = opportunity.projectId ? await tx.select({ id: projects.id, name: projects.name, client: projects.client, location: projects.location }).from(projects)
          .where(and(eq(projects.id, opportunity.projectId), eq(projects.tenant_id, actor.tenantId))).limit(1) : []
        const [account] = opportunity.accountId ? await tx.select({ id: accounts.id, name: accounts.name, billing_address: accounts.billing_address }).from(accounts)
          .where(and(eq(accounts.id, opportunity.accountId), eq(accounts.tenant_id, actor.tenantId))).limit(1) : []
        const bytes = Buffer.from(buildInspectionReportHtml({ inspection, photos, rfis: [], project: project ?? null, account: account ?? null,
          brand: { tenant_name: tenant.name, bir_tin: tenant.bir_tin, pcab_license: tenant.pcab_license, inspector_name: inspector.full_name || inspector.email } }), 'utf8')
        const sha256 = createHash('sha256').update(bytes).digest('hex')
        const storagePath = `${actor.tenantId}/opportunities/${opportunity.id}/inspections/${inspection.id}/report-${sha256}.html`
        await this.storage.ensure({ storagePath, bytes })
        // A busy audit chain is retryable; never wait for it while holding entity locks.
        if (!await this.audit.tryLockTenantChain(tx, actor.tenantId)) throw new ConflictException('Report authority is busy; retry the same inspection')
        const [document] = await tx.insert(documents).values({ tenant_id: actor.tenantId, opportunity_id: opportunity.id, project_id: opportunity.projectId, uploaded_by: current.userId,
          document_type: 'other', file_name: `inspection-report-${inspection.id}.html`, storage_path: storagePath, mime_type: 'text/html; charset=utf-8', size_bytes: bytes.length,
          description: `Site Inspection Report (auto-generated) for inspection ${inspection.id}` }).returning({ id: documents.id })
        if (!document) throw new ConflictException('Report document was not recorded')
        const [linked] = await tx.update(siteInspections).set({ pdf_document_id: document.id, updated_at: new Date() })
          .where(and(eq(siteInspections.id, inspection.id), eq(siteInspections.tenant_id, actor.tenantId))).returning({ id: siteInspections.id })
        if (!linked) throw new ConflictException('Inspection report link was not recorded')
        await this.audit.writeSemantic(tx, { tenantId: actor.tenantId, actorId: current.userId, entityType: 'site_inspection', entityId: inspection.id, action: 'update',
          diff: { source: 'inspection_report_archive_service', opportunity_id: opportunity.id, document_id: document.id, original_inspector_id: inspection.submitted_by, submitted_at: inspection.submitted_at.toISOString(), sha256, size_bytes: bytes.length } })
        return result(document.id, false)
      })
    } catch (error) {
      let cause: unknown = error
      const seen = new Set<unknown>()
      while (cause instanceof Object && !seen.has(cause)) {
        seen.add(cause)
        if ('code' in cause && ['55P03', '40P01'].includes(String(cause.code))) throw new ConflictException('Report authority is changing; retry the same inspection')
        cause = 'cause' in cause ? cause.cause : undefined
      }
      throw error
    }
  }
}
