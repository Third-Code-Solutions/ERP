import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { projectSubmittalListQuerySchema, type ProjectDocumentRow, type ProjectSubmittalDocumentListResult, type ProjectSubmittalListQuery, type ProjectSubmittalStatus } from '@third-code-erp/shared-types'
import { getProjectDocumentsThroughCoreApi, getProjectSubmittalDocumentsThroughCoreApi, getProjectSubmittalsThroughCoreApi, getProjectThroughCoreApi } from '@/lib/erp-core-client'
import { ProjectSubmittalRegister } from './project-submittal-register'

export const metadata: Metadata = { title: 'Project Submittals' }
type SearchParamValue = string | string[] | undefined
function first(value: SearchParamValue): string | undefined { const item = Array.isArray(value) ? value[0] : value; return item?.trim() || undefined }
function parseQuery(raw: Record<string, SearchParamValue>): ProjectSubmittalListQuery { const parsed = projectSubmittalListQuerySchema.safeParse({ status: first(raw.status), page: first(raw.page), limit: first(raw.limit) }); return parsed.success ? parsed.data : projectSubmittalListQuerySchema.parse({}) }
function href(projectId: string, filters: { status?: ProjectSubmittalStatus; page?: number; limit?: number }): string { const params = new URLSearchParams(); if (filters.status) params.set('status', filters.status); if (filters.page && filters.page > 1) params.set('page', String(filters.page)); if (filters.limit && filters.limit !== 25) params.set('limit', String(filters.limit)); const query = params.toString(); return `/projects/${projectId}/submittals${query ? `?${query}` : ''}` }

export default async function ProjectSubmittalsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, SearchParamValue>> }) {
  const { id } = await params; const profile = await requireUserProfile(); const query = parseQuery((await searchParams) ?? {}); const projectResponse = await getProjectThroughCoreApi(id)
  if (!projectResponse.ok || !projectResponse.data) return <div className="card" role="alert"><div className="card-header"><h1 className="card-title">Project submittals</h1></div><div className="card-empty">{projectResponse.error ?? 'Project data was not read.'}</div></div>
  if (projectResponse.data.id !== id || projectResponse.data.tenantId !== profile.tenantId) return <div className="card" role="alert"><div className="card-header"><h1 className="card-title">Project submittals</h1></div><div className="card-empty">Submittal data returned an invalid tenant or project scope.</div></div>
  const response = await getProjectSubmittalsThroughCoreApi(id, query)
  const documentResponse = await getProjectDocumentsThroughCoreApi(id, { page: 1, limit: 100 })
  const linkedDocumentsBySubmittal: Record<string, ProjectSubmittalDocumentListResult> = {}
  if (response.ok && response.data) {
    const linkedResults = await Promise.all(response.data.rows.map((row) => getProjectSubmittalDocumentsThroughCoreApi(id, row.id)))
    response.data.rows.forEach((row, index) => {
      const linked = linkedResults[index]
      if (linked?.ok && linked.data) linkedDocumentsBySubmittal[row.id] = linked.data
    })
  }
  const projectDocuments: ProjectDocumentRow[] = documentResponse.ok && documentResponse.data ? documentResponse.data.rows : []
  const documentError = documentResponse.ok ? null : documentResponse.error ?? 'Project documents are unavailable.'
  return <div><div className="page-header"><p className="page-eyebrow"><Link href={`/projects/${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>Projects · {projectResponse.data.name}</Link></p><div className="page-toolbar"><div><h1 className="page-title">Project submittals</h1><p className="page-subtitle">Track document-control requests from draft through review and approval.</p></div></div></div><ProjectSubmittalRegister projectId={id} result={response.ok && response.data ? response.data : null} error={response.ok ? null : response.error ?? 'Project submittals are unavailable.'} canManage={can(profile.role, 'project.submittal.manage')} canReview={can(profile.role, 'project.submittal.review')} projectDocuments={projectDocuments} linkedDocumentsBySubmittal={linkedDocumentsBySubmittal} documentError={documentError} activeStatus={query.status} filterHref={({ status, page }) => href(id, { status, page, limit: query.limit })} /></div>
}
