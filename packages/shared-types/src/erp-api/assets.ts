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

export const assetMaintenanceTypeValues = [
  'preventive',
  'inspection',
  'repair',
  'calibration',
  'other',
] as const

const assetMaintenanceDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const assetMaintenanceListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()

export type AssetMaintenanceListQuery = z.infer<
  typeof assetMaintenanceListQuerySchema
>

export const assetMaintenanceReadResultSchema = z
  .object({
    id: z.string().uuid(),
    tenantId: z.string().uuid(),
    assetId: z.string().uuid(),
    maintenanceType: z.enum(assetMaintenanceTypeValues),
    summary: z.string().trim().min(1).max(200),
    performedOn: assetMaintenanceDateSchema,
    nextDueOn: assetMaintenanceDateSchema.nullable(),
    vendorName: z.string().trim().max(160).nullable(),
    costCents: z.number().int().nonnegative(),
    notes: z.string().nullable(),
    createdBy: z.string().uuid(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict()

export type AssetMaintenanceReadResult = z.infer<
  typeof assetMaintenanceReadResultSchema
>

export const assetMaintenanceListResultSchema = z
  .object({
    tenantId: z.string().uuid(),
    assetId: z.string().uuid(),
    rows: z.array(assetMaintenanceReadResultSchema).max(100),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    totalPages: z.number().int().min(1),
  })
  .strict()

export type AssetMaintenanceListResult = z.infer<
  typeof assetMaintenanceListResultSchema
>

export const assetMaintenanceDueStateValues = ['overdue', 'due_soon'] as const

export const assetMaintenanceDueQuerySchema = z
  .object({
    asOf: assetMaintenanceDateSchema.optional(),
    daysAhead: z.coerce.number().int().min(0).max(365).default(30),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict()

export type AssetMaintenanceDueQuery = z.infer<
  typeof assetMaintenanceDueQuerySchema
>

export const assetMaintenanceDueReadResultSchema = z
  .object({
    tenantId: z.string().uuid(),
    assetId: z.string().uuid(),
    assetTag: z.string().trim().min(1).max(64),
    assetName: z.string().trim().min(1).max(160),
    assetKind: z.enum(assetKindValues),
    assetStatus: z.enum(['active', 'maintenance']),
    assignedProjectId: z.string().uuid().nullable(),
    assignedProjectName: z.string().nullable(),
    location: z.string().trim().max(255).nullable(),
    maintenanceRecordId: z.string().uuid(),
    maintenanceType: z.enum(assetMaintenanceTypeValues),
    summary: z.string().trim().min(1).max(200),
    performedOn: assetMaintenanceDateSchema,
    nextDueOn: assetMaintenanceDateSchema,
    daysUntilDue: z.number().int(),
    dueState: z.enum(assetMaintenanceDueStateValues),
  })
  .strict()

export type AssetMaintenanceDueReadResult = z.infer<
  typeof assetMaintenanceDueReadResultSchema
>

export const assetMaintenanceDueResultSchema = z
  .object({
    tenantId: z.string().uuid(),
    asOf: assetMaintenanceDateSchema,
    daysAhead: z.number().int().min(0).max(365),
    rows: z.array(assetMaintenanceDueReadResultSchema).max(100),
    total: z.number().int().nonnegative(),
    page: z.number().int().min(1),
    limit: z.number().int().min(1).max(100),
    totalPages: z.number().int().min(1),
  })
  .strict()

export type AssetMaintenanceDueResult = z.infer<
  typeof assetMaintenanceDueResultSchema
>

export const createAssetMaintenanceRecordCommandSchema = z
  .object({
    maintenanceType: z.enum(assetMaintenanceTypeValues),
    summary: z.string().trim().min(1).max(200),
    performedOn: assetMaintenanceDateSchema,
    nextDueOn: assetMaintenanceDateSchema.nullable().default(null),
    vendorName: z.string().trim().max(160).nullable().default(null),
    costCents: z.number().int().nonnegative().max(100_000_000_000).default(0),
    notes: z.string().trim().max(2000).nullable().default(null),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.nextDueOn && value.nextDueOn < value.performedOn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nextDueOn'],
        message: 'nextDueOn must be on or after performedOn',
      })
    }
  })

export type CreateAssetMaintenanceRecordCommand = z.infer<
  typeof createAssetMaintenanceRecordCommandSchema
>

export const assetMaintenanceCreationResultSchema =
  assetMaintenanceReadResultSchema
export type AssetMaintenanceCreationResult = AssetMaintenanceReadResult
