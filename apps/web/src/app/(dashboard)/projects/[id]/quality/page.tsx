import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireUserProfile } from '@third-code-erp/auth'
import {
  qualityHoldPointListQuerySchema,
  type QualityHoldPointListQuery,
} from '@third-code-erp/shared-types'
import { getProjectThroughCoreApi, getQualityHoldPointsThroughCoreApi } from '@/lib/erp-core-client'
import { requireUuidRouteParams } from '@/lib/uuid-route-params'
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

export default async function QualityHoldPointsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, SearchParamValue>>
}) {
  const { id } = await requireUuidRouteParams(params)
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
        owner={{ actorId: profile.user.id, tenantId: profile.tenantId }}
        result={qualityResponse.ok && qualityResponse.data ? qualityResponse.data : null}
        error={qualityResponse.ok ? null : qualityResponse.error ?? 'Quality register is unavailable.'}
        canManage={can(profile.role, 'project.quality.manage')}
        canApprove={can(profile.role, 'project.quality.approve')}
        canPunchlist={can(profile.role, 'punchlist.manage')}
        activeStatus={query.status}
        activeHoldPoint={query.holdPoint}
      />
    </div>
  )
}
