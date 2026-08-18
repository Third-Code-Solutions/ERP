'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
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
  dupaLabourLines,
  dupaEquipmentLines,
  assemblies,
  materialCatalog,
  crewRoles,
  equipmentCatalog,
  priceHistory,
  opportunities,
  takeoffUnresolvedItems,
} from '@third-code-erp/database/schema'
import { eq, and, max, desc, asc, isNotNull, inArray, ne } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { writeAuditLogInTransaction } from '@/lib/audit'
import { safeActionError } from '@/lib/safe-action-error'
import { inngest } from '@/lib/inngest'
import {
  dispatchApprovedBomRfqThroughCoreApi,
  rfqAutoDispatchUsesCoreApi,
} from '@/lib/erp-core-client'
import { selectCanonicalSupplierOptions } from '@/lib/operations/bom-supplier-matching'
import {
  bomGrainReviewResolutionSchema,
  bomLocationReviewResolutionSchema,
  bomLineLocationUpdateSchema,
  classifyBomLineKind,
  computeDupa,
  dupaUpsertInputSchema,
  MAX_BOM_LINE_ITEM_QUANTITY,
  projectLocationCreateSchema,
  type BomLineItemKind,
} from '@third-code-erp/shared-types/bom'
import {
  manualLineTotal,
  bomTotalCost,
  computeGP,
  computeGPMargin,
} from '@third-code-erp/shared-types/bom'

const bomLineItemReferenceSchema = z
  .object({
    lineItemId: z.string().uuid(),
    bomId: z.string().uuid(),
    projectId: z.string().uuid(),
  })
  .strict()

const bomVendorAssignmentSchema = z
  .object({
    lineItemId: z.string().uuid(),
    projectId: z.string().uuid(),
    vendorId: z.string().uuid().nullable(),
  })
  .strict()

const addBomLineItemActionSchema = z
  .object({
    bomId: z.string().uuid(),
    projectId: z.string().uuid(),
    data: z
      .object({
        description: z.string().trim().min(1).max(1_000),
        unit: z.string().trim().min(1).max(20),
        quantity: z.number().int().min(0).max(MAX_BOM_LINE_ITEM_QUANTITY),
        unit_cost_cents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
        code: z.string().trim().max(50).optional(),
        notes: z.string().max(2_000).optional(),
        locationId: z.string().uuid().nullable().optional(),
      })
      .strict()
      .superRefine((value, context) => {
        if (!Number.isSafeInteger(value.unit_cost_cents * value.quantity)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['unit_cost_cents'],
            message: 'Line total exceeds the supported centavo range',
          })
        }
      }),
  })
  .strict()

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Serialize every direct BOM mutation against the BOM row itself. The
 * approval transition uses the same row, so `FOR UPDATE` prevents a stale
 * pre-transaction draft check from slipping a write through after approval.
 */
async function lockBomForMutation(
  tx: DatabaseTransaction,
  scope: { bomId: string; projectId: string; tenantId: string },
) {
  const [bom] = await tx
    .select({ id: boms.id, status: boms.status })
    .from(boms)
    .where(
      and(
        eq(boms.id, scope.bomId),
        eq(boms.project_id, scope.projectId),
        eq(boms.tenant_id, scope.tenantId),
      ),
    )
    .for('update')

  return bom ?? null
}

async function lockProjectForMutation(
  tx: DatabaseTransaction,
  projectId: string,
  tenantId: string,
) {
  const [project] = await tx
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenant_id, tenantId)))
    .for('update')

  return project ?? null
}

export async function createBom(projectId: string): Promise<{ id: string } | { error: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.edit')) {
    return { error: `Forbidden: role "${profile.role}" lacks "bom.edit"` }
  }

  const bomId = await db.transaction(async (tx) => {
    const project = await lockProjectForMutation(tx, projectId, profile.tenantId)
    if (!project) return null

    // Project-row locking serializes version allocation for this direct write
    // path until a database uniqueness constraint can enforce it globally.
    const [existing] = await tx
      .select({ version: max(boms.version) })
      .from(boms)
      .where(and(eq(boms.project_id, projectId), eq(boms.tenant_id, profile.tenantId)))
    const nextVersion = (existing?.version ?? 0) + 1

    const [inserted] = await tx
      .insert(boms)
      .values({
        tenant_id: profile.tenantId,
        project_id: projectId,
        created_by: profile.user.id,
        version: nextVersion,
        status: 'draft',
      })
      .returning({ id: boms.id })
    if (!inserted) throw new Error('BOM insert did not return an id')

    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'bom',
      entityId: inserted.id,
      action: 'create',
      diff: { version: nextVersion, status: 'draft' },
    })

    return inserted.id
  })
  if (!bomId) return { error: 'Project not found' }

  revalidatePath(`/projects/${projectId}/bom`)
  return { id: bomId }
}

export async function addBomLineItem(
  bomId: string,
  projectId: string,
  data: unknown,
): Promise<{ error?: string }> {
  const parsed = addBomLineItemActionSchema.safeParse({ bomId, projectId, data })
  if (!parsed.success) return { error: 'Invalid BOM line item input' }

  const lineInput = parsed.data.data
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.edit')) {
    return { error: `Forbidden: role "${profile.role}" lacks "bom.edit"` }
  }

  const [bom] = await db
    .select({ id: boms.id, status: boms.status })
    .from(boms)
    .where(
      and(
        eq(boms.id, bomId),
        eq(boms.project_id, projectId),
        eq(boms.tenant_id, profile.tenantId),
      ),
    )
  if (!bom) return { error: 'BOM not found' }
  if (bom.status !== 'draft') return { error: 'Only draft BOMs can be edited' }

  if (lineInput.locationId) {
    const [location] = await db
      .select({ id: projectLocations.id })
      .from(projectLocations)
      .where(
        and(
          eq(projectLocations.id, lineInput.locationId),
          eq(projectLocations.project_id, projectId),
          eq(projectLocations.tenant_id, profile.tenantId),
        ),
      )
    if (!location) return { error: 'Location not found in this project' }
  }

  // Use the canonical math module (tested in @third-code-erp/shared-types/bom)
  // Flat line-level markup is retired. Manual lines are explicit cost inputs;
  // client value comes from a DUPA once one is attached to the work item.
  const line_total_cents = manualLineTotal(lineInput.unit_cost_cents, lineInput.quantity)

  const classification = classifyBomLineKind(lineInput.unit)

  const createdLineItemId = await db.transaction(async (tx) => {
    const lockedBom = await lockBomForMutation(tx, {
      bomId,
      projectId,
      tenantId: profile.tenantId,
    })
    if (!lockedBom || lockedBom.status !== 'draft') return null

    const [existing] = await tx
      .select({ max_sort: max(bomLineItems.sort_order) })
      .from(bomLineItems)
      .where(
        and(
          eq(bomLineItems.bom_id, bomId),
          eq(bomLineItems.tenant_id, profile.tenantId),
        ),
      )
    const sort_order = (existing?.max_sort ?? -1) + 1

    const inserted = await tx
      .insert(bomLineItems)
      .values({
        tenant_id: profile.tenantId,
        bom_id: bomId,
        sort_order,
        description: lineInput.description,
        unit: lineInput.unit,
        quantity: lineInput.quantity,
        unit_cost_cents: lineInput.unit_cost_cents,
        markup_bps: 0,
        line_total_cents,
        code: lineInput.code ?? null,
        notes: lineInput.notes ?? null,
        location_id: lineInput.locationId ?? null,
        description_original: lineInput.description,
        kind: classification.kind ?? 'work_item',
        unit_rate_source: 'manual',
        classification_status: classification.status,
        classification_reason: classification.reason,
      })
      .returning({ id: bomLineItems.id })

    const lineItemId = inserted[0]?.id
    if (!lineItemId) throw new Error('BOM line item insert did not return an id')

    if (classification.status === 'review') {
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
    if (!lineInput.locationId) {
      await tx.insert(bomLineItemLocationReviews).values({
        tenant_id: profile.tenantId,
        project_id: projectId,
        bom_id: bomId,
        bom_line_item_id: lineItemId,
        description_original: lineInput.description,
        reason: 'No project location is assigned. Choose a project location before approval.',
        created_by: profile.user.id,
        updated_by: profile.user.id,
      })
    }

    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'bom_line_item',
      entityId: lineItemId,
      action: 'create',
      diff: {
        bom_id: bomId,
        description: lineInput.description,
        code: lineInput.code ?? null,
        unit: lineInput.unit,
        quantity: lineInput.quantity,
        unit_cost_cents: lineInput.unit_cost_cents,
        location_id: lineInput.locationId ?? null,
        classification_status: classification.status,
      },
    })

    await recalcBomTotalsInTransaction(tx, bomId, profile.tenantId)
    return lineItemId
  })

  if (!createdLineItemId) return { error: 'Only draft BOMs can be edited' }

  revalidatePath(`/projects/${projectId}/bom`)
  return {}
}

export interface DupaSavedTotals {
  directCostCentavos: string
  indirectCostCentavos: string
  vatCentavos: string
  totalCostCentavos: string
  unitRateCentavos: string
}

/**
 * Persist one complete DUPA in a single tenant-scoped transaction.
 *
 * The database trigger remains the source of truth for persisted totals. The
 * shared exact arithmetic engine is used as a reconciliation check so a
 * browser/API payload cannot silently diverge from PostgreSQL's cascade.
 */
export async function upsertDupaForBomLine(
  projectId: string,
  bomId: string,
  input: unknown,
): Promise<{ id: string; totals: DupaSavedTotals } | { error: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.edit')) {
    return { error: `Forbidden: role "${profile.role}" lacks "bom.edit"` }
  }

  const ids = [z.string().uuid().safeParse(projectId), z.string().uuid().safeParse(bomId)]
  if (ids.some((result) => !result.success)) return { error: 'Invalid project or BOM id' }

  const parsed = dupaUpsertInputSchema.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.errors[0]
    return { error: `${first?.path.join('.') || 'form'}: ${first?.message || 'invalid input'}` }
  }
  const dupaInput = parsed.data

  const [bom] = await db
    .select({ id: boms.id, status: boms.status })
    .from(boms)
    .where(
      and(
        eq(boms.id, bomId),
        eq(boms.project_id, projectId),
        eq(boms.tenant_id, profile.tenantId),
      ),
    )
    .limit(1)
  if (!bom) return { error: 'BOM not found' }
  if (bom.status !== 'draft') return { error: 'DUPA editing is only available on draft BOMs' }

  const [line] = await db
    .select({
      id: bomLineItems.id,
      unit: bomLineItems.unit,
      kind: bomLineItems.kind,
      classification_status: bomLineItems.classification_status,
    })
    .from(bomLineItems)
    .where(
      and(
        eq(bomLineItems.id, dupaInput.lineItemId),
        eq(bomLineItems.bom_id, bomId),
        eq(bomLineItems.tenant_id, profile.tenantId),
      ),
    )
    .limit(1)
  if (!line) return { error: 'BOM line item not found' }
  if (line.kind !== 'work_item' || line.classification_status !== 'classified') {
    return { error: 'DUPA requires a classified work item' }
  }
  if ((line.unit ?? '').trim().toLowerCase() !== dupaInput.uom.trim().toLowerCase()) {
    return { error: 'DUPA unit must match the classified BOM work-item unit' }
  }

  const materialCatalogIds = [
    ...new Set(
      dupaInput.materials.flatMap((item) =>
        item.catalogItemId ? [item.catalogItemId] : [],
      ),
    ),
  ]
  const crewRoleIds = [
    ...new Set(
      dupaInput.labour.flatMap((item) => (item.crewRoleId ? [item.crewRoleId] : [])),
    ),
  ]
  const equipmentIds = [
    ...new Set(
      dupaInput.equipment.flatMap((item) => (item.equipmentId ? [item.equipmentId] : [])),
    ),
  ]
  if (dupaInput.materials.some((item) => item.rateSource !== 'manual' && !item.catalogItemId)) {
    return { error: 'Sourced material rates require a catalog item' }
  }

  try {
    if (dupaInput.assemblyId) {
      const [assembly] = await db
        .select({ id: assemblies.id })
        .from(assemblies)
        .where(
          and(
            eq(assemblies.id, dupaInput.assemblyId),
            eq(assemblies.tenant_id, profile.tenantId),
            eq(assemblies.is_active, true),
          ),
        )
        .limit(1)
      if (!assembly) return { error: 'Assembly not found or inactive' }
    }

    if (materialCatalogIds.length > 0) {
      const rows = await db
        .select({ id: materialCatalog.id })
        .from(materialCatalog)
        .where(
          and(
            eq(materialCatalog.tenant_id, profile.tenantId),
            inArray(materialCatalog.id, materialCatalogIds),
          ),
        )
      if (rows.length !== materialCatalogIds.length) {
        return { error: 'One or more material catalog items are outside the tenant' }
      }
    }
    if (crewRoleIds.length > 0) {
      const rows = await db
        .select({ id: crewRoles.id })
        .from(crewRoles)
        .where(
          and(eq(crewRoles.tenant_id, profile.tenantId), inArray(crewRoles.id, crewRoleIds)),
        )
      if (rows.length !== crewRoleIds.length) {
        return { error: 'One or more crew roles are outside the tenant' }
      }
    }
    if (equipmentIds.length > 0) {
      const rows = await db
        .select({ id: equipmentCatalog.id })
        .from(equipmentCatalog)
        .where(
          and(
            eq(equipmentCatalog.tenant_id, profile.tenantId),
            inArray(equipmentCatalog.id, equipmentIds),
          ),
        )
      if (rows.length !== equipmentIds.length) {
        return { error: 'One or more equipment items are outside the tenant' }
      }
    }

    const expected = computeDupa({
      headerQuantity: dupaInput.headerQuantity,
      ocmBps: BigInt(dupaInput.ocmBps),
      profitBps: BigInt(dupaInput.profitBps),
      vatBps: BigInt(dupaInput.vatBps),
      vatBase: dupaInput.vatBase,
      materials: dupaInput.materials.map((item) => ({
        quantity: item.quantity,
        unitRateCentavos: BigInt(item.unitRateCentavos),
      })),
      labour: dupaInput.labour.map((item) => ({
        noOfPersons: item.noOfPersons,
        hourlyRateCentavos: BigInt(item.hourlyRateCentavos),
        productivityPerHour: item.productivityPerHour,
      })),
      equipment: dupaInput.equipment.map((item) => ({
        noOfUnits: item.noOfUnits,
        hourlyRateCentavos: BigInt(item.hourlyRateCentavos),
        productivityPerHour: item.productivityPerHour,
      })),
    })

    const saved = await db.transaction(async (tx) => {
      const lockedBom = await lockBomForMutation(tx, {
        bomId,
        projectId,
        tenantId: profile.tenantId,
      })
      if (!lockedBom || lockedBom.status !== 'draft') return null

      const [existing] = await tx
        .select({ id: dupas.id })
        .from(dupas)
        .where(and(eq(dupas.tenant_id, profile.tenantId), eq(dupas.bom_line_item_id, line.id)))
        .limit(1)

      const inserted = existing
        ? []
        : await tx
            .insert(dupas)
            .values({
              tenant_id: profile.tenantId,
              bom_line_item_id: line.id,
              assembly_id: dupaInput.assemblyId ?? null,
              header_quantity: dupaInput.headerQuantity,
              uom: dupaInput.uom,
              ocm_bps: dupaInput.ocmBps,
              profit_bps: dupaInput.profitBps,
              vat_bps: dupaInput.vatBps,
              vat_base: dupaInput.vatBase,
              created_by: profile.user.id,
              updated_by: profile.user.id,
            })
            .returning({ id: dupas.id })
      const dupaId = existing?.id ?? inserted[0]?.id

      if (!dupaId) throw new Error('DUPA was not created')

      if (existing) {
        await tx
          .update(dupas)
          .set({
            assembly_id: dupaInput.assemblyId ?? null,
            header_quantity: dupaInput.headerQuantity,
            uom: dupaInput.uom,
            ocm_bps: dupaInput.ocmBps,
            profit_bps: dupaInput.profitBps,
            vat_bps: dupaInput.vatBps,
            vat_base: dupaInput.vatBase,
            updated_by: profile.user.id,
            updated_at: new Date(),
          })
          .where(and(eq(dupas.id, dupaId), eq(dupas.tenant_id, profile.tenantId)))
      }

      await tx
        .delete(dupaMaterialLines)
        .where(
          and(
            eq(dupaMaterialLines.dupa_id, dupaId),
            eq(dupaMaterialLines.tenant_id, profile.tenantId),
          ),
        )
      await tx
        .delete(dupaLabourLines)
        .where(
          and(
            eq(dupaLabourLines.dupa_id, dupaId),
            eq(dupaLabourLines.tenant_id, profile.tenantId),
          ),
        )
      await tx
        .delete(dupaEquipmentLines)
        .where(
          and(
            eq(dupaEquipmentLines.dupa_id, dupaId),
            eq(dupaEquipmentLines.tenant_id, profile.tenantId),
          ),
        )

      if (dupaInput.materials.length > 0) {
        await tx.insert(dupaMaterialLines).values(
          dupaInput.materials.map((item, sortOrder) => ({
            tenant_id: profile.tenantId,
            dupa_id: dupaId,
            catalog_item_id: item.catalogItemId ?? null,
            description: item.description,
            quantity: item.quantity,
            uom: item.uom,
            unit_rate_centavos: BigInt(item.unitRateCentavos),
            rate_source: item.rateSource,
            rate_as_of: item.rateAsOf ?? null,
            sort_order: sortOrder,
            created_by: profile.user.id,
            updated_by: profile.user.id,
          })),
        )
      }
      if (dupaInput.labour.length > 0) {
        await tx.insert(dupaLabourLines).values(
          dupaInput.labour.map((item, sortOrder) => ({
            tenant_id: profile.tenantId,
            dupa_id: dupaId,
            crew_role_id: item.crewRoleId ?? null,
            description: item.description,
            no_of_persons: item.noOfPersons,
            hourly_rate_centavos: BigInt(item.hourlyRateCentavos),
            productivity_per_hour: item.productivityPerHour,
            sort_order: sortOrder,
            created_by: profile.user.id,
            updated_by: profile.user.id,
          })),
        )
      }
      if (dupaInput.equipment.length > 0) {
        await tx.insert(dupaEquipmentLines).values(
          dupaInput.equipment.map((item, sortOrder) => ({
            tenant_id: profile.tenantId,
            dupa_id: dupaId,
            equipment_id: item.equipmentId ?? null,
            description: item.description,
            no_of_units: item.noOfUnits,
            hourly_rate_centavos: BigInt(item.hourlyRateCentavos),
            productivity_per_hour: item.productivityPerHour,
            sort_order: sortOrder,
            created_by: profile.user.id,
            updated_by: profile.user.id,
          })),
        )
      }

      const [result] = await tx
        .select({
          id: dupas.id,
          direct_cost_centavos: dupas.direct_cost_centavos,
          indirect_cost_centavos: dupas.indirect_cost_centavos,
          vat_centavos: dupas.vat_centavos,
          total_cost_centavos: dupas.total_cost_centavos,
          unit_rate_centavos: dupas.unit_rate_centavos,
        })
        .from(dupas)
        .where(and(eq(dupas.id, dupaId), eq(dupas.tenant_id, profile.tenantId)))
        .limit(1)
      if (!result) throw new Error('DUPA totals were not persisted')

      const reconciles =
        result.direct_cost_centavos === expected.directCostCentavos &&
        result.indirect_cost_centavos === expected.indirectCostCentavos &&
        result.vat_centavos === expected.vatCentavos &&
        result.total_cost_centavos === expected.totalCostCentavos &&
        result.unit_rate_centavos === expected.unitRateCentavos
      if (!reconciles) throw new Error('DUPA totals failed exact arithmetic reconciliation')

      // The semantic audit evidence is part of the same transaction as the
      // DUPA header, its replace-all detail rows, and the trigger-derived
      // totals. If audit insertion fails, the pricing mutation rolls back.
      await writeAuditLogInTransaction(tx, {
        tenantId: profile.tenantId,
        actorId: profile.user.id,
        entityType: 'dupa',
        entityId: result.id,
        action: existing ? 'update' : 'create',
        diff: {
          bom_id: bomId,
          bom_line_item_id: line.id,
          vat_base: dupaInput.vatBase,
          material_lines: dupaInput.materials.length,
          labour_lines: dupaInput.labour.length,
          equipment_lines: dupaInput.equipment.length,
          unit_rate_centavos: result.unit_rate_centavos.toString(),
        },
      })

      return { ...result, created: !existing }
    })

    if (!saved) return { error: 'DUPA editing is only available on draft BOMs' }

    revalidatePath(`/projects/${projectId}/bom`)
    return {
      id: saved.id,
      totals: {
        directCostCentavos: saved.direct_cost_centavos.toString(),
        indirectCostCentavos: saved.indirect_cost_centavos.toString(),
        vatCentavos: saved.vat_centavos.toString(),
        totalCostCentavos: saved.total_cost_centavos.toString(),
        unitRateCentavos: saved.unit_rate_centavos.toString(),
      },
    }
  } catch (error) {
    console.error('[upsertDupaForBomLine]', error)
    return { error: safeActionError(error, 'Unable to save DUPA') }
  }
}

export async function deleteBomLineItem(
  itemId: string,
  bomId: string,
  projectId: string
): Promise<{ error?: string }> {
  const parsed = bomLineItemReferenceSchema.safeParse({
    lineItemId: itemId,
    bomId,
    projectId,
  })
  if (!parsed.success) return { error: 'Invalid BOM line item reference' }

  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.edit')) {
    return { error: `Forbidden: role "${profile.role}" lacks "bom.edit"` }
  }

  const [bom] = await db
    .select({ id: boms.id, status: boms.status })
    .from(boms)
    .where(
      and(
        eq(boms.id, bomId),
        eq(boms.project_id, projectId),
        eq(boms.tenant_id, profile.tenantId),
      ),
    )
    .limit(1)
  if (!bom) return { error: 'BOM not found' }
  if (bom.status !== 'draft') return { error: 'Only draft BOMs can be edited' }

  const [line] = await db
    .select({
      id: bomLineItems.id,
      code: bomLineItems.code,
      description: bomLineItems.description,
      unit: bomLineItems.unit,
      quantity: bomLineItems.quantity,
      unitCostCents: bomLineItems.unit_cost_cents,
    })
    .from(bomLineItems)
    .where(
      and(
        eq(bomLineItems.id, itemId),
        eq(bomLineItems.bom_id, bomId),
        eq(bomLineItems.tenant_id, profile.tenantId),
      ),
    )
  if (!line) return { error: 'Line item not found' }

  const deleted = await db.transaction(async (tx) => {
    const lockedBom = await lockBomForMutation(tx, {
      bomId,
      projectId,
      tenantId: profile.tenantId,
    })
    if (!lockedBom || lockedBom.status !== 'draft') return 'not_draft' as const

    const [removed] = await tx
      .delete(bomLineItems)
      .where(
        and(
          eq(bomLineItems.id, itemId),
          eq(bomLineItems.bom_id, bomId),
          eq(bomLineItems.tenant_id, profile.tenantId),
        ),
      )
      .returning({ id: bomLineItems.id })
    if (!removed) return 'missing' as const

    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'bom_line_item',
      entityId: removed.id,
      action: 'delete',
      diff: {
        bom_id: bomId,
        code: line.code,
        description: line.description,
        unit: line.unit,
        quantity: line.quantity,
        unit_cost_cents: line.unitCostCents,
      },
    })
    await recalcBomTotalsInTransaction(tx, bomId, profile.tenantId)
    return 'deleted' as const
  })
  if (deleted === 'not_draft') return { error: 'Only draft BOMs can be edited' }
  if (deleted === 'missing') return { error: 'Line item no longer exists' }

  revalidatePath(`/projects/${projectId}/bom`)
  return {}
}

export async function approveBom(bomId: string, projectId: string): Promise<{ error?: string }> {
  const profile = await getUserProfile()
  if (!profile) return { error: 'Unauthorized' }
  if (!can(profile.role, 'bom.approve_internal')) {
    return { error: `Forbidden: role "${profile.role}" lacks "bom.approve_internal"` }
  }

  const approved = await db.transaction(async (tx) => {
    const [bom] = await tx
      .select({ id: boms.id, status: boms.status })
      .from(boms)
      .where(
        and(
          eq(boms.id, bomId),
          eq(boms.project_id, projectId),
          eq(boms.tenant_id, profile.tenantId),
        ),
      )
      .for('update')
    if (!bom) return { ok: false as const, error: 'BOM not found' }
    if (bom.status !== 'draft') {
      return { ok: false as const, error: 'Only draft BOMs can be approved' }
    }

    const [pendingTakeoff] = await tx
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
      return {
        ok: false as const,
        error: `Resolve every unresolved takeoff row before approval: ${pendingTakeoff.reason}`,
      }
    }

    const [unpricedAiLine] = await tx
      .select({ id: bomLineItems.id, description: bomLineItems.description })
      .from(bomLineItems)
      .where(
        and(
          eq(bomLineItems.bom_id, bomId),
          eq(bomLineItems.tenant_id, profile.tenantId),
          eq(bomLineItems.ai_drafted, true),
          ne(bomLineItems.unit_rate_source, 'dupa'),
        ),
      )
      .limit(1)
    if (unpricedAiLine) {
      return {
        ok: false as const,
        error: `Attach a DUPA to every AI-drafted line before approval: ${unpricedAiLine.description}`,
      }
    }

    const [unresolvedLine] = await tx
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
      return { ok: false as const, error: 'Resolve every BOM grain review before approval' }
    }

    const [pendingReview] = await tx
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
      return { ok: false as const, error: 'Resolve every BOM grain review before approval' }
    }

    const [pendingLocationReview] = await tx
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
      return { ok: false as const, error: 'Resolve every BOM location review before approval' }
    }

    // Recalculate while the BOM row is locked so no direct mutation can
    // interleave between approval validation, totals, state transition, and audit.
    await recalcBomTotalsInTransaction(tx, bomId, profile.tenantId)

    const [updated] = await tx
      .update(boms)
      .set({ status: 'approved', approved_by: profile.user.id, approved_at: new Date() })
      .where(
        and(
          eq(boms.id, bomId),
          eq(boms.tenant_id, profile.tenantId),
          eq(boms.status, 'draft'),
        ),
      )
      .returning({ id: boms.id })
    if (!updated) {
      return {
        ok: false as const,
        error: 'BOM is no longer a draft and cannot be approved',
      }
    }

    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'bom',
      entityId: bomId,
      action: 'approve',
      diff: { status: 'approved' },
    })
    return { ok: true as const }
  })
  if (!approved.ok) return { error: approved.error }

  // Best-effort: trigger async embedding for RAG. Missing INNGEST keys must
  // not roll back the approval — the BOM is already saved.
  if (rfqAutoDispatchUsesCoreApi(profile.tenantId)) {
    const dispatch = await dispatchApprovedBomRfqThroughCoreApi({ bomId })
    if (!dispatch.ok) {
      console.warn(
        `[approveBom] Nest RFQ dispatch failed (approval still persisted): ${dispatch.error ?? 'unknown error'}`,
      )
    }
  } else {
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
    } catch (error) {
      console.warn(
        '[approveBom] inngest.send failed (approval still persisted):',
        error,
      )
    }
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
      bomStatus: boms.status,
      previousKind: bomLineItems.kind,
      previousParentLineItemId: bomLineItems.parent_line_item_id,
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
  if (review.bomStatus !== 'draft') return { error: 'Only draft BOMs can be edited' }

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
  const resolved = await db.transaction(async (tx) => {
    const lockedBom = await lockBomForMutation(tx, {
      bomId: review.bomId,
      projectId: parsed.data.projectId,
      tenantId: profile.tenantId,
    })
    if (!lockedBom || lockedBom.status !== 'draft') return false

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

    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'bom_line_item',
      entityId: review.lineItemId,
      action: 'update',
      diff: {
        field_changed: 'classification',
        before: {
          kind: review.previousKind,
          parent_line_item_id: review.previousParentLineItemId,
        },
        after: {
          kind: parsed.data.kind,
          parent_line_item_id: parsed.data.parentLineItemId,
        },
        review_id: review.reviewId,
      },
    })
    return true
  })
  if (!resolved) return { error: 'Only draft BOMs can be edited' }

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

  const location = await db.transaction(async (tx) => {
    const project = await lockProjectForMutation(tx, projectId, profile.tenantId)
    if (!project) return null

    const [existing] = await tx
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
    if (existing) return { id: existing.id, created: false }

    const [inserted] = await tx
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
    if (!inserted) throw new Error('Project location insert did not return an id')

    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'project_location',
      entityId: inserted.id,
      action: 'create',
      diff: { projectId, name: parsed.data.name, level: 'room' },
    })

    return { id: inserted.id, created: true }
  })
  if (!location) return { error: 'Project not found' }

  if (location.created) revalidatePath('/projects/' + projectId + '/bom')
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
      bomStatus: boms.status,
      previousLocationId: bomLineItems.location_id,
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
  if (review.bomStatus !== 'draft') return { error: 'Only draft BOMs can be edited' }

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
  const resolved = await db.transaction(async (tx) => {
    const lockedBom = await lockBomForMutation(tx, {
      bomId: review.bomId,
      projectId: parsed.data.projectId,
      tenantId: profile.tenantId,
    })
    if (!lockedBom || lockedBom.status !== 'draft') return false

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

    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'bom_line_item',
      entityId: review.lineItemId,
      action: 'update',
      diff: {
        field_changed: 'location_id',
        before: review.previousLocationId,
        after: { id: location.id, name: location.name },
        description_original: review.descriptionOriginal,
      },
    })
    return true
  })
  if (!resolved) return { error: 'Only draft BOMs can be edited' }

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
      bomStatus: boms.status,
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
  if (line.bomStatus !== 'draft') return { error: 'Only draft BOMs can be edited' }

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
  const updated = await db.transaction(async (tx) => {
    const lockedBom = await lockBomForMutation(tx, {
      bomId: line.bomId,
      projectId: parsed.data.projectId,
      tenantId: profile.tenantId,
    })
    if (!lockedBom || lockedBom.status !== 'draft') return false

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

    const writeLocationAudit = () =>
      writeAuditLogInTransaction(tx, {
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
      await writeLocationAudit()
      return true
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
      await writeLocationAudit()
      return true
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
    await writeLocationAudit()
    return true
  })

  if (!updated) return { error: 'Only draft BOMs can be edited' }

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
  const parsed = bomVendorAssignmentSchema.safeParse({ lineItemId, projectId, vendorId })
  if (!parsed.success) return { error: 'Invalid supplier assignment' }

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
      bomStatus: boms.status,
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
        eq(boms.tenant_id, profile.tenantId),
      ),
    )

  if (!line) return { error: 'Line item not found' }
  if (line.bomStatus !== 'draft') return { error: 'Only draft BOMs can be edited' }

  let vendor: { id: string; name: string } | null = null
  if (parsed.data.vendorId) {
    const [v] = await db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(and(eq(vendors.id, parsed.data.vendorId), eq(vendors.tenant_id, profile.tenantId)))
    if (!v) return { error: 'Vendor not found or outside tenant scope' }
    vendor = v
  }

  const previousVendorMatch = (line.notes ?? '').match(/\[VENDOR:([0-9a-f-]+):([^\]]+)\]/i)
  const before = previousVendorMatch
    ? { id: previousVendorMatch[1], name: previousVendorMatch[2] }
    : null

  const newNotes = attachVendorToken(line.notes, vendor)

  const updated = await db.transaction(async (tx) => {
    const lockedBom = await lockBomForMutation(tx, {
      bomId: line.bom_id,
      projectId: parsed.data.projectId,
      tenantId: profile.tenantId,
    })
    if (!lockedBom || lockedBom.status !== 'draft') return 'not_draft' as const

    const [saved] = await tx
      .update(bomLineItems)
      .set({ notes: newNotes, updated_at: new Date() })
      .where(
        and(
          eq(bomLineItems.id, parsed.data.lineItemId),
          eq(bomLineItems.bom_id, line.bom_id),
          eq(bomLineItems.tenant_id, profile.tenantId),
        ),
      )
      .returning({ id: bomLineItems.id })
    if (!saved) return 'missing' as const

    await writeAuditLogInTransaction(tx, {
      tenantId: profile.tenantId,
      actorId: profile.user.id,
      entityType: 'bom_line_item',
      entityId: saved.id,
      action: 'update',
      diff: {
        field_changed: 'vendor_id',
        before,
        after: vendor,
      },
    })
    return 'updated' as const
  })
  if (updated === 'not_draft') return { error: 'Only draft BOMs can be edited' }
  if (updated === 'missing') return { error: 'Line item no longer exists' }

  revalidatePath(`/projects/${parsed.data.projectId}/bom`)
  return {}
}

async function recalcBomTotalsInTransaction(
  tx: DatabaseTransaction,
  bomId: string,
  tenantId: string,
) {
  const lines = await tx
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

  await tx
    .update(boms)
    .set({ total_cost_cents, tcv_cents, gp_cents, gp_margin_bps })
    .where(and(eq(boms.id, bomId), eq(boms.tenant_id, tenantId)))
}
