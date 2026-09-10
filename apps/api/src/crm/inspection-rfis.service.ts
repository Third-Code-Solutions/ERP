import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  opportunities,
  siteInspections,
  siteInspectionRfis,
  users,
} from '@third-code-erp/database/schema'
import {
  inspectionRfiListResultSchema,
  inspectionRfiQuerySchema,
  inspectionRfiRowSchema,
  inspectionRfiTransitionCommandSchema,
  inspectionRfiTransitionResultSchema,
  type InspectionRfiListResult,
  type InspectionRfiQuery,
  type InspectionRfiRow,
  type InspectionRfiTransitionCommand,
  type InspectionRfiTransitionResult,
} from '@third-code-erp/shared-types'
import {
  ERP_ROLES,
  roleHasCapability,
} from '@third-code-erp/shared-types/authorization'
import { and, asc, count, desc, eq, isNotNull, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { AuditService } from '../audit/audit.service'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

const rowSelection = {
  id: siteInspectionRfis.id,
  inspectionId: siteInspections.id,
  inspectionStatus: siteInspections.status,
  description: siteInspectionRfis.description,
  priority: siteInspectionRfis.priority,
  createdAt: siteInspectionRfis.created_at,
  resolvedAt: siteInspectionRfis.resolved_at,
  resolvedBy: siteInspectionRfis.resolved_by,
}

function serialize(row: {
  id: string
  inspectionId: string
  inspectionStatus: string
  description: string
  priority: string
  createdAt: Date
  resolvedAt: Date | null
  resolvedBy: string | null
}): InspectionRfiRow {
  return inspectionRfiRowSchema.parse({
    ...row,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  })
}

@Injectable()
export class InspectionRfisService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(
    opportunityId: string,
    query: InspectionRfiQuery,
    principal: ErpPrincipal
  ): Promise<InspectionRfiListResult> {
    const filters = inspectionRfiQuerySchema.parse(query)
    const [opportunity] = await this.database.client
      .select({ id: opportunities.id })
      .from(opportunities)
      .where(and(
        eq(opportunities.id, opportunityId),
        eq(opportunities.tenant_id, principal.tenantId)
      ))
      .limit(1)
    if (!opportunity) throw new NotFoundException('Opportunity not found')
    const predicate = and(
      eq(siteInspectionRfis.tenant_id, principal.tenantId),
      eq(siteInspections.tenant_id, principal.tenantId),
      eq(siteInspections.opportunity_id, opportunityId),
      filters.status === 'open'
        ? isNull(siteInspectionRfis.resolved_at)
        : filters.status === 'resolved'
          ? isNotNull(siteInspectionRfis.resolved_at)
          : undefined,
      filters.priority ? eq(siteInspectionRfis.priority, filters.priority) : undefined,
    )
    const join = eq(siteInspectionRfis.inspection_id, siteInspections.id)
    const [rows, totals] = await Promise.all([
      this.database.client
        .select(rowSelection)
        .from(siteInspectionRfis)
        .innerJoin(siteInspections, join)
        .where(predicate)
        .orderBy(desc(siteInspectionRfis.created_at), asc(siteInspectionRfis.id))
        .limit(filters.limit)
        .offset((filters.page - 1) * filters.limit),
      this.database.client
        .select({ total: count() })
        .from(siteInspectionRfis)
        .innerJoin(siteInspections, join)
        .where(predicate),
    ])
    const total = totals[0]?.total ?? 0
    return inspectionRfiListResultSchema.parse({
      opportunityId,
      rows: rows.map(serialize),
      total,
      page: filters.page,
      limit: filters.limit,
      totalPages: Math.max(1, Math.ceil(total / filters.limit)),
    })
  }

  async transition(
    opportunityId: string,
    rfiId: string,
    target: 'open' | 'resolved',
    command: InspectionRfiTransitionCommand,
    principal: ErpPrincipal
  ): Promise<InspectionRfiTransitionResult> {
    const input = inspectionRfiTransitionCommandSchema.parse(command)
    return this.database.client.transaction(async (transaction) => {
      // Revalidate membership under lock so a revoked role cannot commit a write.
      const [membership] = await transaction
        .select({ role: users.role })
        .from(users)
        .where(and(
          eq(users.id, principal.userId),
          eq(users.tenant_id, principal.tenantId)
        ))
        .limit(1)
        .for('share')
      const role = z.enum(ERP_ROLES).safeParse(membership?.role)
      if (!role.success || !roleHasCapability(role.data, 'site_inspection.submit')) {
        throw new ForbiddenException()
      }
      await this.audit.stampActor(transaction, principal)
      const [opportunity] = await transaction
        .select({ id: opportunities.id })
        .from(opportunities)
        .where(and(
          eq(opportunities.id, opportunityId),
          eq(opportunities.tenant_id, principal.tenantId)
        ))
        .limit(1)
        .for('share')
      if (!opportunity) throw new NotFoundException('Opportunity not found')
      // Lock both joined rows, preventing reparenting or concurrent resolution.
      const [row] = await transaction
        .select(rowSelection)
        .from(siteInspectionRfis)
        .innerJoin(
          siteInspections,
          eq(siteInspectionRfis.inspection_id, siteInspections.id)
        )
        .where(and(
          eq(siteInspectionRfis.id, rfiId),
          eq(siteInspectionRfis.tenant_id, principal.tenantId),
          eq(siteInspections.tenant_id, principal.tenantId),
          eq(siteInspections.opportunity_id, opportunityId)
        ))
        .limit(1)
        .for('update')
      if (!row) throw new NotFoundException('Inspection RFI not found')
      const expected = input.expectedResolvedAt === null
        ? null
        : new Date(input.expectedResolvedAt).getTime()
      if ((row.resolvedAt?.getTime() ?? null) !== expected) {
        throw new ConflictException('RFI changed; refresh before trying again')
      }
      const before = serialize(row)
      if ((target === 'resolved') === (row.resolvedAt !== null)) {
        return inspectionRfiTransitionResultSchema.parse({
          opportunityId, changed: false, rfi: before,
        })
      }
      const resolvedAt = target === 'resolved' ? new Date() : null
      const resolvedBy = target === 'resolved' ? principal.userId : null
      const [updated] = await transaction
        .update(siteInspectionRfis)
        .set({ resolved_at: resolvedAt, resolved_by: resolvedBy })
        .where(and(
          eq(siteInspectionRfis.id, rfiId),
          eq(siteInspectionRfis.tenant_id, principal.tenantId),
          eq(siteInspectionRfis.inspection_id, row.inspectionId)
        ))
        .returning({ id: siteInspectionRfis.id })
      if (!updated) {
        throw new InternalServerErrorException('RFI update returned no record')
      }
      const after = serialize({ ...row, resolvedAt, resolvedBy })
      await this.audit.writeSemantic(transaction, {
        tenantId: principal.tenantId,
        actorId: principal.userId,
        entityType: 'site_inspection_rfi',
        entityId: rfiId,
        action: 'status_change',
        diff: {
          opportunity_id: opportunityId,
          inspection_id: row.inspectionId,
          from: row.resolvedAt ? 'resolved' : 'open',
          to: target,
          reason: input.reason,
          resolved_at: { before: before.resolvedAt, after: after.resolvedAt },
          resolved_by: { before: before.resolvedBy, after: after.resolvedBy },
        },
      })
      return inspectionRfiTransitionResultSchema.parse({
        opportunityId, changed: true, rfi: after,
      })
    })
  }
}
