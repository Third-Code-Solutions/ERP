import type { Metadata } from 'next'
import Link from 'next/link'
import { can, requireUserProfile } from '@third-code-erp/auth'
import type {
  ProjectRfiListQuery,
} from '@third-code-erp/shared-types'
import {
  getProjectRfisThroughCoreApi,
  getProjectThroughCoreApi,
} from '@/lib/erp-core-client'
import { projectRfiListQuerySchema } from '@third-code-erp/shared-types'
import { ProjectRfiRegister } from './project-rfi-register'
import { requireUuidRouteParams } from '@/lib/uuid-route-params'

export const metadata: Metadata = { title: 'Project RFIs' }

type SearchParamValue = string | string[] | undefined

function first(value: SearchParamValue): string | undefined {
  const item = Array.isArray(value) ? value[0] : value
  return item?.trim() || undefined
}

function parseQuery(raw: Record<string, SearchParamValue>): ProjectRfiListQuery {
  const parsed = projectRfiListQuerySchema.safeParse({
    status: first(raw.status),
    priority: first(raw.priority),
    page: first(raw.page),
    limit: first(raw.limit),
  })
  return parsed.success ? parsed.data : projectRfiListQuerySchema.parse({})
}

interface PageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, SearchParamValue>>
}

export default async function ProjectRfisPage({ params, searchParams }: PageProps) {
  const { id } = await requireUuidRouteParams(params)
  const profile = await requireUserProfile()
  const query = parseQuery((await searchParams) ?? {})
  const projectResponse = await getProjectThroughCoreApi(id)

  if (!projectResponse.ok || !projectResponse.data) {
    return (
      <div className="card" role="alert">
        <div className="card-header">
          <h1 className="card-title">Project RFIs</h1>
        </div>
        <div className="card-empty">
          {projectResponse.error ?? 'Project data was not read.'}
        </div>
      </div>
    )
  }
  if (
    projectResponse.data.id !== id ||
    projectResponse.data.tenantId !== profile.tenantId
  ) {
    return (
      <div className="card" role="alert">
        <div className="card-header">
          <h1 className="card-title">Project RFIs</h1>
        </div>
        <div className="card-empty">
          Project RFI data returned an invalid tenant or project scope.
        </div>
      </div>
    )
  }

  const rfiResponse = await getProjectRfisThroughCoreApi(id, query)
  const result = rfiResponse.ok && rfiResponse.data ? rfiResponse.data : null
  const error = rfiResponse.ok
    ? null
    : rfiResponse.error ?? 'Project RFI register is unavailable.'

  return (
    <div>
      <div className="page-header">
        <p className="page-eyebrow">
          <Link href={`/projects/${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
            Projects · {projectResponse.data.name}
          </Link>
        </p>
        <div className="page-toolbar">
          <div>
            <h1 className="page-title">Project RFIs</h1>
            <p className="page-subtitle">
              Keep design, site, and commercial questions moving with explicit answers, due dates, and an audit trail.
            </p>
          </div>
        </div>
      </div>

      <ProjectRfiRegister
        projectId={id}
        result={result}
        error={error}
        canManage={can(profile.role, 'project.rfi.manage')}
        activeStatus={query.status}
        activePriority={query.priority}
      />
    </div>
  )
}
