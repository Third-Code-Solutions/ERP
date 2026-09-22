import type { AppRole } from '@third-code-erp/auth'
import {
  STAGE_LEGACY_MAP,
  type OpportunityStage,
} from '@third-code-erp/shared-types'
import { canViewPath } from '@/lib/operations/nav-config'

const OPPORTUNITY_TYPE_LABELS: Record<string, string> = {
  fit_out: 'Fit-out',
  mep: 'MEP',
  interior: 'Interior',
  structural_civil: 'Structural / Civil',
}

export function formatOpportunityDate(value: Date | string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function opportunityTypeLabel(value: string | null): string {
  if (!value) return '—'
  return OPPORTUNITY_TYPE_LABELS[value] ?? value.replace(/_/g, ' ')
}

export function opportunityWorkspaceAccess(input: {
  role: AppRole
  projectId: string | null
  stage: OpportunityStage
}) {
  const bomPath = input.projectId ? `/projects/${input.projectId}/bom` : null
  const projectPath = input.projectId ? `/projects/${input.projectId}` : null
  const isWon = STAGE_LEGACY_MAP[input.stage] === 'won'

  return {
    bomPath,
    canViewBom: Boolean(bomPath && canViewPath(input.role, bomPath)),
    projectPath,
    canViewProject: Boolean(
      isWon && projectPath && canViewPath(input.role, projectPath)
    ),
    projectDisabledReason: !isWon
      ? 'Available once the deal is Won'
      : !projectPath
        ? 'Project workspace is awaiting the Won handoff'
        : 'Your role does not have access to the project workspace',
  }
}
