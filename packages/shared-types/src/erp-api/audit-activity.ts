import { z } from 'zod'

export const auditActivityQuerySchema = z
  .object({
    entityType: z.string().trim().min(1).max(100).optional(),
    action: z.string().trim().min(1).max(50).optional(),
    entityIds: z.preprocess(
      (value) => {
        if (value === undefined) return undefined
        return Array.isArray(value) ? value : [value]
      },
      z.array(z.string().uuid()).max(500).optional()
    ),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(25),
  })
  .strict()

export type AuditActivityQuery = z.infer<typeof auditActivityQuerySchema>

export const auditActivityRowSchema = z.object({
  id: z.string().regex(/^\d+$/),
  tenantId: z.string().uuid(),
  actorId: z.string().uuid().nullable(),
  entityType: z.string().min(1).max(100),
  entityId: z.string().uuid(),
  action: z.string().min(1).max(50),
  prevHash: z.string().regex(/^[a-f0-9]{64}$|^genesis$/),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  createdAt: z.string().datetime({ offset: true }),
})

export type AuditActivityRow = z.infer<typeof auditActivityRowSchema>

export const auditActivityResultSchema = z.object({
  tenantId: z.string().uuid(),
  rows: z.array(auditActivityRowSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  limit: z.number().int().min(1).max(200),
  totalPages: z.number().int().min(1),
})

export type AuditActivityResult = z.infer<typeof auditActivityResultSchema>
