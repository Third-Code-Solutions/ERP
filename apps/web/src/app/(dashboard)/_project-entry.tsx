import React from 'react'
import Link from 'next/link'
import { requireUserProfile } from '@third-code-erp/auth'
import { projectListQuerySchema } from '@third-code-erp/shared-types'

import { getProjectsThroughCoreApi } from '@/lib/erp-core-client'
import { canViewPath } from '@/lib/operations/nav-config'

export const PROJECT_FEATURES = {
  scope: { title: 'Scope', description: 'Review the project scope and connected estimate items.' },
  cost: { title: 'Project Cost', description: 'Review budget, commitments, and actual project costs.' },
  'cost/budget': { title: 'Project Budget', description: 'Review and manage the selected project budget.' },
  checklist: { title: 'Checklist', description: 'Track the selected project’s delivery requirements.' },
  progress: { title: 'Progress', description: 'Review and record project progress updates.' },
  billing: { title: 'Project Billing', description: 'Review project billing and invoice context.' },
  turnover: { title: 'Turnover', description: 'Prepare and review the selected project handover.' },
  coc: { title: 'Certificate of Completion', description: 'Review completion evidence for the selected project.' },
  comments: { title: 'Project Comments', description: 'Open the selected project’s discussion history.' },
  access: { title: 'Project Access', description: 'Inspect the selected project’s access controls.' },
  audit: { title: 'Project Audit', description: 'Inspect immutable activity evidence for the selected project.' },
} as const

export type ProjectFeature = keyof typeof PROJECT_FEATURES
export type ProjectEntrySearch = Promise<{ q?: string; page?: string }>

export async function ProjectFeatureEntry({ feature, searchParams }: {
  feature: ProjectFeature
  searchParams: ProjectEntrySearch
}) {
  const profile = await requireUserProfile()
  const config = PROJECT_FEATURES[feature]
  if (!canViewPath(profile.role, `/projects/selected/${feature}`)) {
    return <section className="card" role="alert"><h1 className="page-title">Access unavailable</h1><p>Your tenant role cannot open this project workspace.</p><Link href="/projects">Return to projects</Link></section>
  }
  const raw = await searchParams
  const query = projectListQuerySchema.safeParse({ q: raw.q, page: raw.page, sort: 'name', order: 'asc', limit: 20 })
  if (!query.success) {
    return <section className="card" role="alert"><h1 className="page-title">Invalid project filter</h1><p>Use a search up to 255 characters and a positive page number.</p><Link href={`/${feature}`}>Reset filters</Link></section>
  }
  const result = await getProjectsThroughCoreApi(query.data)
  const pageHref = (page: number) => `/${feature}?${new URLSearchParams({ ...(query.data.q ? { q: query.data.q } : {}), page: String(page) }).toString()}`

  return <div className="platform-stack">
    <header className="page-header"><p className="page-eyebrow">Project workspace</p><h1 className="page-title">{config.title}</h1><p className="page-subtitle">{config.description} Choose a project to continue.</p></header>
    <form method="get" action={`/${feature}`} className="platform-inline-form">
      <label>Find a project<input type="search" name="q" defaultValue={query.data.q} maxLength={255} placeholder="Project or client name" /></label>
      <button type="submit" className="button button-primary">Search</button>
      {query.data.q ? <Link href={`/${feature}`} className="button button-secondary">Clear</Link> : null}
    </form>
    {!result.ok || !result.data ? <section className="card platform-unavailable" role="alert"><h2>Projects unavailable</h2><p>{result.error || 'The service returned no project data.'}</p><Link href={pageHref(query.data.page)} className="button button-secondary">Retry project list</Link></section> : <>
      <p className="page-subtitle">{result.data.total} projects in your tenant · Page {result.data.page} of {result.data.totalPages}</p>
      {result.data.rows.length === 0 ? <section className="card card-empty" role="status"><h2>No projects found</h2><p>{query.data.q ? 'Try another search or clear the filter.' : 'A project must exist before this workspace can be opened.'}</p><Link href="/projects">Open project directory</Link></section> : <section className="card platform-table-wrap"><table className="data-table"><caption className="sr-only">Choose a project for {config.title}</caption><thead><tr><th scope="col">Project</th><th scope="col">Client</th><th scope="col">Status</th><th scope="col">Workspace</th></tr></thead><tbody>{result.data.rows.map((project) => <tr key={project.id}><td><strong>{project.name}</strong></td><td>{project.client}</td><td>{project.status.replaceAll('_', ' ')}</td><td><Link className="button button-secondary" href={`/projects/${project.id}/${feature}`} aria-label={`Open ${config.title} for ${project.name}`}>Open {config.title}</Link></td></tr>)}</tbody></table></section>}
      <nav className="platform-row-actions" aria-label="Project pages">{result.data.page > 1 ? <Link href={pageHref(result.data.page - 1)} className="button button-secondary">Previous</Link> : null}{result.data.page < result.data.totalPages ? <Link href={pageHref(result.data.page + 1)} className="button button-secondary">Next</Link> : null}</nav>
    </>}
  </div>
}
