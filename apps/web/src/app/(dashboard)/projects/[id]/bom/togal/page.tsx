import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { and, desc, eq } from 'drizzle-orm'
import { requireUserProfile } from '@third-code-erp/auth'
import { db } from '@third-code-erp/database'
import { boms, projects } from '@third-code-erp/database/schema'
import { TakeoffImportWizard } from '@/components/bom/takeoff-import-wizard'
import { getProjectDetailAccess } from '../../project-detail-access'

export const metadata: Metadata = { title: 'Takeoff import' }

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectBomTogalPage({ params }: PageProps) {
  const { id } = await requireUuidRouteParams(params)
  const profile = await requireUserProfile()
  const access = getProjectDetailAccess(profile.role)
  if (!access.bom) return notFound()
  const tenantId = profile.tenantId

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
        <span style={{ color: 'var(--color-neutral-700)' }}>Takeoff import</span>
      </div>

      <header className="page-header">
        <p className="page-eyebrow">Bill of Materials</p>
        <h1 className="page-title">Structured takeoff import</h1>
        <p className="page-subtitle">
          Upload a CSV or XLSX from Togal, a spreadsheet, or another takeoff
          producer. Map its columns, preview the validation result, and retain
          every unresolved row for review.
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
        <TakeoffImportWizard
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
