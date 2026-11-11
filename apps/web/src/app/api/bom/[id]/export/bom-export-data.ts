import { and, asc, eq, inArray, isNull, ne } from 'drizzle-orm'
import { db } from '@third-code-erp/database'
import {
  bomLineItems,
  boms,
  boqDivisions,
  dupaEquipmentLines,
  dupaLabourLines,
  dupaMaterialLines,
  dupas,
  projectLocations,
  projects,
} from '@third-code-erp/database/schema'
import {
  BOQ_EXPORT_MAX_LINES,
  BoqExportTooLargeError,
  type BoqExportData,
  type BoqExportDupa,
} from '@/lib/operations/boq-excel/workbook'

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const row of rows) {
    const group = groups.get(key(row))
    if (group) group.push(row)
    else groups.set(key(row), [row])
  }
  return groups
}

/**
 * Everything the BOQ workbook prints, read with an explicit tenant predicate
 * on every table (Drizzle runs as postgres and bypasses RLS). Null when the
 * BOM is not this tenant's, is archived (the BOM page never shows one) or its
 * project is deleted. Throws BoqExportTooLargeError past BOQ_EXPORT_MAX_LINES.
 */
export async function loadBoqExport(tenantId: string, bomId: string): Promise<BoqExportData | null> {
  const [header] = await db
    .select({
      version: boms.version,
      status: boms.status,
      label: boms.label,
      total_cost_cents: boms.total_cost_cents,
      tcv_cents: boms.tcv_cents,
      gp_cents: boms.gp_cents,
      gp_margin_bps: boms.gp_margin_bps,
      projectName: projects.name,
      projectCode: projects.project_code,
      client: projects.client,
    })
    .from(boms)
    .innerJoin(projects, and(eq(projects.id, boms.project_id), eq(projects.tenant_id, tenantId)))
    .where(
      and(
        eq(boms.id, bomId),
        eq(boms.tenant_id, tenantId),
        isNull(projects.deleted_at),
        ne(boms.status, 'archived'),
      ),
    )
    .limit(1)
  if (!header) return null

  const lines = await db
    .select({
      id: bomLineItems.id,
      item_no: bomLineItems.item_no,
      code: bomLineItems.code,
      description: bomLineItems.description,
      division_id: bomLineItems.division_id,
      location_id: bomLineItems.location_id,
      unit: bomLineItems.unit,
      quantity: bomLineItems.quantity_decimal,
      unit_cost_cents: bomLineItems.unit_cost_cents,
      line_total_cents: bomLineItems.line_total_cents,
      unit_rate_source: bomLineItems.unit_rate_source,
      notes: bomLineItems.notes,
      is_group: bomLineItems.is_group,
      parent_line_item_id: bomLineItems.parent_line_item_id,
    })
    .from(bomLineItems)
    .where(and(eq(bomLineItems.bom_id, bomId), eq(bomLineItems.tenant_id, tenantId)))
    .orderBy(asc(bomLineItems.sort_order), asc(bomLineItems.id))
    .limit(BOQ_EXPORT_MAX_LINES + 1)
  if (lines.length > BOQ_EXPORT_MAX_LINES) throw new BoqExportTooLargeError()

  const ids = (pick: (line: (typeof lines)[number]) => string | null) => [
    ...new Set(lines.flatMap((line) => (pick(line) ? [pick(line)!] : []))),
  ]
  const divisionIds = ids((line) => line.division_id)
  const locationIds = ids((line) => line.location_id)
  const lineIds = lines.map((line) => line.id)

  const [divisionRows, locationRows, dupaRows] = await Promise.all([
    divisionIds.length > 0
      ? db
          .select({ id: boqDivisions.id, name: boqDivisions.name })
          .from(boqDivisions)
          .where(and(eq(boqDivisions.tenant_id, tenantId), inArray(boqDivisions.id, divisionIds)))
      : Promise.resolve([]),
    locationIds.length > 0
      ? db
          .select({ id: projectLocations.id, name: projectLocations.name })
          .from(projectLocations)
          .where(
            and(eq(projectLocations.tenant_id, tenantId), inArray(projectLocations.id, locationIds)),
          )
      : Promise.resolve([]),
    lineIds.length > 0
      ? db
          .select()
          .from(dupas)
          .where(and(eq(dupas.tenant_id, tenantId), inArray(dupas.bom_line_item_id, lineIds)))
      : Promise.resolve([]),
  ])

  const dupaIds = dupaRows.map((dupa) => dupa.id)
  const [materialRows, labourRows, equipmentRows] =
    dupaIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(dupaMaterialLines)
            .where(
              and(eq(dupaMaterialLines.tenant_id, tenantId), inArray(dupaMaterialLines.dupa_id, dupaIds)),
            )
            .orderBy(asc(dupaMaterialLines.sort_order)),
          db
            .select()
            .from(dupaLabourLines)
            .where(and(eq(dupaLabourLines.tenant_id, tenantId), inArray(dupaLabourLines.dupa_id, dupaIds)))
            .orderBy(asc(dupaLabourLines.sort_order)),
          db
            .select()
            .from(dupaEquipmentLines)
            .where(
              and(
                eq(dupaEquipmentLines.tenant_id, tenantId),
                inArray(dupaEquipmentLines.dupa_id, dupaIds),
              ),
            )
            .orderBy(asc(dupaEquipmentLines.sort_order)),
        ])
      : [[], [], []]

  const divisionName = new Map(divisionRows.map((row) => [row.id, row.name]))
  const locationName = new Map(locationRows.map((row) => [row.id, row.name]))
  const materialsByDupa = groupBy(materialRows, (row) => row.dupa_id)
  const labourByDupa = groupBy(labourRows, (row) => row.dupa_id)
  const equipmentByDupa = groupBy(equipmentRows, (row) => row.dupa_id)

  return {
    project: { name: header.projectName, code: header.projectCode, client: header.client },
    bom: {
      version: header.version,
      status: header.status,
      label: header.label,
      total_cost_cents: header.total_cost_cents,
      tcv_cents: header.tcv_cents,
      gp_cents: header.gp_cents,
      gp_margin_bps: header.gp_margin_bps,
    },
    lines: lines.map(({ location_id, ...line }) => ({
      ...line,
      division: line.division_id ? (divisionName.get(line.division_id) ?? null) : null,
      location: location_id ? (locationName.get(location_id) ?? null) : null,
    })),
    dupas: dupaRows.map(
      (dupa): BoqExportDupa => ({
        bom_line_item_id: dupa.bom_line_item_id,
        header_quantity: dupa.header_quantity,
        uom: dupa.uom,
        ocm_bps: dupa.ocm_bps,
        profit_bps: dupa.profit_bps,
        vat_bps: dupa.vat_bps,
        direct_cost_centavos: dupa.direct_cost_centavos,
        indirect_cost_centavos: dupa.indirect_cost_centavos,
        vat_centavos: dupa.vat_centavos,
        total_cost_centavos: dupa.total_cost_centavos,
        unit_rate_centavos: dupa.unit_rate_centavos,
        materials: (materialsByDupa.get(dupa.id) ?? []).map((row) => ({
          description: row.description,
          quantity: row.quantity,
          uom: row.uom,
          unit_rate_centavos: row.unit_rate_centavos,
        })),
        labour: (labourByDupa.get(dupa.id) ?? []).map((row) => ({
          description: row.description,
          no_of_persons: row.no_of_persons,
          hourly_rate_centavos: row.hourly_rate_centavos,
          productivity_per_hour: row.productivity_per_hour,
        })),
        equipment: (equipmentByDupa.get(dupa.id) ?? []).map((row) => ({
          description: row.description,
          no_of_units: row.no_of_units,
          hourly_rate_centavos: row.hourly_rate_centavos,
          productivity_per_hour: row.productivity_per_hour,
        })),
      }),
    ),
  }
}
