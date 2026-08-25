import { can, type AppRole } from '@third-code-erp/auth'

export interface ScopePageAccess {
  canEditScope: boolean
  canUploadDocuments: boolean
}

export function scopePageAccess(role: AppRole): ScopePageAccess {
  return {
    canEditScope: can(role, 'bom.edit'),
    canUploadDocuments: can(role, 'document.manage'),
  }
}
