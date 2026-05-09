import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { boms, bomLineItems, projects, users } from '@buildops/database/schema'
import { and, eq, desc, asc } from 'drizzle-orm'
import { BomBuilder } from '@/components/bom/bom-builder'

export const metadata: Metadata = { title: 'BOM' }

const TABS = [
  { label: 'Overview', href: '' },
  { label: 'Scope', href: '/scope' },
  { label: 'BOM', href: '/bom' },
  { label: 'Documents', href: '/documents' },
  { label: 'Billing', href: '/billing' },
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

      <BomBuilder projectId={id} bom={bomWithLines} />

      {/* Phase 2 notice */}
      <div
        style={{
          marginTop: '24px',
          background: 'var(--color-navy-50)',
          border: '1px solid var(--color-navy-100)',
          borderRadius: '8px',
          padding: '16px 20px',
          fontSize: '0.8125rem',
          color: 'var(--color-navy-700)',
        }}
      >
        DXF auto-extraction will pre-populate scope items here in Phase 2. AI unit-cost suggestions coming in Phase 4.
      </div>
    </div>
  )
}
