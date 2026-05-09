import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { opportunities, projects, users } from '@buildops/database/schema'
import { and, eq } from 'drizzle-orm'
import { OpportunityPanel } from '@/components/opportunities/opportunity-panel'

export const metadata: Metadata = { title: 'Project' }

const TYPE_LABELS: Record<string, string> = {
  mep: 'MEP',
  fit_out: 'Fit-out',
  interior: 'Interior',
  mixed: 'Mixed',
}

const STATUS_LABELS: Record<string, string> = {
  lead: 'Lead',
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_COLORS: Record<string, string> = {
  lead: 'var(--color-neutral-400)',
  active: 'var(--color-success)',
  on_hold: 'var(--color-warning)',
  completed: 'var(--color-info)',
  cancelled: 'var(--color-danger)',
}

const TABS = [
  { label: 'Overview', href: '' },
  { label: 'BOM', href: '/bom' },
  { label: 'Documents', href: '/documents' },
  { label: 'Billing', href: '/billing' },
]

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return notFound()

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, userRow.tenant_id)))

  if (!project) return notFound()

  const opps = await db
    .select({
      id: opportunities.id,
      stage: opportunities.stage,
      tcv_cents: opportunities.tcv_cents,
      gp_cents: opportunities.gp_cents,
      probability: opportunities.probability,
      weighted_tcv_cents: opportunities.weighted_tcv_cents,
      closing_date: opportunities.closing_date,
      area_sqm: opportunities.area_sqm,
      opportunity_type: opportunities.opportunity_type,
    })
    .from(opportunities)
    .where(and(eq(opportunities.project_id, id), eq(opportunities.tenant_id, userRow.tenant_id)))

  const baseHref = `/projects/${id}`

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <Link href="/projects" style={{ color: 'var(--color-neutral-400)', fontSize: '0.875rem', textDecoration: 'none' }}>
            Projects
          </Link>
          <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
          <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>{project.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 4px 0', color: 'var(--color-neutral-900)' }}>
              {project.name}
            </h1>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>
              <span>{project.client}</span>
              {project.location && <span>{project.location}</span>}
              {project.project_type && <span>{TYPE_LABELS[project.project_type] ?? project.project_type}</span>}
              {project.total_sqm && <span>{project.total_sqm.toLocaleString()} sqm</span>}
            </div>
          </div>
          <span
            style={{
              padding: '4px 12px',
              borderRadius: '4px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: STATUS_COLORS[project.status] ?? 'inherit',
              background: 'var(--color-neutral-50)',
              border: '1px solid var(--color-border)',
            }}
          >
            {STATUS_LABELS[project.status] ?? project.status}
          </span>
        </div>
      </div>

      {/* Tab navigation */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)' }}>
        {TABS.map(({ label, href }) => {
          const fullHref = baseHref + href
          const isActive = href === '' // Overview is default
          return (
            <Link
              key={label}
              href={fullHref}
              style={{
                padding: '8px 16px',
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

      {/* Overview content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
        <div>
          {/* Notes */}
          {project.notes && (
            <div
              style={{
                background: 'white',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                padding: '20px',
                marginBottom: '16px',
              }}
            >
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 12px 0', color: 'var(--color-neutral-700)' }}>
                Notes
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)', margin: 0, lineHeight: 1.6 }}>
                {project.notes}
              </p>
            </div>
          )}

          {/* Quick links to tabs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
            {[
              { label: 'Bill of Materials', href: `/projects/${id}/bom`, icon: '≡' },
              { label: 'Documents', href: `/projects/${id}/documents`, icon: '◼' },
              { label: 'Billing', href: `/projects/${id}/billing`, icon: '◇' },
            ].map(({ label, href: tabHref, icon }) => (
              <Link
                key={label}
                href={tabHref}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '20px',
                  background: 'white',
                  border: '1px solid var(--color-border)',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  color: 'var(--color-neutral-700)',
                  textAlign: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '1.5rem', color: 'var(--color-navy-600)' }}>{icon}</span>
                <span style={{ fontSize: '0.8125rem', fontWeight: 500 }}>{label}</span>
              </Link>
            ))}
          </div>

          {/* Pipeline opportunities */}
          <OpportunityPanel projectId={id} opportunities={opps} />
        </div>

        {/* Right metadata rail */}
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '20px',
            height: 'fit-content',
          }}
        >
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, margin: '0 0 16px 0', color: 'var(--color-neutral-700)' }}>
            Project Details
          </h3>
          <dl style={{ margin: 0 }}>
            {[
              { label: 'Status', value: STATUS_LABELS[project.status] ?? project.status },
              { label: 'Type', value: project.project_type ? (TYPE_LABELS[project.project_type] ?? project.project_type) : '—' },
              { label: 'Client', value: project.client },
              { label: 'Location', value: project.location ?? '—' },
              { label: 'Area', value: project.total_sqm ? `${project.total_sqm.toLocaleString()} sqm` : '—' },
              {
                label: 'Created',
                value: new Date(project.created_at).toLocaleDateString('en-PH', {
                  year: 'numeric', month: 'long', day: 'numeric',
                }),
              },
            ].map(({ label, value }) => (
              <div key={label} style={{ marginBottom: '12px' }}>
                <dt style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {label}
                </dt>
                <dd style={{ fontSize: '0.875rem', color: 'var(--color-neutral-800)', margin: 0 }}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  )
}
