'use server'

import { revalidatePath } from 'next/cache'
import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  requireCapability,
  requireUserProfile,
  type ErpCapability,
} from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  costCodes,
  projectBudgetLines,
  projectBudgets,
  projects,
} from '@third-code-erp/database/schema'
import { writeAuditLog } from '@/lib/audit'
import { parsePesosToCents } from '@/lib/operations/scope-money'

type ActionResult =
  | { ok: true; id?: string; error?: never }
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
  sourceBomId: z.string().uuid().optional(),
  controlMode: z.enum(['monitor', 'warn', 'block']),
  toleranceBps: z.coerce.number().int().min(0).max(10_000),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/),
  effectiveFrom: z.string().date(),
  reason: z.string().trim().min(3).max(500),
})

const lineSchema = z.object({
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
    await requireTenantProject(profile.tenantId, parsed.data.projectId)

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
): Promise<ActionResult> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'budget.manage')
    let rawLines: unknown
    try {
      rawLines = JSON.parse(String(formData.get('lines') ?? '[]'))
    } catch {
      return { error: 'Budget lines are invalid.' }
    }
    const parsed = saveBudgetSchema.safeParse({
      projectId: formData.get('project_id'),
      budgetId: formData.get('budget_id'),
      sourceBomId: formData.get('source_bom_id') || undefined,
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

    await db.transaction(async (tx) => {
      const [budget] = await tx
        .select({
          id: projectBudgets.id,
          status: projectBudgets.status,
          projectId: projectBudgets.project_id,
        })
        .from(projectBudgets)
        .where(
          and(
            eq(projectBudgets.id, parsed.data.budgetId),
            eq(projectBudgets.tenant_id, profile.tenantId),
            eq(projectBudgets.project_id, parsed.data.projectId)
          )
        )
        .limit(1)
      if (!budget || budget.status !== 'draft') {
        throw new Error('Only a draft Project Budget can be submitted')
      }

      const duplicateCode = new Set(
        parsed.data.lines.map((line) => line.costCodeId)
      ).size !== parsed.data.lines.length
      if (duplicateCode) {
        throw new Error('Each Cost Code can appear only once per revision.')
      }

      await tx
        .delete(projectBudgetLines)
        .where(
          and(
            eq(projectBudgetLines.project_budget_id, parsed.data.budgetId),
            eq(projectBudgetLines.tenant_id, profile.tenantId)
          )
        )
      await tx
        .update(projectBudgets)
        .set({
          source_bom_id: parsed.data.sourceBomId,
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
            eq(projectBudgets.tenant_id, profile.tenantId)
          )
        )
      await tx.insert(projectBudgetLines).values(
        parsed.data.lines.map((line, index) => {
          const amountCents = parsePesosToCents(line.amountPhp)
          if (amountCents === undefined) {
            throw new Error('Budget amount must be a positive safe centavo value')
          }
          return {
            tenant_id: profile.tenantId,
            project_budget_id: parsed.data.budgetId,
            cost_code_id: line.costCodeId,
            bom_line_item_id: line.bomLineItemId ?? undefined,
            line_number: index + 1,
            description: line.description,
            amount_cents: amountCents,
          }
        })
      )
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
    return { ok: true, id: parsed.data.budgetId }
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
