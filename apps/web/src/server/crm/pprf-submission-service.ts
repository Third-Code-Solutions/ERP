import { createHash } from 'node:crypto'
import { z } from 'zod'

import { db, type Database } from '@third-code-erp/database'
import {
  accounts,
  auditLog,
  notifications,
  opportunities,
  pprfSubmissions,
  slaLogs,
  users,
} from '@third-code-erp/database/schema'
import {
  accountIndustryValues,
  roleHasCapability,
  STAGE_PROBABILITY,
  type ErpRole,
} from '@third-code-erp/shared-types'
import { and, eq, inArray, isNull, sql } from 'drizzle-orm'

import { writeAuditLogInTransaction } from '@/lib/audit'
import {
  initializeOpportunityKycTracks,
  opportunityKycDueAt,
} from '@/lib/operations/opportunity-kyc'
import { SLA_CONFIG } from '@/lib/operations/sla-clock'

const MAX_CENTAVOS = 900_000_000_000n
const CANONICAL_CENTAVOS = /^(?:0|[1-9]\d*)$/
const canonicalCentavosSchema = z
  .string()
  .regex(CANONICAL_CENTAVOS, 'must be canonical integer centavos')
  .refine(
    (value) =>
      !CANONICAL_CENTAVOS.test(value) || BigInt(value) <= MAX_CENTAVOS,
    'amount is too large'
  )

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  )
}

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isCalendarDate, 'must be a valid calendar date')

const optionalTrimmedText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => value || undefined)
    .optional()

export const pprfSubmissionPayloadSchema = z
  .object({
    siteAddress: z.string().trim().min(2).max(500),
    floorAreaSqm: z.number().finite().positive().max(1_000_000),
    landlordContact: z.string().trim().min(2).max(255),
    asBuiltAvailable: z.enum(['yes', 'partial', 'no']),
    scopeNotes: z.string().trim().max(20_000).default(''),
    projectType: z.string().trim().max(255).default(''),
    expectedStartDate: calendarDateSchema.optional(),
    budgetRange: z.string().trim().max(255).default(''),
  })
  .strict()

export const pprfIntakeCommandSchema = z
  .object({
    submissionId: z.string().uuid(),
    clientName: z.string().trim().min(2).max(255),
    industry: z.enum(accountIndustryValues).default('other'),
    billingAddress: optionalTrimmedText(1_000),
    primaryEmail: z.string().trim().email().optional(),
    primaryPhone: optionalTrimmedText(64),
    tcvCentavos: canonicalCentavosSchema,
    gpCentavos: canonicalCentavosSchema,
    areaSqm: z.number().int().positive().max(2_147_483_647).optional(),
    closingDate: calendarDateSchema.optional(),
    opportunityType: optionalTrimmedText(100),
    remarks: optionalTrimmedText(5_000),
    pprf: pprfSubmissionPayloadSchema,
  })
  .strict()

export const pprfResubmissionCommandSchema = z
  .object({
    submissionId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    pprf: pprfSubmissionPayloadSchema,
  })
  .strict()

const intakeSuccessSchema = z
  .object({
    ok: z.literal(true),
    kind: z.literal('intake'),
    tenantId: z.string().uuid(),
    accountId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    pprfSubmissionId: z.string().uuid(),
    version: z.literal(1),
    replayed: z.boolean(),
  })
  .strict()

const resubmissionSuccessSchema = z
  .object({
    ok: z.literal(true),
    kind: z.literal('resubmission'),
    tenantId: z.string().uuid(),
    opportunityId: z.string().uuid(),
    pprfSubmissionId: z.string().uuid(),
    version: z.number().int().positive(),
    replayed: z.boolean(),
  })
  .strict()

const failureSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: z.enum([
          'VALIDATION_ERROR',
          'FORBIDDEN',
          'NOT_FOUND',
          'CONFLICT',
          'DUPLICATE_ACCOUNT',
          'INTERNAL_ERROR',
        ]),
        message: z.string().min(1).max(500),
      })
      .strict(),
  })
  .strict()

export const pprfSubmissionResultSchema = z.union([
  intakeSuccessSchema,
  resubmissionSuccessSchema,
  failureSchema,
])

export type PprfSubmissionPayload = z.infer<
  typeof pprfSubmissionPayloadSchema
>
export type PprfIntakeCommand = z.infer<typeof pprfIntakeCommandSchema>
export type PprfResubmissionCommand = z.infer<
  typeof pprfResubmissionCommandSchema
>
export type PprfSubmissionResult = z.infer<
  typeof pprfSubmissionResultSchema
>

export interface PprfSubmissionPrincipal {
  tenantId: string
  userId: string
}

export interface PprfSubmissionTransaction {
  lockMembership(principal: PprfSubmissionPrincipal): Promise<{
    tenantId: string
    role: ErpRole
  } | null>
  lockCommand(tenantId: string, keyHash: string): Promise<void>
  findReceipts(
    tenantId: string,
    kind: 'intake' | 'resubmission',
    keyHash: string
  ): Promise<Array<{ entityId: string; diff: unknown }>>
  loadPprf(
    tenantId: string,
    pprfId: string
  ): Promise<{
    id: string
    tenantId: string
    opportunityId: string
    version: number
  } | null>
  loadOpportunity(
    tenantId: string,
    opportunityId: string
  ): Promise<{
    id: string
    tenantId: string
    accountId: string | null
    stage: string
  } | null>
  loadAccount(
    tenantId: string,
    accountId: string
  ): Promise<{ id: string; tenantId: string } | null>
  lockAccountName(tenantId: string, normalizedName: string): Promise<void>
  findAccountByName(
    tenantId: string,
    name: string
  ): Promise<{ id: string } | null>
  createAccount(input: {
    tenantId: string
    actorId: string
    name: string
    industry: PprfIntakeCommand['industry']
    billingAddress?: string
    primaryEmail?: string
    primaryPhone?: string
  }): Promise<{ id: string } | null>
  createOpportunity(input: {
    tenantId: string
    actorId: string
    accountId: string
    stage: 'lead'
    tcvCents: number
    gpCents: number
    probability: number
    weightedTcvCents: number
    closingDate: Date | null
    areaSqm?: number
    opportunityType?: string
    remarks?: string
  }): Promise<{ id: string } | null>
  createPprf(input: {
    tenantId: string
    actorId: string
    opportunityId: string
    version: number
    payload: {
      site_address: string
      floor_area_sqm: number
      landlord_contact: string
      as_built_available: 'yes' | 'partial' | 'no'
      scope_notes: string
      project_type: string
      expected_start_date: string
      budget_range: string
    }
    submittedAt: Date
  }): Promise<{ id: string } | null>
  resetKycTracks(input: {
    tenantId: string
    opportunityId: string
    dueAt: Date
  }): Promise<void>
  writeAudit(input: {
    tenantId: string
    actorId: string
    entityType: 'account' | 'opportunity' | 'pprf_submission'
    entityId: string
    action: 'create'
    diff: Record<string, unknown>
  }): Promise<void>
  ensurePprfReviewSla(tenantId: string, opportunityId: string): Promise<void>
  findNotificationRecipients(
    tenantId: string,
    roles: readonly ErpRole[]
  ): Promise<Array<{ id: string; email: string; role: ErpRole }>>
  createNotifications(
    rows: Array<{
      tenantId: string
      recipientUserId: string
      recipientEmail: string
      subject: string
      body: string
      linkUrl: string
    }>
  ): Promise<void>
  lockOpportunity(
    tenantId: string,
    opportunityId: string
  ): Promise<{
    id: string
    tenantId: string
    accountId: string | null
    stage: string
  } | null>
  nextPprfVersion(tenantId: string, opportunityId: string): Promise<number>
}

export interface PprfSubmissionStore {
  transaction<T>(
    callback: (transaction: PprfSubmissionTransaction) => Promise<T>
  ): Promise<T>
}

export interface PprfSubmissionDependencies {
  now: () => Date
  kycDueAt: (tenantId: string, from: Date) => Promise<Date>
}

const principalSchema = z
  .object({
    tenantId: z.string().uuid(),
    userId: z.string().uuid(),
  })
  .strict()

const receiptSchema = z
  .object({
    source: z.literal('pprf_submission_service'),
    receipt_version: z.literal(1),
    submission_kind: z.enum(['intake', 'resubmission']),
    idempotency_key_hash: z.string().regex(/^[a-f0-9]{64}$/),
    command_hash: z.string().regex(/^[a-f0-9]{64}$/),
    account_id: z.string().uuid().nullable(),
    opportunity_id: z.string().uuid(),
    pprf_submission_id: z.string().uuid(),
    pprf_version: z.number().int().positive(),
  })
  .passthrough()

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeJson(entry)])
  )
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeJson(value))
}

function failure(
  code: Extract<PprfSubmissionResult, { ok: false }>['error']['code'],
  message: string
): Extract<PprfSubmissionResult, { ok: false }> {
  return { ok: false, error: { code, message } }
}

function exactCentavosAdapter(value: string): number {
  const exact = BigInt(value)
  if (exact > MAX_CENTAVOS || exact > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError('Centavo amount exceeds the exact database adapter')
  }
  return Number(exact)
}

function weightedCentavos(value: string, probability: number): number {
  const numerator = BigInt(value) * BigInt(probability)
  return exactCentavosAdapter(String((numerator + 50n) / 100n))
}

function philippineDateStart(value: string | undefined): Date | null {
  return value ? new Date(`${value}T00:00:00.000+08:00`) : null
}

function persistedPayload(payload: PprfSubmissionPayload) {
  return {
    site_address: payload.siteAddress,
    floor_area_sqm: payload.floorAreaSqm,
    landlord_contact: payload.landlordContact,
    as_built_available: payload.asBuiltAvailable,
    scope_notes: payload.scopeNotes,
    project_type: payload.projectType,
    expected_start_date: payload.expectedStartDate ?? '',
    budget_range: payload.budgetRange,
  }
}

export class PprfSubmissionService {
  constructor(
    private readonly store: PprfSubmissionStore,
    private readonly dependencies: PprfSubmissionDependencies
  ) {}

  async submitIntake(
    principalInput: PprfSubmissionPrincipal,
    commandInput: PprfIntakeCommand
  ): Promise<PprfSubmissionResult> {
    const principal = principalSchema.safeParse(principalInput)
    const command = pprfIntakeCommandSchema.safeParse(commandInput)
    if (!principal.success || !command.success) {
      return failure('VALIDATION_ERROR', 'Invalid PPRF intake command')
    }

    const keyHash = sha256(command.data.submissionId)
    const commandHash = sha256(
      canonicalJson({ kind: 'intake', command: command.data })
    )

    try {
      return await this.store.transaction(async (transaction) => {
        const membership = await transaction.lockMembership(principal.data)
        if (
          !membership ||
          membership.tenantId !== principal.data.tenantId ||
          !roleHasCapability(membership.role, 'account.create') ||
          !roleHasCapability(membership.role, 'pprf.submit')
        ) {
          return pprfSubmissionResultSchema.parse(
            failure('FORBIDDEN', 'PPRF intake is not permitted')
          )
        }

        await transaction.lockCommand(membership.tenantId, keyHash)
        const replay = await this.replay(
          transaction,
          membership.tenantId,
          'intake',
          keyHash,
          commandHash
        )
        if (replay) return replay

        await transaction.lockAccountName(
          membership.tenantId,
          command.data.clientName.toLocaleLowerCase('en')
        )
        const duplicate = await transaction.findAccountByName(
          membership.tenantId,
          command.data.clientName
        )
        if (duplicate) {
          return pprfSubmissionResultSchema.parse(
            failure(
              'DUPLICATE_ACCOUNT',
              'An account with this name already exists'
            )
          )
        }

        const now = this.dependencies.now()
        const dueAt = await this.dependencies.kycDueAt(
          membership.tenantId,
          now
        )
        const account = await transaction.createAccount({
          tenantId: membership.tenantId,
          actorId: principal.data.userId,
          name: command.data.clientName,
          industry: command.data.industry,
          billingAddress: command.data.billingAddress,
          primaryEmail: command.data.primaryEmail,
          primaryPhone: command.data.primaryPhone,
        })
        if (!account) throw new Error('Account insert returned no row')

        const probability = STAGE_PROBABILITY.lead
        const opportunity = await transaction.createOpportunity({
          tenantId: membership.tenantId,
          actorId: principal.data.userId,
          accountId: account.id,
          stage: 'lead',
          tcvCents: exactCentavosAdapter(command.data.tcvCentavos),
          gpCents: exactCentavosAdapter(command.data.gpCentavos),
          probability,
          weightedTcvCents: weightedCentavos(
            command.data.tcvCentavos,
            probability
          ),
          closingDate: philippineDateStart(command.data.closingDate),
          areaSqm: command.data.areaSqm,
          opportunityType: command.data.opportunityType,
          remarks: command.data.remarks,
        })
        if (!opportunity) throw new Error('Opportunity insert returned no row')

        const pprf = await transaction.createPprf({
          tenantId: membership.tenantId,
          actorId: principal.data.userId,
          opportunityId: opportunity.id,
          version: 1,
          payload: persistedPayload(command.data.pprf),
          submittedAt: now,
        })
        if (!pprf) throw new Error('PPRF insert returned no row')

        await transaction.resetKycTracks({
          tenantId: membership.tenantId,
          opportunityId: opportunity.id,
          dueAt,
        })
        await transaction.writeAudit({
          tenantId: membership.tenantId,
          actorId: principal.data.userId,
          entityType: 'account',
          entityId: account.id,
          action: 'create',
          diff: {
            name: command.data.clientName,
            source: 'pprf_intake',
            kyc_status: 'pending',
          },
        })
        await transaction.writeAudit({
          tenantId: membership.tenantId,
          actorId: principal.data.userId,
          entityType: 'opportunity',
          entityId: opportunity.id,
          action: 'create',
          diff: {
            account_id: account.id,
            stage: 'lead',
            source: 'pprf_intake',
          },
        })
        await transaction.writeAudit({
          tenantId: membership.tenantId,
          actorId: principal.data.userId,
          entityType: 'pprf_submission',
          entityId: pprf.id,
          action: 'create',
          diff: {
            source: 'pprf_submission_service',
            receipt_version: 1,
            submission_kind: 'intake',
            idempotency_key_hash: keyHash,
            command_hash: commandHash,
            account_id: account.id,
            opportunity_id: opportunity.id,
            pprf_submission_id: pprf.id,
            pprf_version: 1,
            kyc_due_at: dueAt.toISOString(),
          },
        })
        await transaction.ensurePprfReviewSla(
          membership.tenantId,
          opportunity.id
        )
        await this.createNotifications(
          transaction,
          membership.tenantId,
          ['finance', 'owner', 'admin'],
          {
            subject: 'New PPRF intake requires dual-track review',
            body: `Client ${command.data.clientName} has a new PPRF. Financial Evaluation and Credit Investigation are due in two business days.`,
            linkUrl: `/crm/opportunities/${opportunity.id}/proposal/pprf`,
          }
        )

        return pprfSubmissionResultSchema.parse({
          ok: true,
          kind: 'intake',
          tenantId: membership.tenantId,
          accountId: account.id,
          opportunityId: opportunity.id,
          pprfSubmissionId: pprf.id,
          version: 1,
          replayed: false,
        })
      })
    } catch {
      return failure(
        'INTERNAL_ERROR',
        'PPRF intake could not be saved. Retry the submission.'
      )
    }
  }

  async submitResubmission(
    principalInput: PprfSubmissionPrincipal,
    commandInput: PprfResubmissionCommand
  ): Promise<PprfSubmissionResult> {
    const principal = principalSchema.safeParse(principalInput)
    const command = pprfResubmissionCommandSchema.safeParse(commandInput)
    if (!principal.success || !command.success) {
      return failure('VALIDATION_ERROR', 'Invalid PPRF resubmission command')
    }

    const keyHash = sha256(command.data.submissionId)
    const commandHash = sha256(
      canonicalJson({ kind: 'resubmission', command: command.data })
    )

    try {
      return await this.store.transaction(async (transaction) => {
        const membership = await transaction.lockMembership(principal.data)
        if (
          !membership ||
          membership.tenantId !== principal.data.tenantId ||
          !roleHasCapability(membership.role, 'pprf.submit')
        ) {
          return pprfSubmissionResultSchema.parse(
            failure('FORBIDDEN', 'PPRF resubmission is not permitted')
          )
        }

        await transaction.lockCommand(membership.tenantId, keyHash)
        const replay = await this.replay(
          transaction,
          membership.tenantId,
          'resubmission',
          keyHash,
          commandHash
        )
        if (replay) return replay

        const opportunity = await transaction.lockOpportunity(
          membership.tenantId,
          command.data.opportunityId
        )
        if (!opportunity || opportunity.tenantId !== membership.tenantId) {
          return pprfSubmissionResultSchema.parse(
            failure('NOT_FOUND', 'Opportunity was not found')
          )
        }

        const now = this.dependencies.now()
        const dueAt = await this.dependencies.kycDueAt(
          membership.tenantId,
          now
        )
        const version = await transaction.nextPprfVersion(
          membership.tenantId,
          opportunity.id
        )
        const pprf = await transaction.createPprf({
          tenantId: membership.tenantId,
          actorId: principal.data.userId,
          opportunityId: opportunity.id,
          version,
          payload: persistedPayload(command.data.pprf),
          submittedAt: now,
        })
        if (!pprf) throw new Error('PPRF insert returned no row')

        await transaction.resetKycTracks({
          tenantId: membership.tenantId,
          opportunityId: opportunity.id,
          dueAt,
        })
        await transaction.writeAudit({
          tenantId: membership.tenantId,
          actorId: principal.data.userId,
          entityType: 'pprf_submission',
          entityId: pprf.id,
          action: 'create',
          diff: {
            source: 'pprf_submission_service',
            receipt_version: 1,
            submission_kind: 'resubmission',
            idempotency_key_hash: keyHash,
            command_hash: commandHash,
            account_id: null,
            opportunity_id: opportunity.id,
            pprf_submission_id: pprf.id,
            pprf_version: version,
            kyc_tracks_reset: true,
            kyc_due_at: dueAt.toISOString(),
          },
        })
        await transaction.ensurePprfReviewSla(
          membership.tenantId,
          opportunity.id
        )
        await this.createNotifications(
          transaction,
          membership.tenantId,
          ['commercial', 'finance'],
          {
            subject: `PPRF v${version} submitted`,
            body: `A new Project Pre-Requirements Form (v${version}) is ready for review.`,
            linkUrl: `/crm/opportunities/${opportunity.id}/proposal/pprf`,
          }
        )

        return pprfSubmissionResultSchema.parse({
          ok: true,
          kind: 'resubmission',
          tenantId: membership.tenantId,
          opportunityId: opportunity.id,
          pprfSubmissionId: pprf.id,
          version,
          replayed: false,
        })
      })
    } catch {
      return failure(
        'INTERNAL_ERROR',
        'PPRF resubmission could not be saved. Retry the submission.'
      )
    }
  }

  private async replay(
    transaction: PprfSubmissionTransaction,
    tenantId: string,
    kind: 'intake' | 'resubmission',
    keyHash: string,
    commandHash: string
  ): Promise<PprfSubmissionResult | null> {
    const receipts = await transaction.findReceipts(tenantId, kind, keyHash)
    if (receipts.length === 0) return null
    if (receipts.length !== 1) {
      return failure('CONFLICT', 'PPRF submission receipt is ambiguous')
    }

    const parsed = receiptSchema.safeParse(receipts[0]?.diff)
    if (
      !parsed.success ||
      receipts[0]?.entityId !== parsed.data.pprf_submission_id ||
      parsed.data.submission_kind !== kind ||
      parsed.data.idempotency_key_hash !== keyHash
    ) {
      return failure('CONFLICT', 'PPRF submission receipt is invalid')
    }
    if (parsed.data.command_hash !== commandHash) {
      return failure(
        'CONFLICT',
        'Submission ID was already used for a different command'
      )
    }

    const pprf = await transaction.loadPprf(
      tenantId,
      parsed.data.pprf_submission_id
    )
    const opportunity = await transaction.loadOpportunity(
      tenantId,
      parsed.data.opportunity_id
    )
    if (
      !pprf ||
      !opportunity ||
      pprf.tenantId !== tenantId ||
      pprf.opportunityId !== parsed.data.opportunity_id ||
      pprf.version !== parsed.data.pprf_version ||
      opportunity.tenantId !== tenantId
    ) {
      return failure('CONFLICT', 'PPRF submission receipt result is invalid')
    }

    if (kind === 'intake') {
      const accountId = parsed.data.account_id
      const account = accountId
        ? await transaction.loadAccount(tenantId, accountId)
        : null
      if (
        !account ||
        account.tenantId !== tenantId ||
        opportunity.accountId !== accountId ||
        opportunity.stage !== 'lead' ||
        parsed.data.pprf_version !== 1
      ) {
        return failure('CONFLICT', 'PPRF intake receipt result is invalid')
      }
      return pprfSubmissionResultSchema.parse({
        ok: true,
        kind: 'intake',
        tenantId,
        accountId,
        opportunityId: opportunity.id,
        pprfSubmissionId: pprf.id,
        version: 1,
        replayed: true,
      })
    }

    if (parsed.data.account_id !== null) {
      return failure('CONFLICT', 'PPRF resubmission receipt is invalid')
    }
    return pprfSubmissionResultSchema.parse({
      ok: true,
      kind: 'resubmission',
      tenantId,
      opportunityId: opportunity.id,
      pprfSubmissionId: pprf.id,
      version: pprf.version,
      replayed: true,
    })
  }

  private async createNotifications(
    transaction: PprfSubmissionTransaction,
    tenantId: string,
    roles: readonly ErpRole[],
    message: { subject: string; body: string; linkUrl: string }
  ): Promise<void> {
    const recipients = await transaction.findNotificationRecipients(
      tenantId,
      roles
    )
    const uniqueRecipients = [
      ...new Map(recipients.map((recipient) => [recipient.id, recipient])).values(),
    ]
    if (uniqueRecipients.length === 0) return
    await transaction.createNotifications(
      uniqueRecipients.map((recipient) => ({
        tenantId,
        recipientUserId: recipient.id,
        recipientEmail: recipient.email,
        subject: message.subject,
        body: message.body,
        linkUrl: message.linkUrl,
      }))
    )
  }
}

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0]

class DrizzlePprfSubmissionTransaction implements PprfSubmissionTransaction {
  constructor(private readonly transaction: DatabaseTransaction) {}

  async lockMembership(principal: PprfSubmissionPrincipal) {
    const [membership] = await this.transaction
      .select({ tenantId: users.tenant_id, role: users.role })
      .from(users)
      .where(
        and(
          eq(users.id, principal.userId),
          eq(users.tenant_id, principal.tenantId)
        )
      )
      .limit(1)
      .for('update')
    return membership ?? null
  }

  async lockCommand(tenantId: string, keyHash: string): Promise<void> {
    await this.transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${'pprf-command:' + tenantId + ':' + keyHash}, 0))`
    )
  }

  async findReceipts(
    tenantId: string,
    kind: 'intake' | 'resubmission',
    keyHash: string
  ) {
    return this.transaction
      .select({ entityId: auditLog.entity_id, diff: auditLog.diff })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.tenant_id, tenantId),
          eq(auditLog.entity_type, 'pprf_submission'),
          eq(auditLog.action, 'create'),
          sql`${auditLog.diff} ->> 'source' = 'pprf_submission_service'`,
          sql`${auditLog.diff} ->> 'submission_kind' = ${kind}`,
          sql`${auditLog.diff} ->> 'idempotency_key_hash' = ${keyHash}`
        )
      )
      .limit(2)
  }

  async loadPprf(tenantId: string, pprfId: string) {
    const [row] = await this.transaction
      .select({
        id: pprfSubmissions.id,
        tenantId: pprfSubmissions.tenant_id,
        opportunityId: pprfSubmissions.opportunity_id,
        version: pprfSubmissions.version,
      })
      .from(pprfSubmissions)
      .where(
        and(
          eq(pprfSubmissions.tenant_id, tenantId),
          eq(pprfSubmissions.id, pprfId)
        )
      )
      .limit(1)
    return row ?? null
  }

  async loadOpportunity(tenantId: string, opportunityId: string) {
    const [row] = await this.transaction
      .select({
        id: opportunities.id,
        tenantId: opportunities.tenant_id,
        accountId: opportunities.account_id,
        stage: opportunities.stage,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.tenant_id, tenantId),
          eq(opportunities.id, opportunityId)
        )
      )
      .limit(1)
    return row ?? null
  }

  async loadAccount(tenantId: string, accountId: string) {
    const [row] = await this.transaction
      .select({ id: accounts.id, tenantId: accounts.tenant_id })
      .from(accounts)
      .where(and(eq(accounts.tenant_id, tenantId), eq(accounts.id, accountId)))
      .limit(1)
    return row ?? null
  }

  async lockAccountName(
    tenantId: string,
    normalizedName: string
  ): Promise<void> {
    await this.transaction.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${'pprf-account:' + tenantId + ':' + normalizedName}, 0))`
    )
  }

  async findAccountByName(tenantId: string, name: string) {
    const [row] = await this.transaction
      .select({ id: accounts.id })
      .from(accounts)
      .where(and(eq(accounts.tenant_id, tenantId), eq(accounts.name, name)))
      .limit(1)
    return row ?? null
  }

  async createAccount(input: Parameters<PprfSubmissionTransaction['createAccount']>[0]) {
    const [row] = await this.transaction
      .insert(accounts)
      .values({
        tenant_id: input.tenantId,
        name: input.name,
        industry: input.industry,
        billing_address: input.billingAddress,
        primary_email: input.primaryEmail,
        primary_phone: input.primaryPhone,
        kyc_status: 'pending',
        created_by: input.actorId,
      })
      .returning({ id: accounts.id })
    return row ?? null
  }

  async createOpportunity(
    input: Parameters<PprfSubmissionTransaction['createOpportunity']>[0]
  ) {
    const [row] = await this.transaction
      .insert(opportunities)
      .values({
        tenant_id: input.tenantId,
        account_id: input.accountId,
        rep_id: input.actorId,
        stage: input.stage,
        tcv_cents: input.tcvCents,
        gp_cents: input.gpCents,
        probability: input.probability,
        weighted_tcv_cents: input.weightedTcvCents,
        closing_date: input.closingDate,
        area_sqm: input.areaSqm,
        opportunity_type: input.opportunityType,
        remarks: input.remarks,
      })
      .returning({ id: opportunities.id })
    return row ?? null
  }

  async createPprf(input: Parameters<PprfSubmissionTransaction['createPprf']>[0]) {
    const [row] = await this.transaction
      .insert(pprfSubmissions)
      .values({
        tenant_id: input.tenantId,
        opportunity_id: input.opportunityId,
        version: input.version,
        payload: input.payload,
        submitted_at: input.submittedAt,
        submitted_by: input.actorId,
      })
      .returning({ id: pprfSubmissions.id })
    return row ?? null
  }

  async resetKycTracks(
    input: Parameters<PprfSubmissionTransaction['resetKycTracks']>[0]
  ): Promise<void> {
    await initializeOpportunityKycTracks(this.transaction, input)
  }

  async writeAudit(
    input: Parameters<PprfSubmissionTransaction['writeAudit']>[0]
  ): Promise<void> {
    await writeAuditLogInTransaction(this.transaction, {
      tenantId: input.tenantId,
      actorId: input.actorId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      diff: input.diff,
    })
  }

  async ensurePprfReviewSla(
    tenantId: string,
    opportunityId: string
  ): Promise<void> {
    const [existing] = await this.transaction
      .select({ id: slaLogs.id })
      .from(slaLogs)
      .where(
        and(
          eq(slaLogs.tenant_id, tenantId),
          eq(slaLogs.entity_type, 'opportunity'),
          eq(slaLogs.entity_id, opportunityId),
          eq(slaLogs.sla_label, 'pprf.review'),
          isNull(slaLogs.completed_at)
        )
      )
      .limit(1)
    if (existing) return
    await this.transaction.insert(slaLogs).values({
      tenant_id: tenantId,
      entity_type: 'opportunity',
      entity_id: opportunityId,
      sla_label: 'pprf.review',
      sla_seconds: SLA_CONFIG['pprf.review'],
    })
  }

  async findNotificationRecipients(
    tenantId: string,
    roles: readonly ErpRole[]
  ) {
    return this.transaction
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(and(eq(users.tenant_id, tenantId), inArray(users.role, [...roles])))
  }

  async createNotifications(
    rows: Parameters<PprfSubmissionTransaction['createNotifications']>[0]
  ): Promise<void> {
    if (rows.length === 0) return
    await this.transaction.insert(notifications).values(
      rows.map((row) => ({
        tenant_id: row.tenantId,
        recipient_user_id: row.recipientUserId,
        recipient_email: row.recipientEmail,
        channel: 'in_app' as const,
        subject: row.subject,
        body: row.body,
        link_url: row.linkUrl,
      }))
    )
  }

  async lockOpportunity(tenantId: string, opportunityId: string) {
    const [row] = await this.transaction
      .select({
        id: opportunities.id,
        tenantId: opportunities.tenant_id,
        accountId: opportunities.account_id,
        stage: opportunities.stage,
      })
      .from(opportunities)
      .where(
        and(
          eq(opportunities.tenant_id, tenantId),
          eq(opportunities.id, opportunityId)
        )
      )
      .limit(1)
      .for('update')
    return row ?? null
  }

  async nextPprfVersion(
    tenantId: string,
    opportunityId: string
  ): Promise<number> {
    const [row] = await this.transaction
      .select({
        version: sql<number>`COALESCE(MAX(${pprfSubmissions.version}), 0)`,
      })
      .from(pprfSubmissions)
      .where(
        and(
          eq(pprfSubmissions.tenant_id, tenantId),
          eq(pprfSubmissions.opportunity_id, opportunityId)
        )
      )
    return z.number().int().nonnegative().parse(row?.version ?? 0) + 1
  }
}

const drizzlePprfSubmissionStore: PprfSubmissionStore = {
  transaction: (callback) =>
    db.transaction((transaction) =>
      callback(new DrizzlePprfSubmissionTransaction(transaction))
    ),
}

export const pprfSubmissionService = new PprfSubmissionService(
  drizzlePprfSubmissionStore,
  { now: () => new Date(), kycDueAt: opportunityKycDueAt }
)
