'use server'

import { revalidatePath } from 'next/cache'
import { getUserProfile, requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  boms,
  bomLineItems,
  bomLineItemGrainReviews,
  bomLineItemLocationReviews,
  projectLocations,
  projects,
  vendors,
  dupas,
  dupaMaterialLines,
  priceHistory,
  opportunities,
  takeoffUnresolvedItems,
} from '@third-code-erp/database/schema'
import { eq, and, max, or, desc, asc, isNotNull, inArray } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { writeAuditLog } from '@/lib/audit'
import { inngest } from '@/lib/inngest'
import { selectCanonicalSupplierOptions } from '@/lib/operations/bom-supplier-matching'
import {
  bomGrainReviewResolutionSchema,
  bomLocationReviewResolutionSchema,
  bomLineLocationUpdateSchema,
  classifyBomLineKind,
  projectLocationCreateSchema,
  type BomLineItemKind,
} from '@third-code-erp/shared-types/bom'
import {
  manualLineTotal,
  bomTotalCost,
  computeGP,
  computeGPMargin,
} from '@third-code-erp/shared-types/bom'

export async function createBom(projectId: string): Promise<{ id: string } | { error: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.edit')) {
    return { error: `Forbidden: role "${profile.role}" lacks "bom.edit"` }
  }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, profile.tenantId)))
  if (!project) return { error: 'Project not found' }

  const [existing] = await db
    .select({ version: max(boms.version) })
    .from(boms)
    .where(and(eq(boms.project_id, projectId), eq(boms.tenant_id, profile.tenantId)))

  const nextVersion = (existing?.version ?? 0) + 1

  const inserted = await db
    .insert(boms)
    .values({
      tenant_id: profile.tenantId,
      project_id: projectId,
      created_by: profile.user.id,
      version: nextVersion,
      status: 'draft',
    })
    .returning({ id: boms.id })

  const bomId = inserted[0]!.id

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
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
    code?: string
    notes?: string
    locationId?: string | null
  }
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.edit')) {
    return { error: `Forbidden: role "${profile.role}" lacks "bom.edit"` }
  }

  const [bom] = await db
    .select({ id: boms.id })
    .from(boms)
    .where(
      and(
        eq(boms.id, bomId),
        eq(boms.project_id, projectId),
        eq(boms.tenant_id, profile.tenantId),
      ),
    )
  if (!bom) return { error: 'BOM not found' }

  if (data.locationId) {
    const [location] = await db
      .select({ id: projectLocations.id })
      .from(projectLocations)
      .where(
        and(
          eq(projectLocations.id, data.locationId),
          eq(projectLocations.project_id, projectId),
          eq(projectLocations.tenant_id, profile.tenantId),
        ),
      )
    if (!location) return { error: 'Location not found in this project' }
  }

  // Use the canonical math module (tested in @third-code-erp/shared-types/bom)
  // Flat line-level markup is retired. Manual lines are explicit cost inputs;
  // client value comes from a DUPA once one is attached to the work item.
  const line_total_cents = manualLineTotal(data.unit_cost_cents, data.quantity)

  const [existing] = await db
    .select({ max_sort: max(bomLineItems.sort_order) })
    .from(bomLineItems)
    .where(
      and(
        eq(bomLineItems.bom_id, bomId),
        eq(bomLineItems.tenant_id, profile.tenantId),
      ),
    )

  const sort_order = (existing?.max_sort ?? -1) + 1
  const classification = classifyBomLineKind(data.unit)

  const createdLineItemId = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(bomLineItems)
      .values({
        tenant_id: profile.tenantId,
        bom_id: bomId,
        sort_order,
        description: data.description,
        unit: data.unit,
        quantity: data.quantity,
        unit_cost_cents: data.unit_cost_cents,
        markup_bps: 0,
        line_total_cents,
        code: data.code ?? null,
        notes: data.notes ?? null,
        location_id: data.locationId ?? null,
        description_original: data.description,
        kind: classification.kind ?? 'work_item',
        unit_rate_source: 'manual',
        classification_status: classification.status,
        classification_reason: classification.reason,
      })
      .returning({ id: bomLineItems.id })

    const lineItemId = inserted[0]?.id ?? null
    if (classification.status === 'review' && lineItemId) {
      await tx.insert(bomLineItemGrainReviews).values({
        tenant_id: profile.tenantId,
        bom_id: bomId,
        bom_line_item_id: lineItemId,
        proposed_kind: classification.kind,
        reason: classification.reason ?? 'Explicit grain review required.',
        created_by: profile.user.id,
        updated_by: profile.user.id,
      })
    }
    if (!data.locationId && lineItemId) {
      await tx.insert(bomLineItemLocationReviews).values({
        tenant_id: profile.tenantId,
        project_id: projectId,
        bom_id: bomId,
        bom_line_item_id: lineItemId,
        description_original: data.description,
        reason: 'No project location is assigned. Choose a project location before approval.',
        created_by: profile.user.id,
        updated_by: profile.user.id,
      })
    }
    return lineItemId
  })

  if (!createdLineItemId) return { error: 'Line item was created without an id' }

  await recalcBomTotals(bomId, profile.tenantId)

  revalidatePath(`/projects/${projectId}/bom`)
  return {}
}

export async function deleteBomLineItem(
  itemId: string,
  bomId: string,
  projectId: string
): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.edit')) {
    return { error: `Forbidden: role "${profile.role}" lacks "bom.edit"` }
  }

  const [line] = await db
    .select({ id: bomLineItems.id })
    .from(bomLineItems)
    .where(
      and(
        eq(bomLineItems.id, itemId),
        eq(bomLineItems.bom_id, bomId),
        eq(bomLineItems.tenant_id, profile.tenantId),
      ),
    )
  if (!line) return { error: 'Line item not found' }

  await db
    .delete(bomLineItems)
    .where(
      and(
        eq(bomLineItems.id, itemId),
        eq(bomLineItems.bom_id, bomId),
        eq(bomLineItems.tenant_id, profile.tenantId),
      ),
    )

  await recalcBomTotals(bomId, profile.tenantId)
  revalidatePath(`/projects/${projectId}/bom`)
  return {}
}

export async function approveBom(bomId: string, projectId: string): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.approve_internal')) {
    return { error: `Forbidden: role "${profile.role}" lacks "bom.approve_internal"` }
  }

  const [bom] = await db
    .select({ id: boms.id })
    .from(boms)
    .where(
      and(
        eq(boms.id, bomId),
        eq(boms.project_id, projectId),
        eq(boms.tenant_id, profile.tenantId),
      ),
  )
  if (!bom) return { error: 'BOM not found' }

  const [pendingTakeoff] = await db
    .select({ id: takeoffUnresolvedItems.id, reason: takeoffUnresolvedItems.reason })
    .from(takeoffUnresolvedItems)
    .where(
      and(
        eq(takeoffUnresolvedItems.tenant_id, profile.tenantId),
        eq(takeoffUnresolvedItems.bom_id, bomId),
        eq(takeoffUnresolvedItems.status, 'pending'),
      ),
    )
    .limit(1)
  if (pendingTakeoff) {
    return { error: `Resolve every unresolved takeoff row before approval: ${pendingTakeoff.reason}` }
  }

  const [unresolvedLine] = await db
    .select({ id: bomLineItems.id })
    .from(bomLineItems)
    .where(
      and(
        eq(bomLineItems.bom_id, bomId),
        eq(bomLineItems.tenant_id, profile.tenantId),
        eq(bomLineItems.classification_status, 'review'),
      ),
    )
    .limit(1)
  if (unresolvedLine) {
    return { error: 'Resolve every BOM grain review before approval' }
  }

  const [pendingReview] = await db
    .select({ id: bomLineItemGrainReviews.id })
    .from(bomLineItemGrainReviews)
    .innerJoin(
      bomLineItems,
      and(
        eq(bomLineItemGrainReviews.bom_line_item_id, bomLineItems.id),
        eq(bomLineItemGrainReviews.tenant_id, bomLineItems.tenant_id),
      ),
    )
    .where(
      and(
        eq(bomLineItemGrainReviews.tenant_id, profile.tenantId),
        eq(bomLineItemGrainReviews.status, 'pending'),
        eq(bomLineItems.bom_id, bomId),
        eq(bomLineItems.tenant_id, profile.tenantId),
      ),
    )
    .limit(1)
  if (pendingReview) {
    return { error: 'Resolve every BOM grain review before approval' }
  }

  const [pendingLocationReview] = await db
    .select({ id: bomLineItemLocationReviews.id })
    .from(bomLineItemLocationReviews)
    .innerJoin(
      bomLineItems,
      and(
        eq(bomLineItemLocationReviews.bom_line_item_id, bomLineItems.id),
        eq(bomLineItemLocationReviews.tenant_id, bomLineItems.tenant_id),
      ),
    )
    .where(
      and(
        eq(bomLineItemLocationReviews.tenant_id, profile.tenantId),
        eq(bomLineItemLocationReviews.status, 'pending'),
        eq(bomLineItems.bom_id, bomId),
        eq(bomLineItems.tenant_id, profile.tenantId),
      ),
    )
    .limit(1)
  if (pendingLocationReview) {
    return { error: 'Resolve every BOM location review before approval' }
  }

  // Recalc on approval to ensure totals are fresh and reconcile any drift
  await recalcBomTotals(bomId, profile.tenantId)

  await db
    .update(boms)
    .set({ status: 'approved', approved_by: profile.user.id, approved_at: new Date() })
    .where(and(eq(boms.id, bomId), eq(boms.tenant_id, profile.tenantId)))

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
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
        tenantId: profile.tenantId,
        actorId: profile.user.id,
      },
    })
  } catch (err) {
    console.warn('[approveBom] inngest.send failed (approval still persisted):', err)
  }

  revalidatePath(`/projects/${projectId}/bom`)
  return {}
}

export interface PendingBomGrainReview {
  reviewId: string
  lineItemId: string
  description: string
  unit: string | null
  proposedKind: BomLineItemKind | null
  reason: string
}

export async function listPendingBomGrainReviews(
  projectId: string,
  bomId: string | null,
): Promise<PendingBomGrainReview[]> {
  const profile = await getUserProfile()
  if (!profile || !bomId) return []

  const rows = await db
    .select({
      reviewId: bomLineItemGrainReviews.id,
      lineItemId: bomLineItems.id,
      description: bomLineItems.description,
      unit: bomLineItems.unit,
      proposedKind: bomLineItemGrainReviews.proposed_kind,
      reason: bomLineItemGrainReviews.reason,
    })
    .from(bomLineItemGrainReviews)
    .innerJoin(
      bomLineItems,
      and(
        eq(bomLineItemGrainReviews.bom_line_item_id, bomLineItems.id),
        eq(bomLineItemGrainReviews.tenant_id, bomLineItems.tenant_id),
      ),
    )
    .innerJoin(
      boms,
      and(
        eq(bomLineItems.bom_id, boms.id),
        eq(bomLineItems.tenant_id, boms.tenant_id),
      ),
    )
    .where(
      and(
        eq(bomLineItemGrainReviews.tenant_id, profile.tenantId),
        eq(bomLineItemGrainReviews.status, 'pending'),
        eq(boms.project_id, projectId),
        eq(boms.id, bomId),
        eq(boms.tenant_id, profile.tenantId),
      ),
    )
    .orderBy(asc(bomLineItems.sort_order), asc(bomLineItemGrainReviews.created_at))

  return rows.map((row) => ({
    ...row,
    proposedKind:
      row.proposedKind === 'work_item' || row.proposedKind === 'material_line'
        ? row.proposedKind
        : null,
  }))
}

export async function resolveBomGrainReview(input: unknown): Promise<{ error?: string }> {
  const parsed = bomGrainReviewResolutionSchema.safeParse(input)
  if (!parsed.success) return { error: 'Invalid grain review input' }

  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.edit')) {
    return { error: `Forbidden: role "${profile.role}" lacks "bom.edit"` }
  }

  const [review] = await db
    .select({
      reviewId: bomLineItemGrainReviews.id,
      lineItemId: bomLineItems.id,
      bomId: bomLineItems.bom_id,
      projectId: boms.project_id,
    })
    .from(bomLineItemGrainReviews)
    .innerJoin(
      bomLineItems,
      and(
        eq(bomLineItemGrainReviews.bom_line_item_id, bomLineItems.id),
        eq(bomLineItemGrainReviews.tenant_id, bomLineItems.tenant_id),
      ),
    )
    .innerJoin(
      boms,
      and(
        eq(bomLineItems.bom_id, boms.id),
        eq(bomLineItems.tenant_id, boms.tenant_id),
      ),
    )
    .where(
      and(
        eq(bomLineItemGrainReviews.id, parsed.data.reviewId),
        eq(bomLineItemGrainReviews.tenant_id, profile.tenantId),
        eq(bomLineItemGrainReviews.status, 'pending'),
        eq(boms.project_id, parsed.data.projectId),
        eq(boms.tenant_id, profile.tenantId),
      ),
    )

  if (!review) return { error: 'Pending grain review not found' }
  if (review.projectId !== parsed.data.projectId) return { error: 'Project scope mismatch' }

  if (parsed.data.kind === 'work_item' && parsed.data.parentLineItemId !== null) {
    return { error: 'A work item cannot receive a material parent' }
  }

  if (parsed.data.kind === 'material_line' && parsed.data.parentLineItemId === null) {
    return { error: 'Select the parent work item before confirming a material line' }
  }

  if (parsed.data.parentLineItemId === review.lineItemId) {
    return { error: 'A line item cannot be its own parent' }
  }

  if (parsed.data.parentLineItemId) {
    const [parent] = await db
      .select({ id: bomLineItems.id })
      .from(bomLineItems)
      .where(
        and(
          eq(bomLineItems.id, parsed.data.parentLineItemId),
          eq(bomLineItems.bom_id, review.bomId),
          eq(bomLineItems.tenant_id, profile.tenantId),
          eq(bomLineItems.kind, 'work_item'),
          eq(bomLineItems.classification_status, 'classified'),
        ),
      )

    if (!parent) return { error: 'Parent must be a classified work item in this BOM' }
  }

  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(bomLineItems)
      .set({
        kind: parsed.data.kind,
        parent_line_item_id: parsed.data.parentLineItemId,
        classification_status: 'classified',
        classification_reason: null,
        updated_at: now,
      })
      .where(
        and(
          eq(bomLineItems.id, review.lineItemId),
          eq(bomLineItems.tenant_id, profile.tenantId),
        ),
      )

    await tx
      .update(bomLineItemGrainReviews)
      .set({
        status: 'resolved',
        resolved_kind: parsed.data.kind,
        resolved_parent_line_item_id: parsed.data.parentLineItemId,
        resolved_by: profile.user.id,
        updated_by: profile.user.id,
        resolved_at: now,
        updated_at: now,
      })
      .where(
        and(
          eq(bomLineItemGrainReviews.id, review.reviewId),
          eq(bomLineItemGrainReviews.tenant_id, profile.tenantId),
          eq(bomLineItemGrainReviews.status, 'pending'),
        ),
      )
  })

  revalidatePath(`/projects/${parsed.data.projectId}/bom`)
  return {}
}

// ───────────────────────────────────────────────────────────────────────────
// US-011 — Supplier switcher + override justification (BOM Builder UX layer)
// ───────────────────────────────────────────────────────────────────────────

export interface ProjectLocationOption {
  id: string
  name: string
  level: string | null
}

export interface PendingBomLocationReview {
  reviewId: string
  lineItemId: string
  description: string
  descriptionOriginal: string
  reason: string
}

export interface BomLocationRollupRow {
  locationId: string
  locationName: string
  description: string
  unit: string | null
  quantity: number
}

export async function listProjectLocations(projectId: string): Promise<ProjectLocationOption[]> {
  const profile = await getUserProfile()
  if (!profile) return []

  return db
    .select({
      id: projectLocations.id,
      name: projectLocations.name,
      level: projectLocations.level,
    })
    .from(projectLocations)
    .where(
      and(
        eq(projectLocations.project_id, projectId),
        eq(projectLocations.tenant_id, profile.tenantId),
      ),
    )
    .orderBy(asc(projectLocations.sort_order), asc(projectLocations.name))
}

export async function listPendingBomLocationReviews(
  projectId: string,
  bomId: string | null,
): Promise<PendingBomLocationReview[]> {
  const profile = await getUserProfile()
  if (!profile || !bomId) return []

  return db
    .select({
      reviewId: bomLineItemLocationReviews.id,
      lineItemId: bomLineItems.id,
      description: bomLineItems.description,
      descriptionOriginal: bomLineItemLocationReviews.description_original,
      reason: bomLineItemLocationReviews.reason,
    })
    .from(bomLineItemLocationReviews)
    .innerJoin(
      bomLineItems,
      and(
        eq(bomLineItemLocationReviews.bom_line_item_id, bomLineItems.id),
        eq(bomLineItemLocationReviews.tenant_id, bomLineItems.tenant_id),
      ),
    )
    .innerJoin(
      boms,
      and(
        eq(bomLineItems.bom_id, boms.id),
        eq(bomLineItems.tenant_id, boms.tenant_id),
      ),
    )
    .where(
      and(
        eq(bomLineItemLocationReviews.tenant_id, profile.tenantId),
        eq(bomLineItemLocationReviews.status, 'pending'),
        eq(boms.project_id, projectId),
        eq(boms.id, bomId),
        eq(boms.tenant_id, profile.tenantId),
      ),
    )
    .orderBy(asc(bomLineItems.sort_order), asc(bomLineItemLocationReviews.created_at))
}

export async function listBomLocationRollup(
  projectId: string,
  bomId: string | null,
): Promise<BomLocationRollupRow[]> {
  const profile = await getUserProfile()
  if (!profile || !bomId) return []

  return db
    .select({
      locationId: projectLocations.id,
      locationName: projectLocations.name,
      description: bomLineItems.description,
      unit: bomLineItems.unit,
      quantity: sql<number>`sum(${bomLineItems.quantity})::int`,
    })
    .from(bomLineItems)
    .innerJoin(
      boms,
      and(
        eq(bomLineItems.bom_id, boms.id),
        eq(bomLineItems.tenant_id, boms.tenant_id),
      ),
    )
    .innerJoin(
      projectLocations,
      and(
        eq(bomLineItems.location_id, projectLocations.id),
        eq(bomLineItems.tenant_id, projectLocations.tenant_id),
      ),
    )
    .where(
      and(
        eq(bomLineItems.tenant_id, profile.tenantId),
        eq(boms.project_id, projectId),
        eq(boms.id, bomId),
        isNotNull(bomLineItems.location_id),
      ),
    )
    .groupBy(
      projectLocations.id,
      projectLocations.name,
      bomLineItems.description,
      bomLineItems.unit,
    )
    .orderBy(asc(projectLocations.name), asc(bomLineItems.description))
}

export async function createProjectLocation(
  projectId: string,
  input: unknown,
): Promise<{ id: string } | { error: string }> {
  const candidate =
    typeof input === 'object' && input !== null ? { ...input, projectId } : { projectId }
  const parsed = projectLocationCreateSchema.safeParse(candidate)
  if (!parsed.success) return { error: 'Location name is required' }

  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.edit')) {
    return { error: 'Forbidden: role "' + profile.role + '" lacks "bom.edit"' }
  }

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, profile.tenantId)))
  if (!project) return { error: 'Project not found' }

  const existing = await db
    .select({ id: projectLocations.id })
    .from(projectLocations)
    .where(
      and(
        eq(projectLocations.tenant_id, profile.tenantId),
        eq(projectLocations.project_id, projectId),
        eq(projectLocations.name, parsed.data.name),
      ),
    )
    .limit(1)
  if (existing[0]) return { id: existing[0].id }

  const [location] = await db
    .insert(projectLocations)
    .values({
      tenant_id: profile.tenantId,
      project_id: projectId,
      name: parsed.data.name,
      level: 'room',
      created_by: profile.user.id,
      updated_by: profile.user.id,
    })
    .returning({ id: projectLocations.id })
  if (!location) return { error: 'Location was not created' }

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'project_location',
    entityId: location.id,
    action: 'create',
    diff: { projectId, name: parsed.data.name, level: 'room' },
  })

  revalidatePath('/projects/' + projectId + '/bom')
  return { id: location.id }
}

export async function resolveBomLocationReview(input: unknown): Promise<{ error?: string }> {
  const parsed = bomLocationReviewResolutionSchema.safeParse(input)
  if (!parsed.success) return { error: 'Select a valid project location' }

  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.edit')) {
    return { error: 'Forbidden: role "' + profile.role + '" lacks "bom.edit"' }
  }

  const [review] = await db
    .select({
      reviewId: bomLineItemLocationReviews.id,
      lineItemId: bomLineItems.id,
      bomId: bomLineItems.bom_id,
      projectId: boms.project_id,
      descriptionOriginal: bomLineItemLocationReviews.description_original,
    })
    .from(bomLineItemLocationReviews)
    .innerJoin(
      bomLineItems,
      and(
        eq(bomLineItemLocationReviews.bom_line_item_id, bomLineItems.id),
        eq(bomLineItemLocationReviews.tenant_id, bomLineItems.tenant_id),
      ),
    )
    .innerJoin(
      boms,
      and(
        eq(bomLineItems.bom_id, boms.id),
        eq(bomLineItems.tenant_id, boms.tenant_id),
      ),
    )
    .where(
      and(
        eq(bomLineItemLocationReviews.id, parsed.data.reviewId),
        eq(bomLineItemLocationReviews.tenant_id, profile.tenantId),
        eq(bomLineItemLocationReviews.status, 'pending'),
        eq(boms.project_id, parsed.data.projectId),
        eq(boms.tenant_id, profile.tenantId),
      ),
    )
  if (!review) return { error: 'Pending location review not found' }

  const [location] = await db
    .select({ id: projectLocations.id, name: projectLocations.name })
    .from(projectLocations)
    .where(
      and(
        eq(projectLocations.id, parsed.data.locationId),
        eq(projectLocations.project_id, parsed.data.projectId),
        eq(projectLocations.tenant_id, profile.tenantId),
      ),
    )
  if (!location) return { error: 'Location not found in this project' }

  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(bomLineItems)
      .set({ location_id: location.id, updated_at: now })
      .where(
        and(
          eq(bomLineItems.id, review.lineItemId),
          eq(bomLineItems.bom_id, review.bomId),
          eq(bomLineItems.tenant_id, profile.tenantId),
        ),
      )

    await tx
      .update(bomLineItemLocationReviews)
      .set({
        status: 'resolved',
        resolved_location_id: location.id,
        resolved_by: profile.user.id,
        updated_by: profile.user.id,
        resolved_at: now,
        updated_at: now,
      })
      .where(
        and(
          eq(bomLineItemLocationReviews.id, review.reviewId),
          eq(bomLineItemLocationReviews.tenant_id, profile.tenantId),
          eq(bomLineItemLocationReviews.status, 'pending'),
        ),
      )
  })

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'bom_line_item',
    entityId: review.lineItemId,
    action: 'update',
    diff: {
      field_changed: 'location_id',
      before: null,
      after: { id: location.id, name: location.name },
      description_original: review.descriptionOriginal,
    },
  })

  revalidatePath('/projects/' + parsed.data.projectId + '/bom')
  return {}
}

export async function setBomLineLocation(input: unknown): Promise<{ error?: string }> {
  const parsed = bomLineLocationUpdateSchema.safeParse(input)
  if (!parsed.success) return { error: 'Select a valid project location' }

  const profile = await requireUserProfile().catch(() => null)
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.edit')) {
    return { error: 'Forbidden: role "' + profile.role + '" lacks "bom.edit"' }
  }

  const [line] = await db
    .select({
      id: bomLineItems.id,
      currentLocationId: bomLineItems.location_id,
      bomId: bomLineItems.bom_id,
      projectId: boms.project_id,
      description: bomLineItems.description,
      descriptionOriginal: bomLineItems.description_original,
    })
    .from(bomLineItems)
    .innerJoin(
      boms,
      and(
        eq(bomLineItems.bom_id, boms.id),
        eq(bomLineItems.tenant_id, boms.tenant_id),
      ),
    )
    .where(
      and(
        eq(bomLineItems.id, parsed.data.lineItemId),
        eq(bomLineItems.tenant_id, profile.tenantId),
        eq(boms.project_id, parsed.data.projectId),
      ),
    )
  if (!line) return { error: 'Line item not found' }

  if (parsed.data.locationId) {
    const [location] = await db
      .select({ id: projectLocations.id })
      .from(projectLocations)
      .where(
        and(
          eq(projectLocations.id, parsed.data.locationId),
          eq(projectLocations.project_id, parsed.data.projectId),
          eq(projectLocations.tenant_id, profile.tenantId),
        ),
      )
    if (!location) return { error: 'Location not found in this project' }
  }

  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(bomLineItems)
      .set({ location_id: parsed.data.locationId, updated_at: now })
      .where(
        and(
          eq(bomLineItems.id, parsed.data.lineItemId),
          eq(bomLineItems.tenant_id, profile.tenantId),
        ),
      )

    const [review] = await tx
      .select({
        id: bomLineItemLocationReviews.id,
        status: bomLineItemLocationReviews.status,
      })
      .from(bomLineItemLocationReviews)
      .where(
        and(
          eq(bomLineItemLocationReviews.tenant_id, profile.tenantId),
          eq(bomLineItemLocationReviews.project_id, line.projectId),
          eq(bomLineItemLocationReviews.bom_id, line.bomId),
          eq(bomLineItemLocationReviews.bom_line_item_id, line.id),
        ),
      )
      .orderBy(desc(bomLineItemLocationReviews.created_at))
      .limit(1)

    if (parsed.data.locationId) {
      if (review) {
        await tx
          .update(bomLineItemLocationReviews)
          .set({
            status: 'resolved',
            resolved_location_id: parsed.data.locationId,
            resolved_by: profile.user.id,
            resolved_at: now,
            updated_by: profile.user.id,
            updated_at: now,
          })
          .where(
            and(
              eq(bomLineItemLocationReviews.id, review.id),
              eq(bomLineItemLocationReviews.tenant_id, profile.tenantId),
            ),
          )
      }
      return
    }

    if (review) {
      await tx
        .update(bomLineItemLocationReviews)
        .set({
          status: 'pending',
          resolved_location_id: null,
          resolved_by: null,
          resolved_at: null,
          updated_by: profile.user.id,
          updated_at: now,
        })
        .where(
          and(
            eq(bomLineItemLocationReviews.id, review.id),
            eq(bomLineItemLocationReviews.tenant_id, profile.tenantId),
          ),
        )
      return
    }

    await tx.insert(bomLineItemLocationReviews).values({
      tenant_id: profile.tenantId,
      project_id: line.projectId,
      bom_id: line.bomId,
      bom_line_item_id: line.id,
      description_original: line.descriptionOriginal ?? line.description,
      reason: 'No project location is assigned. Choose a project location before approval.',
      created_by: profile.user.id,
      updated_by: profile.user.id,
    })
  })

  await writeAuditLog({
    tenantId: profile.tenantId,
    actorId: profile.user.id,
    entityType: 'bom_line_item',
    entityId: parsed.data.lineItemId,
    action: 'update',
    diff: {
      field_changed: 'location_id',
      before: line.currentLocationId,
      after: parsed.data.locationId,
    },
  })

  revalidatePath('/projects/' + parsed.data.projectId + '/bom')
  return {}
}

export interface RateCardOption {
  id: string
  vendor_id: string | null
  vendor_name: string | null
  unit_price_cents: number
  lead_time_days: number | null
  is_preferred: boolean
  effective_from: Date | null
  source_type: string
  occurred_at: string
  is_stale: boolean
}

export interface SupplierContext {
  // Supplier prices resolved from the canonical DUPA catalog_item_id path.
  // Description matching is intentionally not supported: similar text is not
  // a safe commercial identity.
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
  const profile = await getUserProfile()
  if (!profile) return { tcvCents: null }

  // A project can be linked to multiple opportunities (legacy + Won). Pick
  // the highest TCV — if anything, that's the most aggressive forecast and
  // the right anchor for "are we over-shooting?".
  const rows = await db
    .select({ tcv_cents: opportunities.tcv_cents })
    .from(opportunities)
    .where(
      and(
        eq(opportunities.project_id, projectId),
        eq(opportunities.tenant_id, profile.tenantId),
      ),
    )
    .orderBy(desc(opportunities.tcv_cents))
    .limit(1)

  return { tcvCents: rows[0]?.tcv_cents ?? null }
}

export async function fetchLineSupplierContext(
  lineItemId: string,
): Promise<{ data: SupplierContext } | { error: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }

  const [line] = await db
    .select({ id: bomLineItems.id })
    .from(bomLineItems)
    .where(
      and(eq(bomLineItems.id, lineItemId), eq(bomLineItems.tenant_id, profile.tenantId)),
    )

  if (!line) return { error: 'Line item not found' }

  const [dupa] = await db
    .select({ id: dupas.id })
    .from(dupas)
    .where(and(eq(dupas.tenant_id, profile.tenantId), eq(dupas.bom_line_item_id, line.id)))
    .limit(1)

  const catalogRows = dupa
    ? await db
        .select({ catalog_item_id: dupaMaterialLines.catalog_item_id })
        .from(dupaMaterialLines)
        .where(
          and(
            eq(dupaMaterialLines.tenant_id, profile.tenantId),
            eq(dupaMaterialLines.dupa_id, dupa.id),
            isNotNull(dupaMaterialLines.catalog_item_id),
          ),
        )
    : []
  const catalogItemIds = [...new Set(catalogRows.flatMap((row) => row.catalog_item_id ? [row.catalog_item_id] : []))]

  const matches = catalogItemIds.length > 0
    ? await db
        .select({
          id: priceHistory.id,
          vendor_id: priceHistory.vendor_id,
          vendor_name: vendors.name,
          quoted_rate_centavos: priceHistory.quoted_rate_centavos,
          awarded_rate_centavos: priceHistory.awarded_rate_centavos,
          source_type: priceHistory.source_type,
          occurred_at: priceHistory.occurred_at,
        })
        .from(priceHistory)
        .leftJoin(
          vendors,
          and(eq(priceHistory.vendor_id, vendors.id), eq(vendors.tenant_id, profile.tenantId)),
        )
        .where(
          and(
            eq(priceHistory.tenant_id, profile.tenantId),
            inArray(priceHistory.catalog_item_id, catalogItemIds),
          ),
        )
        .orderBy(desc(priceHistory.occurred_at))
        .limit(25)
    : []

  const rateCardOptions: RateCardOption[] = selectCanonicalSupplierOptions(matches)

  const tenantVendors = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(eq(vendors.tenant_id, profile.tenantId))
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
  // tcv        = sum of line totals (rate-source-adjusted, never UI markup)
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
