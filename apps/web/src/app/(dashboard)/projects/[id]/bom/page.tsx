import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import workspaceStyles from '@/components/bom/bom-workspace.module.css'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  boms,
  bomLineItems,
  projects,
  vendors,
  boqDivisions,
  dupas,
  dupaMaterialLines,
  dupaLabourLines,
  dupaEquipmentLines,
  assemblies,
  assemblyMaterialTemplates,
  assemblyLabourTemplates,
  assemblyEquipmentTemplates,
  materialCatalog,
  crewRoles,
  equipmentCatalog,
  awardHandoffs,
  priceHistory,
} from '@third-code-erp/database/schema'
import { and, eq, ne, desc, asc, inArray, isNull } from 'drizzle-orm'
import { BomBuilder } from '@/components/bom/bom-builder'
import { BomGrainReviewQueue } from '@/components/bom/bom-grain-review-queue'
import { BomLocationReviewQueue } from '@/components/bom/bom-location-review-queue'
import { BomLocationRollup } from '@/components/bom/bom-location-rollup'
import { CadDropZone } from '@/components/cad/cad-dropzone'
import {
  listPendingBomGrainReviews,
  listPendingBomLocationReviews,
  listBomLocationRollup,
  listProjectLocations,
} from './actions'
import { summarizeBomPricing } from '@/lib/operations/bom-pricing-breakdown'
import { AwardAutomationPanel } from '@/components/bom/award-automation-panel'
import { isPriceHistoryStale } from '@/lib/operations/bom-supplier-matching'
import type { DupaAssemblyOption } from '@/components/bom/dupa-editor'
import {
  getProjectBomControls,
  getProjectDetailAccess,
} from '../project-detail-access'

export const metadata: Metadata = { title: 'BOM' }

function formatDupaMoneyInput(centavos: bigint): string {
  const absolute = centavos < 0n ? -centavos : centavos
  return `${centavos < 0n ? '-' : ''}${absolute / 100n}.${(absolute % 100n)
    .toString()
    .padStart(2, '0')}`
}

export default async function ProjectBomPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await requireUuidRouteParams(params)
  const profile = await requireUserProfile()
  const access = getProjectDetailAccess(profile.role)
  if (!access.bom) return notFound()
  const controls = getProjectBomControls(profile.role)

  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      projectCode: projects.project_code,
    })
    .from(projects)
    .where(
      and(
        eq(projects.id, id),
        eq(projects.tenant_id, profile.tenantId),
        isNull(projects.deleted_at),
      ),
    )

  if (!project) return notFound()

  // Latest non-archived BOM
  const [latestBom] = await db
    .select()
    .from(boms)
    .where(
      and(
        eq(boms.project_id, id),
        eq(boms.tenant_id, profile.tenantId),
        ne(boms.status, 'archived'),
      ),
    )
    .orderBy(desc(boms.version))
    .limit(1)

  const [awardHandoffsRows, lineItems] = latestBom
    ? await Promise.all([
        db
          .select({
            id: awardHandoffs.id,
            status: awardHandoffs.status,
            projectCode: awardHandoffs.project_code,
            budgetId: awardHandoffs.budget_id,
            dpInvoiceId: awardHandoffs.dp_invoice_id,
            projectTrackerId: awardHandoffs.project_tracker_id,
            taskIds: awardHandoffs.task_ids,
          })
          .from(awardHandoffs)
          .where(
            and(
              eq(awardHandoffs.tenant_id, profile.tenantId),
              eq(awardHandoffs.source_bom_id, latestBom.id),
            ),
          )
          .limit(1),
        db
          .select()
          .from(bomLineItems)
          .where(
            and(
              eq(bomLineItems.bom_id, latestBom.id),
              eq(bomLineItems.tenant_id, profile.tenantId),
            ),
          )
          .orderBy(asc(bomLineItems.sort_order)),
      ])
    : [[], []]
  const [awardHandoff] = awardHandoffsRows

  // The persisted BOM spine stays flat for downstream compatibility. Build
  // the WO-07 view model from the additive division and DUPA tables here so
  // the client never invents pricing or hierarchy state.
  const lineIds = lineItems.map((line) => line.id)
  const dupaRows =
    lineIds.length > 0
      ? await db
          .select()
          .from(dupas)
          .where(
            and(
              eq(dupas.tenant_id, profile.tenantId),
              inArray(dupas.bom_line_item_id, lineIds),
            ),
          )
      : []
  const dupaIds = dupaRows.map((dupa) => dupa.id)
  const [dupaMaterialRows, dupaLabourRows, dupaEquipmentRows] =
    dupaIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(dupaMaterialLines)
            .where(
              and(
                eq(dupaMaterialLines.tenant_id, profile.tenantId),
                inArray(dupaMaterialLines.dupa_id, dupaIds),
              ),
            )
            .orderBy(asc(dupaMaterialLines.sort_order)),
          db
            .select()
            .from(dupaLabourLines)
            .where(
              and(
                eq(dupaLabourLines.tenant_id, profile.tenantId),
                inArray(dupaLabourLines.dupa_id, dupaIds),
              ),
            )
            .orderBy(asc(dupaLabourLines.sort_order)),
          db
            .select()
            .from(dupaEquipmentLines)
            .where(
              and(
                eq(dupaEquipmentLines.tenant_id, profile.tenantId),
                inArray(dupaEquipmentLines.dupa_id, dupaIds),
              ),
            )
            .orderBy(asc(dupaEquipmentLines.sort_order)),
        ])
      : [[], [], []]

  const materialByDupa = new Map<string, typeof dupaMaterialRows>()
  for (const row of dupaMaterialRows) {
    const rows = materialByDupa.get(row.dupa_id) ?? []
    rows.push(row)
    materialByDupa.set(row.dupa_id, rows)
  }
  const labourByDupa = new Map<string, typeof dupaLabourRows>()
  for (const row of dupaLabourRows) {
    const rows = labourByDupa.get(row.dupa_id) ?? []
    rows.push(row)
    labourByDupa.set(row.dupa_id, rows)
  }
  const equipmentByDupa = new Map<string, typeof dupaEquipmentRows>()
  for (const row of dupaEquipmentRows) {
    const rows = equipmentByDupa.get(row.dupa_id) ?? []
    rows.push(row)
    equipmentByDupa.set(row.dupa_id, rows)
  }

  const catalogItemIds = [
    ...new Set(
      dupaMaterialRows.flatMap((row) =>
        row.catalog_item_id ? [row.catalog_item_id] : [],
      ),
    ),
  ]
  const divisionIds = [
    ...new Set(
      lineItems.flatMap((line) => (line.division_id ? [line.division_id] : [])),
    ),
  ]
  const [priceHistoryRows, divisionRows] = await Promise.all([
    catalogItemIds.length > 0
      ? db
          .select({
            id: priceHistory.id,
            catalog_item_id: priceHistory.catalog_item_id,
            vendor_name: vendors.name,
            quoted_rate_centavos: priceHistory.quoted_rate_centavos,
            awarded_rate_centavos: priceHistory.awarded_rate_centavos,
            source_type: priceHistory.source_type,
            source_document: priceHistory.source_document,
            occurred_at: priceHistory.occurred_at,
          })
          .from(priceHistory)
          .leftJoin(
            vendors,
            and(
              eq(priceHistory.vendor_id, vendors.id),
              eq(vendors.tenant_id, profile.tenantId),
            ),
          )
          .where(
            and(
              eq(priceHistory.tenant_id, profile.tenantId),
              inArray(priceHistory.catalog_item_id, catalogItemIds),
            ),
          )
          .orderBy(
            desc(priceHistory.occurred_at),
            desc(priceHistory.created_at),
          )
          .limit(100)
      : Promise.resolve([]),
    divisionIds.length > 0
      ? db
          .select({
            id: boqDivisions.id,
            code: boqDivisions.code,
            name: boqDivisions.name,
          })
          .from(boqDivisions)
          .where(
            and(
              eq(boqDivisions.tenant_id, profile.tenantId),
              inArray(boqDivisions.id, divisionIds),
            ),
          )
      : Promise.resolve([]),
  ])
  const priceHistoryByCatalog = new Map<string, typeof priceHistoryRows>()
  for (const row of priceHistoryRows) {
    const rows = priceHistoryByCatalog.get(row.catalog_item_id) ?? []
    if (rows.length < 5) rows.push(row)
    priceHistoryByCatalog.set(row.catalog_item_id, rows)
  }
  const dupaByLine = new Map<
    string,
    {
      id: string
      header_quantity: string
      uom: string
      assembly_id: string | null
      ocm_bps: number
      profit_bps: number
      vat_bps: number
      vat_base: 'direct_only' | 'direct_plus_indirect'
      direct_cost_centavos: string
      indirect_cost_centavos: string
      vat_centavos: string
      total_cost_centavos: string
      unit_rate_centavos: string
      materials: Array<{
        id: string
        description: string
        quantity: string
        uom: string
        unit_rate_centavos: string
        rate_source: string
        rate_as_of: string | null
        catalog_item_id: string | null
        price_suggestions: Array<{
          id: string
          vendor_name: string | null
          quoted_rate_centavos: string
          awarded_rate_centavos: string | null
          source_type: string
          source_document: string | null
          occurred_at: string
          is_stale: boolean
        }>
      }>
      labour: Array<{
        id: string
        description: string
        no_of_persons: string
        hourly_rate_centavos: string
        productivity_per_hour: string
      }>
      equipment: Array<{
        id: string
        description: string
        no_of_units: string
        hourly_rate_centavos: string
        productivity_per_hour: string
      }>
    }
  >()
  for (const dupa of dupaRows) {
    dupaByLine.set(dupa.bom_line_item_id, {
      id: dupa.id,
      header_quantity: String(dupa.header_quantity),
      uom: dupa.uom,
      assembly_id: dupa.assembly_id,
      ocm_bps: dupa.ocm_bps,
      profit_bps: dupa.profit_bps,
      vat_bps: dupa.vat_bps,
      vat_base: dupa.vat_base as 'direct_only' | 'direct_plus_indirect',
      direct_cost_centavos: String(dupa.direct_cost_centavos),
      indirect_cost_centavos: String(dupa.indirect_cost_centavos),
      vat_centavos: String(dupa.vat_centavos),
      total_cost_centavos: String(dupa.total_cost_centavos),
      unit_rate_centavos: String(dupa.unit_rate_centavos),
      materials: (materialByDupa.get(dupa.id) ?? []).map((row) => ({
        id: row.id,
        description: row.description,
        quantity: String(row.quantity),
        uom: row.uom,
        unit_rate_centavos: String(row.unit_rate_centavos),
        rate_source: row.rate_source,
        rate_as_of: row.rate_as_of,
        catalog_item_id: row.catalog_item_id,
        price_suggestions: (row.catalog_item_id
          ? (priceHistoryByCatalog.get(row.catalog_item_id) ?? [])
          : []
        ).map((suggestion) => ({
          id: suggestion.id,
          vendor_name: suggestion.vendor_name,
          quoted_rate_centavos: String(suggestion.quoted_rate_centavos),
          awarded_rate_centavos:
            suggestion.awarded_rate_centavos == null
              ? null
              : String(suggestion.awarded_rate_centavos),
          source_type: suggestion.source_type,
          source_document: suggestion.source_document,
          occurred_at: suggestion.occurred_at,
          is_stale: isPriceHistoryStale(suggestion.occurred_at),
        })),
      })),
      labour: (labourByDupa.get(dupa.id) ?? []).map((row) => ({
        id: row.id,
        description: row.description,
        no_of_persons: String(row.no_of_persons),
        hourly_rate_centavos: String(row.hourly_rate_centavos),
        productivity_per_hour: String(row.productivity_per_hour),
      })),
      equipment: (equipmentByDupa.get(dupa.id) ?? []).map((row) => ({
        id: row.id,
        description: row.description,
        no_of_units: String(row.no_of_units),
        hourly_rate_centavos: String(row.hourly_rate_centavos),
        productivity_per_hour: String(row.productivity_per_hour),
      })),
    })
  }

  const divisionLabelById = new Map(
    divisionRows.map((division) => [
      division.id,
      `${division.code} · ${division.name}`,
    ]),
  )
  const bomViewLineItems = lineItems.map((line) => ({
    ...line,
    division_label: line.division_id
      ? (divisionLabelById.get(line.division_id) ?? null)
      : null,
    dupa: dupaByLine.get(line.id),
  }))

  const bomWithLines = latestBom
    ? {
        ...latestBom,
        status: latestBom.status as
          | 'draft'
          | 'approved'
          | 'locked'
          | 'archived',
        lineItems: bomViewLineItems,
      }
    : null

  const [
    pendingGrainReviews,
    locations,
    pendingLocationReviews,
    locationRollup,
    vendorList,
    assemblyRows,
  ] = await Promise.all([
    listPendingBomGrainReviews(id, latestBom?.id ?? null),
    listProjectLocations(id),
    listPendingBomLocationReviews(id, latestBom?.id ?? null),
    listBomLocationRollup(id, latestBom?.id ?? null),
    db
      .select({ id: vendors.id, name: vendors.name })
      .from(vendors)
      .where(eq(vendors.tenant_id, profile.tenantId)),
    latestBom
      ? db
          .select({
            id: assemblies.id,
            code: assemblies.code,
            name: assemblies.name,
            uom: assemblies.uom,
          })
          .from(assemblies)
          .where(
            and(
              eq(assemblies.tenant_id, profile.tenantId),
              eq(assemblies.is_active, true),
            ),
          )
          .orderBy(asc(assemblies.name))
          .limit(200)
      : Promise.resolve([]),
  ])
  const grainReviewParents = lineItems
    .filter(
      (line) =>
        line.kind === 'work_item' &&
        line.classification_status === 'classified',
    )
    .map((line) => ({
      id: line.id,
      label: `${line.code ? `${line.code} · ` : ''}${line.description}`,
    }))

  const pricingBreakdown = summarizeBomPricing(lineItems)

  const assemblyIds = assemblyRows.map((assembly) => assembly.id)
  const [assemblyMaterialRows, assemblyLabourRows, assemblyEquipmentRows] =
    assemblyIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(assemblyMaterialTemplates)
            .where(
              and(
                eq(assemblyMaterialTemplates.tenant_id, profile.tenantId),
                inArray(assemblyMaterialTemplates.assembly_id, assemblyIds),
              ),
            )
            .orderBy(asc(assemblyMaterialTemplates.sort_order)),
          db
            .select()
            .from(assemblyLabourTemplates)
            .where(
              and(
                eq(assemblyLabourTemplates.tenant_id, profile.tenantId),
                inArray(assemblyLabourTemplates.assembly_id, assemblyIds),
              ),
            )
            .orderBy(asc(assemblyLabourTemplates.sort_order)),
          db
            .select()
            .from(assemblyEquipmentTemplates)
            .where(
              and(
                eq(assemblyEquipmentTemplates.tenant_id, profile.tenantId),
                inArray(assemblyEquipmentTemplates.assembly_id, assemblyIds),
              ),
            )
            .orderBy(asc(assemblyEquipmentTemplates.sort_order)),
        ])
      : [[], [], []]
  const assemblyMaterialCatalogIds = [
    ...new Set(
      assemblyMaterialRows.flatMap((row) =>
        row.catalog_item_id ? [row.catalog_item_id] : [],
      ),
    ),
  ]
  const assemblyCrewRoleIds = [
    ...new Set(
      assemblyLabourRows.flatMap((row) =>
        row.crew_role_id ? [row.crew_role_id] : [],
      ),
    ),
  ]
  const assemblyEquipmentIds = [
    ...new Set(
      assemblyEquipmentRows.flatMap((row) =>
        row.equipment_id ? [row.equipment_id] : [],
      ),
    ),
  ]
  const [materialCatalogRows, crewRoleRows, equipmentCatalogRows] =
    await Promise.all([
      assemblyMaterialCatalogIds.length > 0
        ? db
            .select()
            .from(materialCatalog)
            .where(
              and(
                eq(materialCatalog.tenant_id, profile.tenantId),
                inArray(materialCatalog.id, assemblyMaterialCatalogIds),
              ),
            )
        : Promise.resolve([]),
      assemblyCrewRoleIds.length > 0
        ? db
            .select()
            .from(crewRoles)
            .where(
              and(
                eq(crewRoles.tenant_id, profile.tenantId),
                inArray(crewRoles.id, assemblyCrewRoleIds),
              ),
            )
        : Promise.resolve([]),
      assemblyEquipmentIds.length > 0
        ? db
            .select()
            .from(equipmentCatalog)
            .where(
              and(
                eq(equipmentCatalog.tenant_id, profile.tenantId),
                inArray(equipmentCatalog.id, assemblyEquipmentIds),
              ),
            )
        : Promise.resolve([]),
    ])
  const materialCatalogById = new Map(
    materialCatalogRows.map((row) => [row.id, row]),
  )
  const crewRoleById = new Map(crewRoleRows.map((row) => [row.id, row]))
  const equipmentCatalogById = new Map(
    equipmentCatalogRows.map((row) => [row.id, row]),
  )
  const assemblyOptions: DupaAssemblyOption[] = assemblyRows.map(
    (assembly) => ({
      id: assembly.id,
      label: `${assembly.code} · ${assembly.name}`,
      uom: assembly.uom,
      materials: assemblyMaterialRows
        .filter((row) => row.assembly_id === assembly.id)
        .map((row) => {
          const catalog = row.catalog_item_id
            ? materialCatalogById.get(row.catalog_item_id)
            : undefined
          return {
            catalogItemId: row.catalog_item_id,
            description: row.description,
            quantity: String(row.quantity),
            uom: row.uom,
            unitRate: catalog
              ? formatDupaMoneyInput(catalog.current_rate_centavos)
              : '0.00',
            rateSource: 'catalog' as const,
            rateAsOf: catalog
              ? catalog.last_updated_at.toISOString().slice(0, 10)
              : '',
          }
        }),
      labour: assemblyLabourRows
        .filter((row) => row.assembly_id === assembly.id)
        .map((row) => {
          const crew = row.crew_role_id
            ? crewRoleById.get(row.crew_role_id)
            : undefined
          return {
            crewRoleId: row.crew_role_id,
            description: row.description,
            noOfPersons: String(row.no_of_persons),
            hourlyRate: crew
              ? formatDupaMoneyInput(crew.hourly_rate_centavos)
              : '0.00',
            productivityPerHour: String(row.productivity_per_hour),
          }
        }),
      equipment: assemblyEquipmentRows
        .filter((row) => row.assembly_id === assembly.id)
        .map((row) => {
          const equipment = row.equipment_id
            ? equipmentCatalogById.get(row.equipment_id)
            : undefined
          return {
            equipmentId: row.equipment_id,
            description: row.description,
            noOfUnits: String(row.no_of_units),
            hourlyRate: equipment
              ? formatDupaMoneyInput(equipment.hourly_rate_centavos)
              : '0.00',
            productivityPerHour: String(
              equipment?.default_productivity_per_hour ??
                row.productivity_per_hour,
            ),
          }
        }),
    }),
  )

  const ragActive = Boolean(process.env.OPENAI_API_KEY)
  const dwgWorkerActive = Boolean(process.env.DXF_PARSER_URL)

  return (
    <div className={workspaceStyles.workspace}>
      {/* Breadcrumb + tabs */}
      <div style={{ marginBottom: '24px' }}>
        <div
          style={{
            fontSize: '0.8125rem',
            color: 'var(--color-neutral-400)',
            marginBottom: '8px',
          }}
        >
          <Link
            href="/projects"
            style={{
              color: 'var(--color-neutral-400)',
              textDecoration: 'none',
            }}
          >
            Projects
          </Link>
          {' / '}
          <Link
            href={`/projects/${id}`}
            style={{
              color: 'var(--color-neutral-400)',
              textDecoration: 'none',
            }}
          >
            {project.name}
          </Link>
          {' / '}
          <span style={{ color: 'var(--color-neutral-700)' }}>BOM</span>
        </div>
        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: 'var(--color-neutral-900)',
            margin: '0 0 16px',
          }}
        >
          {project.name}
        </h1>
      </div>

      {lineItems.length > 0 && (
        <PricingBreakdown
          rag={pricingBreakdown.rag}
          catalog={pricingBreakdown.catalog}
          manual={pricingBreakdown.manual}
          dupa={pricingBreakdown.dupa}
          clientBoq={pricingBreakdown.clientBoq}
          unpriced={pricingBreakdown.unpriced}
          total={pricingBreakdown.total}
        />
      )}

      {controls.review && (
        <BomGrainReviewQueue
          projectId={id}
          reviews={pendingGrainReviews}
          parents={grainReviewParents}
        />
      )}

      {controls.review && (
        <BomLocationReviewQueue
          projectId={id}
          reviews={pendingLocationReviews}
          locations={locations}
        />
      )}

      {locationRollup.length > 0 && (
        <details className={workspaceStyles.details}>
          <summary>
            Location quantities · {locationRollup.length} entries
          </summary>
          <BomLocationRollup rows={locationRollup} />
        </details>
      )}

      <BomBuilder
        projectId={id}
        bom={bomWithLines}
        vendors={vendorList}
        locations={locations}
        assemblyOptions={assemblyOptions}
        readOnly={!controls.edit}
      />

      {controls.award && latestBom?.status === 'locked' && (
        <AwardAutomationPanel
          projectId={id}
          bomId={latestBom.id}
          projectCode={project.projectCode}
          handoff={
            awardHandoff
              ? {
                  id: awardHandoff.id,
                  status: awardHandoff.status,
                  projectCode: awardHandoff.projectCode,
                  budgetId: awardHandoff.budgetId,
                  dpInvoiceId: awardHandoff.dpInvoiceId,
                  projectTrackerId: awardHandoff.projectTrackerId,
                  taskIds: awardHandoff.taskIds,
                }
              : null
          }
        />
      )}

      {/* Live auto-extraction panel */}
      {controls.importCad && (
        <div style={{ marginTop: 24 }}>
          <div
            style={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    color: 'var(--color-neutral-900)',
                    letterSpacing: '-0.005em',
                    margin: 0,
                  }}
                >
                  CAD auto-extraction
                </h3>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--color-neutral-500)',
                    margin: '2px 0 0',
                  }}
                >
                  Drop a DWG or DXF here to extract candidate work items for
                  review.
                </p>
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <StatusPill
                  label="DXF parsing"
                  status="active"
                  detail="In-browser extractor"
                />
                <StatusPill
                  label="DWG conversion"
                  status={dwgWorkerActive ? 'active' : 'pending'}
                  detail={
                    dwgWorkerActive ? 'Worker online' : 'Set DXF_PARSER_URL'
                  }
                />
                <StatusPill
                  label="AI unit costs"
                  status={ragActive ? 'active' : 'pending'}
                  detail={
                    ragActive ? 'pgvector + OpenAI' : 'Set OPENAI_API_KEY'
                  }
                />
              </div>
            </div>
            <div style={{ padding: 18 }}>
              <CadDropZone
                projectId={id}
                compact
                title={
                  bomWithLines && bomWithLines.lineItems.length > 0
                    ? 'Drop another CAD drawing'
                    : 'Drop a DWG or DXF to create a draft BOM'
                }
                subtitle={
                  bomWithLines && bomWithLines.lineItems.length > 0
                    ? 'Adds new candidate work items for review.'
                    : 'Evidence extraction only · pricing requires an explicit DUPA or estimator input'
                }
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface PricingBreakdownProps {
  rag: number
  catalog: number
  manual: number
  dupa: number
  clientBoq: number
  unpriced: number
  total: number
}

function PricingBreakdown({
  rag,
  catalog,
  manual,
  dupa,
  clientBoq,
  unpriced,
  total,
}: PricingBreakdownProps) {
  const chips: Array<{
    key: string
    label: string
    count: number
    bg: string
    fg: string
    border: string
    detail: string
  }> = [
    {
      key: 'rag',
      label: 'RAG',
      count: rag,
      bg: 'var(--color-success-soft)',
      fg: 'var(--color-success)',
      border: 'color-mix(in oklch, var(--color-success) 22%, transparent)',
      detail: 'Cost from similar past BOMs',
    },
    {
      key: 'catalog',
      label: 'Catalog',
      count: catalog,
      bg: 'var(--color-info-soft)',
      fg: 'var(--color-info)',
      border: 'color-mix(in oklch, var(--color-info) 22%, transparent)',
      detail: 'PH industry catalog match',
    },
    {
      key: 'manual',
      label: 'Manual',
      count: manual,
      bg: 'var(--color-neutral-100)',
      fg: 'var(--color-neutral-700)',
      border: 'var(--color-border)',
      detail: 'Estimator-entered unit cost',
    },
    {
      key: 'dupa',
      label: 'DUPA',
      count: dupa,
      bg: 'var(--color-success-soft)',
      fg: 'var(--color-success)',
      border: 'color-mix(in oklch, var(--color-success) 22%, transparent)',
      detail: 'Derived from a Detailed Unit Price Analysis',
    },
    {
      key: 'client-boq',
      label: 'BOQ',
      count: clientBoq,
      bg: 'var(--color-info-soft)',
      fg: 'var(--color-info)',
      border: 'color-mix(in oklch, var(--color-info) 22%, transparent)',
      detail: 'Client-provided BOQ rate',
    },
    {
      key: 'unpriced',
      label: 'Unpriced',
      count: unpriced,
      bg: 'var(--color-warning-soft)',
      fg: 'var(--color-warning)',
      border: 'color-mix(in oklch, var(--color-warning) 22%, transparent)',
      detail: 'No match found — needs estimator review',
    },
  ]

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        padding: '10px 14px',
        marginBottom: 16,
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          color: 'var(--color-neutral-500)',
          marginRight: 4,
        }}
      >
        Pricing breakdown
      </div>
      {chips.map((chip) => (
        <span
          key={chip.key}
          title={`${chip.detail} · ${chip.count} of ${total} line${total === 1 ? '' : 's'}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '3px 10px',
            borderRadius: 999,
            fontSize: 11.5,
            fontWeight: 600,
            background: chip.bg,
            color: chip.fg,
            border: `1px solid ${chip.border}`,
          }}
        >
          <span>{chip.label}</span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              padding: '0 4px',
              borderRadius: 4,
              background: 'color-mix(in oklch, white 60%, transparent)',
            }}
          >
            {chip.count}
          </span>
        </span>
      ))}
      <span
        style={{
          marginLeft: 'auto',
          fontSize: 11.5,
          color: 'var(--color-neutral-500)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        {total} total
      </span>
    </div>
  )
}

function StatusPill({
  label,
  status,
  detail,
}: {
  label: string
  status: 'active' | 'pending'
  detail: string
}) {
  const isActive = status === 'active'
  return (
    <span
      title={detail}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 500,
        background: isActive
          ? 'var(--color-success-soft)'
          : 'var(--color-neutral-100)',
        color: isActive ? 'var(--color-success)' : 'var(--color-neutral-600)',
        border: `1px solid ${isActive ? 'color-mix(in oklch, var(--color-success) 18%, transparent)' : 'var(--color-border)'}`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: isActive
            ? 'var(--color-success)'
            : 'var(--color-neutral-400)',
        }}
      />
      <span>{label}</span>
      <span
        style={{
          color: isActive ? 'var(--color-success)' : 'var(--color-neutral-500)',
          opacity: 0.85,
        }}
      >
        · {detail}
      </span>
    </span>
  )
}
