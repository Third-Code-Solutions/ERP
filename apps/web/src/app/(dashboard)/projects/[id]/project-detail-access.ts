import { can, type AppRole } from '@third-code-erp/auth'

import { canSearchEntity } from '@/app/api/search/search-policy'

export interface ProjectDetailAccess {
  project: boolean
  opportunity: boolean
  bom: boolean
  purchaseOrders: boolean
  cost: boolean
  billing: boolean
  delivery: boolean
  audit: boolean
  access: boolean
}

export interface ProjectBomControls {
  edit: boolean
  review: boolean
  importCad: boolean
  award: boolean
}

/**
 * Project detail composes several independently protected domains. Keep this
 * view policy as a direct projection of the checked-in capability and search
 * registries so route guards and navigation cannot drift into role checks.
 */
export function getProjectDetailAccess(role: AppRole): ProjectDetailAccess {
  return {
    project: can(role, 'project.read'),
    opportunity: can(role, 'opportunity.read'),
    bom: canSearchEntity(role, 'bom'),
    purchaseOrders: canSearchEntity(role, 'po'),
    cost: can(role, 'budget.read'),
    billing: can(role, 'finance.read'),
    delivery: canSearchEntity(role, 'delivery'),
    audit: can(role, 'audit.read'),
    access: can(role, 'project.access.read'),
  }
}

export function getProjectBomControls(role: AppRole): ProjectBomControls {
  const edit = can(role, 'bom.edit')
  return {
    edit,
    review: edit,
    importCad: can(role, 'bom.generate') && can(role, 'document.manage'),
    award: can(role, 'project.award'),
  }
}
