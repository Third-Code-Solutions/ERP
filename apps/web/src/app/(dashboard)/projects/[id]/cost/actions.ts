'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { requireUserProfile, requireCapability } from '@buildops/auth'
import { db } from '@buildops/database'
import { costEntries, projects } from '@buildops/database/schema'
import { writeAuditLog } from '@/lib/audit'

const createSchema = z.object({
  project_id: z.string().uuid(),
  cost_category: z.enum(['material', 'labour', 'subcontractor', 'equipment', 'overhead', 'other']),
  description: z.string().min(1).max(500),
  amount_php: z.coerce.number().min(0.01).max(1_000_000_000),
  quantity: z.coerce.number().int().min(1).max(1_000_000).default(1),
  unit: z.string().max(20).optional(),
  incurred_at: z.string().optional(),
  reference_number: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
})

type Result = { id: string } | { error: string }

function safeMessage(err: unknown): string {
  if (err instanceof Error) {
    // Don't leak the raw capability string to the UI.
    if (err.message.startsWith('Forbidden')) return 'You do not have permission to record costs.'
    return err.message
  }
  return 'Could not record the cost entry.'
}

export async function createCostEntry(formData: FormData): Promise<Result> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'cost.record')

    const parsed = createSchema.safeParse({
      project_id: formData.get('project_id'),
      cost_category: formData.get('cost_category'),
      description: formData.get('description'),
      amount_php: formData.get('amount_php'),
      quantity: formData.get('quantity') ?? 1,
      unit: formData.get('unit') || undefined,
      incurred_at: formData.get('incurred_at') || undefined,
      reference_number: formData.get('reference_number') || undefined,
      notes: formData.get('notes') || undefined,
    })
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? 'Invalid input.' }
    }
    const d = parsed.data
    const amountCents = Math.round(d.amount_php * 100)

    // Verify the project belongs to the caller's tenant. The Drizzle client runs
    // as the postgres owner (RLS-bypassed), so the action is the sole authz gate.
    const [proj] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, d.project_id), eq(projects.tenant_id, profile.tenantId)))
    if (!proj) return { error: 'Project not found.' }

    const [row] = await db
      .insert(costEntries)
      .values({
        tenant_id: profile.tenantId,
        project_id: d.project_id,
        created_by: profile.user.id,
        cost_category: d.cost_category,
        cost_source: 'manual',
        description: d.description,
        amount_cents: amountCents,
        quantity: d.quantity,
        unit: d.unit,
        incurred_at: d.incurred_at ? new Date(d.incurred_at) : new Date(),
        reference_number: d.reference_number,
        notes: d.notes,
      })
      .returning({ id: costEntries.id })

    if (!row) return { error: 'Could not record the cost entry.' }

    try {
      await writeAuditLog({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'cost_entry',
        entityId: row.id,
        action: 'create',
        diff: { project_id: d.project_id, category: d.cost_category, amount_cents: amountCents },
      })
    } catch (err) {
      console.error('[cost/createCostEntry] audit failed:', err)
    }

    revalidatePath(`/projects/${d.project_id}/cost`)
    revalidatePath(`/projects/${d.project_id}`)
    revalidatePath('/reports')
    return { id: row.id }
  } catch (err) {
    return { error: safeMessage(err) }
  }
}

export async function deleteCostEntry(
  entryId: string,
  projectId: string
): Promise<{ ok: true } | { error: string }> {
  try {
    const profile = await requireUserProfile()
    requireCapability(profile, 'cost.record')

    const [row] = await db
      .select({ source: costEntries.cost_source })
      .from(costEntries)
      .where(and(eq(costEntries.id, entryId), eq(costEntries.tenant_id, profile.tenantId)))
    if (!row) return { error: 'Cost entry not found.' }
    if (row.source === 'po_derived') {
      return { error: 'PO-derived cost entries are system-managed and cannot be deleted.' }
    }

    await db
      .delete(costEntries)
      .where(and(eq(costEntries.id, entryId), eq(costEntries.tenant_id, profile.tenantId)))

    try {
      await writeAuditLog({
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'cost_entry',
        entityId: entryId,
        action: 'delete',
        diff: {},
      })
    } catch (err) {
      console.error('[cost/deleteCostEntry] audit failed:', err)
    }

    revalidatePath(`/projects/${projectId}/cost`)
    revalidatePath(`/projects/${projectId}`)
    revalidatePath('/reports')
    return { ok: true }
  } catch (err) {
    return { error: safeMessage(err) }
  }
}
