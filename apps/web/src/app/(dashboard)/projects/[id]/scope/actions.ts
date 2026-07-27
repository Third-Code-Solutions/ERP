'use server'

import { revalidatePath } from 'next/cache'
import { getUser } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { scopeItems, users } from '@third-code-erp/database/schema'
import { and, eq, max } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'

export async function addScopeItem(
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  const description = str(formData.get('description'))
  if (!description) return { error: 'Description is required' }

  const unit = str(formData.get('unit')) ?? 'pc'
  const quantity = intPos(formData.get('quantity')) ?? 1
  const unitCostCents = Math.round((floatPos(formData.get('unit_cost')) ?? 0) * 100)
  const lineTotalCents = unitCostCents * quantity

  const [lastOrder] = await db
    .select({ max_order: max(scopeItems.sort_order) })
    .from(scopeItems)
    .where(and(eq(scopeItems.project_id, projectId), eq(scopeItems.tenant_id, userRow.tenant_id)))

  const sortOrder = (lastOrder?.max_order ?? -1) + 1

  const [item] = await db
    .insert(scopeItems)
    .values({
      tenant_id: userRow.tenant_id,
      project_id: projectId,
      created_by: user.id,
      code: str(formData.get('code')),
      description,
      unit,
      quantity,
      unit_cost_cents: unitCostCents,
      line_total_cents: lineTotalCents,
      sort_order: sortOrder,
      notes: str(formData.get('notes')),
    })
    .returning({ id: scopeItems.id })

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
    entityType: 'scope_item',
    entityId: item!.id,
    action: 'create',
    diff: { description, unit, quantity, unit_cost_cents: unitCostCents },
  })

  revalidatePath(`/projects/${projectId}/scope`)
  return {}
}

export async function updateScopeItemCost(
  itemId: string,
  projectId: string,
  unitCostCents: number
): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  const [existing] = await db
    .select({ quantity: scopeItems.quantity })
    .from(scopeItems)
    .where(and(eq(scopeItems.id, itemId), eq(scopeItems.tenant_id, userRow.tenant_id)))

  if (!existing) return { error: 'Item not found' }

  const lineTotalCents = unitCostCents * existing.quantity

  await db
    .update(scopeItems)
    .set({ unit_cost_cents: unitCostCents, line_total_cents: lineTotalCents })
    .where(and(eq(scopeItems.id, itemId), eq(scopeItems.tenant_id, userRow.tenant_id)))

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
    entityType: 'scope_item',
    entityId: itemId,
    action: 'update',
    diff: { unit_cost_cents: unitCostCents, line_total_cents: lineTotalCents },
  })

  revalidatePath(`/projects/${projectId}/scope`)
  return {}
}

export async function deleteScopeItem(
  itemId: string,
  projectId: string
): Promise<{ error?: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  await db
    .delete(scopeItems)
    .where(and(eq(scopeItems.id, itemId), eq(scopeItems.tenant_id, userRow.tenant_id)))

  await writeAuditLog({
    tenantId: userRow.tenant_id,
    actorId: user.id,
    entityType: 'scope_item',
    entityId: itemId,
    action: 'delete',
    diff: { project_id: projectId },
  })

  revalidatePath(`/projects/${projectId}/scope`)
  return {}
}

function str(val: FormDataEntryValue | null): string | undefined {
  if (typeof val !== 'string' || !val.trim()) return undefined
  return val.trim()
}

function intPos(val: FormDataEntryValue | null): number | undefined {
  const n = parseInt(String(val ?? ''), 10)
  return isNaN(n) || n <= 0 ? undefined : n
}

function floatPos(val: FormDataEntryValue | null): number | undefined {
  const n = parseFloat(String(val ?? ''))
  return isNaN(n) || n < 0 ? undefined : n
}
