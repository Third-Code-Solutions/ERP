import { z } from 'zod'
import { projectStatusValues, projectTypeValues } from '../projects'

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
