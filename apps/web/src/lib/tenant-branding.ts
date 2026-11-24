/**
 * Branding for documents and messages that leave the workspace (client portals,
 * printed documents, emails). They must name the company that issues them, which
 * is the tenant, never the product or another customer of the product.
 */

/** Shown when a tenant has no usable name. Deliberately not any company's name. */
export const NEUTRAL_COMPANY_NAME = 'Your contractor'

/** Product name, for the small "Powered by" footer only. */
export const PLATFORM_NAME = 'ABI OPS'

export function tenantDisplayName(name: string | null | undefined): string {
  const cleaned = name?.replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned : NEUTRAL_COMPANY_NAME
}
