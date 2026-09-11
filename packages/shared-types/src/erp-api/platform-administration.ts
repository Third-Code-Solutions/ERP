import { z } from 'zod'

import { ERP_CAPABILITIES, ERP_ROLES, type ErpCapability, type ErpRole } from '../authorization'
import { ORGANIZATION_TYPES } from '../organization-types'

export const PLATFORM_OWNER_EMAIL = 'kurt@thirdcodesolutions.com' as const
export const PLATFORM_TENANT_STATUSES = [
  'active',
  'suspended',
  'disabled',
] as const
export const PLATFORM_USER_STATUSES = [
  'invited',
  'active',
  'suspended',
  'disabled',
] as const

const trimmed = z.string().trim()
const optionalQuery = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  trimmed.max(120).optional()
)

export const platformListQuerySchema = z.object({
  q: optionalQuery,
  status: optionalQuery,
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
})
export type PlatformListQuery = z.infer<typeof platformListQuerySchema>
export const platformTenantListQuerySchema = platformListQuerySchema.extend({
  status: z.enum(PLATFORM_TENANT_STATUSES).optional(),
})
export const platformUserListQuerySchema = platformListQuerySchema.extend({
  status: z.enum(PLATFORM_USER_STATUSES).optional(),
})
export const platformAuditListQuerySchema = platformListQuerySchema.extend({
  status: z.enum(['succeeded', 'denied', 'failed']).optional(),
})
export const platformInvitationListQuerySchema = platformListQuerySchema.extend({
  status: z
    .enum(['pending', 'sent', 'accepted', 'revoked', 'failed'])
    .optional(),
})

export const createPlatformTenantCommandSchema = z.object({
  name: trimmed.min(2).max(255),
  slug: trimmed
    .min(2)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  organizationType: z.enum(ORGANIZATION_TYPES),
  pcabLicense: trimmed.max(50).nullable().optional(),
  birTin: trimmed.max(20).nullable().optional(),
  dpoContact: trimmed.email().max(255).nullable().optional(),
})
export type CreatePlatformTenantCommand = z.infer<
  typeof createPlatformTenantCommandSchema
>

export const updatePlatformTenantCommandSchema = createPlatformTenantCommandSchema
  .omit({ slug: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one tenant field must be supplied',
  })
export type UpdatePlatformTenantCommand = z.infer<
  typeof updatePlatformTenantCommandSchema
>

export const updatePlatformTenantStatusCommandSchema = z
  .object({
    status: z.enum(PLATFORM_TENANT_STATUSES),
    reason: trimmed.min(3).max(500).nullable(),
  })
  .superRefine((value, context) => {
    if (value.status !== 'active' && !value.reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A reason is required when a tenant is inactive',
      })
    }
  })
export type UpdatePlatformTenantStatusCommand = z.infer<
  typeof updatePlatformTenantStatusCommandSchema
>

export const invitePlatformUserCommandSchema = z.object({
  tenantId: z.string().uuid(),
  email: trimmed.email().max(255).transform((value) => value.toLowerCase()),
  fullName: trimmed.min(2).max(255),
  role: z.enum(ERP_ROLES),
})
export type InvitePlatformUserCommand = z.infer<
  typeof invitePlatformUserCommandSchema
>

export const updatePlatformUserRoleCommandSchema = z.object({
  role: z.enum(ERP_ROLES),
})
export type UpdatePlatformUserRoleCommand = z.infer<
  typeof updatePlatformUserRoleCommandSchema
>

export const updatePlatformUserStatusCommandSchema = z
  .object({
    status: z.enum(['active', 'suspended', 'disabled']),
    reason: trimmed.min(3).max(500).nullable(),
  })
  .superRefine((value, context) => {
    if (value.status !== 'active' && !value.reason) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'A reason is required when a user is inactive',
      })
    }
  })
export type UpdatePlatformUserStatusCommand = z.infer<
  typeof updatePlatformUserStatusCommandSchema
>

export const platformReasonCommandSchema = z.object({
  reason: trimmed.min(3).max(500),
})
export type PlatformReasonCommand = z.infer<
  typeof platformReasonCommandSchema
>

export const createPlatformSupportSessionCommandSchema = z.object({
  tenantId: z.string().uuid(),
  reason: trimmed.min(3).max(500),
  durationMinutes: z.coerce.number().int().min(5).max(240).default(30),
})
export type CreatePlatformSupportSessionCommand = z.infer<
  typeof createPlatformSupportSessionCommandSchema
>

export interface PlatformTenantSummary {
  id: string
  name: string
  slug: string
  organizationType: string
  status: (typeof PLATFORM_TENANT_STATUSES)[number]
  statusReason: string | null
  userCount: number
  activeUserCount: number
  projectCount: number
  lastActivityAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PlatformUserSummary {
  id: string
  tenantId: string
  tenantName: string
  email: string
  fullName: string
  role: ErpRole
  status: (typeof PLATFORM_USER_STATUSES)[number]
  statusReason: string | null
  invitedAt: string | null
  lastActiveAt: string | null
  createdAt: string
}

export interface PlatformInvitationSummary {
  id: string
  tenantId: string
  tenantName: string
  email: string
  fullName: string
  role: ErpRole
  status: 'pending' | 'sent' | 'accepted' | 'revoked' | 'failed'
  createdAt: string
  sentAt: string | null
  acceptedAt: string | null
  revokedAt: string | null
  failureReason: string | null
}

export interface PlatformPagedResult<Row> {
  rows: Row[]
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PlatformRoleSummary {
  role: ErpRole
  capabilities: readonly ErpCapability[]
  platformAccess: false
}

export interface PlatformAnalyticsResult {
  tenants: { total: number; active: number; suspended: number; disabled: number }
  users: {
    total: number
    active: number
    invited: number
    suspended: number
    disabled: number
  }
  projects: { total: number; active: number }
  opportunities: { total: number; open: number }
  generatedAt: string
}

export interface PlatformAuditSummary {
  id: number
  traceId: string
  actorId: string
  action: string
  outcome: 'succeeded' | 'denied' | 'failed'
  targetType: string
  targetId: string | null
  targetTenantId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string
}

export interface PlatformDependencyStatus {
  key: string
  label: string
  status: 'available' | 'configured' | 'unavailable'
  detail: string
}

export interface PlatformSystemHealthResult {
  api: 'available'
  database: 'available'
  dependencies: PlatformDependencyStatus[]
  generatedAt: string
}

export interface PlatformSupportSessionResult {
  id: string
  tenantId: string
  tenantName: string
  reason: string
  createdAt: string
  expiresAt: string
  endedAt: string | null
}

export interface PlatformOverviewResult {
  analytics: PlatformAnalyticsResult
  activeSupportSession: PlatformSupportSessionResult | null
  recentAudit: PlatformAuditSummary[]
}

// Validate HTTP output before it enters the privileged Web rendering boundary.
const identifier = z.string().uuid()
const timestamp = z.string().datetime({ offset: true })
const countValue = z.number().int().nonnegative()

export const platformTenantSummarySchema: z.ZodType<PlatformTenantSummary> = z.object({
  id: identifier, name: z.string(), slug: z.string(), organizationType: z.enum(ORGANIZATION_TYPES),
  status: z.enum(PLATFORM_TENANT_STATUSES), statusReason: z.string().nullable(),
  userCount: countValue, activeUserCount: countValue, projectCount: countValue,
  lastActivityAt: timestamp.nullable(), createdAt: timestamp, updatedAt: timestamp,
})
export const platformUserSummarySchema: z.ZodType<PlatformUserSummary> = z.object({
  id: identifier, tenantId: identifier, tenantName: z.string(), email: z.string().email(),
  fullName: z.string(), role: z.enum(ERP_ROLES), status: z.enum(PLATFORM_USER_STATUSES),
  statusReason: z.string().nullable(), invitedAt: timestamp.nullable(),
  lastActiveAt: timestamp.nullable(), createdAt: timestamp,
})
export const platformInvitationSummarySchema: z.ZodType<PlatformInvitationSummary> = z.object({
  id: identifier, tenantId: identifier, tenantName: z.string(), email: z.string().email(),
  fullName: z.string(), role: z.enum(ERP_ROLES),
  status: z.enum(['pending', 'sent', 'accepted', 'revoked', 'failed']),
  createdAt: timestamp, sentAt: timestamp.nullable(), acceptedAt: timestamp.nullable(),
  revokedAt: timestamp.nullable(), failureReason: z.string().nullable(),
})
export function platformPagedResultSchema<Row>(row: z.ZodType<Row>): z.ZodType<PlatformPagedResult<Row>> {
  return z.object({ rows: z.array(row), page: countValue.min(1), limit: countValue.min(1).max(100), total: countValue, totalPages: countValue })
}
export const platformRoleSummarySchema: z.ZodType<PlatformRoleSummary> = z.object({
  role: z.enum(ERP_ROLES), platformAccess: z.literal(false),
  capabilities: z.array(z.custom<ErpCapability>((value) => ERP_CAPABILITIES.some((capability) => capability === value))),
})
export const platformAnalyticsResultSchema: z.ZodType<PlatformAnalyticsResult> = z.object({
  tenants: z.object({ total: countValue, active: countValue, suspended: countValue, disabled: countValue }),
  users: z.object({ total: countValue, active: countValue, invited: countValue, suspended: countValue, disabled: countValue }),
  projects: z.object({ total: countValue, active: countValue }),
  opportunities: z.object({ total: countValue, open: countValue }), generatedAt: timestamp,
})
export const platformOperationalAnalyticsResultSchema = z.object({
  documents: z.object({ total: countValue, bytes: z.string().regex(/^\d+$/) }),
  kyc: z.object({ pendingTracks: countValue, overdueTracks: countValue, flaggedTracks: countValue }),
  jobs: z.object({ documentFailed: countValue, generationFailed: countValue, indexFailed: countValue }),
  privileged: z.object({ failed: countValue, denied: countValue }),
  generatedAt: timestamp,
})
export type PlatformOperationalAnalyticsResult = z.infer<typeof platformOperationalAnalyticsResultSchema>
export const platformAuditSummarySchema: z.ZodType<PlatformAuditSummary> = z.object({
  id: countValue, traceId: identifier, actorId: identifier, action: z.string(),
  outcome: z.enum(['succeeded', 'denied', 'failed']), targetType: z.string(),
  targetId: z.string().nullable(), targetTenantId: identifier.nullable(),
  metadata: z.record(z.unknown()).nullable(), createdAt: timestamp,
})
export const platformDependencyStatusSchema: z.ZodType<PlatformDependencyStatus> = z.object({
  key: z.string(), label: z.string(), status: z.enum(['available', 'configured', 'unavailable']), detail: z.string(),
})
export const platformSystemHealthResultSchema: z.ZodType<PlatformSystemHealthResult> = z.object({
  api: z.literal('available'), database: z.literal('available'),
  dependencies: z.array(platformDependencyStatusSchema), generatedAt: timestamp,
})
export const platformSupportSessionResultSchema: z.ZodType<PlatformSupportSessionResult> = z.object({
  id: identifier, tenantId: identifier, tenantName: z.string(), reason: z.string(),
  createdAt: timestamp, expiresAt: timestamp, endedAt: timestamp.nullable(),
})
export const platformOverviewResultSchema: z.ZodType<PlatformOverviewResult> = z.object({
  analytics: platformAnalyticsResultSchema, activeSupportSession: platformSupportSessionResultSchema.nullable(),
  recentAudit: z.array(platformAuditSummarySchema),
})
