import { z } from 'zod'

export const erpRoleValues = [
  'owner',
  'estimator',
  'pm',
  'admin',
  'sales',
  'commercial',
  'design',
  'sd_pm_pe',
  'finance',
  'procurement',
  'safety',
  'cx',
  'viewer',
] as const

export const erpRoleSchema = z.enum(erpRoleValues)

export const userRoleAssignmentCommandSchema = z
  .object({
    expectedRole: erpRoleSchema,
    role: erpRoleSchema,
  })
  .strict()

export const userRoleAssignmentResultSchema = z
  .object({
    userId: z.string().uuid(),
    tenantId: z.string().uuid(),
    previousRole: erpRoleSchema,
    role: erpRoleSchema,
    status: z.enum(['updated', 'unchanged']),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type UserRoleAssignmentCommand = z.infer<
  typeof userRoleAssignmentCommandSchema
>
export type UserRoleAssignmentResult = z.infer<
  typeof userRoleAssignmentResultSchema
>
