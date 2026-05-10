import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { boms, bomLineItems, projects, users, vendors } from '@buildops/database/schema'
import { and, eq, desc, asc } from 'drizzle-orm'
import { BomBuilder } from '@/components/bom/bom-builder'
import { CadDropZone } from '@/components/cad/cad-dropzone'
import { scopeItems } from '@buildops/database/schema'
import { sql } from 'drizzle-orm'

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
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return notFound()

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, userRow.tenant_id)))

  if (!project) return notFound()

  // Latest non-archived BOM
  const [latestBom] = await db
    .select()
    .from(boms)
    .where(and(eq(boms.project_id, id), eq(boms.tenant_id, userRow.tenant_id)))
    .orderBy(desc(boms.version))
    .limit(1)

  const lineItems = latestBom
    ? await db
        .select()
        .from(bomLineItems)
        .where(and(eq(bomLineItems.bom_id, latestBom.id), eq(bomLineItems.tenant_id, userRow.tenant_id)))
        .orderBy(asc(bomLineItems.sort_order))
    : []

  const bomWithLines = latestBom
    ? {
        ...latestBom,
        status: latestBom.status as 'draft' | 'approved' | 'locked' | 'archived',
        lineItems,
      }
    : null

  // Provenance breakdown — derived from the per-line `notes` field that
  // auto-bom.ts writes ("Cost from RAG …", "Cost from Catalog …", "Manual …",
  // "No catalog or historical match …"). No new tables, no extra queries.
  const pricingBreakdown = lineItems.reduce(
    (acc, line) => {
      const notes = (line.notes ?? '').trim()
      const isUnpriced = line.unit_cost_cents === 0 || notes.startsWith('No catalog')
      if (notes.startsWith('Cost from RAG')) acc.rag += 1
      else if (
        notes.startsWith('Cost from Catalog') ||
        notes.startsWith('Cost from PH industry catalog')
      )
        acc.catalog += 1
      else if (notes.startsWith('Manual')) acc.manual += 1
      if (isUnpriced) acc.unpriced += 1
      return acc
    },
    { rag: 0, catalog: 0, manual: 0, unpriced: 0 }
  )

  const vendorList = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(eq(vendors.tenant_id, userRow.tenant_id))

  // Status signals for the auto-extraction banner
  const [scopeCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(scopeItems)
    .where(and(eq(scopeItems.project_id, id), eq(scopeItems.tenant_id, userRow.tenant_id)))
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
          unpriced={pricingBreakdown.unpriced}
          total={lineItems.length}
        />
      )}

      <BomBuilder projectId={id} bom={bomWithLines} vendors={vendorList} />

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
  unpriced: number
  total: number
}

function PricingBreakdown({ rag, catalog, manual, unpriced, total }: PricingBreakdownProps) {
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
