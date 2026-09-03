'use server'

import { revalidatePath } from 'next/cache'
import { can, getUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { projects, scopeItems } from '@third-code-erp/database/schema'
import { and, eq, max } from 'drizzle-orm'
import { writeAuditLogInTransaction } from '@/lib/audit'
import { multiplyCents, parsePesosToCents } from '@/lib/operations/scope-money'

export async function addScopeItem(
  projectId: string,
  formData: FormData
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'project.update')) return { error: 'Forbidden' }

  const description = str(formData.get('description'))
  if (!description) return { error: 'Description is required' }

  const unit = str(formData.get('unit')) ?? 'pc'
  const quantity = intPos(formData.get('quantity')) ?? 1
  const rawUnitCost = formData.get('unit_cost')
  const unitCostCents =
    rawUnitCost === null || rawUnitCost === ''
      ? 0
      : parsePesosToCents(String(rawUnitCost))
  if (unitCostCents === undefined) return { error: 'Unit cost must be a valid non-negative peso amount' }
  const lineTotalCents = multiplyCents(unitCostCents, quantity)
  if (lineTotalCents === undefined) return { error: 'Line total exceeds supported centavo range' }

  try {
    const result = await db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.tenant_id, profile.tenantId)))
        .limit(1)
      if (!project) return { error: 'Project not found' } as const

      const [lastOrder] = await tx
        .select({ max_order: max(scopeItems.sort_order) })
        .from(scopeItems)
        .where(and(eq(scopeItems.project_id, projectId), eq(scopeItems.tenant_id, profile.tenantId)))
      const sortOrder = (lastOrder?.max_order ?? -1) + 1

      const [item] = await tx
        .insert(scopeItems)
        .values({
          tenant_id: profile.tenantId,
          project_id: projectId,
          created_by: profile.user.id,
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
      if (!item) throw new Error('Scope item insert returned no row')

      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'scope_item',
        entityId: item.id,
        action: 'create',
        diff: { description, unit, quantity, unit_cost_cents: unitCostCents },
      })
      return {} as const
    })
    if ('error' in result) return result
  } catch {
    return { error: 'Unable to add scope item' }
  }

  revalidatePath(`/projects/${projectId}/scope`)
  return {}
}

export async function updateScopeItemCost(
  itemId: string,
  projectId: string,
  unitCostCents: number
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'project.update')) return { error: 'Forbidden' }
  if (!Number.isSafeInteger(unitCostCents) || unitCostCents < 0) {
    return { error: 'Unit cost must be a non-negative centavo integer' }
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ quantity: scopeItems.quantity })
        .from(scopeItems)
        .where(and(eq(scopeItems.id, itemId), eq(scopeItems.project_id, projectId), eq(scopeItems.tenant_id, profile.tenantId)))
      if (!existing) return { error: 'Item not found' } as const

      const lineTotalCents = multiplyCents(unitCostCents, existing.quantity)
      if (lineTotalCents === undefined) return { error: 'Line total exceeds supported centavo range' } as const

      await tx.update(scopeItems).set({ unit_cost_cents: unitCostCents, line_total_cents: lineTotalCents }).where(
        and(eq(scopeItems.id, itemId), eq(scopeItems.project_id, projectId), eq(scopeItems.tenant_id, profile.tenantId))
      )
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'scope_item',
        entityId: itemId,
        action: 'update',
        diff: { unit_cost_cents: unitCostCents, line_total_cents: lineTotalCents },
      })
      return {} as const
    })
    if ('error' in result) return result
  } catch {
    return { error: 'Unable to update scope item' }
  }

  revalidatePath(`/projects/${projectId}/scope`)
  return {}
}

export async function deleteScopeItem(
  itemId: string,
  projectId: string
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'project.update')) return { error: 'Forbidden' }

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: scopeItems.id })
        .from(scopeItems)
        .where(and(eq(scopeItems.id, itemId), eq(scopeItems.project_id, projectId), eq(scopeItems.tenant_id, profile.tenantId)))
        .limit(1)
      if (!existing) return { error: 'Item not found' } as const

      await tx.delete(scopeItems).where(
        and(eq(scopeItems.id, itemId), eq(scopeItems.project_id, projectId), eq(scopeItems.tenant_id, profile.tenantId))
      )
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'scope_item',
        entityId: itemId,
        action: 'delete',
        diff: { project_id: projectId },
      })
      return {} as const
    })
    if ('error' in result) return result
  } catch {
    return { error: 'Unable to delete scope item' }
  }

  revalidatePath(`/projects/${projectId}/scope`)
  return {}
}

function str(val: FormDataEntryValue | null): string | undefined {
  if (typeof val !== 'string' || !val.trim()) return undefined
  return val.trim()
}

function intPos(val: FormDataEntryValue | null): number | undefined {
  const raw = String(val ?? '').trim()
  if (!/^\d+$/.test(raw)) return undefined
  const n = Number(raw)
  return Number.isSafeInteger(n) && n > 0 ? n : undefined
}
