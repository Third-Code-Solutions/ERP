import Link from 'next/link'
import type { Metadata } from 'next'
import { asc, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { projects, users as usersTable } from '@third-code-erp/database/schema'
import { PunchlistForm } from '@/components/punchlist/punchlist-form'

export const metadata: Metadata = { title: 'New punchlist item' }

interface SearchParams {
  project?: string
}

export default async function NewPunchlistItemPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const profile = await requireUserProfile()
  const { project: defaultProjectId } = await searchParams

  // Active + lead + on_hold projects are the realistic punchlist sources.
  // Completed projects can still have residual punchlist work so we
  // include them too — only 'cancelled' is filtered out.
  const projectRows = await db
    .select({ id: projects.id, name: projects.name, status: projects.status })
    .from(projects)
    .where(eq(projects.tenant_id, profile.tenantId))
    .orderBy(asc(projects.name))

  const eligibleProjects = projectRows
    .filter((p) => p.status !== 'cancelled')
    .map((p) => ({ id: p.id, name: p.name }))

  const userRows = await db
    .select({
      id: usersTable.id,
      full_name: usersTable.full_name,
      email: usersTable.email,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(eq(usersTable.tenant_id, profile.tenantId))
    .orderBy(asc(usersTable.full_name))

  // Only roles that actually do field work get the assignment dropdown to
  // stay short. Anyone outside that set can be entered as free-text
  // "external party".
  const FIELD_ROLES = ['sd_pm_pe', 'pm', 'safety', 'commercial', 'admin', 'owner']
  const fieldUsers = userRows.filter((u) => FIELD_ROLES.includes(u.role as string))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Link
          href="/punchlist"
          style={{
            color: 'var(--color-neutral-400)',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          Punchlist
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>New</span>
      </div>
      <div className="page-header">
        <p className="page-eyebrow">Post-Construction</p>
        <h1 className="page-title">New punchlist item</h1>
        <p className="page-subtitle">
          Log a defect with location and trade. SLA tracking starts at create — the assignee gets a heads-up immediately.
        </p>
      </div>

      <PunchlistForm
        projects={eligibleProjects}
        users={fieldUsers}
        defaultProjectId={defaultProjectId}
      />
    </div>
  )
}
