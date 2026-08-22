import { z } from 'zod'

export const projectStatusValues = ['lead', 'active', 'on_hold', 'completed', 'cancelled'] as const
/**
 * Active project taxonomy. `mixed` remains a database compatibility value
 * during the forward migration, but no new user input may create it.
 */
export const projectTypeValues = [
  'mep',
  'fit_out',
  'interior',
  'structural_civil',
] as const

/** Values that can still be read from a not-yet-backfilled database row. */
export const persistedProjectTypeValues = [
  ...projectTypeValues,
  'mixed',
] as const

export type ProjectStatus = typeof projectStatusValues[number]
export type ProjectType = typeof projectTypeValues[number]
export type PersistedProjectType = typeof persistedProjectTypeValues[number]

export const projectTypeLabels: Readonly<Record<ProjectType, string>> = {
  mep: 'MEP',
  fit_out: 'Fit-out',
  interior: 'Interior',
  structural_civil: 'Structural and Civil',
}

/**
 * Make legacy reads stable while migrations roll through mixed-version
 * deployments. Unknown values intentionally do not acquire a guessed label.
 */
export function normalizeProjectType(
  value: string | null | undefined,
): ProjectType | null {
  if (value === null || value === undefined) return null
  if (value === 'mixed') return 'structural_civil'
  return (projectTypeValues as readonly string[]).includes(value)
    ? (value as ProjectType)
    : null
}

export function projectTypeLabel(value: string | null | undefined): string | null {
  const normalized = normalizeProjectType(value)
  return normalized ? projectTypeLabels[normalized] : null
}

// Project status is a workflow, not an unrestricted label. Terminal states
// remain terminal; reopening requires an explicit future workflow command.
export const projectStatusTransitions: Record<
  ProjectStatus,
  readonly ProjectStatus[]
> = {
  lead: ['lead', 'active', 'on_hold', 'cancelled'],
  active: ['active', 'on_hold', 'completed', 'cancelled'],
  on_hold: ['on_hold', 'active', 'cancelled'],
  completed: ['completed'],
  cancelled: ['cancelled'],
}

export function isProjectStatusTransitionAllowed(
  from: ProjectStatus,
  to: ProjectStatus
): boolean {
  return projectStatusTransitions[from].includes(to)
}

export const createProjectSchema = z.object({
  name: z.string().min(1).max(255),
  client: z.string().min(1).max(255),
  location: z.string().max(1000).optional(),
  project_type: z.enum(projectTypeValues).optional(),
  status: z.enum(projectStatusValues).default('lead'),
  total_sqm: z.number().int().positive().optional(),
  notes: z.string().max(5000).optional(),
})

export const updateProjectSchema = createProjectSchema.partial()

export type CreateProjectInput = z.infer<typeof createProjectSchema>
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>

export const projectFiltersSchema = z.object({
  status: z.enum(projectStatusValues).optional(),
  project_type: z.enum(projectTypeValues).optional(),
  search: z.string().max(255).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type ProjectFilters = z.infer<typeof projectFiltersSchema>
