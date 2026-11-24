// Same rule as apps/web/src/lib/tenant-branding.ts: client email names the issuing
// tenant, never the product or another company. Keep the two in step.
export const NEUTRAL_COMPANY_NAME = 'Your contractor'

export function tenantDisplayName(name: string | null | undefined): string {
  const cleaned = name?.replace(/\s+/g, ' ').trim()
  return cleaned ? cleaned : NEUTRAL_COMPANY_NAME
}
