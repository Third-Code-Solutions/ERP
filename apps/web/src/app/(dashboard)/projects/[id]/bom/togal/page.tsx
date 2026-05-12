import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { boms, projects, users } from '@buildops/database/schema'
import { TogalImportWizard } from '@/components/bom/togal-import-wizard'

export const metadata: Metadata = { title: 'Togal.ai import' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectBomTogalPage({ params }: PageProps) {
  const { id } = await params
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db
    .select({ tenant_id: users.tenant_id })
    .from(users)
    .where(eq(users.id, user.id))
  if (!userRow?.tenant_id) return notFound()
  const tenantId = userRow.tenant_id

  const [project] = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.tenant_id, tenantId)))
  if (!project) return notFound()

  // Latest BOM. US-010 expects a Pending Review draft within 30s of upload,
  // so we target the most recent non-locked BOM as the commit destination.
  const [latestBom] = await db
    .select({
      id: boms.id,
      label: boms.label,
      version: boms.version,
      status: boms.status,
    })
    .from(boms)
    .where(and(eq(boms.project_id, id), eq(boms.tenant_id, tenantId)))
    .orderBy(desc(boms.version))
    .limit(1)

  return (
    <div>
      <div
        style={{
          fontSize: '0.8125rem',
          color: 'var(--color-neutral-400)',
          marginBottom: 8,
        }}
      >
        <Link
          href="/projects"
          style={{ color: 'var(--color-neutral-400)', textDecoration: 'none' }}
        >
          Projects
        </Link>
        {' / '}
        <Link
          href={`/projects/${id}`}
          style={{ color: 'var(--color-neutral-400)', textDecoration: 'none' }}
        >
          {project.name}
        </Link>
        {' / '}
        <Link
          href={`/projects/${id}/bom`}
          style={{ color: 'var(--color-neutral-400)', textDecoration: 'none' }}
        >
          BOM
        </Link>
        {' / '}
        <span style={{ color: 'var(--color-neutral-700)' }}>Togal import</span>
      </div>

      <header className="page-header">
        <p className="page-eyebrow">Bill of Materials</p>
        <h1 className="page-title">Togal.ai import</h1>
        <p className="page-subtitle">
          Upload a Togal.ai takeoff export to append mapped line items to the
          draft BOM. Unmapped items are flagged for review and skipped on
          commit.
        </p>
      </header>

      {!latestBom ? (
        <section className="card">
          <div className="card-empty">
            This project does not have a BOM yet. Create one from the{' '}
            <Link
              href={`/projects/${id}/bom`}
              style={{ color: 'var(--color-primary)' }}
            >
              BOM tab
            </Link>{' '}
            before importing.
          </div>
        </section>
      ) : (
        <TogalImportWizard
          projectId={id}
          bomId={latestBom.id}
          bomLabel={latestBom.label ?? `BOM v${latestBom.version}`}
          bomStatus={
            latestBom.status as 'draft' | 'approved' | 'locked' | 'archived'
          }
        />
      )}
    </div>
  )
}
