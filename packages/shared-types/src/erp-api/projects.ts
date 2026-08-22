import { z } from 'zod'
import { projectStatusValues, projectTypeValues } from '../projects'

export const createProjectCommandSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    client: z.string().trim().min(1).max(255),
    status: z.enum(projectStatusValues).default('lead'),
    projectType: z.enum(projectTypeValues).nullable().default(null),
    totalSqm: z.number().int().positive().nullable().default(null),
    location: z.string().trim().max(1_000).nullable().default(null),
    notes: z.string().trim().max(5_000).nullable().default(null),
  })
  .strict()

export const projectCreationResultSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  client: z.string(),
  status: z.enum(projectStatusValues),
  projectType: z.enum(projectTypeValues).nullable(),
  totalSqm: z.number().int().nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
})

export type CreateProjectCommand = z.infer<typeof createProjectCommandSchema>
export type ProjectCreationResult = z.infer<typeof projectCreationResultSchema>

// Read results are deliberately separate from command results. The core API
// may expose stable ownership metadata without making the browser depend on
// the database package's snake_case row shape.
export const projectReadResultSchema = projectCreationResultSchema.extend({
  accountId: z.string().uuid().nullable(),
  createdBy: z.string().uuid().nullable(),
})

export type ProjectReadResult = z.infer<typeof projectReadResultSchema>

export const projectListSortValues = [
  'created_at',
  'name',
  'status',
] as const

export const projectListQuerySchema = z
  .object({
    q: z.string().trim().max(255).optional(),
    status: z.enum(projectStatusValues).optional(),
    projectType: z.enum(projectTypeValues).optional(),
    sort: z.enum(projectListSortValues).default('created_at'),
    order: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()

export type ProjectListQuery = z.infer<typeof projectListQuerySchema>

export const projectListResultSchema = z.object({
  rows: z.array(projectReadResultSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(100),
  totalPages: z.number().int().min(1),
})

export type ProjectListResult = z.infer<typeof projectListResultSchema>

export const updateProjectCommandSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    client: z.string().trim().min(1).max(255),
    status: z.enum(projectStatusValues),
    projectType: z.enum(projectTypeValues).nullable(),
    totalSqm: z.number().int().positive().nullable(),
    location: z.string().trim().max(1_000).nullable(),
    notes: z.string().trim().max(5_000).nullable(),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export const projectUpdateResultSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  client: z.string(),
  status: z.enum(projectStatusValues),
  projectType: z.enum(projectTypeValues).nullable(),
  totalSqm: z.number().int().nullable(),
  location: z.string().nullable(),
  notes: z.string().nullable(),
  updatedAt: z.string().datetime({ offset: true }),
})

export type UpdateProjectCommand = z.infer<
  typeof updateProjectCommandSchema
>
export type ProjectUpdateResult = z.infer<typeof projectUpdateResultSchema>

/**
 * A project is retired (logical deletion), never cascaded away. The route id
 * carries the project identifier; the body requires both a human reason and
 * stale-state protection.
 */
export const retireProjectCommandSchema = z
  .object({
    reason: z.string().trim().min(3).max(2_000),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type RetireProjectCommand = z.infer<typeof retireProjectCommandSchema>

export const projectRetirementResultSchema = z.object({
  projectId: z.string().uuid(),
  tenantId: z.string().uuid(),
  deleted: z.literal(true),
  retiredAt: z.string().datetime({ offset: true }),
})

export type ProjectRetirementResult = z.infer<
  typeof projectRetirementResultSchema
>
