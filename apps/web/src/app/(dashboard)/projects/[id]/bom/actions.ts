'use server'

import { revalidatePath } from 'next/cache'
import { getUser, requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  boms,
  bomLineItems,
  users,
  vendors,
  rateCards,
  materialItems,
  opportunities,
} from '@third-code-erp/database/schema'
import { eq, and, max, ilike, or, desc, isNull, gt } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'
import { inngest } from '@/lib/inngest'
import {
  lineTotal as calcLineTotal,
  bomTotalCost,
  computeGP,
  computeGPMargin,
} from '@third-code-erp/shared-types/bom'

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

  // Use the canonical math module (tested in @third-code-erp/shared-types/bom)
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
      data: {
        bomId,
        projectId,
        tenantId: userRow.tenant_id,
        actorId: user.id,
      },
    })
  } catch (err) {
    console.warn('[approveBom] inngest.send failed (approval still persisted):', err)
  }

  revalidatePath(`/projects/${projectId}/bom`)
  return {}
}

// ───────────────────────────────────────────────────────────────────────────
// US-011 — Supplier switcher + override justification (BOM Builder UX layer)
// ───────────────────────────────────────────────────────────────────────────

export interface RateCardOption {
  id: string
  vendor_id: string | null
  vendor_name: string | null
  unit_price_cents: number
  lead_time_days: number | null
  is_preferred: boolean
  effective_from: Date | null
}

export interface SupplierContext {
  // All active rate cards that look like a match for the BOM line, joined
  // to vendors. Ranking: preferred first, then by unit price asc.
  rateCards: RateCardOption[]
  // Tenant's active vendor directory for the fallback "assign manually"
  // search — capped server-side so we never ship megabyte payloads.
  vendors: { id: string; name: string }[]
}

// Reused by both client (`SupplierSwitcherPanel`) and server (audit + recalc).
// vendor_id is mirrored into `notes` as `[VENDOR:<uuid>:<name>]` because the
// current `bom_line_items` schema does NOT carry a `vendor_id` column and we
// are explicitly not modifying schemas in this change.
const VENDOR_TOKEN_RE = /\s*\[VENDOR:[0-9a-f-]+:[^\]]+\]/i

function stripVendorToken(notes: string | null | undefined): string {
  if (!notes) return ''
  return notes.replace(VENDOR_TOKEN_RE, '').trim()
}

function attachVendorToken(notes: string | null | undefined, vendor: { id: string; name: string } | null): string | null {
  const base = stripVendorToken(notes)
  if (!vendor) return base || null
  // Vendor name is constrained to 255 chars in schema and we control the
  // assignment surface — but defensive: strip `]` so the token stays well-formed.
  const safeName = vendor.name.replace(/[\]\r\n]/g, '').slice(0, 120)
  const token = `[VENDOR:${vendor.id}:${safeName}]`
  return base ? `${base} ${token}` : token
}

export async function fetchProjectForecastTcv(
  projectId: string,
): Promise<{ tcvCents: number | null }> {
  const user = await getUser()
  if (!user) return { tcvCents: null }
  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { tcvCents: null }

  // A project can be linked to multiple opportunities (legacy + Won). Pick
  // the highest TCV — if anything, that's the most aggressive forecast and
  // the right anchor for "are we over-shooting?".
  const rows = await db
    .select({ tcv_cents: opportunities.tcv_cents })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.project_id, projectId),
        eq(opportunities.tenant_id, userRow.tenant_id),
      ),
    )
    .orderBy(desc(opportunities.tcv_cents))
    .limit(1)

  return { tcvCents: rows[0]?.tcv_cents ?? null }
}

export async function fetchLineSupplierContext(
  lineItemId: string,
): Promise<{ data: SupplierContext } | { error: string }> {
  const user = await getUser()
  if (!user) return { error: 'Unauthorized' }

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return { error: 'No tenant' }

  const [line] = await db
    .select({
      id: bomLineItems.id,
      code: bomLineItems.code,
      description: bomLineItems.description,
    })
    .from(bomLineItems)
    .where(
      and(eq(bomLineItems.id, lineItemId), eq(bomLineItems.tenant_id, userRow.tenant_id)),
    )

  if (!line) return { error: 'Line item not found' }

  const now = new Date()

  // Match strategy: ILIKE on material_items.code OR description against the
  // line's free-text code/description, since `bom_line_items` has no
  // `material_item_id` FK in the current schema. We keep the predicate
  // conservative so we don't surface unrelated suppliers; the manual
  // assignment search remains the fallback.
  const codeNeedle = line.code?.trim() ?? ''
  const descNeedle = (line.description ?? '').trim().slice(0, 120)

  const matches = codeNeedle || descNeedle
    ? await db
        .select({
          id: rateCards.id,
          vendor_id: rateCards.vendor_id,
          vendor_name: vendors.name,
          unit_price_cents: rateCards.unit_price_cents,
          lead_time_days: rateCards.lead_time_days,
          is_preferred: rateCards.is_preferred,
          effective_from: rateCards.effective_from,
          effective_to: rateCards.effective_to,
        })
        .from(rateCards)
        .leftJoin(vendors, eq(rateCards.vendor_id, vendors.id))
        .leftJoin(materialItems, eq(rateCards.material_item_id, materialItems.id))
        .where(
          and(
            eq(rateCards.tenant_id, userRow.tenant_id),
            or(
              isNull(rateCards.effective_to),
              gt(rateCards.effective_to, now),
            ),
            or(
              codeNeedle ? ilike(materialItems.code, `%${codeNeedle}%`) : sql`false`,
              descNeedle ? ilike(materialItems.description, `%${descNeedle}%`) : sql`false`,
            ),
          ),
        )
        .orderBy(desc(rateCards.is_preferred), rateCards.unit_price_cents)
        .limit(25)
    : []

  // De-dup by id (in case both ILIKE branches match the same row).
  const seen = new Set<string>()
  const rateCardOptions: RateCardOption[] = []
  for (const m of matches) {
    if (seen.has(m.id)) continue
    seen.add(m.id)
    rateCardOptions.push({
      id: m.id,
      vendor_id: m.vendor_id,
      vendor_name: m.vendor_name,
      unit_price_cents: m.unit_price_cents,
      lead_time_days: m.lead_time_days,
      is_preferred: m.is_preferred,
      effective_from: m.effective_from,
    })
  }

  const tenantVendors = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(eq(vendors.tenant_id, userRow.tenant_id))
    .orderBy(vendors.name)
    .limit(200)

  return {
    data: {
      rateCards: rateCardOptions,
      vendors: tenantVendors,
    },
  }
}

export async function setLineItemVendor(
  lineItemId: string,
  projectId: string,
  vendorId: string | null,
): Promise<{ error?: string }> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.edit')) {
    return { error: `Forbidden: role "${profile.role}" lacks "bom.edit"` }
  }

  const [line] = await db
    .select({
      id: bomLineItems.id,
      bom_id: bomLineItems.bom_id,
      notes: bomLineItems.notes,
    })
    .from(bomLineItems)
    .where(
      and(eq(bomLineItems.id, lineItemId), eq(bomLineItems.tenant_id, profile.tenantId)),
    )

  if (!line) return { error: 'Line item not found' }

  let vendor: { id: string; name: string } | null = null
  if (vendorId) {
    const [v] = await db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(and(eq(vendors.id, vendorId), eq(vendors.tenant_id, profile.tenantId)))
    if (!v) return { error: 'Vendor not found or outside tenant scope' }
    vendor = v
  }

  const previousVendorMatch = (line.notes ?? '').match(/\[VENDOR:([0-9a-f-]+):([^\]]+)\]/i)
  const before = previousVendorMatch
    ? { id: previousVendorMatch[1], name: previousVendorMatch[2] }
    : null

  const newNotes = attachVendorToken(line.notes, vendor)

  await db
    .update(bomLineItems)
    .set({ notes: newNotes, updated_at: new Date() })
    .where(and(eq(bomLineItems.id, lineItemId), eq(bomLineItems.tenant_id, profile.tenantId)))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'bom_line_item',
    entityId: lineItemId,
    action: 'update',
    diff: {
      field_changed: 'vendor_id',
      before,
      after: vendor,
    },
  })

  revalidatePath(`/projects/${projectId}/bom`)
  return {}
}

export async function recordOverrideJustification(
  lineItemId: string,
  projectId: string,
  fieldChanged: string,
  reason: string,
  before: unknown,
  after: unknown,
): Promise<{ error?: string }> {
  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.edit')) {
    return { error: `Forbidden: role "${profile.role}" lacks "bom.edit"` }
  }

  const trimmed = reason.trim()
  if (!trimmed) return { error: 'Reason is required' }
  if (trimmed.length > 200) return { error: 'Reason must be 200 characters or fewer' }

  const [line] = await db
    .select({ id: bomLineItems.id })
    .from(bomLineItems)
    .where(and(eq(bomLineItems.id, lineItemId), eq(bomLineItems.tenant_id, profile.tenantId)))
  if (!line) return { error: 'Line item not found' }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'bom_line_item',
    entityId: lineItemId,
    action: 'update',
    diff: {
      field_changed: fieldChanged,
      reason: trimmed,
      before,
      after,
    },
  })

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
