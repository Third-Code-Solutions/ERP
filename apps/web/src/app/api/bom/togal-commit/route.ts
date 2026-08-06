import { NextRequest, NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { boms, bomLineItems } from '@third-code-erp/database/schema'
import {
  lineTotal as calcLineTotal,
  computeGP,
  computeGPMargin,
} from '@third-code-erp/shared-types/bom'
import { writeAuditLog } from '@/lib/audit'
import {
  commitTogalBomThroughCoreApi,
  togalBomCommitWritesUseCoreApi,
} from '@/lib/erp-core-client'

/**
 * Togal commit endpoint (REFACTOR.md M3 / US-010 #6).
 *
 * Companion to /api/bom/togal-import. The preview endpoint returns proposed
 * lines without writing; this endpoint takes those lines (after the estimator
 * has reviewed unmapped items + confirmed the proposal) and inserts them as
 * real bom_line_items rows, recomputing the parent BOM totals in the same
 * transaction.
 *
 * Spec target: draft BOM ready for review within 30 seconds of upload.
 */

const DEFAULT_MARKUP_BPS = 3000 // 30% — matches auto-bom.ts default.

const proposedLineSchema = z.object({
  material_item_id: z.string().uuid().nullable().optional(),
  code: z.string().nullable().optional(),
  description: z.string().min(1, 'description required'),
  unit: z.string().nullable().optional(),
  // Quantity arrives as a decimal from the preview (effective_quantity is
  // fractional after wastage). The bom_line_items.quantity column is an
  // integer, so we round at write time and stash the precise value in notes.
  qty: z.number().nonnegative(),
  unit_cost_cents: z.number().int().nonnegative(),
  markup_bps: z.number().int().nonnegative().optional(),
  vendor_id: z.string().uuid().nullable().optional(),
  source_label: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
})

const commitSchema = z.object({
  bom_id: z.string().uuid(),
  proposed_lines: z.array(proposedLineSchema).min(1, 'at least one line required'),
  markup_bps: z.number().int().nonnegative().optional(),
})

export type TogalCommitRequest = z.infer<typeof commitSchema>

interface CommitResponse {
  ok: true
  lines_created: number
  bom_id: string
  total_cost_cents: number
  tcv_cents: number
  gp_cents: number
  gp_margin_bps: number
}

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

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = commitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.flatten() },
      { status: 422 }
    )
  }

  const { bom_id: bomId, proposed_lines: proposedLines } = parsed.data
  const projectMarkupBps = parsed.data.markup_bps ?? DEFAULT_MARKUP_BPS

  if (togalBomCommitWritesUseCoreApi(profile.tenantId)) {
    const idempotencyKey = req.headers.get('idempotency-key')?.trim()
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: 'Idempotency-Key header is required when Core authority is enabled' },
        { status: 400 }
      )
    }
    if (idempotencyKey.length > 256) {
      return NextResponse.json(
        { error: 'Idempotency-Key header is too long' },
        { status: 400 }
      )
    }

    const coreResult = await commitTogalBomThroughCoreApi(
      {
        bomId,
        proposedLines: proposedLines.map((line) => ({
          materialItemId: line.material_item_id,
          code: line.code,
          description: line.description,
          unit: line.unit,
          qty: line.qty,
          unitCostCents: line.unit_cost_cents,
          markupBps: line.markup_bps,
          vendorId: line.vendor_id,
          sourceLabel: line.source_label,
          notes: line.notes,
        })),
        markupBps: parsed.data.markup_bps,
      },
      idempotencyKey
    )
    if (!coreResult.ok || !coreResult.data) {
      return NextResponse.json(
        { error: coreResult.error ?? 'Togal BOM lines were not committed.' },
        { status: coreResult.status ?? 503 }
      )
    }
    return NextResponse.json({
      ok: true,
      lines_created: coreResult.data.linesCreated,
      bom_id: coreResult.data.bomId,
      total_cost_cents: coreResult.data.totalCostCents,
      tcv_cents: coreResult.data.tcvCents,
      gp_cents: coreResult.data.gpCents,
      gp_margin_bps: coreResult.data.gpMarginBps,
    })
  }

  // Verify BOM belongs to tenant and is in a writable status.
  // The schema enum is ['draft', 'approved', 'locked', 'archived'] — we treat
  // 'draft' as the US-010 "Pending Review" surface. 'approved' is allowed in
  // case an estimator is layering Togal-derived lines onto a reviewed BOM
  // pre-lock. 'locked' and 'archived' remain immutable.
  const [bom] = await db
    .select({
      id: boms.id,
      status: boms.status,
      total_cost_cents: boms.total_cost_cents,
      tcv_cents: boms.tcv_cents,
      label: boms.label,
    })
    .from(boms)
    .where(and(eq(boms.id, bomId), eq(boms.tenant_id, profile.tenantId)))
    .limit(1)

  if (!bom) {
    return NextResponse.json({ error: 'BOM not found' }, { status: 404 })
  }
  if (bom.status === 'locked' || bom.status === 'archived') {
    return NextResponse.json(
      { error: `BOM is ${bom.status}; cannot commit lines` },
      { status: 409 }
    )
  }

  // Compute totals for the new lines.
  let addedCostCents = 0
  let addedTcvCents = 0

  const linesToInsert = proposedLines.map((line, idx) => {
    const markupBps = line.markup_bps ?? projectMarkupBps
    // bom_line_items.quantity is integer; preserve the raw fractional qty in
    // notes so estimators see what Togal extracted.
    const qtyInt = Math.max(0, Math.round(line.qty))
    const total = calcLineTotal(line.unit_cost_cents, qtyInt, markupBps)
    const cost = line.unit_cost_cents * qtyInt
    addedCostCents += cost
    addedTcvCents += total

    const notesParts: string[] = []
    if (line.source_label) {
      notesParts.push(`Cost from Togal (${line.source_label})`)
    } else {
      notesParts.push('Cost from Togal import')
    }
    if (Math.abs(line.qty - qtyInt) > 1e-6) {
      notesParts.push(`raw_qty=${line.qty}`)
    }
    if (line.vendor_id) notesParts.push(`vendor:${line.vendor_id}`)
    if (line.notes) notesParts.push(line.notes)

    return {
      tenant_id: profile.tenantId,
      bom_id: bomId,
      sort_order: idx,
      is_group: 0,
      code: line.code ?? null,
      description: line.description,
      unit: line.unit ?? null,
      quantity: qtyInt,
      unit_cost_cents: line.unit_cost_cents,
      markup_bps: markupBps,
      line_total_cents: total,
      notes: notesParts.join(' · '),
    }
  })

  const newTotalCostCents = bom.total_cost_cents + addedCostCents
  const newTcvCents = bom.tcv_cents + addedTcvCents
  const newGpCents = computeGP(newTcvCents, newTotalCostCents)
  const newGpMarginBps = computeGPMargin(newGpCents, newTcvCents)

  try {
    await db.transaction(async (tx) => {
      await tx.insert(bomLineItems).values(linesToInsert)
      await tx
        .update(boms)
        .set({
          total_cost_cents: newTotalCostCents,
          tcv_cents: newTcvCents,
          gp_cents: newGpCents,
          gp_margin_bps: newGpMarginBps,
          updated_at: new Date(),
        })
        .where(and(eq(boms.id, bomId), eq(boms.tenant_id, profile.tenantId)))
    })
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : 'Failed to insert BOM lines',
      },
      { status: 500 }
    )
  }

  // Audit-log outside the txn — failures here must not roll back the commit,
  // but we still surface them via Sentry / logs at the runtime layer.
  try {
    await writeAuditLog({
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'bom',
      entityId: bomId,
      action: 'update',
      diff: {
        lines_added: linesToInsert.length,
        source: 'togal_commit',
        total_cost_cents: {
          before: bom.total_cost_cents,
          after: newTotalCostCents,
        },
        tcv_cents: { before: bom.tcv_cents, after: newTcvCents },
      },
    })
  } catch (err) {
    // Non-fatal — line items already persisted.
    console.error('[togal-commit] audit log failed:', err)
  }

  const response: CommitResponse = {
    ok: true,
    lines_created: linesToInsert.length,
    bom_id: bomId,
    total_cost_cents: newTotalCostCents,
    tcv_cents: newTcvCents,
    gp_cents: newGpCents,
    gp_margin_bps: newGpMarginBps,
  }
  return NextResponse.json(response, { status: 200 })
}
