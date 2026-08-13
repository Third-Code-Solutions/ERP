import { db } from '@third-code-erp/database'
import {
  accounts,
  changeRequests,
  designFiles,
  opportunities,
  pprfSubmissions,
  projects,
  siteInspections,
} from '@third-code-erp/database/schema'
import type { Opportunity } from '@third-code-erp/database/schema'
import { opportunityReadsUseCoreApi, getOpportunityThroughCoreApi } from './erp-core-client'
import { and, desc, eq } from 'drizzle-orm'

export interface OpportunityDetailPageData {
  opp: {
    id: string
    stage: Opportunity['stage']
    tcv_cents: number
    gp_cents: number
    probability: number
    weighted_tcv_cents: number
    area_sqm: number | null
    opportunity_type: string | null
    closing_date: Date | null
    account_id: string | null
    project_id: string | null
    account_name: string | null
    project_name: string | null
  }
  latestPprfVersion: number | null
  latestInspection: { id: string; status: string } | null
  designCount: number
  approvedDesignCount: number
  openCrCount: number
}

export async function getOpportunityDetail(
  tenantId: string,
  opportunityId: string
): Promise<OpportunityDetailPageData | null> {
  if (opportunityReadsUseCoreApi(tenantId)) {
    const result = await getOpportunityThroughCoreApi(opportunityId)
    if (!result.ok || !result.data) {
      if (result.error === 'Opportunity not found.') return null
      throw new Error(result.error ?? 'Opportunity detail was not read')
    }
    const { opportunity, progress } = result.data
    if (opportunity.id !== opportunityId || opportunity.tenantId !== tenantId) {
      throw new Error('Opportunity detail returned an invalid tenant scope')
    }
    return {
      opp: {
        id: opportunity.id,
        stage: opportunity.stage,
        tcv_cents: opportunity.tcvCents,
        gp_cents: opportunity.gpCents,
        probability: opportunity.probability,
        weighted_tcv_cents: opportunity.weightedTcvCents,
        area_sqm: opportunity.areaSqm,
        opportunity_type: opportunity.opportunityType,
        closing_date: opportunity.closingDate
          ? new Date(opportunity.closingDate)
          : null,
        account_id: opportunity.accountId,
        project_id: opportunity.projectId,
        account_name: opportunity.accountName,
        project_name: opportunity.projectName,
      },
      latestPprfVersion: progress.latestPprfVersion,
      latestInspection: progress.latestInspection,
      designCount: progress.designCount,
      approvedDesignCount: progress.approvedDesignCount,
      openCrCount: progress.openChangeRequestCount,
    }
  }

  const [opp] = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      tcv_cents: opportunities.tcv_cents,
      gp_cents: opportunities.gp_cents,
      probability: opportunities.probability,
      weighted_tcv_cents: opportunities.weighted_tcv_cents,
      area_sqm: opportunities.area_sqm,
      opportunity_type: opportunities.opportunity_type,
      closing_date: opportunities.closing_date,
      account_id: opportunities.account_id,
      project_id: opportunities.project_id,
      account_name: accounts.name,
      project_name: projects.name,
    })
    .from(opportunities)
    .leftJoin(
      accounts,
      and(
        eq(opportunities.account_id, accounts.id),
        eq(accounts.tenant_id, tenantId)
      )
    )
    .leftJoin(
      projects,
      and(
        eq(opportunities.project_id, projects.id),
        eq(projects.tenant_id, tenantId)
      )
    )
    .where(
      and(eq(opportunities.id, opportunityId), eq(opportunities.tenant_id, tenantId))
    )
    .limit(1)

  if (!opp) return null

  const [pprfRows, inspectionRows, designRows, crRows] = await Promise.all([
    db
      .select({ version: pprfSubmissions.version })
      .from(pprfSubmissions)
      .where(
        and(
          eq(pprfSubmissions.opportunity_id, opportunityId),
          eq(pprfSubmissions.tenant_id, tenantId)
        )
      )
      .orderBy(desc(pprfSubmissions.version))
      .limit(1),
    db
      .select({ id: siteInspections.id, status: siteInspections.status })
      .from(siteInspections)
      .where(
        and(
          eq(siteInspections.opportunity_id, opportunityId),
          eq(siteInspections.tenant_id, tenantId)
        )
      )
      .orderBy(desc(siteInspections.created_at))
      .limit(1),
    db
      .select({
        id: designFiles.id,
        is_client_approved: designFiles.is_client_approved,
      })
      .from(designFiles)
      .where(
        and(
          eq(designFiles.opportunity_id, opportunityId),
          eq(designFiles.tenant_id, tenantId)
        )
      ),
    db
      .select({ id: changeRequests.id, resolved_at: changeRequests.resolved_at })
      .from(changeRequests)
      .where(
        and(
          eq(changeRequests.opportunity_id, opportunityId),
          eq(changeRequests.tenant_id, tenantId)
        )
      ),
  ])

  return {
    opp,
    latestPprfVersion: pprfRows[0]?.version ?? null,
    latestInspection: inspectionRows[0] ?? null,
    designCount: designRows.length,
    approvedDesignCount: designRows.filter((row) => row.is_client_approved).length,
    openCrCount: crRows.filter((row) => !row.resolved_at).length,
  }
}
