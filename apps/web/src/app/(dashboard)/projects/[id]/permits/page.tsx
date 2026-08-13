import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, asc, desc, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { mobilizationReadiness, permits, projects, users } from '@third-code-erp/database/schema'
import { CreatePermitForm } from '@/components/permits/create-permit-form'
import { UpdatePermitStatus } from '@/components/permits/update-permit-status'
import { MobilizationReadinessPanel } from './mobilization-readiness-panel'

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
  occupancy_permit: 'Occupancy Permit',
  cari: 'CARI',
  performance_bond: 'Performance Bond',
  surety_bond: 'Surety Bond',
  construction_bond: 'Construction Bond',
}

type PermitStatus =
  | 'not_started'
  | 'submitted'
  | 'additional_docs_required'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'released'
  | 'refunded'
  | 'cancelled'

const STATUS_LABEL: Record<PermitStatus, string> = {
  not_started: 'Not started',
  submitted: 'Submitted',
  additional_docs_required: 'Additional docs required',
  under_review: 'Under review',
  approved: 'Approved',
  rejected: 'Rejected',
  released: 'Released',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
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
      expected_return_at: permits.expected_return_at,
      approved_at: permits.approved_at,
      max_duration_days: permits.max_duration_days,
      escalation_at: permits.escalation_at,
      escalated_at: permits.escalated_at,
      responsible_name: users.full_name,
      last_status_change_at: permits.last_status_change_at,
      notes: permits.notes,
    })
    .from(permits)
    .leftJoin(users, and(eq(users.id, permits.responsible_user_id), eq(users.tenant_id, profile.tenantId)))
    .where(and(eq(permits.project_id, id), eq(permits.tenant_id, profile.tenantId)))
    .orderBy(desc(permits.last_status_change_at))

  const workspaceUsers = await db
    .select({ id: users.id, fullName: users.full_name, role: users.role })
    .from(users)
    .where(eq(users.tenant_id, profile.tenantId))
    .orderBy(asc(users.full_name))

  const [readiness] = await db
    .select({
      commentedFcdReceivedAt: mobilizationReadiness.commented_fcd_received_at,
      poCopiesReceivedAt: mobilizationReadiness.po_copies_received_at,
      cariReceivedAt: mobilizationReadiness.cari_received_at,
      ntpReceivedAt: mobilizationReadiness.ntp_received_at,
      startedAt: mobilizationReadiness.started_at,
      overrideReason: mobilizationReadiness.override_reason,
    })
    .from(mobilizationReadiness)
    .where(and(eq(mobilizationReadiness.project_id, id), eq(mobilizationReadiness.tenant_id, profile.tenantId)))
    .limit(1)

  const riskForPermit = (permitType: string): number | null => {
    const permit = rows.find((row) => row.permit_type === permitType)
    if (!permit) return null
    const expected = permit.expected_return_at ?? permit.expected_approval_at
    if (!expected) return null
    return Math.max(0, Math.ceil((Date.now() - new Date(expected).getTime()) / 86_400_000))
  }

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
            External permits, bonds, insurance, and return dates for this project.
          </p>
        </div>
      </div>

      <MobilizationReadinessPanel
        projectId={id}
        readiness={
          readiness
            ? {
                commentedFcdReceivedAt: readiness.commentedFcdReceivedAt?.toISOString() ?? null,
                poCopiesReceivedAt: readiness.poCopiesReceivedAt?.toISOString() ?? null,
                cariReceivedAt: readiness.cariReceivedAt?.toISOString() ?? null,
                ntpReceivedAt: readiness.ntpReceivedAt?.toISOString() ?? null,
                startedAt: readiness.startedAt?.toISOString() ?? null,
                overrideReason: readiness.overrideReason,
              }
            : null
        }
        riskByInput={{
          commented_fcd_received_at: null,
          po_copies_received_at: null,
          cari_received_at: riskForPermit('cari'),
          ntp_received_at: riskForPermit('building_admin_vetting'),
        }}
      />

      <CreatePermitForm projectId={id} users={workspaceUsers} />

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
          <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ minWidth: '900px', width: '100%' }}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Responsible</th>
                <th>Submitted</th>
                <th>Expected return</th>
                <th>Days at risk</th>
                <th>Last update</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const daysSinceUpdate = Math.floor(
                  (Date.now() - new Date(p.last_status_change_at).getTime()) / 86_400_000
                )
                const isStale = daysSinceUpdate > 7 && !['approved', 'rejected', 'released', 'refunded', 'cancelled'].includes(p.status)
                const expectedReturn = p.expected_return_at ?? p.expected_approval_at
                const daysAtRisk = expectedReturn
                  ? Math.max(0, Math.ceil((Date.now() - new Date(expectedReturn).getTime()) / 86_400_000))
                  : null
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{TYPE_LABEL[p.permit_type] ?? p.permit_type}</td>
                    <td>
                      <UpdatePermitStatus
                        permitId={p.id}
                        currentStatus={p.status as PermitStatus}
                        isLate={daysAtRisk !== null && daysAtRisk > 0}
                      />
                      <span className="sr-only">{STATUS_LABEL[p.status as PermitStatus] ?? p.status}</span>
                    </td>
                    <td className="muted">{p.responsible_name ?? 'Unassigned'}</td>
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
                      {expectedReturn
                        ? new Date(expectedReturn).toLocaleDateString('en-PH', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                          })
                        : '—'}
                    </td>
                    <td
                      style={{
                        color: daysAtRisk !== null && daysAtRisk > 0 ? 'var(--color-danger, #ef4444)' : 'var(--color-neutral-500)',
                        fontWeight: daysAtRisk !== null && daysAtRisk > 0 ? 600 : 400,
                      }}
                    >
                      {daysAtRisk === null ? 'No forecast' : daysAtRisk > 0 ? `${daysAtRisk}d overdue` : '0d'}
                      {p.escalated_at ? ' · escalated' : ''}
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
          </div>
        )}
      </div>
    </div>
  )
}
