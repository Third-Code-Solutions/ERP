'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { boms, bomLineItems, users } from '@buildops/database/schema'
import { eq, and, max } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'
import { inngest } from '@/lib/inngest'
import {
  lineTotal as calcLineTotal,
  bomTotalCost,
  computeGP,
  computeGPMargin,
} from '@buildops/shared-types/bom'

export async function createBom(projectId: string): Promise<{ id: string } | { error: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  const [existing] = await db
    .select({ version: max(boms.version) })
    .from(boms)
    .where(and(eq(boms.project_id, projectId), eq(boms.tenant_id, userRow.tenant_id)))

  const nextVersion = (existing?.version ?? 0) + 1

  const inserted = await db
    .insert(boms)
    .values({
      tenant_id: userRow.tenant_id,
      project_id: projectId,
      created_by: user.id,
      version: nextVersion,
      status: 'draft',
    })
    .returning({ id: boms.id })

  const bomId = inserted[0]!.id

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
    entityType: 'bom',
    entityId: bomId,
    action: 'create',
    diff: { version: nextVersion, status: 'draft' },
  })

  revalidatePath(`/projects/${projectId}/bom`)
  return { id: bomId }
}

export async function addBomLineItem(
  bomId: string,
  projectId: string,
  data: {
    description: string
    unit: string
    quantity: number
    unit_cost_cents: number
    markup_bps: number
    code?: string
    notes?: string
  }
): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  // Use the canonical math module (tested in @buildops/shared-types/bom)
  const line_total_cents = calcLineTotal(data.unit_cost_cents, data.quantity, data.markup_bps)

  const [existing] = await db
    .select({ max_sort: max(bomLineItems.sort_order) })
    .from(bomLineItems)
    .where(eq(bomLineItems.bom_id, bomId))

  const sort_order = (existing?.max_sort ?? -1) + 1

  await db
    .insert(bomLineItems)
    .values({
      tenant_id: userRow.tenant_id,
      bom_id: bomId,
      sort_order,
      description: data.description,
      unit: data.unit,
      quantity: data.quantity,
      unit_cost_cents: data.unit_cost_cents,
      markup_bps: data.markup_bps,
      line_total_cents,
      code: data.code ?? null,
      notes: data.notes ?? null,
    })
    .returning({ id: bomLineItems.id })

  await recalcBomTotals(bomId, userRow.tenant_id)

  revalidatePath(`/projects/${projectId}/bom`)
  return {}
}

export async function deleteBomLineItem(
  itemId: string,
  bomId: string,
  projectId: string
): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  await db
    .delete(bomLineItems)
    .where(and(eq(bomLineItems.id, itemId), eq(bomLineItems.tenant_id, userRow.tenant_id)))

  await recalcBomTotals(bomId, userRow.tenant_id)
  revalidatePath(`/projects/${projectId}/bom`)
  return {}
}

export async function approveBom(bomId: string, projectId: string): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  // Recalc on approval to ensure totals are fresh and reconcile any drift
  await recalcBomTotals(bomId, userRow.tenant_id)

  await db
    .update(boms)
    .set({ status: 'approved', approved_by: user.id, approved_at: new Date() })
    .where(and(eq(boms.id, bomId), eq(boms.tenant_id, userRow.tenant_id)))

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
    entityType: 'bom',
    entityId: bomId,
    action: 'approve',
    diff: { status: 'approved' },
  })

  // Best-effort: trigger async embedding for RAG. Missing INNGEST keys must
  // not roll back the approval — the BOM is already saved.
  try {
    await inngest.send({
      name: 'bom/approved',
      data: { bomId, projectId, tenantId: userRow.tenant_id },
    })
  } catch (err) {
    console.warn('[approveBom] inngest.send failed (approval still persisted):', err)
  }

  revalidatePath(`/projects/${projectId}/bom`)
  return {}
}

async function recalcBomTotals(bomId: string, tenantId: string) {
  const lines = await db
    .select({
      line_total_cents: bomLineItems.line_total_cents,
      unit_cost_cents: bomLineItems.unit_cost_cents,
      quantity: bomLineItems.quantity,
    })
    .from(bomLineItems)
    .where(and(eq(bomLineItems.bom_id, bomId), eq(bomLineItems.tenant_id, tenantId)))

  // total_cost = sum of raw costs (no markup)
  // tcv        = sum of line totals (with markup)
  // gp         = tcv - cost
  // gp_margin  = gp / tcv (in basis points)
  const total_cost_cents = lines.reduce((s, l) => s + l.unit_cost_cents * l.quantity, 0)
  const tcv_cents = bomTotalCost(lines)
  const gp_cents = computeGP(tcv_cents, total_cost_cents)
  const gp_margin_bps = computeGPMargin(gp_cents, tcv_cents)

  await db
    .update(boms)
    .set({ total_cost_cents, tcv_cents, gp_cents, gp_margin_bps })
    .where(and(eq(boms.id, bomId), eq(boms.tenant_id, tenantId)))
}
