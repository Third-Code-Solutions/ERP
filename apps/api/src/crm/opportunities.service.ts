import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import {
  accounts,
  changeRequests,
  designFiles,
  opportunities,
  pprfSubmissions,
  projects,
  siteInspections,
} from '@third-code-erp/database/schema'
import {
  opportunityDetailResultSchema,
  type OpportunityDetailResult,
} from '@third-code-erp/shared-types'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

@Injectable()
export class OpportunitiesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async read(
    opportunityId: string,
    principal: ErpPrincipal
  ): Promise<OpportunityDetailResult> {
    const [opportunity] = await this.database.client
      .select({
        id: opportunities.id,
        tenantId: opportunities.tenant_id,
        stage: opportunities.stage,
        tcvCents: opportunities.tcv_cents,
        gpCents: opportunities.gp_cents,
        probability: opportunities.probability,
        weightedTcvCents: opportunities.weighted_tcv_cents,
        areaSqm: opportunities.area_sqm,
        opportunityType: opportunities.opportunity_type,
        closingDate: opportunities.closing_date,
        accountId: opportunities.account_id,
        projectId: opportunities.project_id,
        prospectiveProjectName: opportunities.prospective_project_name,
        accountName: accounts.name,
        projectName: projects.name,
      })
      .from(opportunities)
      .leftJoin(
        accounts,
        and(
          eq(opportunities.account_id, accounts.id),
          eq(accounts.tenant_id, principal.tenantId)
        )
      )
      .leftJoin(
        projects,
        and(
          eq(opportunities.project_id, projects.id),
          eq(projects.tenant_id, principal.tenantId)
        )
      )
      .where(
        and(
          eq(opportunities.id, opportunityId),
          eq(opportunities.tenant_id, principal.tenantId)
        )
      )
      .limit(1)

    if (!opportunity) throw new NotFoundException('Opportunity not found')

    const [pprfRows, inspectionRows, designRows, changeRequestRows] =
      await Promise.all([
        this.database.client
          .select({ version: pprfSubmissions.version })
          .from(pprfSubmissions)
          .where(
            and(
              eq(pprfSubmissions.opportunity_id, opportunityId),
              eq(pprfSubmissions.tenant_id, principal.tenantId)
            )
          )
          .orderBy(desc(pprfSubmissions.version))
          .limit(1),
        this.database.client
          .select({ id: siteInspections.id, status: siteInspections.status })
          .from(siteInspections)
          .where(
            and(
              eq(siteInspections.opportunity_id, opportunityId),
              eq(siteInspections.tenant_id, principal.tenantId)
            )
          )
          .orderBy(desc(siteInspections.created_at))
          .limit(1),
        this.database.client
          .select({
            designCount: sql<number>`count(*)::int`,
            approvedDesignCount: sql<number>`count(*) FILTER (WHERE ${designFiles.is_client_approved})::int`,
          })
          .from(designFiles)
          .where(
            and(
              eq(designFiles.opportunity_id, opportunityId),
              eq(designFiles.tenant_id, principal.tenantId)
            )
          ),
        this.database.client
          .select({
            openChangeRequestCount: sql<number>`count(*) FILTER (WHERE ${changeRequests.resolved_at} IS NULL)::int`,
          })
          .from(changeRequests)
          .where(
            and(
              eq(changeRequests.opportunity_id, opportunityId),
              eq(changeRequests.tenant_id, principal.tenantId)
            )
          ),
      ])

    return opportunityDetailResultSchema.parse({
      opportunity: {
        id: opportunity.id,
        tenantId: opportunity.tenantId,
        stage: opportunity.stage,
        tcvCents: opportunity.tcvCents,
        gpCents: opportunity.gpCents,
        probability: opportunity.probability,
        weightedTcvCents: opportunity.weightedTcvCents,
        areaSqm: opportunity.areaSqm,
        opportunityType: opportunity.opportunityType,
        closingDate: opportunity.closingDate?.toISOString() ?? null,
        accountId: opportunity.accountId,
        projectId: opportunity.projectId,
        prospectiveProjectName: opportunity.prospectiveProjectName,
        accountName: opportunity.accountName,
        projectName: opportunity.projectName,
      },
      progress: {
        latestPprfVersion: pprfRows[0]?.version ?? null,
        latestInspection: inspectionRows[0]
          ? {
              id: inspectionRows[0].id,
              status: inspectionRows[0].status,
            }
          : null,
        designCount: Number(designRows[0]?.designCount ?? 0),
        approvedDesignCount: Number(
          designRows[0]?.approvedDesignCount ?? 0
        ),
        openChangeRequestCount: Number(
          changeRequestRows[0]?.openChangeRequestCount ?? 0
        ),
      },
    })
  }
}
