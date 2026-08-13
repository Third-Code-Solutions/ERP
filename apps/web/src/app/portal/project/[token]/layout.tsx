/**
 * Customer-portal project layout (REFACTOR.md Phase 10 — US-CP-001).
 *
 * Nested inside the public /portal layout (which already noindexes the
 * subtree). Server component: validates the token via
 * `findActiveCustomerSession`, fetches the project + account for the
 * header, and renders an expired/revoked dead end if the session is no
 * longer active. The sub-nav and `{children}` only render on a live
 * session.
 *
 * Tenant identity is read from the session row — never the URL.
 */

import type { Metadata } from 'next'
import { db } from '@third-code-erp/database'
import { projects, accounts } from '@third-code-erp/database/schema'
import { and, eq } from 'drizzle-orm'
import { findActiveCustomerSession } from '@/lib/operations/customer-portal'
import { PortalHeader } from '@/components/customer-portal/portal-header'
import { PortalSubNav } from '@/components/customer-portal/portal-sub-nav'

export const metadata: Metadata = {
  title: 'Live project · ABI OPS',
  robots: { index: false, follow: false },
}

// Per-token URL — never prerender.
export const dynamic = 'force-dynamic'

interface LayoutProps {
  children: React.ReactNode
  params: Promise<{ token: string }>
}

export default async function PortalProjectLayout({
  children,
  params,
}: LayoutProps) {
  const { token } = await params
  const session = await findActiveCustomerSession(token)

  if (!session) {
    return (
      <section
        style={{
          maxWidth: 960,
          margin: '0 auto',
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 12,
          padding: '40px 32px',
          textAlign: 'center',
          boxShadow: '0 1px 2px rgba(15, 45, 74, 0.04)',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#9aa1ad',
            fontWeight: 600,
          }}
        >
          Link no longer active
        </p>
        <h1
          style={{
            margin: '12px 0 8px',
            fontSize: 24,
            color: '#0F2D4A',
            fontWeight: 600,
          }}
        >
          This link is no longer active
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 14,
            color: '#525866',
            lineHeight: 1.6,
          }}
        >
          For a fresh link, please contact your project team. They can mint a
          new portal token at any time.
        </p>
      </section>
    )
  }

  // Pull project + account for the header. Scoped via tenant_id from the
  // session row to keep the public surface tenant-safe.
  const [row] = await db
    .select({
      project_id: projects.id,
      project_name: projects.name,
      project_status: projects.status,
      account_name: accounts.name,
    })
    .from(projects)
    .leftJoin(
      accounts,
      and(
        eq(accounts.id, projects.account_id),
        eq(accounts.tenant_id, session.tenant_id)
      )
    )
    .where(
      and(
        eq(projects.id, session.project_id),
        eq(projects.tenant_id, session.tenant_id)
      )
    )
    .limit(1)

  // Defence in depth — session must point at a project in its own tenant.
  if (!row) {
    return (
      <section
        style={{
          maxWidth: 960,
          margin: '0 auto',
          background: 'white',
          border: '1px solid #d8dde6',
          borderRadius: 12,
          padding: '40px 32px',
          textAlign: 'center',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, color: '#0F2D4A' }}>
          Project unavailable
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: 14, color: '#525866' }}>
          This project record can&apos;t be loaded. Please contact your project team.
        </p>
      </section>
    )
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <PortalHeader
        projectName={row.project_name}
        status={row.project_status}
        accountName={row.account_name}
        viewerEmail={session.viewer_email}
      />
      <PortalSubNav token={token} />
      {children}
    </div>
  )
}
