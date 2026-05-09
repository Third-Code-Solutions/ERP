import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { projects, scopeItems, users } from '@buildops/database/schema'
import { and, asc, eq } from 'drizzle-orm'

export const metadata: Metadata = { title: 'Scope' }

const TABS = [
  { label: 'Overview', href: '' },
  { label: 'Scope', href: '/scope' },
  { label: 'BOM', href: '/bom' },
  { label: 'Documents', href: '/documents' },
  { label: 'Billing', href: '/billing' },
]

const UNIT_LABELS: Record<string, string> = {
  unit: 'unit',
  sqm: 'm²',
  lm: 'lm',
  set: 'set',
  lot: 'lot',
}

function formatPHP(cents: number): string {
  return `₱${(cents / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default async function ProjectScopePage({ params }: { params: Promise<{ id: string }> }) {
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

  const items = await db
    .select()
    .from(scopeItems)
    .where(and(eq(scopeItems.project_id, id), eq(scopeItems.tenant_id, userRow.tenant_id)))
    .orderBy(asc(scopeItems.sort_order), asc(scopeItems.description))

  const baseHref = `/projects/${id}`

  // Group by unit type for display
  const equipment = items.filter((i) => i.unit === 'unit' || i.unit === 'set')
  const areas = items.filter((i) => i.unit === 'sqm' || i.unit === 'lm')
  const annotations = items.filter((i) => !['unit', 'set', 'sqm', 'lm'].includes(i.unit))

  const totalLineCents = items.reduce((sum, i) => sum + i.line_total_cents, 0)

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <Link href="/projects" style={{ color: 'var(--color-neutral-400)', fontSize: '0.875rem', textDecoration: 'none' }}>
          Projects
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <Link href={baseHref} style={{ color: 'var(--color-neutral-400)', fontSize: '0.875rem', textDecoration: 'none' }}>
          {project.name}
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>Scope</span>
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)', marginTop: '16px' }}>
        {TABS.map(({ label, href }) => {
          const fullHref = baseHref + href
          const isActive = href === '/scope'
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

      {/* Summary bar */}
      <div
        style={{
          display: 'flex',
          gap: '24px',
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          padding: '16px 20px',
          marginBottom: '20px',
          alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
            Scope Items
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
            {items.length}
          </div>
        </div>
        <div style={{ width: 1, height: 40, background: 'var(--color-border)' }} />
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
            Equipment
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
            {equipment.length}
          </div>
        </div>
        <div style={{ width: 1, height: 40, background: 'var(--color-border)' }} />
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
            Areas
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
            {areas.length}
          </div>
        </div>
        <div style={{ width: 1, height: 40, background: 'var(--color-border)' }} />
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-neutral-400)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>
            Est. Cost
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
            {totalLineCents > 0 ? formatPHP(totalLineCents) : '—'}
          </div>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <Link
            href={`/projects/${id}/bom`}
            style={{
              display: 'inline-block',
              padding: '8px 16px',
              background: 'var(--color-navy-700)',
              color: 'white',
              borderRadius: '6px',
              fontSize: '0.875rem',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            View BOM →
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: '0.875rem', color: 'var(--color-neutral-500)', margin: '0 0 8px 0' }}>
            No scope items yet.
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-400)', margin: 0 }}>
            Upload a DXF drawing in the{' '}
            <Link href={`/projects/${id}/documents`} style={{ color: 'var(--color-navy-700)' }}>
              Documents tab
            </Link>{' '}
            to auto-extract scope items.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {[
            { label: 'Equipment & Units', rows: equipment },
            { label: 'Areas & Lengths', rows: areas },
            { label: 'Annotations', rows: annotations },
          ]
            .filter(({ rows }) => rows.length > 0)
            .map(({ label, rows }) => (
              <div key={label}>
                <h3
                  style={{
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    color: 'var(--color-neutral-500)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    margin: '0 0 8px 0',
                  }}
                >
                  {label}
                </h3>
                <div
                  style={{
                    background: 'white',
                    border: '1px solid var(--color-border)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                      <tr style={{ background: 'var(--color-neutral-50)', borderBottom: '1px solid var(--color-border)' }}>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.8125rem' }}>
                          Code
                        </th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.8125rem' }}>
                          Description
                        </th>
                        <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.8125rem' }}>
                          Qty
                        </th>
                        <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.8125rem' }}>
                          Unit
                        </th>
                        <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.8125rem' }}>
                          Unit Cost
                        </th>
                        <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--color-neutral-600)', fontSize: '0.8125rem' }}>
                          Line Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((item, idx) => (
                        <tr
                          key={item.id}
                          style={{
                            borderBottom: idx < rows.length - 1 ? '1px solid var(--color-border)' : 'none',
                          }}
                        >
                          <td style={{ padding: '10px 16px', color: 'var(--color-neutral-500)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8125rem' }}>
                            {item.code ?? '—'}
                          </td>
                          <td style={{ padding: '10px 16px', color: 'var(--color-neutral-800)', fontWeight: 500 }}>
                            {item.description}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--color-neutral-900)', fontFamily: 'JetBrains Mono, monospace' }}>
                            {item.quantity.toLocaleString()}
                          </td>
                          <td style={{ padding: '10px 16px', color: 'var(--color-neutral-500)' }}>
                            {UNIT_LABELS[item.unit] ?? item.unit}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--color-neutral-700)', fontFamily: 'JetBrains Mono, monospace' }}>
                            {item.unit_cost_cents > 0 ? formatPHP(item.unit_cost_cents) : '—'}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--color-neutral-900)', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                            {item.line_total_cents > 0 ? formatPHP(item.line_total_cents) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
