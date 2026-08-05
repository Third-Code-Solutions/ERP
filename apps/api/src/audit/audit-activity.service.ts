import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { auditLog } from '@third-code-erp/database/schema'
import {
  auditActivityResultSchema,
  type AuditActivityQuery,
  type AuditActivityResult,
} from '@third-code-erp/shared-types'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { DatabaseService } from '../database/database.service'

interface AuditActivityDatabaseRow {
  id: string
  tenant_id: string
  actor_id: string | null
  entity_type: string
  entity_id: string
  action: string
  prev_hash: string
  hash: string
  created_at: Date | string
}

interface CountRow {
  total: string | number | bigint
}

function toIso(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString()
}

@Injectable()
export class AuditActivityService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService
  ) {}

  async list(
    query: AuditActivityQuery,
    principal: ErpPrincipal
  ): Promise<AuditActivityResult> {
    const conditions = [eq(auditLog.tenant_id, principal.tenantId)]
    if (query.entityType) {
      conditions.push(eq(auditLog.entity_type, query.entityType))
    }
    if (query.action) {
      conditions.push(eq(auditLog.action, query.action))
    }
    if (query.entityIds?.length) {
      conditions.push(inArray(auditLog.entity_id, query.entityIds))
    }
    const whereClause =
      conditions.length === 1 ? conditions[0] : and(...conditions)
    const offset = (query.page - 1) * query.limit

    const [rows, countRows] = await Promise.all([
      this.database.client
        .select({
          id: sql<string>`${auditLog.id}::text`,
          tenant_id: auditLog.tenant_id,
          actor_id: auditLog.actor_id,
          entity_type: auditLog.entity_type,
          entity_id: auditLog.entity_id,
          action: auditLog.action,
          prev_hash: auditLog.prev_hash,
          hash: auditLog.hash,
          created_at: auditLog.created_at,
        })
        .from(auditLog)
        .where(whereClause)
        .orderBy(desc(auditLog.id))
        .limit(query.limit)
        .offset(offset),
      this.database.client
        .select({ total: sql<number>`count(*)::int` })
        .from(auditLog)
        .where(whereClause),
    ])

    const total = Number((countRows[0] as CountRow | undefined)?.total ?? 0)
    if (!Number.isSafeInteger(total) || total < 0) {
      throw new BadRequestException('Audit activity count is out of range')
    }
    const totalPages = total === 0 ? 1 : Math.ceil(total / query.limit)

    return auditActivityResultSchema.parse({
      tenantId: principal.tenantId,
      rows: (rows as AuditActivityDatabaseRow[]).map((row) => ({
        id: row.id,
        tenantId: row.tenant_id,
        actorId: row.actor_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        action: row.action,
        prevHash: row.prev_hash,
        hash: row.hash,
        createdAt: toIso(row.created_at),
      })),
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
    })
  }
}
