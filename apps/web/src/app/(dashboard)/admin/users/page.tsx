import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { and, desc, eq } from 'drizzle-orm'
import { requireUserProfile, can } from '@buildops/auth'
import { db } from '@buildops/database'
import { users as usersTable } from '@buildops/database/schema'

export const metadata: Metadata = { title: 'Users' }

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
  sales: 'stage-badge stage-scoping',
  commercial: 'stage-badge stage-negotiation',
  design: 'stage-badge stage-bom_submission',
  sd_pm_pe: 'stage-badge stage-scoping',
  finance: 'stage-badge stage-resubmission',
  procurement: 'stage-badge stage-resubmission',
  safety: 'stage-badge stage-negotiation',
  cx: 'stage-badge stage-scoping',
  viewer: 'stage-badge stage-opportunity_creation',
}

export default async function UsersListPage() {
  const profile = await requireUserProfile()
  if (!can(profile.role, 'admin.users')) {
    redirect('/admin?error=forbidden')
  }

  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      full_name: usersTable.full_name,
      role: usersTable.role,
      created_at: usersTable.created_at,
    })
    .from(usersTable)
    .where(eq(usersTable.tenant_id, profile.tenantId))
    .orderBy(desc(usersTable.created_at))

  return (
    <div>
      <div className="page-header">
        <div className="page-toolbar">
          <div>
            <p className="page-eyebrow">
              <Link href="/admin" style={{ color: 'inherit', textDecoration: 'none' }}>
                Administration ·
              </Link>{' '}
              Users
            </p>
            <h1 className="page-title">Users</h1>
            <p className="page-subtitle">
              Create workspace accounts, assign roles, and manage seats.
              All changes are audit-logged.
            </p>
          </div>
          <Link
            href="/admin/users/new"
            className="user-chip"
            style={{
              background: 'var(--color-navy-700)',
              borderColor: 'var(--color-navy-700)',
              color: 'white',
            }}
          >
            <span style={{ fontWeight: 600 }}>+ New user</span>
          </Link>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">{rows.length} user{rows.length === 1 ? '' : 's'}</h2>
        </div>
        {rows.length === 0 ? (
          <div className="card-empty">
            No users yet. Create the first one to get started.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Email</th>
                <th scope="col">Role</th>
                <th scope="col">Created</th>
                <th scope="col"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link
                      href={`/admin/users/${r.id}`}
                      className="row-leader"
                      style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                      <div className="avatar-pill">
                        {r.full_name
                          .split(/\s+/)
                          .map((p) => p[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <strong style={{ fontWeight: 500 }}>
                        {r.full_name}
                        {r.id === profile.user.id && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 11,
                              color: 'var(--color-neutral-500)',
                              fontWeight: 400,
                            }}
                          >
                            (you)
                          </span>
                        )}
                      </strong>
                    </Link>
                  </td>
                  <td className="muted">{r.email}</td>
                  <td>
                    <span className={ROLE_TONE[r.role] ?? 'stage-badge'}>
                      <span className="stage-badge-dot" />
                      {ROLE_LABEL[r.role] ?? r.role}
                    </span>
                  </td>
                  <td className="muted">
                    {new Date(r.created_at).toLocaleDateString('en-PH', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                  <td>
                    <Link
                      href={`/admin/users/${r.id}`}
                      style={{
                        color: 'var(--color-navy-700)',
                        fontSize: 12.5,
                        fontWeight: 500,
                      }}
                    >
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
