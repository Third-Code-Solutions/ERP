import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireUserProfile } from '@third-code-erp/auth'
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
import styles from '@/components/projects/workspace.module.css'
import { ProjectListControls } from '@/components/projects/project-list-controls'

export const metadata: Metadata = { title: 'Projects' }

const STATUS_COLORS: Record<string, string> = {
  lead: 'var(--color-neutral-600)',
  active: 'var(--color-success)',
  on_hold: 'var(--color-warning)',
  completed: 'var(--color-info)',
  cancelled: 'var(--color-danger)',
}

const TYPE_LABELS: Record<string, string> = {
  mep: 'MEP',
  fit_out: 'Fit-out',
  interior: 'Interior',
  mixed: 'Structural and Civil',
  structural_civil: 'Structural and Civil',
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
    statusRaw &&
    (PROJECT_STATUS_VALUES as readonly string[]).includes(statusRaw)
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

function buildPageHref(
  rawSearch: Record<string, SearchParamValue>,
  page: number,
): string {
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

export default async function ProjectsPage({
  searchParams,
}: ProjectsPageProps) {
  const profile = await requireUserProfile()
  const tenantId = profile.tenantId

  const rawSearch: Record<string, SearchParamValue> = searchParams
    ? await searchParams
    : {}
  const filters = parseFilters(rawSearch)
  const hasActiveFilters = Boolean(filters.q || filters.status || filters.type)
  const canCreate = can(profile.role, 'project.create')

  const {
    rows: projectList,
    total,
    page,
    totalPages,
  } = await getProjectsFiltered(tenantId, filters)

  const prevHref = page > 1 ? buildPageHref(rawSearch, page - 1) : null
  const nextHref = page < totalPages ? buildPageHref(rawSearch, page + 1) : null

  const tableView = pickFirst(rawSearch.view) === 'table'
  return (
    <section className={styles.workspace} aria-label="Projects workspace">
      <header className={styles.header}>
        <div>
          <h1>Projects</h1>
          <p>Keep project scope, estimates, and delivery in one place.</p>
        </div>
        {canCreate && (
          <Link className={styles.primary} href="/projects/new">
            + New Project
          </Link>
        )}
      </header>
      <ProjectListControls />
      <div className={styles.summary}>
        <span>
          {total} project{total === 1 ? '' : 's'}
          {hasActiveFilters ? ' match your filters' : ' in this workspace'}
        </span>
        <span>
          Showing {projectList.length} · Page {page} of {totalPages}
        </span>
      </div>
      {projectList.length === 0 ? (
        <div className={styles.empty}>
          <h2>
            {hasActiveFilters
              ? 'No projects match your filters'
              : 'No projects yet'}
          </h2>
          <p>
            {hasActiveFilters
              ? 'Try a different name, client, status, or project type.'
              : 'Create a project to organize its scope and delivery.'}
          </p>
          <Link
            className={styles.secondary}
            href={
              hasActiveFilters ? '/projects' : canCreate ? '/projects/new' : '/'
            }
          >
            {hasActiveFilters
              ? 'Clear filters'
              : canCreate
                ? 'Create your first project'
                : 'Back to dashboard'}
          </Link>
        </div>
      ) : tableView ? (
        <div
          className={styles.tableWrap}
          tabIndex={0}
          aria-label="Projects table, scroll for more columns"
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Project / client</th>
                <th>Type</th>
                <th>Status</th>
                <th>Area (sqm)</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {projectList.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link href={`/projects/${project.id}`}>{project.name}</Link>
                    <small>
                      {project.client} ·{' '}
                      {project.location ?? 'Location not set'}
                    </small>
                  </td>
                  <td>
                    {TYPE_LABELS[project.project_type ?? ''] ?? 'Not set'}
                  </td>
                  <td>
                    <span className={styles.badge}>
                      {project.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>{project.total_sqm?.toLocaleString('en-PH') ?? '—'}</td>
                  <td>
                    {new Date(project.created_at).toLocaleDateString('en-PH')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className={styles.cards}>
          {projectList.map((project) => (
            <article className={styles.card} key={project.id}>
              <span
                className={styles.badge}
                style={{ color: STATUS_COLORS[project.status] }}
              >
                {project.status.replace('_', ' ')}
              </span>
              <h2>
                <Link href={`/projects/${project.id}`}>{project.name}</Link>
              </h2>
              <p>{project.client}</p>
              <dl>
                <div>
                  <dt>Project type</dt>
                  <dd>
                    {TYPE_LABELS[project.project_type ?? ''] ?? 'Not set'}
                  </dd>
                </div>
                <div>
                  <dt>Area</dt>
                  <dd>
                    {project.total_sqm?.toLocaleString('en-PH') ?? '—'}
                    {project.total_sqm != null ? ' sqm' : ''}
                  </dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{project.location ?? 'Not set'}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>
                    {new Date(project.created_at).toLocaleDateString('en-PH', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </dd>
                </div>
              </dl>
              <div className={styles.actions}>
                <Link
                  className={styles.secondary}
                  href={`/projects/${project.id}`}
                >
                  Open project →
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
      {totalPages > 1 && (
        <nav className={styles.summary} aria-label="Pagination">
          {prevHref ? (
            <Link className={styles.secondary} href={prevHref}>
              Previous
            </Link>
          ) : (
            <span>First page</span>
          )}
          <span>
            Page {page} of {totalPages}
          </span>
          {nextHref && (
            <Link className={styles.secondary} href={nextHref}>
              Next
            </Link>
          )}
        </nav>
      )}
    </section>
  )
}
