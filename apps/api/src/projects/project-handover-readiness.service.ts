import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  certificatesOfCompletion,
  permits,
  projects,
  punchlistItems,
  turnoverPackages,
  users,
} from '@third-code-erp/database/schema'
import {
  buildProjectHandoverReadinessResult,
  projectHandoverReadinessQuerySchema,
  type ProjectHandoverReadinessQuery,
  type ProjectHandoverReadinessResult,
} from '@third-code-erp/shared-types'
import { ERP_ROLES, roleHasCapability, type ErpCapability } from '@third-code-erp/shared-types/authorization'
import { and, desc, eq, isNull, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

type TurnoverRow = {
  asBuiltDocumentId: string | null
  omManualDocumentId: string | null
  warrantyCertDocumentId: string | null
  keysLogDocumentId: string | null
  compiledAt: Date | null
}

type CocRow = { status: 'draft' | 'pending_signature' | 'signed' }
type PunchlistRow = { total: number | string | null; open: number | string | null }
type PermitRow = { status: ProjectHandoverReadinessResult['occupancyPermitStatus'] }

function numberValue(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

@Injectable()
export class ProjectHandoverReadinessService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async read(
    projectId: string,
    query: ProjectHandoverReadinessQuery,
    principal: ErpPrincipal,
    now = new Date(),
  ): Promise<ProjectHandoverReadinessResult> {
    projectHandoverReadinessQuerySchema.parse(query)
    await this.requireMembership(principal, 'project.read')

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

    const [turnoverRows, cocRows, punchlistRows, permitRows] = await Promise.all([
      this.database.client
        .select({
          asBuiltDocumentId: turnoverPackages.as_built_document_id,
          omManualDocumentId: turnoverPackages.om_manual_document_id,
          warrantyCertDocumentId: turnoverPackages.warranty_cert_document_id,
          keysLogDocumentId: turnoverPackages.keys_log_document_id,
          compiledAt: turnoverPackages.compiled_at,
        })
        .from(turnoverPackages)
        .where(
          and(
            eq(turnoverPackages.tenant_id, principal.tenantId),
            eq(turnoverPackages.project_id, projectId),
          ),
        )
        .orderBy(desc(turnoverPackages.created_at))
        .limit(1) as Promise<TurnoverRow[]>,
      this.database.client
        .select({ status: certificatesOfCompletion.status })
        .from(certificatesOfCompletion)
        .where(
          and(
            eq(certificatesOfCompletion.tenant_id, principal.tenantId),
            eq(certificatesOfCompletion.project_id, projectId),
          ),
        )
        .orderBy(desc(certificatesOfCompletion.created_at))
        .limit(1) as Promise<CocRow[]>,
      this.database.client
        .select({
          total: sql<number>`count(*)::int`,
          open: sql<number>`count(*) filter (where ${punchlistItems.status} <> 'closed')::int`,
        })
        .from(punchlistItems)
        .where(
          and(
            eq(punchlistItems.tenant_id, principal.tenantId),
            eq(punchlistItems.project_id, projectId),
          ),
        ) as Promise<PunchlistRow[]>,
      this.database.client
        .select({ status: permits.status })
        .from(permits)
        .where(
          and(
            eq(permits.tenant_id, principal.tenantId),
            eq(permits.project_id, projectId),
            eq(permits.permit_type, 'occupancy_permit'),
          ),
        )
        .orderBy(desc(permits.updated_at))
        .limit(1) as Promise<PermitRow[]>,
    ])

    const turnover = turnoverRows[0]
    const attachedSlotCount = turnover
      ? [
          turnover.asBuiltDocumentId,
          turnover.omManualDocumentId,
          turnover.warrantyCertDocumentId,
          turnover.keysLogDocumentId,
        ].filter((value) => value !== null).length
      : 0
    const punchlist = punchlistRows[0]
    return buildProjectHandoverReadinessResult(projectId, now.toISOString(), {
      turnoverPackageExists: turnover !== undefined,
      turnoverCompiled: turnover?.compiledAt !== null && turnover?.compiledAt !== undefined,
      attachedSlotCount,
      requiredSlotCount: 4,
      cocStatus: cocRows[0]?.status ?? null,
      totalPunchlistCount: numberValue(punchlist?.total),
      openPunchlistCount: numberValue(punchlist?.open),
      occupancyPermitStatus: permitRows[0]?.status ?? null,
    })
  }

  private async requireMembership(
    principal: ErpPrincipal,
    capability: ErpCapability,
  ): Promise<void> {
    const [membership] = await this.database.client
      .select({ tenantId: users.tenant_id, role: users.role, email: users.email })
      .from(users)
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.tenant_id, principal.tenantId),
        ),
      )
      .limit(1)
    const role = z.enum(ERP_ROLES).safeParse(membership?.role)
    if (!role.success || !roleHasCapability(role.data, capability)) {
      throw new ForbiddenException()
    }
  }
}
