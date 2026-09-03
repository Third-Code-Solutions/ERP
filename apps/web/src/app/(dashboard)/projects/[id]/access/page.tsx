import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, desc, eq } from 'drizzle-orm'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import {
  customerPortalSessions,
  projects,
  accounts,
} from '@third-code-erp/database/schema'
import { MintTokenButton } from '@/components/customer-portal/mint-token-button'
import {
  AccessListTable,
  type AccessRow,
} from '@/components/customer-portal/access-list-table'
import { getProjectDetailAccess } from '../project-detail-access'

export const metadata: Metadata = { title: 'Client access' }

export default async function ProjectAccessPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const profile = await requireUserProfile()
  const access = getProjectDetailAccess(profile.role)
  if (!access.access) return notFound()
  const canManage = can(profile.role, 'admin.users')

  // Verify the project exists in this tenant.
  const [project] = await db
    .select({
      id: projects.id,
      name: projects.name,
      account_name: accounts.name,
    })
    .from(projects)
    .leftJoin(
      accounts,
      and(
        eq(projects.account_id, accounts.id),
        eq(accounts.tenant_id, profile.tenantId),
      ),
    )
    .where(and(eq(projects.id, id), eq(projects.tenant_id, profile.tenantId)))
    .limit(1)
  if (!project) return notFound()

  // Load all sessions for this project, newest first.
  const sessionRows = await db
    .select({
      id: customerPortalSessions.id,
      viewer_email: customerPortalSessions.viewer_email,
      viewer_name: customerPortalSessions.viewer_name,
      expires_at: customerPortalSessions.expires_at,
      revoked_at: customerPortalSessions.revoked_at,
      last_viewed_at: customerPortalSessions.last_viewed_at,
      view_count: customerPortalSessions.view_count,
      created_at: customerPortalSessions.created_at,
    })
    .from(customerPortalSessions)
    .where(
      and(
        eq(customerPortalSessions.project_id, project.id),
        eq(customerPortalSessions.tenant_id, profile.tenantId)
      )
    )
    .orderBy(desc(customerPortalSessions.created_at))

  const rows: AccessRow[] = sessionRows.map((r) => ({
    id: r.id,
    viewer_email: r.viewer_email,
    viewer_name: r.viewer_name,
    expires_at: (r.expires_at instanceof Date ? r.expires_at : new Date(r.expires_at)).toISOString(),
    revoked_at: r.revoked_at
      ? (r.revoked_at instanceof Date ? r.revoked_at : new Date(r.revoked_at)).toISOString()
      : null,
    last_viewed_at: r.last_viewed_at
      ? (r.last_viewed_at instanceof Date ? r.last_viewed_at : new Date(r.last_viewed_at)).toISOString()
      : null,
    view_count: r.view_count,
    created_at: (r.created_at instanceof Date ? r.created_at : new Date(r.created_at)).toISOString(),
  }))

  const activeCount = rows.filter(
    (r) => !r.revoked_at && new Date(r.expires_at).getTime() >= Date.now()
  ).length

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Link href="/projects" style={{ color: 'var(--color-neutral-400)', fontSize: 14, textDecoration: 'none' }}>
          Projects
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <Link
          href={`/projects/${project.id}`}
          style={{ color: 'var(--color-neutral-400)', fontSize: 14, textDecoration: 'none' }}
        >
          {project.name}
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: 14, color: 'var(--color-neutral-600)' }}>Access</span>
      </div>

      {/* Page header */}
      <div style={{ margin: '20px 0 18px' }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--color-navy-700)' }}>
          Client portal access
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: 13.5, color: 'var(--color-neutral-600)', lineHeight: 1.5 }}>
          Mint long-lived read-only links so your client can view live project status — progress, documents,
          photos, and billing — without a workspace login. {activeCount} active link{activeCount === 1 ? '' : 's'} currently.
        </p>
      </div>

      {canManage && <MintTokenButton projectId={project.id} />}

      <div style={{ marginTop: 20 }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--color-navy-700)' }}>
          Active client links
        </h2>
        <AccessListTable rows={rows} canManage={canManage} />
      </div>
    </div>
  )
}
