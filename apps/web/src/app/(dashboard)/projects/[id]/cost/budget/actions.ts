'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { createHash, randomUUID } from 'node:crypto'
import {
  requireUserProfile,
  type ErpCapability,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  costCodes,
  bomLineItems,
  boms,
  projectBudgetLines,
  projectBudgets,
  projects,
  users,
  tenants,
  auditLog,
} from '@third-code-erp/database/schema'
import { canUniversalSearchEntity } from '@third-code-erp/shared-types'
import { ERP_ROLES, roleHasCapability } from '@third-code-erp/shared-types/authorization'
import { stampActorInTransaction, writeAuditLogInTransaction, type DatabaseTransaction } from '@/lib/audit'
import { parsePesosToCents } from '@/lib/operations/scope-money'

type ActionResult =
  | { ok: true; id: string; receipt: BudgetDraftReceipt; refreshWarning?: string; error?: never }
  | { ok?: false; error: string; unconfirmed?: true }

type SaveBudgetResult =
  | {
      ok: true
      id: string
      lines: Array<{ id: string; costCodeId: string; clientKey?: string }>
      receipt: BudgetDraftReceipt
      refreshWarning?: string
      error?: never
    }
  | { ok?: false; error: string; unconfirmed?: true }

const canonicalUuid = z.string().guid().transform(value => value.toLowerCase())
const budgetVersionSchema = z.string().regex(/^\d+:-?\d+(?:\.\d{1,6})?$/).max(80)
const draftReceiptSchema = z.object({
  operation: z.enum(['create_cost_code', 'create_budget', 'save_draft']),
  projectId: canonicalUuid,
  sourceBudgetId: canonicalUuid.nullable(),
  requestId: canonicalUuid.optional(),
  resultId: canonicalUuid,
  expectedVersion: budgetVersionSchema.optional(),
  resultVersion: budgetVersionSchema.optional(),
  lines: z.array(z.object({ id: canonicalUuid, costCodeId: canonicalUuid, clientKey: canonicalUuid.optional() })).optional(),
})
export type BudgetDraftReceipt = z.infer<typeof draftReceiptSchema>

const categorySchema = z.enum([
  'material',
  'labour',
  'subcontractor',
  'equipment',
  'overhead',
  'other',
])

const createCodeSchema = z.object({
  projectId: canonicalUuid,
  requestId: canonicalUuid.optional(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  category: categorySchema,
})

const createBudgetSchema = z.object({
  projectId: canonicalUuid,
  requestId: canonicalUuid.optional(),
  sourceBomId: canonicalUuid.nullable().optional(),
  controlMode: z.enum(['monitor', 'warn', 'block']),
  toleranceBps: z.coerce.number().int().min(0).max(10_000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  effectiveFrom: z.string().date(),
  reason: z.string().trim().min(3).max(500),
})

const lineSchema = z.object({
  clientKey: canonicalUuid.optional(),
  id: canonicalUuid.optional(),
  costCodeId: canonicalUuid,
  bomLineItemId: canonicalUuid.nullable().optional(),
  description: z.string().trim().min(1).max(500),
  amountPhp: z.string()
    .trim()
    .regex(/^\d+(?:\.\d{1,2})?$/, 'Budget amount must use pesos with at most two decimals')
    .refine((value) => {
      const cents = parsePesosToCents(value)
      return cents !== undefined && cents > 0 && cents <= 100_000_000_000
    }, 'Budget amount must be a positive safe centavo value'),
})

const saveBudgetSchema = createBudgetSchema
  .omit({ projectId: true })
  .extend({
    projectId: canonicalUuid,
    budgetId: canonicalUuid,
    requestId: canonicalUuid,
    expectedVersion: budgetVersionSchema,
    lines: z.array(lineSchema).min(1).max(200),
  })

const KNOWN_ERRORS = [
  'Project Budget not found',
  'Only a draft Project Budget can be submitted',
  'Project Budget requires positive line evidence',
  'Project Budget contains an inactive Cost Code',
  'Project Budget creator cannot approve their own revision',
  'Commercial budget lane is already approved',
  'Finance budget lane is already approved',
  'Commercial and Finance approvals require separate actors',
  'Only a submitted Project Budget can be reviewed',
  'Only a submitted Project Budget can be rejected',
  'Project Budget rejection reason is required',
  'Only the approved Project Budget can be revised',
  'Project Budget revision reason is required',
  'Project Budget source BOM must belong to its project',
  'Project Budget revision must supersede its approved baseline',
  'Remove linked budget lines before changing source BOM',
  'Project Budget line requires an active Cost Code',
  'Budget BOM line must belong to its source BOM',
  'Project Budget line does not belong to this draft',
  'Project Budget changed during save. Please retry.',
] as const

function safeMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.startsWith('Forbidden')) {
      return 'You do not have permission to manage this Project Budget.'
    }
    const known = KNOWN_ERRORS.find((message) =>
      error.message.includes(message)
    )
    if (known) return known
    if (
      error.message.includes('ux_cost_codes_tenant_code') ||
      error.message.includes('duplicate key')
    ) {
      return 'That Cost Code or budget revision already exists.'
    }
  }
  return 'Project Budget outcome could not be confirmed. Refresh before retrying.'
}

function refreshProjectBudget(projectId: string) {
  revalidatePath(`/projects/${projectId}`)
  revalidatePath(`/projects/${projectId}/cost`)
  revalidatePath(`/projects/${projectId}/cost/budget`)
  revalidatePath('/purchase-orders')
}

export async function createCostCode(
  formData: FormData
): Promise<ActionResult> {
  try {
    const profile = await requireUserProfile()
    const parsed = createCodeSchema.safeParse({
      requestId: formData.get('request_id') ?? undefined,
      projectId: formData.get('project_id'),
      code: formData.get('code'),
      name: formData.get('name'),
      category: formData.get('category'),
    })
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? 'Invalid Cost Code.',
      }
    }
    return await executeDraftCommand(profile, {
      operation: 'create_cost_code', projectId: parsed.data.projectId, sourceBudgetId: null,
      requestId: parsed.data.requestId, fingerprint: draftFingerprint({ ...parsed.data, code: parsed.data.code.toUpperCase() }),
    }, async tx => {
    const [created] = await tx
      .insert(costCodes)
      .values({
        tenant_id: profile.tenantId,
        code: parsed.data.code.toUpperCase(),
        name: parsed.data.name,
        category: parsed.data.category,
        created_by: profile.user.id,
      })
      .returning({ id: costCodes.id })

    if (!created) throw new Error('Cost Code receipt missing')
    return { id: created.id }
    })
  } catch (error) {
    return draftFailure(error, Boolean(formData.get('request_id')))
  }
}

export async function createProjectBudget(
  formData: FormData
): Promise<ActionResult> {
  try {
    const profile = await requireUserProfile()
    const parsed = createBudgetSchema.safeParse({
      requestId: formData.get('request_id') ?? undefined,
      projectId: formData.get('project_id'),
      sourceBomId: formData.get('source_bom_id') || undefined,
      controlMode: formData.get('control_mode'),
      toleranceBps: formData.get('tolerance_bps') ?? 0,
      currency: formData.get('currency') ?? 'PHP',
      effectiveFrom: formData.get('effective_from'),
      reason: formData.get('revision_reason'),
    })
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? 'Invalid Project Budget.',
      }
    }
    return await executeDraftCommand(profile, {
      operation: 'create_budget', projectId: parsed.data.projectId, sourceBudgetId: null,
      requestId: parsed.data.requestId, fingerprint: draftFingerprint({ ...parsed.data, sourceBomId: parsed.data.sourceBomId }),
    }, async (tx, role) => {
    if (
      parsed.data.sourceBomId &&
      !canUniversalSearchEntity(role, 'bom')
    ) {
      throw new Error('Forbidden: BOM associations require BOM read access')
    }
    if (parsed.data.sourceBomId) {
      const [bom] = await tx.select({ id: boms.id }).from(boms).where(and(
        eq(boms.id, parsed.data.sourceBomId), eq(boms.tenant_id, profile.tenantId), eq(boms.project_id, parsed.data.projectId),
      )).limit(1)
      if (!bom) throw new BudgetWorkflowError('Project Budget source BOM must belong to its project')
    }
      const revisions = await tx
        .select({ revision: projectBudgets.revision })
        .from(projectBudgets)
        .where(
          and(
            eq(projectBudgets.tenant_id, profile.tenantId),
            eq(projectBudgets.project_id, parsed.data.projectId)
          )
        )
        .orderBy(asc(projectBudgets.revision))
      const revision =
        revisions.reduce((maxRevision, row) => {
          return Math.max(maxRevision, row.revision)
        }, 0) + 1

      const [created] = await tx
        .insert(projectBudgets)
        .values({
          tenant_id: profile.tenantId,
          project_id: parsed.data.projectId,
          source_bom_id: parsed.data.sourceBomId,
          revision,
          status: 'draft',
          control_mode: parsed.data.controlMode,
          commitment_tolerance_bps: parsed.data.toleranceBps,
          currency: parsed.data.currency,
          effective_from: parsed.data.effectiveFrom,
          revision_reason: parsed.data.reason,
          created_by: profile.user.id,
        })
        .returning({ id: projectBudgets.id })
      if (!created) throw new Error('Project Budget not found')
      return { id: created.id }
    })
  } catch (error) {
    return draftFailure(error, Boolean(formData.get('request_id')))
  }
}

export async function saveProjectBudget(
  formData: FormData
): Promise<SaveBudgetResult> {
  try {
    const profile = await requireUserProfile()
    if (!formData.get('request_id') || !formData.get('expected_version')) {
      return { error: 'Reload this draft before saving; a request key and current version are required.' }
    }
    let rawLines: unknown
    try {
      rawLines = JSON.parse(String(formData.get('lines') ?? '[]'))
    } catch {
      return { error: 'Budget lines are invalid.' }
    }
    const rawSourceBomId = formData.get('source_bom_id')
    const parsed = saveBudgetSchema.safeParse({
      requestId: formData.get('request_id'),
      expectedVersion: formData.get('expected_version'),
      projectId: formData.get('project_id'),
      budgetId: formData.get('budget_id'),
      sourceBomId:
        rawSourceBomId === null
          ? undefined
          : rawSourceBomId === ''
            ? null
            : rawSourceBomId,
      controlMode: formData.get('control_mode'),
      toleranceBps: formData.get('tolerance_bps') ?? 0,
      currency: formData.get('currency') ?? 'PHP',
      effectiveFrom: formData.get('effective_from'),
      reason: formData.get('revision_reason'),
      lines: rawLines,
    })
    if (!parsed.success) {
      return {
        error: parsed.error.issues[0]?.message ?? 'Invalid Project Budget.',
      }
    }

    const result = await executeDraftCommand(profile, {
      operation: 'save_draft', projectId: parsed.data.projectId, sourceBudgetId: parsed.data.budgetId,
      requestId: parsed.data.requestId, expectedVersion: parsed.data.expectedVersion,
      fingerprint: draftFingerprint({ ...parsed.data, sourceBomId: parsed.data.sourceBomId,
        lines: parsed.data.lines.map(line => ({ clientKey: line.clientKey, id: line.id, costCodeId: line.costCodeId,
          bomLineItemId: line.bomLineItemId, description: line.description, amountCents: String(parsePesosToCents(line.amountPhp)) })) }),
    }, async (tx, role) => {
    const canReadBom = canUniversalSearchEntity(role, 'bom')
    if (
      !canReadBom &&
      (parsed.data.sourceBomId !== undefined ||
        parsed.data.lines.some((line) => line.bomLineItemId !== undefined))
    ) {
      throw new Error('Forbidden: BOM associations require BOM read access')
    }

      // This row is the serialization point for every save of this draft. It
      // must be locked before the line snapshot so concurrent requests cannot
      // both reconcile against stale identities or line numbers.
      const [budget] = await tx
        .select({
          id: projectBudgets.id,
          status: projectBudgets.status,
          projectId: projectBudgets.project_id,
          sourceBomId: projectBudgets.source_bom_id,
        })
        .from(projectBudgets)
        .where(
          and(
            eq(projectBudgets.id, parsed.data.budgetId),
            eq(projectBudgets.tenant_id, profile.tenantId),
            eq(projectBudgets.project_id, parsed.data.projectId),
            eq(projectBudgets.status, 'draft')
          )
        )
        .for('update')
      if (!budget) {
        throw new Error('Only a draft Project Budget can be submitted')
      }

      const duplicateCode = new Set(
        parsed.data.lines.map((line) => line.costCodeId)
      ).size !== parsed.data.lines.length
      if (duplicateCode) {
        throw new Error('Each Cost Code can appear only once per revision.')
      }

      const submittedLineIds = parsed.data.lines.flatMap((line) =>
        line.id ? [line.id] : []
      )
      if (new Set(submittedLineIds).size !== submittedLineIds.length) {
        throw new Error('Project Budget line does not belong to this draft')
      }

      const existingLines = await tx
        .select({
          id: projectBudgetLines.id,
          costCodeId: projectBudgetLines.cost_code_id,
          bomLineItemId: projectBudgetLines.bom_line_item_id,
          lineNumber: projectBudgetLines.line_number,
          createdAt: projectBudgetLines.created_at,
        })
        .from(projectBudgetLines)
        .where(
          and(
            eq(projectBudgetLines.project_budget_id, parsed.data.budgetId),
            eq(projectBudgetLines.tenant_id, profile.tenantId)
          )
        )
      const existingById = new Map(
        existingLines.map((line) => [line.id, line])
      )

      for (const lineId of submittedLineIds) {
        if (!existingById.has(lineId)) {
          throw new Error('Project Budget line does not belong to this draft')
        }
      }

      const sourceBomId =
        parsed.data.sourceBomId === undefined
          ? budget.sourceBomId
          : parsed.data.sourceBomId
      const resolvedLines = parsed.data.lines.map((line) => {
        const existing = line.id ? existingById.get(line.id) : undefined
        return {
          ...line,
          bomLineItemId:
            line.bomLineItemId === undefined
              ? existing?.bomLineItemId ?? null
              : line.bomLineItemId,
        }
      })
      const submittedLineIdSet = new Set(submittedLineIds)
      const omittedLineIds = existingLines
        .filter((line) => !submittedLineIdSet.has(line.id))
        .map((line) => line.id)

      if (canReadBom && sourceBomId) {
        const [sourceBom] = await tx
          .select({ id: boms.id })
          .from(boms)
          .where(
            and(
              eq(boms.id, sourceBomId),
              eq(boms.project_id, parsed.data.projectId),
              eq(boms.tenant_id, profile.tenantId)
            )
          )
          .limit(1)
        if (!sourceBom) {
          throw new Error('Project Budget source BOM must belong to its project')
        }
      }

      if (canReadBom) {
        const requestedBomLineIds = [
          ...new Set(
            resolvedLines.flatMap((line) =>
              line.bomLineItemId ? [line.bomLineItemId] : []
            )
          ),
        ]
        if (requestedBomLineIds.length > 0 && !sourceBomId) {
          throw new Error('Budget BOM line must belong to its source BOM')
        }
        if (requestedBomLineIds.length > 0) {
          const ownedBomLines = await tx
            .select({
              id: bomLineItems.id,
              bomId: bomLineItems.bom_id,
            })
            .from(bomLineItems)
            .where(
              and(
                eq(bomLineItems.tenant_id, profile.tenantId),
                inArray(bomLineItems.id, requestedBomLineIds)
              )
            )
          const ownedBomLineById = new Map(
            ownedBomLines.map((line) => [line.id, line])
          )
          if (
            requestedBomLineIds.some(
              (lineId) =>
                ownedBomLineById.get(lineId)?.bomId !== sourceBomId
            )
          ) {
            throw new Error('Budget BOM line must belong to its source BOM')
          }
        }
      }

      // The budget guard treats these metadata fields as workflow-controlled.
      // Establish the exact locked budget as transaction-local context even
      // when this is the first save and no line trigger has run yet.
      await tx.execute(sql`
        select pg_catalog.set_config(
          'app.project_budget_write',
          ${budget.id}::text,
          true
        )
      `)

      const sourceBomChanged = sourceBomId !== budget.sourceBomId
      const temporaryLineNumberStart =
        existingLines.reduce(
          (maximum, line) => Math.max(maximum, line.lineNumber),
          0
        ) + parsed.data.lines.length + 1
      const persistedLines = resolvedLines.filter(
        (line): line is typeof line & { id: string } => Boolean(line.id)
      )
      const costCodeChangingIdSet = new Set(
        persistedLines.flatMap((line) =>
          existingById.get(line.id)?.costCodeId !== line.costCodeId
            ? [line.id]
            : []
        )
      )
      const deletedLineIds = [
        ...new Set([...omittedLineIds, ...costCodeChangingIdSet]),
      ]

      if (deletedLineIds.length > 0) {
        const deletedLines = await tx
          .delete(projectBudgetLines)
          .where(
            and(
              eq(projectBudgetLines.project_budget_id, parsed.data.budgetId),
              eq(projectBudgetLines.tenant_id, profile.tenantId),
              inArray(projectBudgetLines.id, deletedLineIds)
            )
          )
          .returning({ id: projectBudgetLines.id })
        if (deletedLines.length !== deletedLineIds.length) {
          throw new Error('Project Budget changed during save. Please retry.')
        }
      }

      // Stage retained identities outside the final line-number range. When
      // the source BOM changes, detach them first so the database can enforce
      // the source/line invariant throughout the transaction.
      const stablePersistedLines = persistedLines.filter(
        (line) => !costCodeChangingIdSet.has(line.id)
      )
      for (const [index, line] of stablePersistedLines.entries()) {
        const staged = await tx
          .update(projectBudgetLines)
          .set({
            line_number: temporaryLineNumberStart + index,
            ...(sourceBomChanged ? { bom_line_item_id: null } : {}),
          })
          .where(
            and(
              eq(projectBudgetLines.id, line.id),
              eq(projectBudgetLines.project_budget_id, parsed.data.budgetId),
              eq(projectBudgetLines.tenant_id, profile.tenantId)
            )
          )
          .returning({ id: projectBudgetLines.id })
        if (staged.length !== 1) {
          throw new Error('Project Budget changed during save. Please retry.')
        }
      }

      const updatedBudgets = await tx
        .update(projectBudgets)
        .set({
          source_bom_id: sourceBomId,
          control_mode: parsed.data.controlMode,
          commitment_tolerance_bps: parsed.data.toleranceBps,
          currency: parsed.data.currency,
          effective_from: parsed.data.effectiveFrom,
          revision_reason: parsed.data.reason,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(projectBudgets.id, parsed.data.budgetId),
            eq(projectBudgets.tenant_id, profile.tenantId),
            eq(projectBudgets.project_id, parsed.data.projectId),
            eq(projectBudgets.status, 'draft')
          )
        )
        .returning({ id: projectBudgets.id })
      if (updatedBudgets.length !== 1) {
        throw new Error('Project Budget changed during save. Please retry.')
      }

      const lineWrites = resolvedLines.map((line, index) => {
        const amountCents = parsePesosToCents(line.amountPhp)
        if (amountCents === undefined) {
          throw new Error('Budget amount must be a positive safe centavo value')
        }
        return {
          ...line,
          lineNumber: index + 1,
          amountCents,
        }
      })

      for (const line of lineWrites) {
        if (!line.id || costCodeChangingIdSet.has(line.id)) continue
        const updatedLines = await tx
          .update(projectBudgetLines)
          .set({
            cost_code_id: line.costCodeId,
            bom_line_item_id: line.bomLineItemId,
            line_number: line.lineNumber,
            description: line.description,
            amount_cents: line.amountCents,
          })
          .where(
            and(
              eq(projectBudgetLines.id, line.id),
              eq(projectBudgetLines.project_budget_id, parsed.data.budgetId),
              eq(projectBudgetLines.tenant_id, profile.tenantId)
            )
          )
          .returning({ id: projectBudgetLines.id })
        if (updatedLines.length !== 1) {
          throw new Error('Project Budget changed during save. Please retry.')
        }
      }

      // The cost-code unique index is immediate, so an A<->B swap cannot be
      // expressed as two in-place updates. Recreate only cost-code-changing
      // rows with their exact id/created_at after deleting the full collision
      // set. Database total and audit triggers intentionally observe both
      // legs; the enclosing transaction keeps the intermediate state private.
      const insertedLineValues = lineWrites
        .filter((line) => !line.id || costCodeChangingIdSet.has(line.id))
        .map((line) => {
          const existing = line.id ? existingById.get(line.id) : undefined
          return {
            ...(line.id && existing
              ? { id: line.id, created_at: existing.createdAt }
              : {}),
            tenant_id: profile.tenantId,
            project_budget_id: parsed.data.budgetId,
            cost_code_id: line.costCodeId,
            bom_line_item_id: line.bomLineItemId,
            line_number: line.lineNumber,
            description: line.description,
            amount_cents: line.amountCents,
          }
        })
      const insertedLines =
        insertedLineValues.length > 0
          ? await tx
              .insert(projectBudgetLines)
              .values(insertedLineValues)
              .returning({
                id: projectBudgetLines.id,
                costCodeId: projectBudgetLines.cost_code_id,
              })
          : []
      if (insertedLines.length !== insertedLineValues.length) {
        throw new Error('Project Budget changed during save. Please retry.')
      }

      const insertedByCostCode = new Map(
        insertedLines.map((line) => [line.costCodeId, line.id])
      )
      const savedLines = lineWrites.map((line) => {
        const id = line.id ?? insertedByCostCode.get(line.costCodeId)
        if (!id) {
          throw new Error('Project Budget changed during save. Please retry.')
        }
        return {
          id,
          costCodeId: line.costCodeId,
          ...(line.clientKey ? { clientKey: line.clientKey } : {}),
        }
      })
      return { id: parsed.data.budgetId, lines: savedLines }
    })
    if (!result.receipt.lines) throw new Error('Saved line receipt missing')
    return { ...result, lines: result.receipt.lines }
  } catch (error) {
    return draftFailure(error, Boolean(formData.get('request_id')))
  }
}

type WorkflowOperation = 'submit' | 'commercial' | 'finance' | 'reject' | 'revise'
type BudgetRow = typeof projectBudgets.$inferSelect

export type BudgetWorkflowReceipt = {
  projectId: string
  sourceBudgetId: string
  operation: WorkflowOperation
  resultBudgetId: string
  status: BudgetRow['status']
  requestId?: string
}

function draftFingerprint(value: unknown): string {
  function canonical(input: unknown): unknown {
    if (input === undefined) return { omitted: true }
    if (Array.isArray(input)) return input.map(canonical)
    if (input !== null && typeof input === 'object') {
      return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, canonical(item)]))
    }
    return input
  }
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

function draftFailure(error: unknown, keyed: boolean): { error: string; unconfirmed?: true } {
  if (error instanceof BudgetWorkflowError) return { error: error.message }
  const seen = new Set<unknown>()
  let cause = error
  while (cause instanceof Object && !seen.has(cause)) {
    seen.add(cause)
    // PostgreSQL rejected and rolled back this write. A nested driver wrapper
    // must not turn a definite uniqueness conflict into an uncertain retry.
    if ('code' in cause && cause.code === '23505') {
      return { error: 'This command conflicts with an existing Cost Code or budget record. Refresh and review it.' }
    }
    cause = 'cause' in cause ? cause.cause : undefined
  }
  const safe = safeMessage(error)
  if (safe !== 'Project Budget outcome could not be confirmed. Refresh before retrying.') return { error: safe }
  const failure = workflowError(error)
  if (!failure.unconfirmed) return failure
  return { error: keyed
    ? 'Project Budget outcome could not be confirmed. Retry the unchanged request to reconcile it.'
    : 'Project Budget outcome could not be confirmed. Refresh and inspect existing records before creating another.', unconfirmed: true }
}

async function exactBudgetVersion(tx: DatabaseTransaction, tenantId: string, budgetId: string): Promise<string> {
  const [row] = await tx.execute<{ version: string }>(sql`select xmin::text || ':' || extract(epoch from updated_at)::text as version
    from public.project_budgets where tenant_id = ${tenantId}::uuid and id = ${budgetId}::uuid`)
  if (!row) throw new Error('Budget version receipt missing')
  return row.version
}

async function executeDraftCommand(
  profile: Awaited<ReturnType<typeof requireUserProfile>>,
  command: { operation: BudgetDraftReceipt['operation']; projectId: string; sourceBudgetId: string | null; requestId?: string; expectedVersion?: string; fingerprint: string },
  mutate: (tx: DatabaseTransaction, role: (typeof ERP_ROLES)[number]) => Promise<{ id: string; lines?: NonNullable<BudgetDraftReceipt['lines']> }>,
): Promise<Extract<ActionResult, { ok: true }>> {
  const traceId = randomUUID()
  let outcome = 'unconfirmed'
  try {
    const receipt = await db.transaction(async tx => {
      const role = await admitBudgetWorkflow(tx, profile.tenantId, profile.user.id, 'submit')
      await tx.execute(sql`select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
        ${profile.tenantId}::uuid::text || ':' || ${command.projectId}::uuid::text, 0))`)
      const [project] = await tx.select({ id: projects.id }).from(projects)
        .where(and(eq(projects.id, command.projectId), eq(projects.tenant_id, profile.tenantId))).limit(1).for('key share')
      if (!project) throw new BudgetWorkflowError('Project Budget not found')
      // Do not filter draft here: a committed save must reconcile after submit.
      if (command.sourceBudgetId) await lockedWorkflowBudget(tx, profile.tenantId, command.projectId, command.sourceBudgetId)
      if (command.requestId) {
        const [prior] = await tx.select({ diff: auditLog.diff }).from(auditLog).where(and(
          eq(auditLog.tenant_id, profile.tenantId), eq(auditLog.actor_id, profile.user.id),
          sql`${auditLog.diff}->>'draft_operation' = ${command.operation}`,
          sql`${auditLog.diff}->>'request_id' = ${command.requestId}`,
          sql`${auditLog.diff}->>'project_id' = ${command.projectId}`,
        )).limit(1)
        if (prior) {
          const saved = z.object({ payload_sha256: z.string(), receipt: draftReceiptSchema }).safeParse(prior.diff)
          if (!saved.success) throw new Error('Draft receipt is invalid')
          if (saved.data.payload_sha256 !== command.fingerprint) throw new BudgetWorkflowError('This request was already used with different draft data.')
          return saved.data.receipt
        }
      }
      if (command.sourceBudgetId && await exactBudgetVersion(tx, profile.tenantId, command.sourceBudgetId) !== command.expectedVersion) {
        throw new BudgetWorkflowError('This draft changed after you loaded it. Reload before saving; your edits were not applied.')
      }
      const result = await mutate(tx, role)
      await tx.execute(sql`select pg_catalog.set_config('app.project_budget_write', '', true)`)
      const committedReceipt: BudgetDraftReceipt = {
        operation: command.operation, projectId: command.projectId, sourceBudgetId: command.sourceBudgetId,
        ...(command.requestId ? { requestId: command.requestId } : {}),
        resultId: result.id,
        ...(command.expectedVersion ? { expectedVersion: command.expectedVersion } : {}),
        ...(command.operation !== 'create_cost_code' ? { resultVersion: await exactBudgetVersion(tx, profile.tenantId, result.id) } : {}),
        ...(result.lines ? { lines: result.lines } : {}),
      }
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId, actorId: profile.user.id,
        entityType: command.operation === 'create_cost_code' ? 'cost_code' : 'project_budget', entityId: result.id,
        action: command.operation === 'save_draft' ? 'update' : 'create',
        diff: { draft_operation: command.operation, project_id: command.projectId, request_id: command.requestId ?? null,
          payload_sha256: command.fingerprint, receipt: committedReceipt },
      })
      return committedReceipt
    })
    let refreshWarning: string | undefined
    try { refreshProjectBudget(command.projectId) } catch {
      refreshWarning = 'The draft command committed, but the view could not refresh. Reload to see the recorded result.'
    }
    outcome = refreshWarning ? 'succeeded_refresh_pending' : 'succeeded'
    return { ok: true, id: receipt.resultId, receipt, ...(refreshWarning ? { refreshWarning } : {}) }
  } catch (error) {
    if (!draftFailure(error, Boolean(command.requestId)).unconfirmed) outcome = 'rejected'
    throw error
  } finally {
    console.info(JSON.stringify({ trace_id: traceId, tenant_id: profile.tenantId, actor_id: profile.user.id, action: 'project_budget.draft', operation: command.operation, outcome }))
  }
}
export type BudgetWorkflowResult =
  | { ok: true; id: string; receipt: BudgetWorkflowReceipt; refreshWarning?: string; error?: never }
  | { ok?: false; error: string; unconfirmed?: true }

class BudgetWorkflowError extends Error {}

function workflowError(error: unknown): { error: string; unconfirmed?: true } {
  if (error instanceof BudgetWorkflowError) return { error: error.message }
  const seen = new Set<unknown>()
  let cause = error
  while (cause instanceof Object && !seen.has(cause)) {
    seen.add(cause)
    if ('code' in cause && (cause.code === '55P03' || cause.code === '40P01')) {
      return { error: 'Project Budget authority is changing or busy. Refresh and retry.' }
    }
    if (cause instanceof Error) {
      const known = KNOWN_ERRORS.find(message => cause instanceof Error && cause.message.includes(message))
      if (known) return { error: known }
    }
    cause = 'cause' in cause ? cause.cause : undefined
  }
  return { error: 'Project Budget outcome could not be confirmed. Retry the same request to reconcile it.', unconfirmed: true }
}

async function admitBudgetWorkflow(
  tx: DatabaseTransaction,
  tenantId: string,
  actorId: string,
  operation: WorkflowOperation,
) {
  await tx.execute(sql`set local lock_timeout = '3s'`)
  const [actor] = await tx.select({ role: users.role }).from(users)
    .where(and(eq(users.id, actorId), eq(users.tenant_id, tenantId), eq(users.account_status, 'active')))
    .limit(1).for('share', { noWait: true })
  const role = z.enum(ERP_ROLES).safeParse(actor?.role)
  const capability: ErpCapability = operation === 'commercial' ? 'budget.approve_commercial'
    : operation === 'finance' ? 'budget.approve_finance' : 'budget.manage'
  const allowed = role.success && (operation === 'reject'
    ? roleHasCapability(role.data, 'budget.approve_commercial') || roleHasCapability(role.data, 'budget.approve_finance')
    : roleHasCapability(role.data, capability))
  if (!role.success || !allowed) {
    throw new BudgetWorkflowError('Your current account cannot perform this Project Budget workflow.')
  }
  const [tenant] = await tx.select({ id: tenants.id }).from(tenants)
    .where(and(eq(tenants.id, tenantId), eq(tenants.status, 'active')))
    .limit(1).for('share', { noWait: true })
  if (!tenant) throw new BudgetWorkflowError('This organization is not active.')
  await stampActorInTransaction(tx, actorId)
  return role.data
}

async function lockedWorkflowBudget(tx: DatabaseTransaction, tenantId: string, projectId: string, budgetId: string) {
  const [budget] = await tx.select().from(projectBudgets)
    .where(and(eq(projectBudgets.id, budgetId), eq(projectBudgets.project_id, projectId), eq(projectBudgets.tenant_id, tenantId)))
    .limit(1).for('update')
  if (!budget) throw new BudgetWorkflowError('Project Budget not found')
  return budget
}

function existingWorkflowReceipt(budget: BudgetRow, operation: WorkflowOperation, actorId: string, reason?: string): boolean {
  if (operation === 'submit') return budget.submitted_by === actorId && budget.submitted_at !== null
  if (operation === 'commercial') return budget.commercial_approved_by === actorId && budget.commercial_approved_at !== null
  if (operation === 'finance') return budget.finance_approved_by === actorId && budget.finance_approved_at !== null
  if (operation === 'reject') {
    return budget.rejected_by === actorId && budget.rejected_at !== null && budget.rejection_reason === reason
  }
  return false
}

async function runWorkflow(
  projectId: string,
  budgetId: string,
  operation: WorkflowOperation,
  reason?: string,
  requestId?: string,
): Promise<BudgetWorkflowResult> {
  const traceId = randomUUID()
  let actorId: string | null = null
  let tenantId: string | null = null
  let validatedOperation: WorkflowOperation | null = null
  let outcome = 'rejected'
  try {
    const parsed = z.object({
      projectId: z.string().guid().transform(value => value.toLowerCase()),
      budgetId: z.string().guid().transform(value => value.toLowerCase()),
      operation: z.enum(['submit', 'commercial', 'finance', 'reject', 'revise']),
      reason: z.string().trim().max(operation === 'revise' ? 500 : 1000).optional(),
      requestId: z.string().guid().transform(value => value.toLowerCase()).optional(),
    }).safeParse({ projectId, budgetId, operation, reason, requestId })
    if (!parsed.success) return { error: 'A valid project, budget, workflow and bounded reason are required.' }
    const command = parsed.data
    validatedOperation = command.operation
    if ((command.operation === 'reject' || command.operation === 'revise') && (!command.reason || command.reason.length < 3)) {
      return { error: command.operation === 'reject' ? 'Project Budget rejection reason is required.' : 'Project Budget revision reason is required.' }
    }
    const profile = await requireUserProfile()
    actorId = profile.user.id
    tenantId = profile.tenantId
    outcome = 'unconfirmed'
    const receipt = await db.transaction(async tx => {
      const role = await admitBudgetWorkflow(tx, profile.tenantId, profile.user.id, command.operation)
      // SQL workflows use this exact advisory-before-row order. Do not invert it.
      await tx.execute(sql`select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(${profile.tenantId}::uuid::text || ':' || ${command.projectId}::uuid::text, 0)
      )`)
      const budget = await lockedWorkflowBudget(tx, profile.tenantId, command.projectId, command.budgetId)
      const receiptFor = (result: BudgetRow): BudgetWorkflowReceipt => ({
        projectId: command.projectId,
        sourceBudgetId: command.budgetId,
        operation: command.operation,
        resultBudgetId: result.id,
        status: result.status,
        ...(command.operation === 'revise' && command.requestId ? { requestId: command.requestId } : {}),
      })

      if (command.operation === 'revise' && command.requestId) {
        // Scope keys to this actor/source/project. A new command gets a new key,
        // even when its reason matches an earlier rejected revision.
        const [prior] = await tx.select({ id: auditLog.entity_id, diff: auditLog.diff }).from(auditLog)
          .where(and(
            eq(auditLog.tenant_id, profile.tenantId), eq(auditLog.actor_id, profile.user.id),
            eq(auditLog.entity_type, 'project_budget'), eq(auditLog.action, 'create'),
            sql`${auditLog.diff}->>'workflow_operation' = 'revise'`,
            sql`${auditLog.diff}->>'request_id' = ${command.requestId}`,
            sql`${auditLog.diff}->>'source_budget_id' = ${command.budgetId}`,
            sql`${auditLog.diff}->>'project_id' = ${command.projectId}`,
          )).limit(1)
        if (prior) {
          if (!prior.diff || typeof prior.diff !== 'object' || !('reason' in prior.diff) || prior.diff.reason !== command.reason) {
            throw new BudgetWorkflowError('This revision request was already used with a different reason.')
          }
          return receiptFor(await lockedWorkflowBudget(tx, profile.tenantId, command.projectId, prior.id))
        }
      }
      if (existingWorkflowReceipt(budget, command.operation, profile.user.id, command.reason)) return receiptFor(budget)

      let resultId = budget.id
      if (command.operation === 'submit') {
        await tx.execute(sql`select * from public.submit_project_budget(${budget.id}::uuid, ${profile.user.id}::uuid)`)
      } else if (command.operation === 'commercial' || command.operation === 'finance') {
        await tx.execute(sql`select * from public.review_project_budget(${budget.id}::uuid, ${profile.user.id}::uuid, ${command.operation})`)
      } else if (command.operation === 'reject') {
        await tx.execute(sql`select * from public.reject_project_budget(${budget.id}::uuid, ${profile.user.id}::uuid, ${command.reason})`)
      } else {
        const [created] = await tx.execute<{ budget_id: string }>(sql`select * from public.create_project_budget_revision(
          ${budget.id}::uuid, ${profile.user.id}::uuid, ${command.reason}
        )`)
        if (!created) throw new Error('Project Budget revision receipt missing')
        resultId = created.budget_id
      }
      // Revision line-total triggers also set this context. Never carry it into
      // subsequent work; on failure the enclosing rollback clears it.
      await tx.execute(sql`select pg_catalog.set_config('app.project_budget_write', '', true)`)
      const result = await lockedWorkflowBudget(tx, profile.tenantId, command.projectId, resultId)
      const approval = command.operation === 'commercial' || command.operation === 'finance'
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId, actorId: profile.user.id,
        entityType: 'project_budget', entityId: resultId,
        action: command.operation === 'revise' ? 'create' : approval ? 'approve' : 'status_change',
        diff: {
          workflow_operation: command.operation, project_id: command.projectId, source_budget_id: budget.id,
          ...(command.reason ? { reason: command.reason } : {}),
          ...(command.operation === 'revise' ? { supersedes_budget_id: budget.id, ...(command.requestId ? { request_id: command.requestId } : {}) } : {}),
          ...(approval || command.operation === 'submit' ? { lane: command.operation } : {}),
          ...(approval ? {
            owner_override: role === 'owner',
            commercial_approved_by: result.commercial_approved_by,
            finance_approved_by: result.finance_approved_by,
          } : {}),
          status: result.status,
        },
      })
      return receiptFor(result)
    })
    let refreshWarning: string | undefined
    try { refreshProjectBudget(parsed.data.projectId) } catch {
      refreshWarning = 'The workflow committed, but the view could not refresh. Reload to see the recorded result.'
    }
    outcome = refreshWarning ? 'succeeded_refresh_pending' : 'succeeded'
    return { ok: true, id: receipt.resultBudgetId, receipt, ...(refreshWarning ? { refreshWarning } : {}) }
  } catch (error) {
    const failure = workflowError(error)
    if (!failure.unconfirmed) outcome = 'rejected'
    if (failure.unconfirmed && validatedOperation === 'revise' && !requestId) {
      return { error: 'Project Budget outcome could not be confirmed. Refresh and inspect revisions before starting another revision.', unconfirmed: true }
    }
    return failure
  } finally {
    console.info(JSON.stringify({ trace_id: traceId, tenant_id: tenantId, actor_id: actorId, action: 'project_budget.workflow', operation: validatedOperation, outcome }))
  }
}

export async function submitProjectBudget(projectId: string, budgetId: string): Promise<BudgetWorkflowResult> {
  return runWorkflow(projectId, budgetId, 'submit')
}

export async function approveProjectBudget(projectId: string, budgetId: string, lane: 'commercial' | 'finance'): Promise<BudgetWorkflowResult> {
  const parsedLane = z.enum(['commercial', 'finance']).safeParse(lane)
  if (!parsedLane.success) return { error: 'Project Budget approval lane is invalid.' }
  return runWorkflow(projectId, budgetId, parsedLane.data)
}

export async function rejectProjectBudget(projectId: string, budgetId: string, reason: string): Promise<BudgetWorkflowResult> {
  return runWorkflow(projectId, budgetId, 'reject', reason)
}

export async function reviseProjectBudget(projectId: string, budgetId: string, reason: string, requestId?: string): Promise<BudgetWorkflowResult> {
  return runWorkflow(projectId, budgetId, 'revise', reason, requestId)
}
