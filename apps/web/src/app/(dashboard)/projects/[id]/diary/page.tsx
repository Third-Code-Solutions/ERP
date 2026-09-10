import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireUserProfile } from '@third-code-erp/auth'
import {
  siteDiaryListQuerySchema,
  type SiteDiaryListQuery,
} from '@third-code-erp/shared-types'
import {
  getProjectThroughCoreApi,
  getSiteDiaryThroughCoreApi,
} from '@/lib/erp-core-client'
import { requireUuidRouteParams } from '@/lib/uuid-route-params'
import { SiteDiaryRegister } from './site-diary-register'

export const metadata: Metadata = { title: 'Daily Site Diary' }

type SearchParamValue = string | string[] | undefined

function first(value: SearchParamValue): string | undefined {
  const item = Array.isArray(value) ? value[0] : value
  return item?.trim() || undefined
}

function parseQuery(raw: Record<string, SearchParamValue>): SiteDiaryListQuery {
  const parsed = siteDiaryListQuerySchema.safeParse({
    status: first(raw.status),
    fromDate: first(raw.fromDate),
    toDate: first(raw.toDate),
    page: first(raw.page),
    limit: first(raw.limit),
  })
  return parsed.success ? parsed.data : siteDiaryListQuerySchema.parse({})
}

export default async function SiteDiaryPage({
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
    return <div className="card" role="alert"><div className="card-header"><h1 className="card-title">Daily site diary</h1></div><div className="card-empty">{projectResponse.error ?? 'Project data was not read.'}</div></div>
  }
  if (projectResponse.data.id !== id || projectResponse.data.tenantId !== profile.tenantId) {
    return <div className="card" role="alert"><div className="card-header"><h1 className="card-title">Daily site diary</h1></div><div className="card-empty">Project diary data returned an invalid tenant or project scope.</div></div>
  }

  const diaryResponse = await getSiteDiaryThroughCoreApi(id, query)
  const result = diaryResponse.ok && diaryResponse.data ? diaryResponse.data : null
  const error = diaryResponse.ok ? null : diaryResponse.error ?? 'Daily site diary is unavailable.'

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow"><Link href={`/projects/${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>Projects · {projectResponse.data.name}</Link></p>
        <div className="page-toolbar"><div><h1 className="page-title">Daily site diary</h1><p className="page-subtitle">A durable field record for weather, manpower, completed work, constraints, and safety notes.</p></div></div>
      </div>
      <SiteDiaryRegister
        projectId={id}
        result={result}
        error={error}
        canManage={can(profile.role, 'project.diary.manage')}
        activeStatus={query.status}
        activeFromDate={query.fromDate}
        activeToDate={query.toDate}
      />
    </div>
  )
}
