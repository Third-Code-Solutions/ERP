import type { AppRole } from '@third-code-erp/auth'
import {
  roleHasCapability,
  type ErpCapability,
} from '@third-code-erp/shared-types/authorization'

export interface ProjectTabDefinition {
  slug: string
  label: string
  capability: ErpCapability
}

/**
 * The project command centre is a composite surface. Each sensitive tab keeps
 * its own read capability; project.read is never a substitute for Finance,
 * BOM, Audit, or portal-access authority.
 */
export const PROJECT_TABS: readonly ProjectTabDefinition[] = [
  { slug: '', label: 'Overview', capability: 'project.read' },
  { slug: 'scope', label: 'Scope', capability: 'project.read' },
  { slug: 'bom', label: 'BOM', capability: 'bom.read' },
  { slug: 'cost', label: 'Cost', capability: 'budget.read' },
  { slug: 'checklist', label: 'Checklist', capability: 'project.read' },
  { slug: 'permits', label: 'Permits', capability: 'project.read' },
  { slug: 'progress', label: 'Progress', capability: 'project.read' },
  { slug: 'reports', label: 'Reports', capability: 'project.read' },
  { slug: 'vos', label: 'VOs', capability: 'project.read' },
  { slug: 'documents', label: 'Documents', capability: 'project.read' },
  { slug: 'billing', label: 'Billing', capability: 'finance.read' },
  { slug: 'turnover', label: 'Turnover', capability: 'project.read' },
  { slug: 'coc', label: 'COC', capability: 'project.read' },
  { slug: 'comments', label: 'Comments', capability: 'project.read' },
  { slug: 'access', label: 'Access', capability: 'admin.users' },
  { slug: 'audit', label: 'Audit', capability: 'audit.read' },
]

export function projectRouteCapability(pathname: string): ErpCapability | null {
  const segments = pathname.split('/').filter(Boolean)
  if (segments[0] !== 'projects') return null

  if (!segments[1]) return 'project.read'
  if (segments[1] === 'new') return 'project.create'
  if (!segments[2]) return 'project.read'

  const tab = PROJECT_TABS.find((item) => item.slug === segments[2])
  return tab?.capability ?? null
}

export function visibleProjectTabs(role: AppRole): ProjectTabDefinition[] {
  return PROJECT_TABS.filter((tab) => roleHasCapability(role, tab.capability))
}
