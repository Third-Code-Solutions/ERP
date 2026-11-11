import { roleHasCapability, type ErpRole } from '@third-code-erp/shared-types/authorization'

/** Outcome of every catalogue read and write. `status` mirrors HTTP. */
export type CatalogueDenied = { ok: false; status: 400 | 403 | 404 | 500; error: string }
export type CatalogueResult<T> = { ok: true; data: T } | CatalogueDenied

/** The caller, as resolved by `requireUserProfile()`. */
export interface CatalogueActor {
  tenantId: string
  role: ErpRole
}

// The catalogue ships dark until the owner flips it (after smoke:prod passes).
export function catalogueEnabled(): boolean {
  return process.env.ERP_CATALOGUE_ENABLED === 'true'
}

/**
 * Gate shared by every catalogue function, not only the page: flag off reads
 * as not-found, a missing capability as forbidden. Null means "go ahead".
 */
export function catalogueAccessDenial(
  role: ErpRole,
  capability: 'catalogue.read' | 'catalogue.manage',
): CatalogueDenied | null {
  if (!catalogueEnabled()) return { ok: false, status: 404, error: 'Not found' }
  if (!roleHasCapability(role, capability)) {
    return { ok: false, status: 403, error: `Forbidden: role "${role}" lacks "${capability}"` }
  }
  return null
}
