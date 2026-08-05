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
