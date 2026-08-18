import { createHash } from 'node:crypto'
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  bomLineItems,
  boms,
  materialItems,
  togalBomCommitRequests,
  users,
  vendors,
} from '@third-code-erp/database/schema'
import {
  computeGP,
  computeGPMargin,
  lineTotal,
} from '@third-code-erp/shared-types/bom'
import {
  togalBomCommitCommandSchema,
  togalBomCommitResultSchema,
  type TogalBomCommitCommand,
  type TogalBomCommitResult,
} from '@third-code-erp/shared-types'
import { and, eq, inArray } from 'drizzle-orm'
import { roleHasCapability } from '../auth/capability.guard'
import type { ErpPrincipal, ErpRole } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService } from '../database/database.service'

const MAX_SAFE_INTEGER_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)
const MAX_POSTGRES_BIGINT = 9_223_372_036_854_775_807n
const MAX_BOM_QUANTITY = 2_147_483_647
const DEFAULT_MARKUP_BPS = 3_000

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`
}

function commandHash(command: TogalBomCommitCommand): string {
  return createHash('sha256').update(canonicalJson(command)).digest('hex')
}

function replayResult(value: unknown): TogalBomCommitResult {
  const parsed = togalBomCommitResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new InternalServerErrorException(
      'Togal BOM commit idempotency result is invalid'
    )
  }
  return parsed.data
}

function safeCents(value: number, message: string): number {
  if (
    !Number.isSafeInteger(value) ||
    value < 0 ||
    BigInt(value) > MAX_SAFE_INTEGER_BIGINT ||
    BigInt(value) > MAX_POSTGRES_BIGINT
  ) {
    throw new ConflictException(message)
  }
  return value
}

function validateIdempotencyKey(raw: string): string {
  const key = raw.trim()
  if (key.length === 0 || key.length > 256) {
    throw new BadRequestException('Invalid Idempotency-Key header')
  }
  return key
}

@Injectable()
export class TogalBomCommitService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async commit(
    command: TogalBomCommitCommand,
    principal: ErpPrincipal,
    rawIdempotencyKey: string
  ): Promise<TogalBomCommitResult> {
    const parsedCommand = togalBomCommitCommandSchema.parse(command)
    const idempotencyKey = validateIdempotencyKey(rawIdempotencyKey)
    const enabled = this.config.get<boolean>(
      'ERP_BOM_TOGAL_COMMIT_WRITES_ENABLED',
      false
    )
    const allowedTenantIds = this.config.get<string[]>(
      'ERP_BOM_TOGAL_COMMIT_WRITES_TENANT_IDS',
      []
    )
    if (!enabled || !allowedTenantIds.includes(principal.tenantId)) {
      throw new ServiceUnavailableException(
        'Togal BOM commit is not enabled for this tenant; no BOM lines were created.'
      )
    }

    const requestHash = commandHash(parsedCommand)
    return this.database.client.transaction(async (transaction) => {
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
      if (!membership || !role || !roleHasCapability(role, 'bom.generate')) {
        throw new ForbiddenException()
      }
      const authorizedPrincipal: ErpPrincipal = {
        userId: principal.userId,
        tenantId: membership.tenantId,
        role,
        email: membership.email,
      }
      await this.audit.stampActor(transaction, authorizedPrincipal)

      const [bom] = await transaction
        .select({
          id: boms.id,
          status: boms.status,
          totalCostCents: boms.total_cost_cents,
          tcvCents: boms.tcv_cents,
        })
        .from(boms)
        .where(
          and(
            eq(boms.id, parsedCommand.bomId),
            eq(boms.tenant_id, authorizedPrincipal.tenantId)
          )
        )
        .limit(1)
        .for('update')
      if (!bom) throw new NotFoundException('BOM not found')

      await transaction
        .insert(togalBomCommitRequests)
        .values({
          tenant_id: authorizedPrincipal.tenantId,
          bom_id: bom.id,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          created_by: authorizedPrincipal.userId,
        })
        .onConflictDoNothing({
          target: [
            togalBomCommitRequests.tenant_id,
            togalBomCommitRequests.idempotency_key,
          ],
        })

      const [request] = await transaction
        .select({
          id: togalBomCommitRequests.id,
          requestHash: togalBomCommitRequests.request_hash,
          state: togalBomCommitRequests.state,
          result: togalBomCommitRequests.result,
        })
        .from(togalBomCommitRequests)
        .where(
          and(
            eq(
              togalBomCommitRequests.tenant_id,
              authorizedPrincipal.tenantId
            ),
            eq(togalBomCommitRequests.idempotency_key, idempotencyKey)
          )
        )
        .limit(1)
        .for('update')

      if (!request) {
        throw new InternalServerErrorException(
          'Togal BOM commit idempotency record was not created'
        )
      }
      if (request.requestHash !== requestHash) {
        throw new ConflictException(
          'Idempotency key was already used with a different Togal BOM commit'
        )
      }
      if (request.state === 'succeeded') return replayResult(request.result)
      if (request.state !== 'processing') {
        throw new ConflictException(
          'Togal BOM commit idempotency record has an unsupported state'
        )
      }
      if (bom.status !== 'draft') {
        throw new ConflictException(
          `BOM is ${bom.status}; cannot commit lines`
        )
      }

      const materialIds = parsedCommand.proposedLines.flatMap((line) =>
        line.materialItemId ? [line.materialItemId] : []
      )
      if (materialIds.length > 0) {
        const materialRows = await transaction
          .select({ id: materialItems.id })
          .from(materialItems)
          .where(
            and(
              eq(materialItems.tenant_id, authorizedPrincipal.tenantId),
              inArray(materialItems.id, materialIds)
            )
          )
          .for('share')
        if (new Set(materialRows.map((row) => row.id)).size !== new Set(materialIds).size) {
          throw new NotFoundException('Material item not found')
        }
      }

      const vendorIds = parsedCommand.proposedLines.flatMap((line) =>
        line.vendorId ? [line.vendorId] : []
      )
      if (vendorIds.length > 0) {
        const vendorRows = await transaction
          .select({ id: vendors.id })
          .from(vendors)
          .where(
            and(
              eq(vendors.tenant_id, authorizedPrincipal.tenantId),
              inArray(vendors.id, vendorIds)
            )
          )
          .for('share')
        if (new Set(vendorRows.map((row) => row.id)).size !== new Set(vendorIds).size) {
          throw new NotFoundException('Vendor not found')
        }
      }

      const projectMarkupBps = parsedCommand.markupBps ?? DEFAULT_MARKUP_BPS
      let addedCostCents = 0
      let addedTcvCents = 0
      const linesToInsert = parsedCommand.proposedLines.map((line, index) => {
        const markupBps = line.markupBps ?? projectMarkupBps
        const qtyInt = line.qty
        if (!Number.isSafeInteger(qtyInt) || qtyInt < 0 || qtyInt > MAX_BOM_QUANTITY) {
          throw new ConflictException(
            'Togal BOM quantity exceeds supported integer range'
          )
        }
        const cost = safeCents(
          line.unitCostCents * qtyInt,
          'Togal BOM cost exceeds supported exact centavo range'
        )
        const total = safeCents(
          lineTotal(line.unitCostCents, qtyInt, markupBps),
          'Togal BOM line total exceeds supported exact centavo range'
        )
        addedCostCents = safeCents(
          addedCostCents + cost,
          'Togal BOM cost exceeds supported exact centavo range'
        )
        addedTcvCents = safeCents(
          addedTcvCents + total,
          'Togal BOM contract value exceeds supported exact centavo range'
        )

        const notesParts: string[] = [
          line.sourceLabel
            ? `Cost from Togal (${line.sourceLabel})`
            : 'Cost from Togal import',
        ]
        if (line.materialItemId) notesParts.push(`material:${line.materialItemId}`)
        if (line.vendorId) notesParts.push(`vendor:${line.vendorId}`)
        if (line.notes) notesParts.push(line.notes)

        return {
          tenant_id: authorizedPrincipal.tenantId,
          bom_id: bom.id,
          sort_order: index,
          is_group: 0,
          code: line.code ?? null,
          description: line.description,
          unit: line.unit ?? null,
          quantity: qtyInt,
          unit_cost_cents: line.unitCostCents,
          markup_bps: markupBps,
          line_total_cents: total,
          notes: notesParts.join(' · '),
        }
      })

      const newTotalCostCents = safeCents(
        bom.totalCostCents + addedCostCents,
        'Togal BOM cost exceeds supported exact centavo range'
      )
      const newTcvCents = safeCents(
        bom.tcvCents + addedTcvCents,
        'Togal BOM contract value exceeds supported exact centavo range'
      )
      const newGpCents = computeGP(newTcvCents, newTotalCostCents)
      const newGpMarginBps = computeGPMargin(newGpCents, newTcvCents)

      await transaction.insert(bomLineItems).values(linesToInsert)
      await transaction
        .update(boms)
        .set({
          total_cost_cents: newTotalCostCents,
          tcv_cents: newTcvCents,
          gp_cents: newGpCents,
          gp_margin_bps: newGpMarginBps,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(boms.id, bom.id),
            eq(boms.tenant_id, authorizedPrincipal.tenantId)
          )
        )

      const result = togalBomCommitResultSchema.parse({
        ok: true,
        linesCreated: linesToInsert.length,
        bomId: bom.id,
        tenantId: authorizedPrincipal.tenantId,
        totalCostCents: newTotalCostCents,
        tcvCents: newTcvCents,
        gpCents: newGpCents,
        gpMarginBps: newGpMarginBps,
      })
      const [completed] = await transaction
        .update(togalBomCommitRequests)
        .set({
          state: 'succeeded',
          result,
          completed_at: new Date(),
        })
        .where(
          and(
            eq(togalBomCommitRequests.id, request.id),
            eq(togalBomCommitRequests.state, 'processing')
          )
        )
        .returning({ id: togalBomCommitRequests.id })
      if (!completed) {
        throw new InternalServerErrorException(
          'Togal BOM commit idempotency record changed before completion'
        )
      }

      await this.audit.writeSemantic(transaction, {
        tenantId: authorizedPrincipal.tenantId,
        actorId: authorizedPrincipal.userId,
        entityType: 'bom',
        entityId: bom.id,
        action: 'update',
        diff: {
          lines_added: linesToInsert.length,
          source: 'togal_commit_nest_authority',
          total_cost_cents: {
            before: bom.totalCostCents,
            after: newTotalCostCents,
          },
          tcv_cents: { before: bom.tcvCents, after: newTcvCents },
          idempotency_key_hash: requestHash,
        },
      })

      return result
    })
  }
}
