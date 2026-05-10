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
