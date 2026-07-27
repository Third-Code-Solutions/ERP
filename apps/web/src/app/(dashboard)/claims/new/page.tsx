import Link from 'next/link'
import type { Metadata } from 'next'
import { asc, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { projects } from '@third-code-erp/database/schema'
import { ClaimForm } from '@/components/claims/claim-form'

export const metadata: Metadata = { title: 'New progress claim' }

interface SearchParams {
  project?: string
}

export default async function NewClaimPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const profile = await requireUserProfile()
  const { project: defaultProjectId } = await searchParams

  // Active projects are the natural source of progress claims. We do
  // include 'on_hold' so a claim can still be raised when work resumes
  // and exclude only 'lead' / 'completed' / 'cancelled' so the picker
  // doesn't surface noise.
  const projectRows = await db
    .select({ id: projects.id, name: projects.name, status: projects.status })
    .from(projects)
    .where(eq(projects.tenant_id, profile.tenantId))
    .orderBy(asc(projects.name))

  const eligibleProjects = projectRows
    .filter((p) => p.status === 'active' || p.status === 'on_hold')
    .map((p) => ({ id: p.id, name: p.name }))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <Link
          href="/claims"
          style={{
            color: 'var(--color-neutral-400)',
            fontSize: '0.875rem',
            textDecoration: 'none',
          }}
        >
          Progress claims
        </Link>
        <span style={{ color: 'var(--color-neutral-300)' }}>/</span>
        <span style={{ fontSize: '0.875rem', color: 'var(--color-neutral-600)' }}>New</span>
      </div>
      <div className="page-header">
        <p className="page-eyebrow">Execution</p>
        <h1 className="page-title">New progress claim</h1>
        <p className="page-subtitle">
          Capture the milestone, scope, and amount. Save as draft — submission
          to certification happens on the claim detail screen.
        </p>
      </div>

      {eligibleProjects.length === 0 ? (
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: 8,
            padding: 24,
            maxWidth: 720,
          }}
        >
          <p style={{ margin: 0, color: 'var(--color-neutral-600)', fontSize: '0.875rem' }}>
            No active projects available. Activate a project before raising a claim.
          </p>
        </div>
      ) : (
        <ClaimForm projects={eligibleProjects} defaultProjectId={defaultProjectId} />
      )}
    </div>
  )
}
