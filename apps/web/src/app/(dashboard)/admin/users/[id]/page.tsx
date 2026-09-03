import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { and, desc, eq } from 'drizzle-orm'
import { requireUserProfile, can } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { users as usersTable, auditLog } from '@third-code-erp/database/schema'
import { ManageUserPanel } from '@/components/admin/manage-user-panel'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams: Promise<{ created?: string }>
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin',
  owner: 'Owner',
  sales: 'Sales',
  commercial: 'Commercial',
  design: 'Design',
  sd_pm_pe: 'SD / PM / PE',
  finance: 'Finance',
  procurement: 'Procurement',
  safety: 'Safety',
  cx: 'Customer Experience',
  viewer: 'Viewer',
  estimator: 'Estimator (legacy)',
  pm: 'PM (legacy)',
}

const ROLE_TONE: Record<string, string> = {
  admin: 'stage-badge stage-closed_won',
  owner: 'stage-badge stage-closed_won',
  viewer: 'stage-badge stage-opportunity_creation',
}

export default async function UserDetailPage({ params, searchParams }: PageProps) {
  const { id } = await requireUuidRouteParams(params)
  const { created } = await searchParams

  const profile = await requireUserProfile()
  if (!can(profile.role, 'admin.users.read')) {
    redirect('/admin?error=forbidden')
  }
  const canManage = can(profile.role, 'admin.users')

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, id), eq(usersTable.tenant_id, profile.tenantId)))
    .limit(1)

  if (!user) notFound()

  // Audit fetch is best-effort — if it throws (FK trouble, weird diff
  // column, anything), we still render the rest of the page.
  let audit: Array<{
    id: string
    action: string
    diff: unknown
    created_at: Date
    actor_id: string | null
  }> = []
  try {
    const raw = await db
      .select({
        id: auditLog.id,
        action: auditLog.action,
        diff: auditLog.diff,
        created_at: auditLog.created_at,
        actor_id: auditLog.actor_id,
      })
      .from(auditLog)
      .where(
        and(eq(auditLog.tenant_id, profile.tenantId), eq(auditLog.entity_id, id))
      )
      .orderBy(desc(auditLog.created_at))
      .limit(20)
    audit = raw.map((r) => ({
      id: String(r.id), // bigserial → string-safe key for React
      action: r.action,
      diff: r.diff,
      created_at: r.created_at instanceof Date ? r.created_at : new Date(r.created_at as unknown as string),
      actor_id: r.actor_id,
    }))
  } catch (err) {

    console.warn('[admin/users/[id]] audit fetch failed (non-fatal):', err)
  }

  const isSelf = user.id === profile.user.id
  const initials =
    (user.full_name ?? '')
      .split(/\s+/)
      .map((p) => p[0])
      .filter(Boolean)
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U'

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href="/admin/users" style={{ color: 'inherit', textDecoration: 'none' }}>
            Administration · Users
          </Link>
        </p>
        <div className="page-toolbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              className="avatar-pill"
              style={{ width: 44, height: 44, fontSize: 16 }}
            >
              {initials}
            </div>
            <div>
              <h1 className="page-title" style={{ marginBottom: 2 }}>
                {user.full_name}{' '}
                {isSelf && (
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--color-neutral-500)',
                      verticalAlign: 'middle',
                    }}
                  >
                    (you)
                  </span>
                )}
              </h1>
              <p
                style={{
                  color: 'var(--color-neutral-500)',
                  fontSize: 13.5,
                  margin: 0,
                }}
              >
                {user.email} ·{' '}
                <span className={ROLE_TONE[user.role] ?? 'stage-badge'}>
                  <span className="stage-badge-dot" />
                  {ROLE_LABEL[user.role] ?? user.role}
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {canManage && created === '1' && (
        <div
          role="status"
          aria-live="polite"
          style={{
            background: 'var(--color-success-soft)',
            border:
              '1px solid color-mix(in oklch, var(--color-success) 22%, transparent)',
            color: 'var(--color-success)',
            padding: '12px 14px',
            borderRadius: 'var(--radius-md, 6px)',
            fontSize: 13.5,
            marginBottom: 16,
          }}
        >
          User created. Share the credentials securely — the initial password is only
          known to whoever set it.
        </div>
      )}

      <div className="section-grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Manage panel */}
          {canManage && <div className="card">
            <div className="card-header">
              <h2 className="card-title">Manage</h2>
            </div>
            <div style={{ padding: 16 }}>
              <ManageUserPanel
                userId={user.id}
                currentRole={user.role}
                email={user.email}
                isSelf={isSelf}
              />
            </div>
          </div>}

          {/* Audit trail */}
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Activity ({audit.length})</h2>
            </div>
            {audit.length === 0 ? (
              <div className="card-empty">No events yet.</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {audit.map((e) => (
                  <li
                    key={e.id}
                    style={{
                      padding: '10px 16px',
                      borderBottom: '1px solid var(--color-border)',
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <strong style={{ fontWeight: 500 }}>{e.action}</strong>
                      <span
                        style={{
                          color: 'var(--color-neutral-500)',
                          fontSize: 11.5,
                        }}
                      >
                        {new Date(e.created_at).toLocaleString('en-PH', {
                          timeZone: 'Asia/Manila',
                        })}
                      </span>
                    </div>
                    {canManage && e.diff !== null && (
                      <pre
                        style={{
                          margin: '6px 0 0',
                          padding: '6px 8px',
                          background: 'var(--color-neutral-50)',
                          borderRadius: 'var(--radius-sm, 4px)',
                          fontSize: 11.5,
                          fontFamily: 'var(--font-mono)',
                          color: 'var(--color-neutral-600)',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {safeStringify(e.diff)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Details</h2>
            </div>
            <div
              style={{
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                fontSize: 13,
              }}
            >
              <Meta label="User ID" value={user.id} mono />
              <Meta label="Email" value={user.email} />
              <Meta label="Full name" value={user.full_name} />
              <Meta label="Role" value={ROLE_LABEL[user.role] ?? user.role} />
              <Meta
                label="Created"
                value={new Date(user.created_at).toLocaleString('en-PH', {
                  timeZone: 'Asia/Manila',
                })}
              />
              <Meta
                label="Updated"
                value={new Date(user.updated_at).toLocaleString('en-PH', {
                  timeZone: 'Asia/Manila',
                })}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

// JSON.stringify can throw on circular refs or BigInt values. Use a
// defensive fallback so a rogue audit diff never crashes the page.
function safeStringify(value: unknown): string {
  if (value === null || value === undefined) return ''
  try {
    return JSON.stringify(
      value,
      (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
      2
    )
  } catch {
    return String(value)
  }
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ color: 'var(--color-neutral-500)', fontSize: 11.5 }}>
        {label}
      </span>
      <span
        style={{
          color: 'var(--color-neutral-900)',
          fontFamily: mono ? 'var(--font-mono)' : 'inherit',
          fontSize: mono ? 12 : 13,
          wordBreak: 'break-all',
        }}
      >
        {value}
      </span>
    </div>
  )
}
