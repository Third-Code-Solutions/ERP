import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireUserProfile } from '@third-code-erp/auth'
import { projectScheduleListQuerySchema, type ProjectScheduleLevel, type ProjectScheduleTaskStatus, type ProjectLabourReconciliationResult } from '@third-code-erp/shared-types'
import { getProjectLabourReconciliationThroughCoreApi, getProjectScheduleThroughCoreApi, getProjectThroughCoreApi, projectLabourReconciliationReadsUseCoreApi } from '@/lib/erp-core-client'
import { readProjectLabourReconciliationForTenant } from '@/lib/operations/project-labour-reconciliation'
import { ProjectLabourReconciliationCard } from '@/components/schedule/project-labour-reconciliation-card'
import { ProjectScheduleRegister } from './project-schedule-register'

export const metadata: Metadata = { title: 'Project Schedule' }
type SearchParamValue = string | string[] | undefined
function first(value: SearchParamValue): string | undefined { const item = Array.isArray(value) ? value[0] : value; return item?.trim() || undefined }
function parseQuery(raw: Record<string, SearchParamValue>) { const parsed = projectScheduleListQuerySchema.safeParse({ level: first(raw.level), status: first(raw.status), commitmentStatus: first(raw.commitmentStatus), page: first(raw.page), limit: first(raw.limit) }); return parsed.success ? parsed.data : projectScheduleListQuerySchema.parse({}) }
function href(projectId: string, filters: { level?: ProjectScheduleLevel; status?: ProjectScheduleTaskStatus; page?: number; limit?: number }): string { const params = new URLSearchParams(); if (filters.level) params.set('level', filters.level); if (filters.status) params.set('status', filters.status); if (filters.page && filters.page > 1) params.set('page', String(filters.page)); if (filters.limit && filters.limit !== 50) params.set('limit', String(filters.limit)); const query = params.toString(); return `/projects/${projectId}/schedule${query ? `?${query}` : ''}` }

export default async function ProjectSchedulePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, SearchParamValue>> }) {
  const { id } = await params
  const profile = await requireUserProfile()
  const query = parseQuery((await searchParams) ?? {})
  const projectResponse = await getProjectThroughCoreApi(id)
  if (!projectResponse.ok || !projectResponse.data) return <div className="card" role="alert"><div className="card-header"><h1 className="card-title">Schedule & lookahead</h1></div><div className="card-empty">{projectResponse.error ?? 'Project data was not read.'}</div></div>
  if (projectResponse.data.id !== id || projectResponse.data.tenantId !== profile.tenantId) return <div className="card" role="alert"><div className="card-header"><h1 className="card-title">Schedule & lookahead</h1></div><div className="card-empty">Schedule data returned an invalid tenant or project scope.</div></div>
  const response = await getProjectScheduleThroughCoreApi(id, query)
  let labourResult: ProjectLabourReconciliationResult | null = null
  let labourError: string | null = null
  if (projectLabourReconciliationReadsUseCoreApi(profile.tenantId)) {
    const labourResponse = await getProjectLabourReconciliationThroughCoreApi(id)
    if (labourResponse.ok && labourResponse.data) labourResult = labourResponse.data
    else labourError = labourResponse.error ?? 'Labour reconciliation is unavailable.'
  } else {
    try {
      labourResult = await readProjectLabourReconciliationForTenant(profile.tenantId, id, {})
    } catch {
      labourError = 'Labour reconciliation could not be loaded from the current data source.'
    }
  }
  return <div><div className="page-header"><p className="page-eyebrow"><Link href={`/projects/${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>Projects · {projectResponse.data.name}</Link></p><div className="page-toolbar"><div><h1 className="page-title">Schedule & lookahead</h1><p className="page-subtitle">Normalized L1–L4 tasks, labour reconciliation, and Last-Planner commitments.</p></div></div></div>{labourResult ? <ProjectLabourReconciliationCard result={labourResult} /> : <div className="card" role="status" style={{ marginBottom: 16 }}><div className="card-header"><h2 className="card-title">Labour reconciliation unavailable</h2></div><p className="card-empty">{labourError ?? 'No verified labour reconciliation result was returned.'} No labour cost or headcount estimate has been fabricated.</p></div>}<ProjectScheduleRegister projectId={id} result={response.ok && response.data ? response.data : null} error={response.ok ? null : response.error ?? 'Project schedule is unavailable.'} canManage={can(profile.role, 'project.schedule.manage')} activeLevel={query.level} activeStatus={query.status} filterHref={({ level, status, page }) => href(id, { level, status, page, limit: query.limit })} /></div>
}
