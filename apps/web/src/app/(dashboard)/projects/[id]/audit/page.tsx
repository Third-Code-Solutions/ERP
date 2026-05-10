import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { auditLog, boms, invoices, projects, scopeItems, users } from '@buildops/database/schema'
import { and, desc, eq, inArray, or } from 'drizzle-orm'

export const metadata: Metadata = { title: 'Audit Trail' }

const TABS = [
  { label: 'Overview', href: '' },
  { label: 'Scope', href: '/scope' },
  { label: 'BOM', href: '/bom' },
  { label: 'Documents', href: '/documents' },
  { label: 'Billing', href: '/billing' },
  { label: 'Comments', href: '/comments' },
  { label: 'Audit', href: '/audit' },
]

const ACTION_LABELS: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  delete: 'Deleted',
  approve: 'Approved',
  lock: 'Locked',
  archive: 'Archived',
  stage_change: 'Stage Changed',
}

const ENTITY_LABELS: Record<string, string> = {
  project: 'Project',
  scope_item: 'Scope Item',
  bom: 'BOM',
  bom_line_item: 'BOM Line',
  invoice: 'Invoice',
  purchase_order: 'Purchase Order',
  opportunities: 'Opportunity',
}

function relativeTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default async function ProjectAuditPage({ params }: { params: Promise<{ id: string }> }) {
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

  // Gather entity IDs for this project
  const [scopeIds, bomIds, invoiceIds] = await Promise.all([
    db.select({ id: scopeItems.id }).from(scopeItems)
      .where(and(eq(scopeItems.project_id, id), eq(scopeItems.tenant_id, userRow.tenant_id))),
    db.select({ id: boms.id }).from(boms)
      .where(and(eq(boms.project_id, id), eq(boms.tenant_id, userRow.tenant_id))),
    db.select({ id: invoices.id }).from(invoices)
      .where(and(eq(invoices.project_id, id), eq(invoices.tenant_id, userRow.tenant_id))),
  ])

  const relatedIds = [
    id,
    ...scopeIds.map((r) => r.id),
    ...bomIds.map((r) => r.id),
    ...invoiceIds.map((r) => r.id),
  ]

  const entries = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.tenant_id, userRow.tenant_id), inArray(auditLog.entity_id, relatedIds)))
    .orderBy(desc(auditLog.created_at))
    .limit(200)

  const baseHref = `/projects/${id}`

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
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>Audit</span>
      </div>

      {/* Tab nav */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '24px', borderBottom: '1px solid var(--color-border)', marginTop: '16px' }}>
        {TABS.map(({ label, href }) => {
          const fullHref = baseHref + href
          const isActive = href === '/audit'
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

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-neutral-500)', margin: 0 }}>
            {entries.length} event{entries.length !== 1 ? 's' : ''} — append-only, hash-chained
          </p>
        </div>
      </div>

      {entries.length === 0 ? (
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--color-neutral-400)',
            fontSize: '0.875rem',
          }}
        >
          No audit events recorded yet.
        </div>
      ) : (
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
                {['When', 'Action', 'Entity', 'Changes', 'Hash'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 16px',
                      textAlign: 'left',
                      fontWeight: 600,
                      color: 'var(--color-neutral-600)',
                      fontSize: '0.8125rem',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <tr
                  key={entry.id}
                  style={{ borderBottom: idx < entries.length - 1 ? '1px solid var(--color-border)' : 'none' }}
                >
                  <td style={{ padding: '10px 16px', color: 'var(--color-neutral-500)', whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>
                    <span title={new Date(entry.created_at).toLocaleString('en-PH')}>
                      {relativeTime(new Date(entry.created_at))}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        background:
                          entry.action === 'delete' ? '#fee2e2' :
                          entry.action === 'create' ? '#dcfce7' :
                          entry.action === 'approve' || entry.action === 'lock' ? '#dbeafe' :
                          'var(--color-neutral-100)',
                        color:
                          entry.action === 'delete' ? '#dc2626' :
                          entry.action === 'create' ? '#166534' :
                          entry.action === 'approve' || entry.action === 'lock' ? '#1e40af' :
                          'var(--color-neutral-600)',
                      }}
                    >
                      {ACTION_LABELS[entry.action] ?? entry.action}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-neutral-700)', fontSize: '0.8125rem' }}>
                    {ENTITY_LABELS[entry.entity_type] ?? entry.entity_type}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-neutral-600)', fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace', maxWidth: '320px' }}>
                    {entry.diff
                      ? Object.entries(entry.diff as Record<string, unknown>)
                          .slice(0, 3)
                          .map(([k, v]) => {
                            if (typeof v === 'object' && v !== null && 'before' in v && 'after' in v) {
                              const diff = v as { before: unknown; after: unknown }
                              return `${k}: ${JSON.stringify(diff.before)} → ${JSON.stringify(diff.after)}`
                            }
                            return `${k}: ${JSON.stringify(v)}`
                          })
                          .join(' · ')
                      : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--color-neutral-300)', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                    {entry.hash.slice(0, 12)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
