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
  auditLog,
  boms,
  progressClaims,
  projects,
  tenants,
  users,
  variationOrders,
} from '@third-code-erp/database/schema'
import {
  CLAIM_CAP_EXCEEDED_CODE,
  claimDraftCommandReceiptSchema,
  claimDraftPayload,
  createClaimDraftCommandSchema,
  createClaimDraftResultSchema,
  type ClaimDraftCommandReceipt,
  type CreateClaimDraftCommand,
  type CreateClaimDraftResult,
} from '@third-code-erp/shared-types'
import { ERP_ROLES, roleHasCapability } from '@third-code-erp/shared-types/authorization'
import { and, desc, eq, inArray, isNull, notInArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { ErpPrincipal } from '../auth/current-principal.decorator'
import { AuditService } from '../audit/audit.service'
import { DatabaseService, type DatabaseTransaction } from '../database/database.service'

const CLAIM_COMMAND_ENTITY = 'progress_claim_command'
const CREATE_ACTION = 'create'
const MAX_SUFFIX_DIGITS = 29
// A rejected or cancelled claim no longer counts against the contract value.
const RELEASED_CLAIM_STATUSES: Array<'rejected' | 'cancelled'> = ['rejected', 'cancelled']

function pgCode(error: unknown): string | undefined {
  const seen = new Set<object>()
  let current: unknown = error
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    if ('code' in current && typeof current.code === 'string') return current.code
    current = 'cause' in current ? current.cause : undefined
  }
  return undefined
}

function hashPayload(command: CreateClaimDraftCommand): string {
  return createHash('sha256').update(claimDraftPayload(command)).digest('hex')
}

function pesoText(value: bigint): string {
  const sign = value < 0n ? '-' : ''
  const cents = value < 0n ? -value : value
  const whole = cents / 100n
  const fraction = (cents % 100n).toString().padStart(2, '0')
  return `${sign}₱${whole.toLocaleString('en-PH')}.${fraction}`
}

function nextClaimNumber(maxSuffix: string | null): string {
  const next = BigInt(maxSuffix ?? '0') + 1n
  const suffix = next.toString()
  if (suffix.length > MAX_SUFFIX_DIGITS) throw new ConflictException('Claim number sequence is exhausted; reconcile existing claim numbers')
  return `PC-${suffix.padStart(5, '0')}`
}

@Injectable()
export class ClaimDraftService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async create(command: CreateClaimDraftCommand, principal: ErpPrincipal): Promise<CreateClaimDraftResult> {
    const parsed = createClaimDraftCommandSchema.parse(command)
    const input = { ...parsed, projectId: parsed.projectId.toLowerCase(), clientRequestId: parsed.clientRequestId.toLowerCase() }
    const payloadHash = hashPayload(input)

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.database.client.transaction(async transaction => {
          const actor = await this.admit(transaction, principal)
          await this.lockProject(transaction, input.projectId, actor.tenantId)
          const replay = await this.findReceipt(transaction, actor, input.projectId, input.clientRequestId, payloadHash)
          if (replay) return createClaimDraftResultSchema.parse({ projectId: input.projectId, created: false, changed: false, receipt: replay })

          await this.assertWithinContractSum(transaction, actor.tenantId, input.projectId, input.amountCents)

          const [max] = await transaction.execute<{ max_suffix: string | null }>(sql`
            select max((substring(${progressClaims.claim_number} from '^PC-([0-9]+)$'))::numeric)::text as max_suffix
            from ${progressClaims}
            where ${progressClaims.tenant_id} = ${actor.tenantId}::uuid
              and ${progressClaims.claim_number} ~ '^PC-[0-9]+$'
          `)
          const claimNumber = nextClaimNumber(max?.max_suffix ?? null)
          const createdAt = await this.databaseClock(transaction)
          const [claim] = await transaction.insert(progressClaims).values({
            tenant_id: actor.tenantId,
            project_id: input.projectId,
            claim_number: claimNumber,
            milestone_pct: input.milestonePct,
            amount_cents: input.amountCents,
            description: input.description,
            status: 'draft',
            created_by: actor.userId,
            created_at: createdAt,
            updated_at: createdAt,
          }).returning({
            id: progressClaims.id,
            claimNumber: progressClaims.claim_number,
            milestonePct: progressClaims.milestone_pct,
            amountCents: progressClaims.amount_cents,
            description: progressClaims.description,
            status: progressClaims.status,
            createdBy: progressClaims.created_by,
            createdAt: progressClaims.created_at,
          })
          if (!claim?.createdBy || !claim.createdAt) throw new InternalServerErrorException('Claim draft was not created')
          const receipt = claimDraftCommandReceiptSchema.parse({
            schemaVersion: 1,
            operation: 'create_draft',
            tenantId: actor.tenantId,
            actorId: actor.userId,
            projectId: input.projectId,
            clientRequestId: input.clientRequestId,
            payloadHash,
            claim: {
              id: claim.id,
              claimNumber: claim.claimNumber,
              milestonePct: claim.milestonePct,
              amountCents: claim.amountCents,
              description: claim.description,
              status: claim.status,
              createdBy: claim.createdBy,
              createdAt: claim.createdAt.toISOString(),
            },
          })
          await this.audit.writeSemantic(transaction, {
            tenantId: actor.tenantId,
            actorId: actor.userId,
            entityType: CLAIM_COMMAND_ENTITY,
            entityId: input.clientRequestId,
            action: CREATE_ACTION,
            diff: { schemaVersion: 1, payloadHash, receipt },
          })
          return createClaimDraftResultSchema.parse({ projectId: input.projectId, created: true, changed: true, receipt })
        })
      } catch (error) {
        const code = pgCode(error)
        if ((code === '23505' || code === '55P03' || code === '40P01') && attempt < 2) continue
        if (code === '23505') throw new ConflictException('Claim number allocation is changing; retry the unchanged draft')
        if (code === '55P03' || code === '40P01') throw new ConflictException('Claim draft authority is changing; retry the unchanged draft')
        throw error
      }
    }
    throw new ConflictException('Claim draft authority is changing; retry the unchanged draft')
  }

  private async databaseClock(transaction: DatabaseTransaction): Promise<Date> {
    const [row] = await transaction.execute<{ now: string }>(sql`select clock_timestamp()::text as now`)
    const value = new Date(row?.now ?? '')
    if (!Number.isFinite(value.getTime())) throw new InternalServerErrorException('Database clock unavailable')
    return value
  }

  private async admit(transaction: DatabaseTransaction, principal: ErpPrincipal): Promise<ErpPrincipal> {
    await transaction.execute(sql`select set_config('lock_timeout', '3s', true)`)
    const [actor] = await transaction.select({ role: users.role, status: users.account_status, email: users.email })
      .from(users).where(and(eq(users.id, principal.userId), eq(users.tenant_id, principal.tenantId)))
      .limit(1).for('share', { noWait: true })
    const role = z.enum(ERP_ROLES).safeParse(actor?.role)
    if (!actor || actor.status !== 'active' || !role.success || (!roleHasCapability(role.data, 'kyc.create_ar_code') && !roleHasCapability(role.data, 'precon.manage_checklist'))) {
      throw new ForbiddenException()
    }
    const [tenant] = await transaction.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, principal.tenantId)).limit(1).for('share', { noWait: true })
    if (tenant?.status !== 'active') throw new ForbiddenException('Current tenant is not active')
    const actorPrincipal: ErpPrincipal = { userId: principal.userId.toLowerCase(), tenantId: principal.tenantId.toLowerCase(), role: role.data, email: actor.email }
    await this.audit.stampActor(transaction, actorPrincipal)
    if (!await this.audit.tryLockTenantChain(transaction, actorPrincipal.tenantId)) throw new ConflictException('Claim writes are busy; retry the unchanged draft')
    return actorPrincipal
  }

  /**
   * Live claims plus the new one may not exceed the contract sum: the TCV of
   * the latest approved or locked BOM (the BOM the invoice draft bills) plus
   * the cost impact of every signed variation order; a deductive VO subtracts.
   * Claims, TCV and VO impacts are all VAT-exclusive, so they compare as is.
   * Gap D-2 (owner Q1): DUPA-priced lines carry 12% VAT inside TCV, so on such
   * a BOM the cap is up to 12% generous; fixing D-2 tightens it with no change
   * here. Runs under the project lock, so two concurrent drafts cannot both
   * pass. A project with no approved BOM has no contract sum and is uncapped.
   */
  private async assertWithinContractSum(transaction: DatabaseTransaction, tenantId: string, projectId: string, newAmountCents: number): Promise<void> {
    const [bom] = await transaction
      .select({ tcvCents: sql<string>`cast(${boms.tcv_cents} as text)` })
      .from(boms)
      .where(and(eq(boms.project_id, projectId), eq(boms.tenant_id, tenantId), inArray(boms.status, ['approved', 'locked'])))
      .orderBy(desc(boms.version))
      .limit(1)
      .for('share')
    if (!bom) return
    const [signed] = await transaction
      .select({ total: sql<string>`coalesce(sum(${variationOrders.cost_impact_cents}), 0)::text` })
      .from(variationOrders)
      .where(and(eq(variationOrders.tenant_id, tenantId), eq(variationOrders.project_id, projectId), eq(variationOrders.status, 'signed')))
    const [live] = await transaction
      .select({ total: sql<string>`coalesce(sum(${progressClaims.amount_cents}), 0)::text` })
      .from(progressClaims)
      .where(and(eq(progressClaims.tenant_id, tenantId), eq(progressClaims.project_id, projectId), notInArray(progressClaims.status, RELEASED_CLAIM_STATUSES)))
    let bomCents: bigint
    let voCents: bigint
    let liveCents: bigint
    try {
      bomCents = BigInt(bom.tcvCents)
      voCents = BigInt(signed?.total ?? '0')
      liveCents = BigInt(live?.total ?? '0')
    } catch {
      throw new InternalServerErrorException('Claim totals are not exact centavo amounts')
    }
    const contractCents = bomCents + voCents
    const remainingCents = contractCents - liveCents
    if (BigInt(newAmountCents) <= remainingCents) return
    const voPart = voCents === 0n ? '' : `${voCents > 0n ? ' plus' : ' less'} signed variation orders ${pesoText(voCents < 0n ? -voCents : voCents)}`
    const basis = `the contract sum of ${pesoText(contractCents)} (approved BOM ${pesoText(bomCents)}${voPart}, excl. VAT)`
    throw new ConflictException({
      code: CLAIM_CAP_EXCEEDED_CODE,
      message: remainingCents <= 0n
        ? `No further claim fits the contract sum. Reject or cancel a claim, or sign a variation order. Live claims total ${pesoText(liveCents)} against ${basis}.`
        : `This claim is above what can still be claimed. At most ${pesoText(remainingCents)} remains of ${basis} after live claims of ${pesoText(liveCents)}.`,
    })
  }

  private async lockProject(transaction: DatabaseTransaction, projectId: string, tenantId: string): Promise<void> {
    const [project] = await transaction.select({ id: projects.id }).from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId), isNull(projects.deleted_at)))
      .limit(1).for('update', { noWait: true })
    if (!project) throw new NotFoundException('Project not found')
  }

  private async findReceipt(transaction: DatabaseTransaction, actor: ErpPrincipal, projectId: string, requestId: string, payloadHash: string): Promise<ClaimDraftCommandReceipt | undefined> {
    const rows = await transaction.select({ actorId: auditLog.actor_id, action: auditLog.action, diff: auditLog.diff })
      .from(auditLog).where(and(eq(auditLog.tenant_id, actor.tenantId), eq(auditLog.entity_type, CLAIM_COMMAND_ENTITY), eq(auditLog.entity_id, requestId))).limit(2)
    if (!rows.length) return undefined
    const stored = z.object({ schemaVersion: z.literal(1), payloadHash: z.string(), receipt: claimDraftCommandReceiptSchema }).strict().safeParse(rows[0]?.diff)
    if (rows.length !== 1 || !stored.success || rows[0]?.action !== CREATE_ACTION) throw new ConflictException('Claim draft command receipt requires reconciliation')
    const receipt = stored.data.receipt
    if (rows[0]?.actorId !== actor.userId || stored.data.payloadHash !== payloadHash || receipt.payloadHash !== payloadHash || receipt.tenantId !== actor.tenantId || receipt.actorId !== actor.userId || receipt.projectId !== projectId || receipt.clientRequestId !== requestId) {
      throw new ConflictException('Client request id was already used by another claim draft command')
    }
    return receipt
  }
}
