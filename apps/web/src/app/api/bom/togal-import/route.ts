import { NextRequest, NextResponse } from 'next/server'
import { and, eq, lte, or, gte, isNull, desc, inArray } from 'drizzle-orm'
import { requireUserProfile, can } from '@buildops/auth'
import { db } from '@buildops/database'
import {
  boms,
  materialItems,
  rateCards,
  mappingConfig,
} from '@buildops/database/schema'
import { parseTogalFile, type TogalRow } from '@/lib/abi/integrations/togal'

/**
 * Togal import preview (REFACTOR.md M3 / US-010).
 *
 * Accepts multipart/form-data with `file` (CSV/XLSX) + `bom_id`.
 * Returns a preview of proposed BOM lines — *no* DB writes occur in v1.
 * The caller (BOM builder UI) can review unmapped rows and confirm.
 */

interface ProposedLine {
  source_label: string
  material_item_id: string | null
  code: string | null
  description: string
  unit: string
  quantity: number
  wastage_bps: number
  effective_quantity: number
  unit_price_cents: number
  vendor_id: string | null
  line_total_cents: number
  level?: string
  room?: string
  notes?: string
}

interface ImportPreviewResponse {
  row_count: number
  mapped_count: number
  unmapped_items: string[]
  missing_columns?: string[]
  proposed_lines: ProposedLine[]
}

const MAX_FILE_BYTES = 25 * 1024 * 1024 // 25MB

export async function POST(req: NextRequest): Promise<NextResponse> {
  let profile
  try {
    profile = await requireUserProfile()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!can(profile.role, 'bom.generate')) {
    return NextResponse.json(
      { error: `Forbidden: role "${profile.role}" lacks "bom.generate"` },
      { status: 403 }
    )
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json(
      { error: 'Expected multipart/form-data body' },
      { status: 400 }
    )
  }

  const file = form.get('file')
  const bomId = form.get('bom_id')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (typeof bomId !== 'string' || bomId.length === 0) {
    return NextResponse.json({ error: 'bom_id is required' }, { status: 400 })
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json(
      { error: `file too large (max ${MAX_FILE_BYTES} bytes)` },
      { status: 413 }
    )
  }

  // Verify BOM belongs to tenant.
  const [bom] = await db
    .select({ id: boms.id, status: boms.status })
    .from(boms)
    .where(and(eq(boms.id, bomId), eq(boms.tenant_id, profile.tenantId)))
    .limit(1)
  if (!bom) return NextResponse.json({ error: 'BOM not found' }, { status: 404 })
  if (bom.status === 'locked' || bom.status === 'archived') {
    return NextResponse.json(
      { error: `BOM is ${bom.status}; cannot import` },
      { status: 409 }
    )
  }

  let parsed
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    parsed = await parseTogalFile(buffer, file.name)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Parse failed' },
      { status: 422 }
    )
  }

  if (parsed.missing_columns.length > 0) {
    const response: ImportPreviewResponse = {
      row_count: 0,
      mapped_count: 0,
      unmapped_items: [],
      missing_columns: parsed.missing_columns,
      proposed_lines: [],
    }
    return NextResponse.json(response, { status: 200 })
  }

  // Build mapping lookup: source_label (lowercased) → material_item_id.
  const mappings = await db
    .select({
      source_label: mappingConfig.source_label,
      material_item_id: mappingConfig.material_item_id,
    })
    .from(mappingConfig)
    .where(eq(mappingConfig.tenant_id, profile.tenantId))

  const mappingByLabel = new Map<string, string>()
  for (const m of mappings) {
    mappingByLabel.set(m.source_label.toLowerCase().trim(), m.material_item_id)
  }

  // Collect the material item IDs we need.
  const matchedItemIds = new Set<string>()
  for (const row of parsed.rows) {
    const mid = mappingByLabel.get(row.element_type.toLowerCase().trim())
    if (mid) matchedItemIds.add(mid)
  }

  // Fetch matched material items + preferred rate cards in two queries.
  const items =
    matchedItemIds.size === 0
      ? []
      : await db
          .select({
            id: materialItems.id,
            code: materialItems.code,
            description: materialItems.description,
            unit: materialItems.unit,
            wastage_bps: materialItems.wastage_bps,
          })
          .from(materialItems)
          .where(
            and(
              eq(materialItems.tenant_id, profile.tenantId),
              inArray(materialItems.id, Array.from(matchedItemIds))
            )
          )

  const itemById = new Map(items.map((i) => [i.id, i]))

  const now = new Date()
  const rateRows =
    matchedItemIds.size === 0
      ? []
      : await db
          .select({
            id: rateCards.id,
            material_item_id: rateCards.material_item_id,
            vendor_id: rateCards.vendor_id,
            unit_price_cents: rateCards.unit_price_cents,
            is_preferred: rateCards.is_preferred,
            effective_from: rateCards.effective_from,
            effective_to: rateCards.effective_to,
          })
          .from(rateCards)
          .where(
            and(
              eq(rateCards.tenant_id, profile.tenantId),
              inArray(rateCards.material_item_id, Array.from(matchedItemIds)),
              lte(rateCards.effective_from, now),
              or(isNull(rateCards.effective_to), gte(rateCards.effective_to, now))
            )
          )
          .orderBy(
            desc(rateCards.is_preferred),
            desc(rateCards.effective_from)
          )

  // Pick best rate per material: preferred first, then most-recently-effective.
  const rateByItem = new Map<
    string,
    { unit_price_cents: number; vendor_id: string | null }
  >()
  for (const r of rateRows) {
    if (rateByItem.has(r.material_item_id)) continue
    rateByItem.set(r.material_item_id, {
      unit_price_cents: r.unit_price_cents,
      vendor_id: r.vendor_id,
    })
  }

  const proposed: ProposedLine[] = []
  const unmapped = new Set<string>()
  let mappedCount = 0

  for (const row of parsed.rows as TogalRow[]) {
    const key = row.element_type.toLowerCase().trim()
    const materialId = mappingByLabel.get(key)
    if (!materialId) {
      unmapped.add(row.element_type)
      proposed.push({
        source_label: row.element_type,
        material_item_id: null,
        code: null,
        description: row.element_type,
        unit: row.unit,
        quantity: row.quantity,
        wastage_bps: 0,
        effective_quantity: row.quantity,
        unit_price_cents: 0,
        vendor_id: null,
        line_total_cents: 0,
        level: row.level,
        room: row.room,
        notes: row.notes,
      })
      continue
    }

    const item = itemById.get(materialId)
    const rate = rateByItem.get(materialId)
    const wastageBps = item?.wastage_bps ?? 0
    const effectiveQty = row.quantity * (1 + wastageBps / 10000)
    const unitPrice = rate?.unit_price_cents ?? 0
    const lineTotal = Math.round(effectiveQty * unitPrice)

    proposed.push({
      source_label: row.element_type,
      material_item_id: materialId,
      code: item?.code ?? null,
      description: item?.description ?? row.element_type,
      unit: item?.unit ?? row.unit,
      quantity: row.quantity,
      wastage_bps: wastageBps,
      effective_quantity: Number(effectiveQty.toFixed(4)),
      unit_price_cents: unitPrice,
      vendor_id: rate?.vendor_id ?? null,
      line_total_cents: lineTotal,
      level: row.level,
      room: row.room,
      notes: row.notes,
    })
    mappedCount += 1
  }

  const response: ImportPreviewResponse = {
    row_count: parsed.row_count,
    mapped_count: mappedCount,
    unmapped_items: Array.from(unmapped),
    proposed_lines: proposed,
  }
  return NextResponse.json(response, { status: 200 })
}
