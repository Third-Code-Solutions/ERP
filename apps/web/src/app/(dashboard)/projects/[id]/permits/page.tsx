import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { permits, projects } from '@third-code-erp/database/schema'
import { CreatePermitForm } from '@/components/permits/create-permit-form'
import { UpdatePermitStatus } from '@/components/permits/update-permit-status'

export const metadata: Metadata = { title: 'Permits' }

const TABS = [
  { label: 'Overview', href: '' },
  { label: 'Scope', href: '/scope' },
  { label: 'BOM', href: '/bom' },
  { label: 'Documents', href: '/documents' },
  { label: 'Billing', href: '/billing' },
  { label: 'Checklist', href: '/checklist' },
  { label: 'Permits', href: '/permits' },
  { label: 'Comments', href: '/comments' },
  { label: 'Audit', href: '/audit' },
]

const TYPE_LABEL: Record<string, string> = {
  building_admin_vetting: 'Building Admin Vetting',
  lgu_building_permit: 'LGU Building Permit',
  dole_permit: 'DOLE Permit',
}

type PermitStatus =
  | 'not_started'
  | 'submitted'
  | 'additional_docs_required'
  | 'under_review'
  | 'approved'
  | 'rejected'

const STATUS_LABEL: Record<PermitStatus, string> = {
  not_started: 'Not started',
  submitted: 'Submitted',
  additional_docs_required: 'Additional docs required',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
}

export default async function ProjectPermitsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireUserProfile()

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)
  if (!project) return notFound()

  const rows = await db
    .select({
      id: permits.id,
      permit_type: permits.permit_type,
      status: permits.status,
      submitted_at: permits.submitted_at,
      expected_approval_at: permits.expected_approval_at,
      approved_at: permits.approved_at,
      last_status_change_at: permits.last_status_change_at,
      notes: permits.notes,
    })
    .from(permits)
    .where(and(eq(permits.project_id, id), eq(permits.tenant_id, profile.tenantId)))
    .orderBy(desc(permits.last_status_change_at))

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
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>Permits</span>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '2px',
          marginBottom: '24px',
          borderBottom: '1px solid var(--color-border)',
          marginTop: '16px',
          overflowX: 'auto',
        }}
      >
        {TABS.map(({ label, href }) => {
          const fullHref = baseHref + href
          const isActive = href === '/permits'
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
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {/* Header + create */}
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-neutral-900)' }}>
            Permits
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: 'var(--color-neutral-500)' }}>
            Building Admin Vetting, LGU Building Permit, and DOLE permits for this project.
          </p>
        </div>
      </div>

      <CreatePermitForm projectId={id} />

      <div
        style={{
          background: 'white',
          border: '1px solid var(--color-border)',
          borderRadius: '8px',
          overflow: 'hidden',
        }}
      >
        {rows.length === 0 ? (
          <div
            style={{
              padding: '32px',
              textAlign: 'center',
              color: 'var(--color-neutral-500)',
              fontSize: '0.875rem',
            }}
          >
            No permits filed for this project yet.
          </div>
        ) : (
          <table className="data-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Expected</th>
                <th>Last update</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const daysSinceUpdate = Math.floor(
                  (Date.now() - new Date(p.last_status_change_at).getTime()) / 86_400_000
                )
                const isStale = daysSinceUpdate > 7 && !['approved', 'rejected'].includes(p.status)
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{TYPE_LABEL[p.permit_type] ?? p.permit_type}</td>
                    <td>
                      <UpdatePermitStatus
                        permitId={p.id}
                        currentStatus={p.status as PermitStatus}
                      />
                      <span className="sr-only">{STATUS_LABEL[p.status as PermitStatus] ?? p.status}</span>
                    </td>
                    <td className="muted">
                      {p.submitted_at
                        ? new Date(p.submitted_at).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td className="muted">
                      {p.expected_approval_at
                        ? new Date(p.expected_approval_at).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td
                      style={
                        isStale
                          ? { color: 'var(--color-warning, #f59e0b)', fontWeight: 500 }
                          : { color: 'var(--color-neutral-500)' }
                      }
                    >
                      {daysSinceUpdate}d {isStale && '⚠'}
                    </td>
                    <td style={{ color: 'var(--color-neutral-600)', maxWidth: '280px' }}>
                      {p.notes ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
