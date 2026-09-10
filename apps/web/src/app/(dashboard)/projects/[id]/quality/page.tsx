import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireUserProfile } from '@third-code-erp/auth'
import {
  qualityHoldPointListQuerySchema,
  type QualityHoldPointListQuery,
  type QualityHoldPointStatus,
} from '@third-code-erp/shared-types'
import { getProjectThroughCoreApi, getQualityHoldPointsThroughCoreApi } from '@/lib/erp-core-client'
import { QualityHoldPointRegister } from './quality-hold-point-register'

export const metadata: Metadata = { title: 'QA/QC Hold Points' }
type SearchParamValue = string | string[] | undefined

function first(value: SearchParamValue): string | undefined {
  const item = Array.isArray(value) ? value[0] : value
  return item?.trim() || undefined
}

function parseQuery(raw: Record<string, SearchParamValue>): QualityHoldPointListQuery {
  const value = first(raw.holdPoint)
  const parsed = qualityHoldPointListQuerySchema.safeParse({
    status: first(raw.status),
    holdPoint: value === undefined ? undefined : value === 'true' ? true : value === 'false' ? false : value,
    page: first(raw.page),
    limit: first(raw.limit),
  })
  return parsed.success ? parsed.data : qualityHoldPointListQuerySchema.parse({})
}

function qualityHref(projectId: string, filters: { status?: QualityHoldPointStatus; holdPoint?: boolean; page?: number; limit?: number }): string {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.holdPoint !== undefined) params.set('holdPoint', String(filters.holdPoint))
  if (filters.page && filters.page > 1) params.set('page', String(filters.page))
  if (filters.limit && filters.limit !== 25) params.set('limit', String(filters.limit))
  const query = params.toString()
  return `/projects/${projectId}/quality${query ? `?${query}` : ''}`
}

export default async function QualityHoldPointsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, SearchParamValue>>
}) {
  const { id } = await params
  const profile = await requireUserProfile()
  const query = parseQuery((await searchParams) ?? {})
  const projectResponse = await getProjectThroughCoreApi(id)
  if (!projectResponse.ok || !projectResponse.data) {
    return <div className="card" role="alert"><div className="card-header"><h1 className="card-title">QA/QC hold points</h1></div><div className="card-empty">{projectResponse.error ?? 'Project data was not read.'}</div></div>
  }
  if (projectResponse.data.id !== id || projectResponse.data.tenantId !== profile.tenantId) {
    return <div className="card" role="alert"><div className="card-header"><h1 className="card-title">QA/QC hold points</h1></div><div className="card-empty">Quality data returned an invalid tenant or project scope.</div></div>
  }
  const qualityResponse = await getQualityHoldPointsThroughCoreApi(id, query)
  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow"><Link href={`/projects/${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>Projects · {projectResponse.data.name}</Link></p>
        <div className="page-toolbar"><div><h1 className="page-title">QA/QC hold points</h1><p className="page-subtitle">Move inspection work requests from planned to accepted or rejected with evidence.</p></div></div>
      </div>
      <QualityHoldPointRegister
        projectId={id}
        result={qualityResponse.ok && qualityResponse.data ? qualityResponse.data : null}
        error={qualityResponse.ok ? null : qualityResponse.error ?? 'Quality register is unavailable.'}
        canManage={can(profile.role, 'project.quality.manage')}
        canApprove={can(profile.role, 'project.quality.approve')}
        canPunchlist={can(profile.role, 'punchlist.manage')}
        activeStatus={query.status}
        activeHoldPoint={query.holdPoint}
        filterHref={({ status, holdPoint, page }) => qualityHref(id, { status, holdPoint, page, limit: query.limit })}
      />
    </div>
  )
}
