import type { OrganizationType } from '@third-code-erp/shared-types'

export const ORGANIZATION_TYPE_OPTIONS = [
  { value: 'construction', label: 'Construction contractor' },
  { value: 'developer', label: 'Property owner or developer' },
  { value: 'design-engineering', label: 'Design or engineering' },
  { value: 'supply-manufacturing', label: 'Supply or manufacturing' },
  { value: 'professional-services', label: 'Professional services' },
  { value: 'other', label: 'Other project-driven business' },
] as const satisfies readonly {
  value: OrganizationType
  label: string
}[]
