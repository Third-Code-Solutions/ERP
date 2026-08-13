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
  awardHandoffs,
} from '@third-code-erp/database/schema'
import { and, eq, desc, asc, inArray } from 'drizzle-orm'
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
import { scopeItems } from '@third-code-erp/database/schema'
import { sql } from 'drizzle-orm'
import { summarizeBomPricing } from '@/lib/operations/bom-pricing-breakdown'
import { AwardAutomationPanel } from '@/components/bom/award-automation-panel'

export const metadata: Metadata = { title: 'BOM' }

const TABS = [
  { label: 'Overview', href: '' },
  { label: 'Scope', href: '/scope' },
  { label: 'BOM', href: '/bom' },
  { label: 'Documents', href: '/documents' },
  { label: 'Billing', href: '/billing' },
  { label: 'Comments', href: '/comments' },
  { label: 'Audit', href: '/audit' },
]

export default async function ProjectBomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const profile = await requireUserProfile()

  const [project] = await db
    .select({ id: projects.id, name: projects.name, projectCode: projects.project_code })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, profile.tenantId)))

  if (!project) return notFound()

  // Latest non-archived BOM
  const [latestBom] = await db
    .select()
    .from(boms)
    .where(and(eq(boms.project_id, id), eq(boms.tenant_id, profile.tenantId)))
    .orderBy(desc(boms.version))
    .limit(1)

  const [awardHandoff] = latestBom
    ? await db
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
            eq(awardHandoffs.source_bom_id, latestBom.id)
          )
        )
        .limit(1)
    : []

  const lineItems = latestBom
    ? await db
        .select()
        .from(bomLineItems)
        .where(and(eq(bomLineItems.bom_id, latestBom.id), eq(bomLineItems.tenant_id, profile.tenantId)))
        .orderBy(asc(bomLineItems.sort_order))
    : []

  // The persisted BOM spine stays flat for downstream compatibility. Build
  // the WO-07 view model from the additive division and DUPA tables here so
  // the client never invents pricing or hierarchy state.
  const lineIds = lineItems.map((line) => line.id)
  const dupaRows = lineIds.length > 0
    ? await db
        .select()
        .from(dupas)
        .where(and(eq(dupas.tenant_id, profile.tenantId), inArray(dupas.bom_line_item_id, lineIds)))
    : []
  const dupaIds = dupaRows.map((dupa) => dupa.id)
  const dupaMaterialRows = dupaIds.length > 0
    ? await db
        .select()
        .from(dupaMaterialLines)
        .where(and(eq(dupaMaterialLines.tenant_id, profile.tenantId), inArray(dupaMaterialLines.dupa_id, dupaIds)))
        .orderBy(asc(dupaMaterialLines.sort_order))
    : []
  const dupaLabourRows = dupaIds.length > 0
    ? await db
        .select()
        .from(dupaLabourLines)
        .where(and(eq(dupaLabourLines.tenant_id, profile.tenantId), inArray(dupaLabourLines.dupa_id, dupaIds)))
        .orderBy(asc(dupaLabourLines.sort_order))
    : []
  const dupaEquipmentRows = dupaIds.length > 0
    ? await db
        .select()
        .from(dupaEquipmentLines)
        .where(and(eq(dupaEquipmentLines.tenant_id, profile.tenantId), inArray(dupaEquipmentLines.dupa_id, dupaIds)))
        .orderBy(asc(dupaEquipmentLines.sort_order))
    : []

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
  const dupaByLine = new Map<string, {
    id: string
    header_quantity: string
    uom: string
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
  }>()
  for (const dupa of dupaRows) {
    dupaByLine.set(dupa.bom_line_item_id, {
      id: dupa.id,
      header_quantity: String(dupa.header_quantity),
      uom: dupa.uom,
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

  const divisionIds = [...new Set(lineItems.flatMap((line) => line.division_id ? [line.division_id] : []))]
  const divisionRows = divisionIds.length > 0
    ? await db
        .select({ id: boqDivisions.id, code: boqDivisions.code, name: boqDivisions.name })
        .from(boqDivisions)
        .where(and(eq(boqDivisions.tenant_id, profile.tenantId), inArray(boqDivisions.id, divisionIds)))
    : []
  const divisionLabelById = new Map(divisionRows.map((division) => [
    division.id,
    `${division.code} · ${division.name}`,
  ]))
  const bomViewLineItems = lineItems.map((line) => ({
    ...line,
    division_label: line.division_id ? divisionLabelById.get(line.division_id) ?? null : null,
    dupa: dupaByLine.get(line.id),
  }))

  const bomWithLines = latestBom
    ? {
        ...latestBom,
        status: latestBom.status as 'draft' | 'approved' | 'locked' | 'archived',
        lineItems: bomViewLineItems,
      }
    : null

  const pendingGrainReviews = await listPendingBomGrainReviews(id, latestBom?.id ?? null)
  const locations = await listProjectLocations(id)
  const pendingLocationReviews = await listPendingBomLocationReviews(id, latestBom?.id ?? null)
  const locationRollup = await listBomLocationRollup(id, latestBom?.id ?? null)
  const grainReviewParents = lineItems
    .filter((line) => line.kind === 'work_item' && line.classification_status === 'classified')
    .map((line) => ({
      id: line.id,
      label: `${line.code ? `${line.code} · ` : ''}${line.description}`,
    }))

  const pricingBreakdown = summarizeBomPricing(lineItems)

  const vendorList = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(eq(vendors.tenant_id, profile.tenantId))

  // Status signals for the auto-extraction banner
  const [scopeCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scopeItems)
    .where(and(eq(scopeItems.project_id, id), eq(scopeItems.tenant_id, profile.tenantId)))
  const scopeCount = scopeCountRow?.count ?? 0
  const ragActive = Boolean(process.env.OPENAI_API_KEY)
  const dwgWorkerActive = Boolean(process.env.DXF_PARSER_URL)

  return (
    <div>
      {/* Breadcrumb + tabs */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-400)', marginBottom: '8px' }}>
          <Link href="/projects" style={{ color: 'var(--color-neutral-400)', textDecoration: 'none' }}>Projects</Link>
          {' / '}
          <Link href={`/projects/${id}`} style={{ color: 'var(--color-neutral-400)', textDecoration: 'none' }}>{project.name}</Link>
          {' / '}
          <span style={{ color: 'var(--color-neutral-700)' }}>BOM</span>
        </div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-neutral-900)', margin: '0 0 16px' }}>
          {project.name}
        </h1>
        <div style={{ display: 'flex', gap: '0', borderBottom: '1px solid var(--color-border)' }}>
          {TABS.map(({ label, href }) => {
            const isActive = href === '/bom'
            return (
              <Link
                key={href}
                href={`/projects/${id}${href}`}
                style={{
                  padding: '8px 20px',
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--color-navy-700)' : 'var(--color-neutral-500)',
                  textDecoration: 'none',
                  borderBottom: isActive ? '2px solid var(--color-navy-700)' : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {label}
              </Link>
            )
          })}
        </div>
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

      <BomGrainReviewQueue
        projectId={id}
        reviews={pendingGrainReviews}
        parents={grainReviewParents}
      />

      <BomLocationReviewQueue
        projectId={id}
        reviews={pendingLocationReviews}
        locations={locations}
      />

      <BomLocationRollup rows={locationRollup} />

      <BomBuilder projectId={id} bom={bomWithLines} vendors={vendorList} locations={locations} />

      {latestBom?.status === 'locked' && (
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
                Drop a DWG or DXF here to extract scope and draft a BOM.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <StatusPill
                label="DXF parsing"
                status="active"
                detail="In-browser extractor"
              />
              <StatusPill
                label="DWG conversion"
                status={dwgWorkerActive ? 'active' : 'pending'}
                detail={dwgWorkerActive ? 'Worker online' : 'Set DXF_PARSER_URL'}
              />
              <StatusPill
                label="AI unit costs"
                status={ragActive ? 'active' : 'pending'}
                detail={ragActive ? 'pgvector + OpenAI' : 'Set OPENAI_API_KEY'}
              />
              {scopeCount > 0 ? (
                <Link
                  href={`/projects/${id}/scope`}
                  style={{
                    fontSize: 12,
                    color: 'var(--color-navy-700)',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  {scopeCount} scope item{scopeCount === 1 ? '' : 's'} →
                </Link>
              ) : null}
            </div>
          </div>
          <div style={{ padding: 18 }}>
            <CadDropZone
              projectId={id}
              compact
              title={
                bomWithLines && bomWithLines.lineItems.length > 0
                  ? 'Drop another CAD drawing'
                  : 'Drop a DWG or DXF to pre-populate this BOM'
              }
              subtitle={
                bomWithLines && bomWithLines.lineItems.length > 0
                  ? 'Adds new scope items and a fresh draft BOM.'
                  : 'Real-time scope extraction · auto-priced lines from past projects'
              }
            />
          </div>
        </div>
      </div>
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

function PricingBreakdown({ rag, catalog, manual, dupa, clientBoq, unpriced, total }: PricingBreakdownProps) {
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
        background: isActive ? 'var(--color-success-soft)' : 'var(--color-neutral-100)',
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
          background: isActive ? 'var(--color-success)' : 'var(--color-neutral-400)',
        }}
      />
      <span>{label}</span>
      <span style={{ color: isActive ? 'var(--color-success)' : 'var(--color-neutral-500)', opacity: 0.85 }}>
        · {detail}
      </span>
    </span>
  )
}
