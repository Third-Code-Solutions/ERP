import { z } from 'zod'

export const REDIS_CLIENT = Symbol('THIRD_CODE_ERP_REDIS_CLIENT')

const optionalHttpUrl = z
  .string()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  }, 'must use http or https')
  .optional()

const environmentSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_URL: z.string().url(),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(20),
  // Server-only Storage access for short-lived exact-object URLs. Optional
  // while every processing flag is closed; the bridge rejects activation
  // without it at runtime.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  REDIS_URL: z.string().url(),
  ERP_API_CORS_ORIGINS: z.string().default('http://localhost:3000'),
  RESEND_API_KEY: z.string().min(20).optional(),
  EMAIL_FROM: z.string().min(3).max(320).optional(),
  ERP_WEB_BASE_URL: optionalHttpUrl,
  ERP_NOTIFICATION_SWEEP_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // PO command boundary stays fail-closed until idempotency and full
  // transaction parity are proven in a later migration slice.
  ERP_PO_CREATE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Empty by default. A write can only be enabled for explicitly listed
  // tenant UUIDs after migration and canary evidence exist.
  ERP_PO_CREATE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Approval transitions stay fail-closed until hosted reconciliation and a
  // tenant-scoped canary are explicitly approved.
  ERP_PO_WORKFLOW_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_PO_WORKFLOW_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Workflow writes require durable notification intent and recipients. Both
  // this flag and its tenant allowlist stay empty until delivery parity is
  // replayed and a single-tenant canary is explicitly approved.
  ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_PO_WORKFLOW_NOTIFICATIONS_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Stock Receipt draft creation stays fail-closed until hosted migration and
  // a tenant-scoped canary prove inventory transaction parity.
  ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_INVENTORY_RECEIPT_CREATE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // CAD evidence commits stay fail-closed until the Nest transaction is
  // replayed against hosted schema and canary data.
  ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Processing intake stays fail-closed until a Nest worker bridge and
  // disposable/hosted canary prove the full evidence path.
  ERP_DOCUMENT_PROCESSING_JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Private evidence bridge remains fail-closed until the parser URL, secret,
  // commit path, disposable canary, and hosted gates are approved together.
  ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  // Draft BOM creation has its own gate. A processing job requesting a BOM
  // is rejected at intake unless this flag and tenant allowlist both match.
  ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  DXF_PARSER_URL: optionalHttpUrl,
  PARSER_SHARED_SECRET: z.string().min(20).optional(),
})

export type Environment = z.infer<typeof environmentSchema>

export function validateEnvironment(
  values: Record<string, unknown>
): Environment {
  const parsed = environmentSchema.safeParse(values)
  if (!parsed.success) {
    throw new Error(
      `Invalid ERP API environment: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`
    )
  }
  return parsed.data
}

export function corsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
}

export function redisConnectionOptions(redisUrl: string) {
  const url = new URL(redisUrl)
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username
      ? decodeURIComponent(url.username)
      : undefined,
    password: url.password
      ? decodeURIComponent(url.password)
      : undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
  }
}
