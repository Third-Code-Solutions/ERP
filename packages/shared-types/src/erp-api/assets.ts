import { z } from 'zod'

export const assetKindValues = [
  'equipment',
  'vehicle',
  'tool',
  'fixture',
  'other',
] as const

export const assetStatusValues = [
  'active',
  'maintenance',
  'retired',
] as const

export const assetListSortValues = [
  'created_at',
  'asset_tag',
  'name',
  'status',
] as const

export const assetListQuerySchema = z
  .object({
    q: z.string().trim().max(255).optional(),
    kind: z.enum(assetKindValues).optional(),
    status: z.enum(assetStatusValues).optional(),
    sort: z.enum(assetListSortValues).default('created_at'),
    order: z.enum(['asc', 'desc']).default('desc'),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()

export type AssetListQuery = z.infer<typeof assetListQuerySchema>

export const assetReadResultSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    assetTag: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(160),
    kind: z.enum(assetKindValues),
    status: z.enum(assetStatusValues),
    serialNumber: z.string().trim().max(120).nullable(),
    manufacturer: z.string().trim().max(120).nullable(),
    model: z.string().trim().max(120).nullable(),
    assignedProjectId: z.string().uuid().nullable(),
    assignedProjectName: z.string().nullable(),
    location: z.string().trim().max(255).nullable(),
    commissionedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    retiredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    notes: z.string().nullable(),
    createdBy: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type AssetReadResult = z.infer<typeof assetReadResultSchema>

export const assetListResultSchema = z
  .object({
    rows: z.array(assetReadResultSchema).max(100),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    totalPages: z.number().int().min(1),
  })
  .strict()

export type AssetListResult = z.infer<typeof assetListResultSchema>
