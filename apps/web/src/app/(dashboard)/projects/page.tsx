import type { Metadata } from 'next'
import Link from 'next/link'
import { getUser } from '@buildops/auth'
import { db } from '@buildops/database'
import { users } from '@buildops/database/schema'
import { eq } from 'drizzle-orm'
import {
  getProjectsFiltered,
  PROJECT_SORT_VALUES,
  PROJECT_STATUS_VALUES,
  PROJECT_TYPE_VALUES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  type ProjectFilters,
  type ProjectOrder,
  type ProjectSort,
  type ProjectStatus,
  type ProjectType,
} from '@/lib/project-queries'
import { ProjectListControls } from '@/components/projects/project-list-controls'

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

type SearchParamValue = string | string[] | undefined

interface ProjectsPageProps {
  // Next 15: searchParams is always a Promise in route components.
  searchParams?: Promise<Record<string, SearchParamValue>>
}

function pickFirst(value: SearchParamValue): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

function parseFilters(raw: Record<string, SearchParamValue>): ProjectFilters {
  const q = pickFirst(raw.q)?.trim()

  const statusRaw = pickFirst(raw.status)
  const status =
    statusRaw && (PROJECT_STATUS_VALUES as readonly string[]).includes(statusRaw)
      ? (statusRaw as ProjectStatus)
      : undefined

  const typeRaw = pickFirst(raw.type)
  const type =
    typeRaw && (PROJECT_TYPE_VALUES as readonly string[]).includes(typeRaw)
      ? (typeRaw as ProjectType)
      : undefined

  const sortRaw = pickFirst(raw.sort)
  const sort: ProjectSort =
    sortRaw && (PROJECT_SORT_VALUES as readonly string[]).includes(sortRaw)
      ? (sortRaw as ProjectSort)
      : 'created_at'

  const orderRaw = pickFirst(raw.order)
  const order: ProjectOrder = orderRaw === 'asc' ? 'asc' : 'desc'

  const pageRaw = pickFirst(raw.page)
  const pageNum = pageRaw ? Number.parseInt(pageRaw, 10) : NaN
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1

  const limitRaw = pickFirst(raw.limit)
  const limitNum = limitRaw ? Number.parseInt(limitRaw, 10) : NaN
  const limit =
    Number.isFinite(limitNum) && limitNum > 0
      ? Math.min(MAX_LIMIT, limitNum)
      : DEFAULT_LIMIT

  return {
    q: q && q.length > 0 ? q : undefined,
    status,
    type,
    sort,
    order,
    page,
    limit,
  }
}

function buildPageHref(rawSearch: Record<string, SearchParamValue>, page: number): string {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(rawSearch)) {
    if (key === 'page') continue
    const v = pickFirst(value)
    if (v !== undefined && v !== '') next.set(key, v)
  }
  if (page > 1) next.set('page', String(page))
  const qs = next.toString()
  return qs ? `/projects?${qs}` : '/projects'
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
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

  const rawSearch: Record<string, SearchParamValue> = searchParams
    ? await searchParams
    : {}
  const filters = parseFilters(rawSearch)
  const hasActiveFilters = Boolean(filters.q || filters.status || filters.type)

  const { rows: projectList, total, page, totalPages } = await getProjectsFiltered(tenantId, filters)

  const prevHref = page > 1 ? buildPageHref(rawSearch, page - 1) : null
  const nextHref = page < totalPages ? buildPageHref(rawSearch, page + 1) : null

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">
            {total} project{total !== 1 ? 's' : ''}
            {hasActiveFilters ? ' match your filters' : ''}
          </p>
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

      <ProjectListControls />

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
          {hasActiveFilters ? (
            <p style={{ fontSize: '1rem' }}>No projects match your filters</p>
          ) : (
            <>
              <p style={{ fontSize: '1rem', marginBottom: '8px' }}>No projects yet</p>
              <p style={{ fontSize: '0.875rem' }}>
                <Link href="/projects/new" style={{ color: 'var(--color-navy-700)' }}>
                  Create your first project
                </Link>{' '}
                to get started.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
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

          <nav
            aria-label="Pagination"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: '16px',
              fontSize: '0.875rem',
              color: 'var(--color-neutral-600)',
            }}
          >
            {prevHref ? (
              <Link
                href={prevHref}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  color: 'var(--color-navy-700)',
                  background: 'white',
                }}
              >
                Prev
              </Link>
            ) : (
              <span
                aria-disabled="true"
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  color: 'var(--color-neutral-400)',
                  background: 'var(--color-neutral-50)',
                }}
              >
                Prev
              </span>
            )}
            <span>
              Page {page} of {totalPages}
            </span>
            {nextHref ? (
              <Link
                href={nextHref}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  color: 'var(--color-navy-700)',
                  background: 'white',
                }}
              >
                Next
              </Link>
            ) : (
              <span
                aria-disabled="true"
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  color: 'var(--color-neutral-400)',
                  background: 'var(--color-neutral-50)',
                }}
              >
                Next
              </span>
            )}
          </nav>
        </>
      )}
    </div>
  )
}
