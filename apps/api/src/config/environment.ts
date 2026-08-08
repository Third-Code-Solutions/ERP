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

const optionalHttpsUrl = z
  .string()
  .url()
  .refine(
    (value) => new URL(value).protocol === 'https:',
    'must use https'
  )
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
  // Asset register reads stay fail-closed until the hosted migration suffix,
  // replay, and a tenant-scoped read canary are approved. This seam never
  // grants browser table access or write authority.
  ERP_ASSET_READS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_ASSET_READS_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Asset maintenance history remains fail-closed until the migration replay,
  // audit/RLS review, and a protected tenant canary are approved.
  ERP_ASSET_MAINTENANCE_READS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_ASSET_MAINTENANCE_READS_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  ERP_ASSET_MAINTENANCE_CREATE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_ASSET_MAINTENANCE_CREATE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Cortex keyword reads stay fail-closed until the derived graph replay and
  // a tenant-scoped canary are approved. Search never accepts tenant or role
  // scope from the browser and never spends an external AI provider budget.
  ERP_CORTEX_SEARCH_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_SEARCH_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Interactive Cortex graph reads are separate from keyword search so each
  // surface can be canaried and rolled back independently.
  ERP_CORTEX_GRAPH_READS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_GRAPH_READS_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Entity context, relationship, citation, and evidence reads are canaried
  // independently from the whole graph so rollback remains one flag change.
  ERP_CORTEX_ENTITY_READS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_ENTITY_READS_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Saved Cortex memory reads are canaried independently. Core derives tenant,
  // user ownership, and current-role citation/context scope from the principal.
  ERP_CORTEX_CONVERSATION_READS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_CONVERSATION_READS_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Only signed-in user turns are accepted here. Assistant/provider turns need
  // a separate server-to-server authority and cannot be supplied by browsers.
  ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Assistant generations require both an authenticated principal and a
  // server-only HMAC. Browser callers can never select the assistant role.
  ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET: z.string().min(32).optional(),
  // Provider-free grounded analysis jobs are independently scoped for intake,
  // execution, and stale-job recovery. All gates default closed.
  ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_ASSISTANT_GENERATION_JOBS_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  ERP_CORTEX_ASSISTANT_GENERATION_WORKER_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_ASSISTANT_GENERATION_WORKER_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // A future provider-backed assistant may dispatch only after Nest reserves
  // one exact PostgreSQL budget. No policy rows are seeded by source.
  ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Provider execution is a second, independent exact-tenant gate. Source
  // provides only an unavailable adapter; no provider can be called yet.
  ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Circuit alert routing is a separate exact-tenant gate. Source provides
  // only a provider-neutral adapter contract; no route credential belongs in
  // this boundary or in a route payload.
  ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Durable circuit-alert transport stays closed until a reviewed queue,
  // worker, recovery, and exact-tenant canary are approved. BullMQ carries
  // only an opaque event key; it never grants route or ERP authority.
  ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Semantic indexing can spend an external provider call. Intake, worker,
  // and recovery are independently closed and exact-tenant scoped.
  ERP_CORTEX_SEMANTIC_INDEX_JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_SEMANTIC_INDEX_JOBS_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  ERP_CORTEX_SEMANTIC_INDEX_WORKER_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_SEMANTIC_INDEX_WORKER_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // General-ledger reads stay fail-closed until the hosted finance schema,
  // disposable replay, and a protected tenant canary are approved.
  ERP_FINANCE_LEDGER_READS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_FINANCE_LEDGER_READS_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Customer receivables reads stay fail-closed until invoice, allocation,
  // RLS, and exact-cent parity are replayed and a protected canary is approved.
  ERP_FINANCE_RECEIVABLES_READS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Supplier payables reads stay fail-closed until supplier-bill,
  // allocation, RLS, and exact-cent parity are replayed and a protected
  // canary is approved.
  ERP_FINANCE_PAYABLES_READS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_FINANCE_PAYABLES_READS_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Cash register reads stay fail-closed until cash-account, transaction,
  // counterparty, RLS, and exact-cent parity are replayed and a protected
  // canary is approved.
  ERP_FINANCE_CASH_READS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_FINANCE_CASH_READS_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Project creation authority stays fail-closed until idempotency and a
  // tenant-scoped canary are approved.
  ERP_PROJECT_CREATE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_PROJECT_CREATE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // User role assignment is a privileged command. It stays fail-closed until
  // browser DML revocation, replay, audit, and one protected tenant canary pass.
  ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Won-to-Project handoff stays fail-closed until the atomic checklist,
  // notification, idempotency, and tenant-canary replay are approved.
  ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Manual project cost entry authority stays fail-closed until the
  // idempotency ledger, replay, and tenant canary are approved.
  ERP_COST_ENTRY_CREATE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_COST_ENTRY_CREATE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Manual cost-entry voids stay fail-closed until the soft-delete snapshot,
  // replay, read filtering, and rollback evidence are approved.
  ERP_COST_ENTRY_DELETE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_COST_ENTRY_DELETE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Cost-entry restores stay fail-closed until snapshot/replay and recovery
  // evidence are approved independently from voids.
  ERP_COST_ENTRY_RESTORE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_COST_ENTRY_RESTORE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
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
  // BOM-to-PO creation stays fail-closed until its single transaction and
  // idempotent replay are proven against a designated tenant.
  ERP_PO_BOM_CREATE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_PO_BOM_CREATE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Grouped BOM-to-PO creation stays fail-closed until supplier grouping,
  // rate-card validity, and idempotent multi-PO replay are proven.
  ERP_PO_BOM_GROUPED_CREATE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Togal BOM line commits stay fail-closed until the dedicated idempotency
  // ledger, transaction replay, and tenant canary are approved.
  ERP_BOM_TOGAL_COMMIT_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_BOM_TOGAL_COMMIT_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Client Change Request authority stays fail-closed until hosted schema
  // reconciliation and a tenant-scoped canary are explicitly approved.
  ERP_CHANGE_REQUEST_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_CHANGE_REQUEST_WRITES_TENANT_IDS: z
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
  // Delivery schedule creation stays fail-closed until the server-owned
  // idempotency ledger, notification parity, and tenant canary are approved.
  ERP_DELIVERY_SCHEDULE_CREATE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_DELIVERY_SCHEDULE_CREATE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Delivery receipt status changes stay fail-closed until the server-owned
  // idempotency ledger and a tenant canary are approved.
  ERP_DELIVERY_RECEIPT_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Marking a prepared delivery in transit stays fail-closed until the
  // server-owned request ledger and a tenant canary are approved.
  ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Starting delivery site preparation stays fail-closed until the existing
  // delivery ledger and a tenant canary are approved.
  ERP_DELIVERY_SITE_PREPARATION_START_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Completing site preparation stays fail-closed until its transaction,
  // replay behavior, and tenant canary are approved.
  ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Starting a delivery inspection stays fail-closed until the existing
  // delivery ledger extension and a tenant canary are approved.
  ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Completing a delivery inspection stays fail-closed until its terminal
  // transaction, replay behavior, and tenant canary are approved.
  ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Delivery cancellation stays fail-closed until cancellation evidence,
  // replay behavior, and a tenant canary are approved.
  ERP_DELIVERY_CANCEL_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Manual journal posting stays fail-closed until the forward migration,
  // disposable transaction proof, and tenant canary are approved.
  ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Manual journal reversal stays fail-closed until its forward migration,
  // disposable transaction proof, and tenant canary are approved.
  ERP_FINANCE_JOURNAL_REVERSE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_FINANCE_JOURNAL_REVERSE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Supplier Bill posting stays fail-closed until its payable function,
  // idempotent replay, and tenant canary are approved.
  ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Supplier Bill reversal stays fail-closed until its ordered migration,
  // disposable transaction proof, and tenant canary are approved.
  ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Cash posting and reversal stay fail-closed until their ordered migration,
  // disposable transaction proof, and tenant canary are approved.
  ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Cash draft create/update/delete stays fail-closed until its ordered
  // migration, disposable transaction proof, and tenant canary are approved.
  ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Customer invoice issuance stays fail-closed until its ordered migration,
  // disposable transaction proof, and tenant canary are approved.
  ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Customer invoice draft creation stays fail-closed until the Core
  // transaction, idempotency ledger, audit proof, and tenant canary pass.
  ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Customer invoice reversal stays fail-closed until its ordered migration,
  // disposable transaction proof, and tenant canary are approved.
  ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Customer invoice cancellation stays fail-closed until its ordered
  // migration, disposable transaction proof, and tenant canary are approved.
  ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS: z
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
  // Stock Receipt posting/reversal stay fail-closed until the workflow
  // idempotency migration, disposable transaction proof, and canary pass.
  ERP_INVENTORY_RECEIPT_POST_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  ERP_INVENTORY_RECEIPT_REVERSE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_INVENTORY_RECEIPT_REVERSE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Stock Movement draft creation stays fail-closed until the ordered
  // idempotency migration, disposable transaction proof, and tenant canary.
  ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Stock Movement posting/reversal remains fail-closed until the workflow
  // ledger, disposable transaction proof, and tenant canary are approved.
  ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Inventory item policy updates are naturally idempotent state setters;
  // keep the transactional Nest command fail-closed until a tenant canary.
  ERP_INVENTORY_ITEM_CONFIG_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_INVENTORY_ITEM_CONFIG_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // UOM setup writes stay fail-closed until the Nest transaction and tenant
  // canary prove parity with the compatibility Server Action.
  ERP_INVENTORY_UOM_CREATE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_INVENTORY_UOM_CREATE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  ERP_INVENTORY_UOM_UPDATE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_INVENTORY_UOM_UPDATE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Warehouse setup writes stay fail-closed until the Nest transaction and
  // tenant canary prove parity with the compatibility Server Action.
  ERP_INVENTORY_WAREHOUSE_CREATE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_INVENTORY_WAREHOUSE_CREATE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Warehouse name/state updates stay fail-closed until the Nest transaction
  // and protected tenant canary prove parity with the compatibility action.
  ERP_INVENTORY_WAREHOUSE_UPDATE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_INVENTORY_WAREHOUSE_UPDATE_WRITES_TENANT_IDS: z
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
  // Recovery scheduling is closed by default and must be scoped to explicit
  // tenant UUIDs before any Redis scheduler is created.
  ERP_DOCUMENT_PROCESSING_RECOVERY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS: z
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
  // Document deletion is closed by default. Enable only for an explicit
  // tenant canary after the Nest transaction, replay, and Storage cleanup
  // gates pass together.
  ERP_DOCUMENT_DELETE_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Public canvas signing is token-authorized but still closed by default.
  // Enable only for an explicit tenant canary after Storage, replay, and
  // transaction proof are complete.
  ERP_PUBLIC_SIGNING_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_PUBLIC_SIGNING_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Supplier confirmation review is a token-scoped read seam. Keep closed
  // until the hosted supplier tables and public-link threat model are cleared.
  ERP_PUBLIC_VENDOR_CONFIRMATION_READ_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_PUBLIC_VENDOR_CONFIRMATION_READ_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Supplier confirmation is token-authorized but closed until the response
  // state machine, replay, and rollback proofs pass for one tenant.
  ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  // Session minting is a separate closed seam. It can create only a hashed
  // token session during SCM issuance; public link delivery remains off.
  ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  ERP_PUBLIC_VENDOR_CONFIRMATION_TOKEN_SECRET: z
    .string()
    .min(32)
    .optional(),
  ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_TTL_HOURS: z.coerce
    .number()
    .int()
    .min(1)
    .max(2_160)
    .default(720),
  // Link delivery is independently gated and also requires the public-write
  // gate for the same tenant so suppliers never receive a dead URL.
  ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_TENANT_IDS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((tenantId) => tenantId.trim())
        .filter(Boolean)
    )
    .pipe(z.array(z.string().uuid())),
  ERP_PUBLIC_VENDOR_CONFIRMATION_BASE_URL: optionalHttpsUrl,
  AI_WORKER_URL: optionalHttpUrl,
  AI_WORKER_SHARED_SECRET: z.string().min(20).optional(),
  AI_WORKER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(60_000)
    .default(15_000),
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
