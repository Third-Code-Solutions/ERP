# Environment Variables

Every variable consumed by Third Code ERP, grouped by service. Variables
marked `public` are exposed to the browser bundle (Next.js
`NEXT_PUBLIC_` prefix). Everything else is server-only.

Copy `.env.example` to `.env.local` for local development. In
production, set these in Vercel (web), Railway (workers), and Supabase
(edge functions) as appropriate.

---

## Supabase

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | public | `Settings → API → Project URL` | API base URL the browser hits |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | public | `Settings → API → anon public` | RLS-scoped client key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | server | `Settings → API → service_role` | Bypasses RLS; used by server actions, Inngest jobs, and storage admin |
| `SUPABASE_JWT_SECRET` | no | server | `Settings → API → JWT secret` | Only needed if verifying tokens outside Supabase SDK |

---

## Auth & Site

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | yes | public | Your production domain (e.g. `https://thirdcode-erp.vercel.app`) | Used to build portal links in emails and signed share URLs |
| `AUTH_TRUSTED_HOSTS` | no | server | Comma-separated host list | Adds extra hostnames the redirect allowlist accepts |

---

## OpenAI

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `OPENAI_API_KEY` | yes | server | `platform.openai.com → API keys` | Embeddings + chat completions for RAG suggestions and AI assistant |
| `OPENAI_EMBEDDING_MODEL` | no | server | Defaults to `text-embedding-3-small` | Override if you want to A/B another embedder |
| `OPENAI_CHAT_MODEL` | no | server | Defaults to `gpt-4o-mini` | Override for higher-quality answers (costlier) |
| `ANTHROPIC_API_KEY` | no | server | `console.anthropic.com` | Optional fallback provider for `packages/ai` |

## Python AI Worker (incremental, optional)

When `AI_WORKER_URL` is set, embedding calls use the private Python worker;
TypeScript OpenAI embeddings are no longer called. Keep the worker URL and
secret server-only. Omit both variables to retain the current compatibility
provider during migration.

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `AI_WORKER_URL` | no | server | Private Railway worker URL | Selects Python-owned advisory embeddings |
| `AI_WORKER_SHARED_SECRET` | no* | server | Generate a random 32-byte secret | Bearer secret between server callers and worker |
| `AI_WORKER_TIMEOUT_MS` | no | server | Defaults to 15000 | Bounds each worker request |

Worker-only variables belong on the Python service, never in the browser:
`AI_WORKER_SHARED_SECRET`, `AI_PROVIDER_API_KEY`, `AI_PROVIDER_URL`,
`AI_EMBEDDING_MODEL`, `AI_EMBEDDING_DIMENSIONS`, `AI_MAX_TEXTS`,
`AI_MAX_CHARS`, and `AI_PROVIDER_TIMEOUT_SECONDS`.

`OPENAI_API_KEY` remains required for Cortex/chat completions. It is not needed
for embeddings when a correctly authenticated `AI_WORKER_URL` is configured.

---

## Inngest

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `INNGEST_EVENT_KEY` | yes | server | `app.inngest.com → Manage → Event Keys` | Sends events from server actions |
| `INNGEST_SIGNING_KEY` | yes | server | `app.inngest.com → Manage → Signing Key` | Verifies webhooks at `/api/webhooks/inngest` |
| `INNGEST_DEV` | no | server | `1` for local | Forces local dev server mode |

---

## DXF Parser (Railway)

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `PARSER_URL` | no | server | Railway service public URL | When set, BOM uploads route DXF + Togal jobs to the worker |
| `PARSER_SHARED_SECRET` | no | server | Generate (32-byte hex) | HMAC secret between web and parser. Required when `PARSER_URL` is set |

If `PARSER_URL` is unset, the BOM editor falls back to manual line
entry only — parsing is skipped.

---

## DocuSeal (Optional)

When any of these are set, the BOM portal and turnover signing flows
swap the built-in canvas signing pad for a DocuSeal envelope.

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `DOCUSEAL_API_URL` | no | server | Your DocuSeal install URL | Switches signing strategy to DocuSeal envelopes |
| `DOCUSEAL_API_KEY` | no* | server | DocuSeal `Settings → API` | Auth header for envelope creation. Required when `DOCUSEAL_API_URL` is set |
| `DOCUSEAL_WEBHOOK_SECRET` | no* | server | DocuSeal `Settings → Webhooks` | Validates inbound completion webhooks. Required when `DOCUSEAL_API_URL` is set |

Optional — when unset, the built-in canvas signing pad is used. The
audit trail and signature bundle layout are identical either way.

---

## Resend (Optional)

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `RESEND_API_KEY` | no | server | `resend.com → API Keys` | Outbound transactional email |
| `RESEND_FROM_EMAIL` | no | server | Verified sender on Resend | Default `From:` address |

Optional — when unset, notifications log to stdout instead of sending.
Useful in staging so we don't email real customers.

---

## Semaphore SMS (Optional)

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `SEMAPHORE_API_KEY` | no | server | `semaphore.co → Account` | Outbound SMS for SLA breach + warranty alerts |
| `SEMAPHORE_SENDER_NAME` | no | server | Sender name approved by Semaphore | Branded SMS sender |

Optional — when unset, notifications log to stdout instead of sending.

---

## Shared provider quota (NestJS + Redis, disabled by default)

Provider quota endpoint is authenticated by Supabase bearer token and derives
tenant/user scope from Nest principal. It accepts fixed bucket names only; it
cannot write ERP records or change provider limits. Keep selector disabled
until Redis, auth, replay, and spend gates pass for one disposable tenant.

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `ERP_PROVIDER_QUOTA_VIA_API` | no | Next server | Selects shared NestJS Redis accounting; exact `true` only |
| `ERP_PROVIDER_QUOTA_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist; default empty |

When enabled, failed Nest/Redis quota calls fail closed before external AI
work. Edge limiter remains separate per-instance burst guard. This is not a
global budget until every provider instance uses shared accounting.

## Operational asset register reads (NestJS, disabled by default)

The asset register read projection is intentionally closed until the ordered
Supabase migration suffix, disposable PostgreSQL replay, tenant mapping,
protected canary, and rollback evidence are approved. These variables belong
only on the Railway API. They do not grant browser table access or any write
authority.

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `ERP_ASSET_READS_ENABLED` | no | Railway API | Exact `true` enables the Nest read seam; default `false` |
| `ERP_ASSET_READS_TENANT_IDS` | no | Railway API | Comma-separated strict UUID allowlist; default empty |

## Cortex keyword search reads (NestJS, disabled by default)

The Cortex keyword read contract is a closed, tenant-derived NestJS seam. The
Next route remains the compatibility path unless both the exact boolean and
the tenant allowlist match. An enabled canary never falls back to a direct
database query if the Core API is unavailable. Search is bounded keyword
retrieval only; it does not invoke an external AI provider or authorize ERP
writes.

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `ERP_CORTEX_SEARCH_ENABLED` | no | Railway API | Exact `true` enables `GET /v1/cortex/search`; default `false` |
| `ERP_CORTEX_SEARCH_TENANT_IDS` | no | Railway API | Strict UUID allowlist; default empty |
| `ERP_CORTEX_SEARCH_VIA_API` | no | Next server | Selects the authenticated Nest read adapter; exact `true` only |
| `ERP_CORTEX_SEARCH_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist; default empty |

## General-ledger reads (NestJS, disabled by default)

The posted general-ledger projection is tenant-derived and restricted to
finance-authorized roles. The existing `/finance/ledger` page keeps its direct
read path unless both exact flags and the tenant allowlist match. Keep these
closed until disposable replay, hosted parity, protected browser proof, and
rollback evidence are complete.

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `ERP_FINANCE_LEDGER_READS_ENABLED` | no | Railway API | Exact `true` enables `GET /v1/finance/ledger`; default `false` |
| `ERP_FINANCE_LEDGER_READS_TENANT_IDS` | no | Railway API | Strict UUID allowlist; default empty |
| `ERP_FINANCE_LEDGER_READS_VIA_API` | no | Next server | Selects the authenticated Nest read adapter; exact `true` only |
| `ERP_FINANCE_LEDGER_READS_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist; default empty |

## Customer receivables read projection (NestJS, disabled by default)

The `/finance/receivables` page can select the tenant-scoped Nest
`GET /v1/finance/receivables` projection. It returns posted invoice balances,
receipt allocations, retention, withholding, and server-computed aging totals.
The existing server-side read path remains the default. Keep both selectors
closed until disposable replay, exact-cent invoice/allocation parity, RLS and
audit review, protected browser proof, rollback evidence, and spend controls
are complete.

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `ERP_FINANCE_RECEIVABLES_READS_ENABLED` | no | Railway API | Exact `true` enables `GET /v1/finance/receivables`; default `false` |
| `ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS` | no | Railway API | Strict UUID allowlist; default empty |
| `ERP_FINANCE_RECEIVABLES_READS_VIA_API` | no | Next server | Selects the authenticated Nest read adapter; exact `true` only |
| `ERP_FINANCE_RECEIVABLES_READS_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist; default empty |

## Supplier payables read projection (NestJS, disabled by default)

The `/finance/payables` page can select the tenant-scoped Nest
`GET /v1/finance/payables` projection. It returns supplier bills, posted
disbursement allocations, open balances, and server-computed aging totals.
The existing server-side read path remains the default. Keep both selectors
closed until disposable replay, exact-cent supplier-bill/allocation parity,
RLS and audit review, protected browser proof, rollback evidence, and spend
controls are complete.

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `ERP_FINANCE_PAYABLES_READS_ENABLED` | no | Railway API | Exact `true` enables `GET /v1/finance/payables`; default `false` |
| `ERP_FINANCE_PAYABLES_READS_TENANT_IDS` | no | Railway API | Strict UUID allowlist; default empty |
| `ERP_FINANCE_PAYABLES_READS_VIA_API` | no | Next server | Selects the authenticated Nest read adapter; exact `true` only |
| `ERP_FINANCE_PAYABLES_READS_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist; default empty |

## Cash transaction register read projection (NestJS, disabled by default)

The `/finance/cash` page can select the tenant-scoped Nest
`GET /v1/finance/cash-transactions` projection. It returns bounded cash
register rows, same-tenant cash-account/counterparty context, and posted
receipt/disbursement aggregates in exact cents. The existing server-side read
path remains the default. Keep both selectors closed until disposable replay,
exact-cent parity, RLS and audit review, protected browser proof, rollback
evidence, and spend controls are complete.

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `ERP_FINANCE_CASH_READS_ENABLED` | no | Railway API | Exact `true` enables `GET /v1/finance/cash-transactions`; default `false` |
| `ERP_FINANCE_CASH_READS_TENANT_IDS` | no | Railway API | Strict UUID allowlist; default empty |
| `ERP_FINANCE_CASH_READS_VIA_API` | no | Next server | Selects the authenticated Nest read adapter; exact `true` only |
| `ERP_FINANCE_CASH_READS_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist; default empty |

## Project detail read cutover (NestJS, disabled by default)

The project detail page can opt into the tenant-scoped Nest read contract for
one controlled tenant. The default remains the existing server-side read path;
the flag must not be enabled until the API deployment identity, protected
browser proof, and rollback path are recorded.

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `ERP_PROJECT_READS_VIA_API` | no | Next server | Selects Nest `GET /v1/projects/:id`; exact `true` only |
| `ERP_PROJECT_READS_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist; default empty |

## Project collection read cutover (NestJS, disabled by default)

The Projects page may opt into the bounded tenant-scoped Nest list contract for
one controlled tenant. The default remains the existing server-side query;
the flag must not be enabled until pagination, protected browser, exact
deployment identity, and rollback evidence are recorded.

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `ERP_PROJECT_LISTS_VIA_API` | no | Next server | Selects Nest `GET /v1/projects`; exact `true` only |
| `ERP_PROJECT_LISTS_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist; default empty |

## CRM account collection read cutover (NestJS, disabled by default)

The Accounts page may opt into the bounded, tenant-scoped Nest account list
contract for one controlled tenant. The default remains the existing
server-side query; keep the flag disabled until protected browser, exact
deployment, pagination, and rollback evidence are recorded.

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `ERP_ACCOUNT_READS_VIA_API` | no | Next server | Selects Nest `GET /v1/crm/accounts`; exact `true` only |
| `ERP_ACCOUNT_READS_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist; default empty |

## Local Development

The minimum to boot `pnpm dev`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Everything else can be omitted; the corresponding feature will either
no-op or log a stdout warning at first invocation.

## Inventory Stock Movement draft command (disabled by default)

The Nest command owns validation, idempotency, tenant authorization, the
transaction, and audit. Keep both API-side gates false/empty until the hosted
migration ledger and disposable PostgreSQL proof are complete.

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_ENABLED` | no | API server | Nest Stock Movement draft-create gate; default false |
| `ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_TENANT_IDS` | no | API server | Explicit Stock Movement draft-create tenant allowlist; default empty |
| `ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_ENABLED` | no | API server | Nest Stock Movement post/reverse workflow gate; default false |
| `ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_TENANT_IDS` | no | API server | Explicit Stock Movement post/reverse tenant allowlist; default empty |

## Nest API document-processing bridge (disabled by default)

The incremental signed worker path is server-only. Keep every processing flag
false and tenant list empty until the controlled release gate is clear.

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `DXF_PARSER_URL` | no | API server | Private parser `/parse-evidence` base URL |
| `SUPABASE_SERVICE_ROLE_KEY` | no* | API server | Issues a 120-second exact-object Storage URL; never sent to Python |
| `ERP_DOCUMENT_PROCESSING_JOBS_ENABLED` | no | API server | Processing intake gate; default false |
| `ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS` | no | API server | Explicit processing tenant allowlist; default empty |
| `ERP_DOCUMENT_PROCESSING_RECOVERY_ENABLED` | no | API server | BullMQ recovery scheduler gate; default false |
| `ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS` | no | API server | Recovery tenant allowlist; must intersect processing and commit allowlists |
| `ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED` | no | API server | Signed Nest-to-Python bridge gate; default false |
| `ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED` | no | API server | Idempotent CAD draft-BOM gate; default false |
| `ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS` | no | API server | Explicit draft-BOM tenant allowlist; default empty |
| `ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED` | no | API server | Nest scope commit gate; default false |
| `ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS` | no | API server | Explicit commit tenant allowlist; default empty |
| `ERP_DOCUMENT_DELETE_WRITES_ENABLED` | no | API server | Nest document deletion gate; default false |
| `ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS` | no | API server | Explicit deletion tenant allowlist; default empty |
| `ERP_PUBLIC_SIGNING_WRITES_ENABLED` | no | API server | Nest token-authorized public signing gate; default false |
| `ERP_PUBLIC_SIGNING_WRITES_TENANT_IDS` | no | API server | Explicit public-signing tenant allowlist; default empty |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_READ_ENABLED` | no | API server | Token-scoped supplier PO review read gate; default false |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_READ_TENANT_IDS` | no | API server | Explicit supplier-review tenant allowlist; default empty |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_ENABLED` | no | API server | Nest token-authorized supplier confirmation gate; default false |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_TENANT_IDS` | no | API server | Explicit supplier-confirmation tenant allowlist; default empty |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_ENABLED` | no | API server | Closed SCM-issuance session-minting seam; default false |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_TENANT_IDS` | no | API server | Explicit session-minting tenant allowlist; default empty |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_TOKEN_SECRET` | no* | API server | Server-only HMAC secret for deterministic token derivation; required when minting is enabled |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_TTL_HOURS` | no | API server | Pending session lifetime, 1-2160 hours; default 720 |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_ENABLED` | no | API server | Gated supplier confirmation-link email delivery; default false and requires public-write gate |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_TENANT_IDS` | no | API server | Explicit link-delivery tenant allowlist; default empty |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_BASE_URL` | no | API server | HTTPS Nest API origin used for supplier confirmation links |

The Next.js upload compatibility selector is separate from the API-side gates:

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `ERP_DOCUMENT_PROCESSING_VIA_API` | no | Next server | Selects the binary-DWG Next-to-Nest handoff; default false |
| `ERP_DOCUMENT_PROCESSING_TENANT_IDS` | no | Next server | Strict UUID allowlist for the handoff; default empty |
| `ERP_DOCUMENT_DELETE_WRITES_VIA_API` | no | Next server | Selects the Nest document deletion authority; default false |
| `ERP_DOCUMENT_DELETE_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for document deletion; default empty |
| `ERP_PUBLIC_SIGNING_VIA_API` | no | Next server | Selects the Nest public-signing authority; default false |
| `ERP_PUBLIC_SIGNING_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for public signing; default empty |
| `ERP_INVENTORY_RECEIPT_CREATE_VIA_API` | no | Next server | Selects the Stock Receipt Next-to-Nest handoff; default false |
| `ERP_INVENTORY_STOCK_MOVEMENT_CREATE_VIA_API` | no | Next server | Selects the Stock Movement draft-create Next-to-Nest handoff; default false |
| `ERP_INVENTORY_STOCK_MOVEMENT_CREATE_TENANT_IDS` | no | Next server | Strict UUID allowlist for Stock Movement draft creation; default empty |
| `ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_VIA_API` | no | Next server | Selects the Stock Movement post/reverse Next-to-Nest handoff; default false |
| `ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_TENANT_IDS` | no | Next server | Strict UUID allowlist for Stock Movement post/reverse; default empty |
| `ERP_INVENTORY_STOCK_MOVEMENT_READS_VIA_API` | no | Next server | Selects the tenant-scoped Stock Movement register read through Nest; default false |
| `ERP_INVENTORY_STOCK_MOVEMENT_READS_TENANT_IDS` | no | Next server | Strict UUID allowlist for Stock Movement register reads; default empty |
| `ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_VIA_API` | no | Next server | Selects the tenant-scoped Stock Movement detail read through Nest; default false |
| `ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_TENANT_IDS` | no | Next server | Strict UUID allowlist for Stock Movement detail reads; default empty |
| `ERP_INVENTORY_RECEIPT_CREATE_TENANT_IDS` | no | Next server | Strict UUID allowlist for Stock Receipt creation; default empty |
| `ERP_INVENTORY_RECEIPT_POST_VIA_API` | no | Next server | Selects the Stock Receipt post Next-to-Nest handoff; default false |
| `ERP_INVENTORY_RECEIPT_POST_TENANT_IDS` | no | Next server | Strict UUID allowlist for Stock Receipt posting; default empty |
| `ERP_INVENTORY_RECEIPT_REVERSE_VIA_API` | no | Next server | Selects the Stock Receipt reverse Next-to-Nest handoff; default false |
| `ERP_INVENTORY_RECEIPT_REVERSE_TENANT_IDS` | no | Next server | Strict UUID allowlist for Stock Receipt reversal; default empty |
| `ERP_FINANCE_JOURNAL_POST_WRITES_VIA_API` | no | Next server | Selects the journal-post Next-to-Nest handoff; default false |
| `ERP_FINANCE_JOURNAL_POST_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for journal posting; default empty |
| `ERP_FINANCE_JOURNAL_REVERSE_WRITES_VIA_API` | no | Next server | Selects the journal-reversal Next-to-Nest handoff; default false |
| `ERP_FINANCE_JOURNAL_REVERSE_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for journal reversal; default empty |
| `ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API` | no | Next server | Selects the Supplier Bill posting Next-to-Nest handoff; default false |
| `ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for Supplier Bill posting; default empty |
| `ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API` | no | Next server | Selects the Supplier Bill reversal Next-to-Nest handoff; default false |
| `ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for Supplier Bill reversal; default empty |
| `ERP_FINANCE_CASH_WORKFLOW_WRITES_VIA_API` | no | Next server | Selects cash posting/reversal Next-to-Nest handoff; default false |
| `ERP_FINANCE_CASH_WORKFLOW_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for cash posting/reversal; default empty |
| `ERP_FINANCE_CASH_DRAFT_WRITES_VIA_API` | no | Next server | Selects cash draft create/update/delete Next-to-Nest handoff; default false |
| `ERP_FINANCE_CASH_DRAFT_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for cash draft writes; default empty |
| `ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_VIA_API` | no | Next server | Selects customer invoice issuance Next-to-Nest handoff; default false |
| `ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for customer invoice issuance; default empty |
| `ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_VIA_API` | no | Next server | Selects customer invoice draft creation Next-to-Nest handoff; default false |
| `ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for customer invoice draft creation; default empty |
| `ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_VIA_API` | no | Next server | Selects customer invoice reversal Next-to-Nest handoff; default false |
| `ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for customer invoice reversal; default empty |
| `ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_VIA_API` | no | Next server | Selects customer invoice cancellation Next-to-Nest handoff; default false |
| `ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for customer invoice cancellation; default empty |
| `ERP_DELIVERY_SITE_PREPARATION_START_WRITES_VIA_API` | no | Next server | Selects the delivery site-preparation-start Next-to-Nest handoff; default false |
| `ERP_DELIVERY_SITE_PREPARATION_START_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for delivery site-preparation start; default empty |
| `ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API` | no | Next server | Selects the delivery site-preparation-complete Next-to-Nest handoff; default false |
| `ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for delivery site-preparation completion; default empty |
| `ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API` | no | Next server | Selects the delivery inspection-start Next-to-Nest handoff; default false |
| `ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for delivery inspection start; default empty |
| `ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API` | no | Next server | Selects the delivery inspection-complete Next-to-Nest handoff; default false |
| `ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for delivery inspection completion; default empty |
| `ERP_DELIVERY_CANCEL_WRITES_VIA_API` | no | Next server | Selects the delivery cancellation Next-to-Nest handoff; default false |
| `ERP_DELIVERY_CANCEL_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for delivery cancellation; default empty |
| `ERP_PO_BOM_CREATE_WRITES_VIA_API` | no | Next server | Selects the BOM-to-Purchase-Order Next-to-Nest handoff; default false |
| `ERP_PO_BOM_CREATE_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for BOM-to-Purchase-Order creation; default empty |
| `ERP_PO_BOM_GROUPED_CREATE_WRITES_VIA_API` | no | Next server | Selects the grouped BOM-to-Purchase-Order Next-to-Nest handoff; default false |
| `ERP_PO_BOM_GROUPED_CREATE_WRITES_VIA_API_TENANT_IDS` | no | Next server | Strict UUID allowlist for grouped BOM-to-Purchase-Order creation; default empty |

Keep all frontend canary variables false/empty unless a controlled demo-tenant
cutover is approved. Selecting any core path is fail-closed and never falls
back to a direct legacy write after the command is selected.

The API-side delivery site-preparation-start controls are
`ERP_DELIVERY_SITE_PREPARATION_START_WRITES_ENABLED` and
`ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS`; both default to
false/empty.

The API-side delivery site-preparation-completion controls are
`ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_ENABLED` and
`ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS`; both default to
false/empty.

The API-side delivery inspection-start controls are
`ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED` and
`ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS`; both default to false/empty.

The API-side delivery inspection-completion controls are
`ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_ENABLED` and
`ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS`; both default to
false/empty.

The API-side delivery cancellation controls are
`ERP_DELIVERY_CANCEL_WRITES_ENABLED` and
`ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS`; both default to false/empty. The
Next-side selector uses the corresponding `..._VIA_API` flag and UUID
allowlist.

The API-side Supplier Bill posting controls are
`ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED` and
`ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS`; both default to
false/empty. The Next-side selector uses the corresponding
`..._VIA_API` flag and UUID allowlist.

The API-side Supplier Bill reversal controls are
`ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_ENABLED` and
`ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS`; both default to
false/empty. The Next-side selector uses the corresponding
`..._VIA_API` flag and UUID allowlist.

The API-side cash posting/reversal controls are
`ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED` and
`ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS`; both default to false/empty.
The Next-side selector uses the corresponding `..._VIA_API` flag and UUID
allowlist. The Core API is the only authority when selected; a failed Core
request never falls back to a direct browser database function call.

The API-side cash draft create/update/delete controls are
`ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED` and
`ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS`; both default to false/empty.
The Next-side selector uses the corresponding `..._VIA_API` flag and UUID
allowlist. The Core API is the only authority when selected; a failed Core
request never falls back to a direct browser database write.

The API-side customer invoice issuance controls are
`ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED` and
`ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS`; both default to
false/empty. The Next-side selector uses the corresponding `..._VIA_API` flag
and UUID allowlist. The Core API is the only authority when selected; a failed
Core request never falls back to a direct browser database function call.

The API-side customer invoice reversal controls are
`ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED` and
`ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS`; both default to
false/empty. The Next-side selector uses the corresponding `..._VIA_API` flag
and UUID allowlist. The Core API is the only authority when selected; a failed
Core request never falls back to a direct browser database function call.

The API-side customer invoice cancellation controls are
`ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED` and
`ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS`; both default to
false/empty. The Next-side selector uses the corresponding `..._VIA_API` flag
and UUID allowlist. The Core API is the only authority when selected; a failed
Core request never falls back to a direct browser database function call.

`PARSER_SHARED_SECRET` must be at least 20 characters when the private bridge
is activated. Missing URL, secret, service-role key, or matching allowlists
fail closed; no processing job is accepted.

## Python AI worker boundary (source candidate)

`apps/workers/ai` is an advisory-only FastAPI service. It has no database or
tenant credentials and cannot approve or commit ERP state. Its `/health` route
is public; `/v1/embeddings` requires the shared bearer secret and bounds input.
Deployment is separately controlled and is not part of a routine Vercel build.
