export const ORGANIZATION_TYPES = [
  'construction',
  'developer',
  'design-engineering',
  'supply-manufacturing',
  'professional-services',
  'other',
] as const

export type OrganizationType = (typeof ORGANIZATION_TYPES)[number]

export function isOrganizationType(value: string): value is OrganizationType {
  return (ORGANIZATION_TYPES as readonly string[]).includes(value)
}
