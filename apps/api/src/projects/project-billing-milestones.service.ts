import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common'
import {
  certificatesOfCompletion,
  invoices,
  progressClaims,
  projectWeeklyProgress,
  projects,
  tenants,
  users,
} from '@third-code-erp/database/schema'
import {
  projectBillingMilestoneListQuerySchema,
  projectBillingMilestoneListResultSchema,
  projectWeeklyProgressWarSnapshotSchema,
  type ProjectBillingMilestoneListQuery,
  type ProjectBillingMilestoneListResult,
  type ProjectBillingMilestoneRow,
} from '@third-code-erp/shared-types'
import { ERP_ROLES, roleHasCapability, type ErpCapability } from '@third-code-erp/shared-types/authorization'
import { and, asc, count, desc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

const claimStatusSchema = z.enum([
  'draft', 'submitted', 'certificate_pending', 'certified',
  'handed_over_finance', 'invoiced', 'paid', 'rejected', 'cancelled',
])

type ClaimRow = {
  claimId: string
  claimNumber: string
  milestonePct: number
  amountCents: number
  claimStatus: string
  certificateDocumentId: string | null
  invoiceId: string | null
  invoiceNumber: string | null
  invoiceStatus: string | null
}

type WarRow = {
  status: string
  weekEnding: string
  warSnapshot: unknown
}

@Injectable()
export class ProjectBillingMilestonesService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(
    projectId: string,
    query: ProjectBillingMilestoneListQuery,
    principal: ErpPrincipal,
  ): Promise<ProjectBillingMilestoneListResult> {
    const filters = projectBillingMilestoneListQuerySchema.parse(query)
    await this.requireMembership(principal, 'finance.read')
    await this.assertProject(projectId, principal.tenantId)

    const projectPredicate = and(
      eq(progressClaims.tenant_id, principal.tenantId),
      eq(progressClaims.project_id, projectId),
    )
    const [claims, totals, [coc], warRows] = await Promise.all([
      this.database.client
        .select({
          claimId: progressClaims.id,
          claimNumber: progressClaims.claim_number,
          milestonePct: progressClaims.milestone_pct,
          amountCents: progressClaims.amount_cents,
          claimStatus: progressClaims.status,
          certificateDocumentId: progressClaims.certificate_document_id,
          invoiceId: progressClaims.invoice_id,
          invoiceNumber: invoices.invoice_number,
          invoiceStatus: invoices.status,
        })
        .from(progressClaims)
        .leftJoin(
          invoices,
          and(
            eq(invoices.id, progressClaims.invoice_id),
            eq(invoices.tenant_id, principal.tenantId),
          ),
        )
        .where(projectPredicate)
        .orderBy(asc(progressClaims.milestone_pct), asc(progressClaims.claim_number))
        .limit(filters.limit)
        .offset((filters.page - 1) * filters.limit),
      this.database.client
        .select({ total: count() })
        .from(progressClaims)
        .where(projectPredicate),
      this.database.client
        .select({
          id: certificatesOfCompletion.id,
          status: certificatesOfCompletion.status,
          signedAt: certificatesOfCompletion.signed_at,
        })
        .from(certificatesOfCompletion)
        .where(
          and(
            eq(certificatesOfCompletion.tenant_id, principal.tenantId),
            eq(certificatesOfCompletion.project_id, projectId),
          ),
        )
        .limit(1),
      this.database.client
        .select({
          status: projectWeeklyProgress.status,
          weekEnding: projectWeeklyProgress.week_ending,
          warSnapshot: projectWeeklyProgress.war_snapshot,
        })
        .from(projectWeeklyProgress)
        .where(
          and(
            eq(projectWeeklyProgress.tenant_id, principal.tenantId),
            eq(projectWeeklyProgress.project_id, projectId),
            eq(projectWeeklyProgress.status, 'locked'),
          ),
        )
        .orderBy(desc(projectWeeklyProgress.week_ending))
        .limit(100),
    ])

    const total = Number(totals[0]?.total ?? 0)
    const warEvidence = this.warEvidence(warRows as WarRow[])
    const cocSummary = coc
      ? {
          id: coc.id,
          status: coc.status,
          signedAt: coc.signedAt?.toISOString() ?? null,
        }
      : null
    const rows = (claims as ClaimRow[]).map((claim) => this.serializeClaim(claim, cocSummary?.status ?? null, warEvidence))

    return projectBillingMilestoneListResultSchema.parse({
      projectId,
      coc: cocSummary,
      rows,
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    })
  }

  private serializeClaim(
    claim: ClaimRow,
    cocStatus: 'draft' | 'pending_signature' | 'signed' | null,
    evidence: ProjectBillingMilestoneRow['evidence'],
  ): ProjectBillingMilestoneRow {
    const parsedStatus = claimStatusSchema.safeParse(claim.claimStatus)
    if (!parsedStatus.success) throw new InternalServerErrorException('Stored progress claim status is invalid')
    const blockers: ProjectBillingMilestoneRow['blockers'] = []
    if (
      evidence.latestWarOverallPct === null ||
      evidence.latestWarOverallPct < claim.milestonePct
    ) {
      blockers.push('war_evidence_below_milestone')
    }
    if (claim.milestonePct >= 90 && cocStatus !== 'signed') {
      blockers.push('coc_not_signed_for_final_milestone')
    }
    if (['draft', 'submitted', 'certificate_pending', 'rejected', 'cancelled'].includes(parsedStatus.data)) {
      blockers.push('claim_not_certified')
    } else if (parsedStatus.data === 'certified') {
      blockers.push('claim_not_handed_to_finance')
    }
    if (parsedStatus.data === 'invoiced' && !claim.invoiceId) {
      blockers.push('invoice_not_linked')
    }
    if (claim.invoiceId && claim.invoiceStatus === 'draft') {
      blockers.push('invoice_not_issued')
    }
    const readyForInvoice =
      parsedStatus.data === 'handed_over_finance' &&
      !claim.invoiceId &&
      !blockers.includes('war_evidence_below_milestone') &&
      !blockers.includes('coc_not_signed_for_final_milestone')

    return {
      claimId: claim.claimId,
      claimNumber: claim.claimNumber,
      milestonePct: claim.milestonePct,
      amountCents: claim.amountCents,
      claimStatus: parsedStatus.data,
      certificateDocumentId: claim.certificateDocumentId,
      invoiceId: claim.invoiceId,
      invoiceNumber: claim.invoiceNumber,
      invoiceStatus: claim.invoiceStatus as ProjectBillingMilestoneRow['invoiceStatus'],
      cocStatus,
      evidence,
      readyForInvoice,
      blockers,
    }
  }

  private warEvidence(rows: WarRow[]): ProjectBillingMilestoneRow['evidence'] {
    const locked = rows.filter((row) => row.status === 'locked')
    const latest = locked[0]
    const snapshot = latest
      ? projectWeeklyProgressWarSnapshotSchema.safeParse(latest.warSnapshot)
      : null
    return {
      lockedWarPeriods: locked.length,
      latestWarWeekEnding: latest?.weekEnding ?? null,
      latestWarOverallPct: snapshot?.success ? snapshot.data.overallPct : null,
    }
  }

  private async assertProject(projectId: string, tenantId: string): Promise<void> {
    const [project] = await this.database.client
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId), isNull(projects.deleted_at)))
      .limit(1)
    if (!project) throw new NotFoundException('Project not found')
  }

  private async requireMembership(principal: ErpPrincipal, capability: ErpCapability): Promise<void> {
    const [membership] = await this.database.client
      .select({ tenantId: users.tenant_id, role: users.role })
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
    if (!membership || !role.success || !roleHasCapability(role.data, capability)) {
      throw new ForbiddenException()
    }
  }
}
