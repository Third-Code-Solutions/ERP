'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  requireCapability,
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
} from '@third-code-erp/database/schema'
import { canUniversalSearchEntity } from '@third-code-erp/shared-types'
import { writeAuditLog } from '@/lib/audit'
import { parsePesosToCents } from '@/lib/operations/scope-money'

type ActionResult =
  | { ok: true; id?: string; error?: never }
  | { ok?: false; error: string }

type SaveBudgetResult =
  | {
      ok: true
      id: string
      lines: Array<{ id: string; costCodeId: string; clientKey?: string }>
      error?: never
    }
  | { ok?: false; error: string }

const categorySchema = z.enum([
  'material',
  'labour',
  'subcontractor',
  'equipment',
  'overhead',
  'other',
])

const createCodeSchema = z.object({
  projectId: z.string().uuid(),
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(160),
  category: categorySchema,
})

const createBudgetSchema = z.object({
  projectId: z.string().uuid(),
  sourceBomId: z.string().uuid().nullable().optional(),
  controlMode: z.enum(['monitor', 'warn', 'block']),
  toleranceBps: z.coerce.number().int().min(0).max(10_000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  effectiveFrom: z.string().date(),
  reason: z.string().trim().min(3).max(500),
})

const lineSchema = z.object({
  clientKey: z.string().uuid().optional(),
  id: z.string().uuid().optional(),
  costCodeId: z.string().uuid(),
  bomLineItemId: z.string().uuid().nullable().optional(),
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
    projectId: z.string().uuid(),
    budgetId: z.string().uuid(),
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
  return 'Project Budget action failed. No changes were saved.'
}

async function requireTenantProject(tenantId: string, projectId: string) {
  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId))
    )
    .limit(1)
  if (!project) throw new Error('Project Budget not found')
}

async function requireTenantProjectBom(
  tenantId: string,
  projectId: string,
  bomId: string
) {
  const [bom] = await db
    .select({ id: boms.id })
    .from(boms)
    .where(
      and(
        eq(boms.id, bomId),
        eq(boms.project_id, projectId),
        eq(boms.tenant_id, tenantId)
      )
    )
    .limit(1)
  if (!bom) {
    throw new Error('Project Budget source BOM must belong to its project')
  }
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
    requireCapability(profile, 'budget.manage')
    const parsed = createCodeSchema.safeParse({
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
    await requireTenantProject(profile.tenantId, parsed.data.projectId)

    const [created] = await db
      .insert(costCodes)
      .values({
        tenant_id: profile.tenantId,
        code: parsed.data.code.toUpperCase(),
        name: parsed.data.name,
        category: parsed.data.category,
        created_by: profile.user.id,
      })
      .returning({ id: costCodes.id })

    if (!created) return { error: 'Cost Code was not created.' }
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'cost_code',
      entityId: created.id,
      action: 'create',
      diff: {
        code: parsed.data.code.toUpperCase(),
        category: parsed.data.category,
      },
    })
    refreshProjectBudget(parsed.data.projectId)
    return { ok: true, id: created.id }
  } catch (error) {
    return { error: safeMessage(error) }
  }
}

export async function createProjectBudget(
  formData: FormData
): Promise<ActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'budget.manage')
    const parsed = createBudgetSchema.safeParse({
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
    if (
      parsed.data.sourceBomId &&
      !canUniversalSearchEntity(profile.role, 'bom')
    ) {
      throw new Error('Forbidden: BOM associations require BOM read access')
    }
    await requireTenantProject(profile.tenantId, parsed.data.projectId)
    if (parsed.data.sourceBomId) {
      await requireTenantProjectBom(
        profile.tenantId,
        parsed.data.projectId,
        parsed.data.sourceBomId
      )
    }

    const createdId = await db.transaction(async (tx) => {
      await tx.execute(sql`
        select pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(
            ${`${profile.tenantId}:${parsed.data.projectId}`},
            0
          )
        )
      `)
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
      return created.id
    })

    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'project_budget',
      entityId: createdId,
      action: 'create',
      diff: {
        project_id: parsed.data.projectId,
        reason: parsed.data.reason,
      },
    })
    refreshProjectBudget(parsed.data.projectId)
    return { ok: true, id: createdId }
  } catch (error) {
    return { error: safeMessage(error) }
  }
}

export async function saveProjectBudget(
  formData: FormData
): Promise<SaveBudgetResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'budget.manage')
    let rawLines: unknown
    try {
      rawLines = JSON.parse(String(formData.get('lines') ?? '[]'))
    } catch {
      return { error: 'Budget lines are invalid.' }
    }
    const rawSourceBomId = formData.get('source_bom_id')
    const parsed = saveBudgetSchema.safeParse({
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

    const canReadBom = canUniversalSearchEntity(profile.role, 'bom')
    if (
      !canReadBom &&
      (parsed.data.sourceBomId !== undefined ||
        parsed.data.lines.some((line) => line.bomLineItemId !== undefined))
    ) {
      throw new Error('Forbidden: BOM associations require BOM read access')
    }

    const savedLines = await db.transaction(async (tx) => {
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
      return lineWrites.map((line) => {
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
    })

    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'project_budget',
      entityId: parsed.data.budgetId,
      action: 'update',
      diff: { line_count: parsed.data.lines.length },
    })
    refreshProjectBudget(parsed.data.projectId)
    return { ok: true, id: parsed.data.budgetId, lines: savedLines }
  } catch (error) {
    return { error: safeMessage(error) }
  }
}

async function runWorkflow(
  capability: ErpCapability,
  projectId: string,
  budgetId: string,
  statement: 'submit' | 'commercial' | 'finance',
  reason?: string
): Promise<ActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, capability)
    const [budget] = await db
      .select({ id: projectBudgets.id })
      .from(projectBudgets)
      .where(
        and(
          eq(projectBudgets.id, budgetId),
          eq(projectBudgets.project_id, projectId),
          eq(projectBudgets.tenant_id, profile.tenantId)
        )
      )
      .limit(1)
    if (!budget) return { error: 'Project Budget not found' }

    if (statement === 'submit') {
      await db.execute(sql`
        select *
        from public.submit_project_budget(
          ${budgetId}::uuid,
          ${profile.user.id}::uuid
        )
      `)
    } else {
      await db.execute(sql`
        select *
        from public.review_project_budget(
          ${budgetId}::uuid,
          ${profile.user.id}::uuid,
          ${statement}
        )
      `)
    }

    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'project_budget',
      entityId: budgetId,
      action: statement === 'submit' ? 'status_change' : 'approve',
      diff: reason ? { lane: statement, reason } : { lane: statement },
    })
    refreshProjectBudget(projectId)
    return { ok: true, id: budgetId }
  } catch (error) {
    return { error: safeMessage(error) }
  }
}

export async function submitProjectBudget(
  projectId: string,
  budgetId: string
) {
  return runWorkflow(
    'budget.manage',
    projectId,
    budgetId,
    'submit'
  )
}

export async function approveProjectBudget(
  projectId: string,
  budgetId: string,
  lane: 'commercial' | 'finance'
) {
  return runWorkflow(
    lane === 'commercial'
      ? 'budget.approve_commercial'
      : 'budget.approve_finance',
    projectId,
    budgetId,
    lane
  )
}

export async function rejectProjectBudget(
  projectId: string,
  budgetId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const profile = await requireUserProfile()
    const mayReview =
      profile.role === 'owner' ||
      profile.role === 'admin' ||
      profile.role === 'commercial' ||
      profile.role === 'finance'
    if (!mayReview) {
      return { error: 'You do not have permission to reject this Project Budget.' }
    }
    const parsedReason = z.string().trim().min(3).max(1000).safeParse(reason)
    if (!parsedReason.success) {
      return { error: 'Project Budget rejection reason is required.' }
    }

    const [budget] = await db
      .select({ id: projectBudgets.id })
      .from(projectBudgets)
      .where(
        and(
          eq(projectBudgets.id, budgetId),
          eq(projectBudgets.project_id, projectId),
          eq(projectBudgets.tenant_id, profile.tenantId)
        )
      )
      .limit(1)
    if (!budget) return { error: 'Project Budget not found' }

    await db.execute(sql`
      select *
      from public.reject_project_budget(
        ${budgetId}::uuid,
        ${profile.user.id}::uuid,
        ${parsedReason.data}
      )
    `)
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'project_budget',
      entityId: budgetId,
      action: 'status_change',
      diff: { reason: parsedReason.data },
    })
    refreshProjectBudget(projectId)
    return { ok: true, id: budgetId }
  } catch (error) {
    return { error: safeMessage(error) }
  }
}

export async function reviseProjectBudget(
  projectId: string,
  budgetId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'budget.manage')
    const parsedReason = z.string().trim().min(3).max(500).safeParse(reason)
    if (!parsedReason.success) {
      return { error: 'Project Budget revision reason is required.' }
    }
    const rows = await db.execute<{ budget_id: string }>(sql`
      select *
      from public.create_project_budget_revision(
        ${budgetId}::uuid,
        ${profile.user.id}::uuid,
        ${parsedReason.data}
      )
    `)
    const created = rows[0]
    if (!created) return { error: 'Project Budget revision was not created.' }

    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'project_budget',
      entityId: created.budget_id,
      action: 'create',
      diff: { supersedes_budget_id: budgetId, reason: parsedReason.data },
    })
    refreshProjectBudget(projectId)
    return { ok: true, id: created.budget_id }
  } catch (error) {
    return { error: safeMessage(error) }
  }
}
