import { z } from 'zod'

export const projectStatusValues = ['lead', 'active', 'on_hold', 'completed', 'cancelled'] as const
export const projectTypeValues = ['mep', 'fit_out', 'interior', 'mixed'] as const

export type ProjectStatus = typeof projectStatusValues[number]
export type ProjectType = typeof projectTypeValues[number]

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
