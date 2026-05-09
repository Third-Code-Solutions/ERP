import type { Metadata } from 'next'
import Link from 'next/link'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { users } from '@buildops/database/schema'
import { eq } from 'drizzle-orm'
import { getProjects } from '@/lib/project-queries'

export const metadata: Metadata = { title: 'Projects' }

const STATUS_COLORS: Record<string, string> = {
  lead: 'var(--color-neutral-400)',
  active: 'var(--color-success)',
  on_hold: 'var(--color-warning)',
  completed: 'var(--color-info)',
  cancelled: 'var(--color-danger)',
}

const TYPE_LABELS: Record<string, string> = {
  mep: 'MEP',
  fit_out: 'Fit-out',
  interior: 'Interior',
  mixed: 'Mixed',
}

export default async function ProjectsPage() {
  const user = await getUser()
  if (!user) return null

  const [userRow] = await db.select({ tenant_id: users.tenant_id }).from(users).where(eq(users.id, user.id))
  const tenantId = userRow?.tenant_id

  if (!tenantId) {
    return (
      <div className="page-header">
        <h1 className="page-title">Projects</h1>
        <p className="page-subtitle">Tenant not configured.</p>
      </div>
    )
  }

  const projectList = await getProjects(tenantId)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">{projectList.length} project{projectList.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/projects/new"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            background: 'var(--color-navy-700)',
            color: 'white',
            borderRadius: '6px',
            textDecoration: 'none',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          + New Project
        </Link>
      </div>

      {projectList.length === 0 ? (
        <div
          style={{
            background: 'white',
            border: '1px solid var(--color-border)',
            borderRadius: '8px',
            padding: '64px 24px',
            textAlign: 'center',
            color: 'var(--color-neutral-400)',
          }}
        >
          <p style={{ fontSize: '1rem', marginBottom: '8px' }}>No projects yet</p>
          <p style={{ fontSize: '0.875rem' }}>
            <Link href="/projects/new" style={{ color: 'var(--color-navy-700)' }}>
              Create your first project
            </Link>{' '}
            to get started.
          </p>
        </div>
      ) : (
        <div style={{ background: 'white', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Type</th>
                <th>Status</th>
                <th className="numeric">Area (sqm)</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {projectList.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link
                      href={`/projects/${project.id}`}
                      style={{
                        color: 'var(--color-navy-700)',
                        fontWeight: 500,
                        textDecoration: 'none',
                      }}
                    >
                      {project.name}
                    </Link>
                    {project.location && (
                      <span style={{ color: 'var(--color-neutral-400)', fontSize: '0.75rem', marginLeft: '8px' }}>
                        {project.location}
                      </span>
                    )}
                  </td>
                  <td>{project.client}</td>
                  <td>{project.project_type ? (TYPE_LABELS[project.project_type] ?? project.project_type) : '—'}</td>
                  <td>
                    <span
                      style={{
                        color: STATUS_COLORS[project.status] ?? 'inherit',
                        fontWeight: 500,
                        fontSize: '0.8125rem',
                        textTransform: 'capitalize',
                      }}
                    >
                      {project.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="numeric">{project.total_sqm?.toLocaleString() ?? '—'}</td>
                  <td style={{ color: 'var(--color-neutral-500)', fontSize: '0.8125rem' }}>
                    {new Date(project.created_at).toLocaleDateString('en-PH', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
