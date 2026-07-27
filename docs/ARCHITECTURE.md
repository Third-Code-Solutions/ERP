# Architecture

Third Code ERP is a single Next.js 15 application backed by Supabase, with
Inngest for background work and an optional Python DXF worker on
Railway. The same Postgres instance carries operational rows, vector
embeddings, the append-only audit log, and Supabase Auth — every table
is `tenant_id`-scoped and protected by row-level security.

---

## System Map

```text
                  ┌────────────────────────────────────────┐
                  │  Browser (React 19 · App Router · RSC) │
                  └───────────────┬────────────────────────┘
                                  │ HTTPS / WSS
                  ┌───────────────┴────────────────────────┐
                  │  Vercel Edge + Next.js Server Actions  │
                  └─┬───────────┬─────────────┬────────────┘
                    │           │             │
       ┌────────────┴──┐ ┌──────┴───────┐ ┌──┴──────────────────┐
       │ Supabase      │ │ Inngest      │ │ Railway (optional)  │
       │ - Postgres 17 │ │ - sla.tick   │ │ - dxf-parser        │
       │ - Auth        │ │ - cadence    │ │ - rag-indexer       │
       │ - Storage     │ │ - warranty   │ └─────────────────────┘
       │ - Realtime    │ │ - permits    │
       │ - pgvector    │ └──────────────┘
       └───────────────┘
                    │
                    ▼
       ┌─────────────────────────────────────────────────────────┐
       │ External (all optional)                                  │
       │ OpenAI · Anthropic · DocuSeal · Resend · Semaphore SMS  │
       └─────────────────────────────────────────────────────────┘
```

Client requests hit Vercel's edge, then either render server
components against Supabase (RLS-scoped) or invoke server actions that
mutate via Drizzle. Mutations emit Inngest events for any work that
should not block the request (notifications, cadence rollups, parser
calls). The DXF parser is the only non-TypeScript service.

---

## Data Model Summary

Entities are scoped per tenant. RLS enforces isolation; no application
code joins across tenants.

```text
tenants
  └── users (membership + role)

accounts ─┬── opportunities ──┬── proposals
          │                   ├── bom_drafts ── bom_lines
          │                   └── projects
          │
projects ─┼── scope_items ──── boms ──── bom_line_items
          ├── change_orders / variation_orders
          ├── permits
          ├── purchase_orders ── po_lines ── vendors
          ├── tasks (daily / weekly cadence)
          ├── punchlist_items
          ├── documents (DXF, PDF, photos, signatures)
          ├── billing_milestones ── invoices
          ├── coc / turnover_packages
          └── warranty_tickets ── cnps_surveys

audit_log     (append-only, hash-chained)
embeddings    (pgvector — scope + BOM history + docs)
sla_logs      (cross-entity SLA timers)
signature_sessions  (canvas + DocuSeal envelopes)
```

Every business table has `tenant_id`, `created_at`, `created_by`, and
an `updated_at` trigger. Soft-delete is via `deleted_at`; rows are
never hard-deleted from operational tables.

---

## Module Map

| Module | Owning Tables | Routes |
|---|---|---|
| CRM — Accounts & Pipeline | `accounts`, `contacts`, `opportunities` | `/crm/accounts`, `/crm/opportunities`, `/pipeline` |
| Projects | `projects`, `documents`, `scope_items` | `/projects`, `/projects/[id]` |
| Proposal Workflow | `proposals`, `site_inspections`, `design_uploads`, `client_changes` | `/crm/opportunities/[id]/proposal` |
| BOM Engine | `boms`, `bom_lines`, `signature_sessions` | `/bom`, `/projects/[id]/bom`, `/portal/bom/[token]` |
| Project Cost Control | `cost_codes`, `project_budgets`, `project_budget_lines`, `cost_entries` | `/projects/[id]/cost`, `/projects/[id]/cost/budget` |
| Procurement | `vendors`, `rfqs`, `purchase_orders`, `po_lines` | `/procurement`, `/purchase-orders` |
| Inventory | `units_of_measure`, `material_items`, `warehouses`, `stock_receipts`, `stock_receipt_lines`, `stock_movements`, `stock_movement_lines`, `stock_ledger_entries` | `/inventory`, `/inventory/receipts`, `/inventory/receipts/[id]`, `/inventory/movements`, `/inventory/movements/[id]` |
| Pre-Construction | `permits`, `checklists` | `/permits`, `/projects/[id]/checklist` |
| Construction Cadence | `tasks`, `variation_orders`, `progress_snapshots` | `/tasks`, `/projects/[id]/progress`, `/projects/[id]/vos` |
| Post-Construction | `punchlist_items`, `coc`, `turnover_packages` | `/punchlist`, `/projects/[id]/turnover` |
| Warranty & CX | `warranty_tickets`, `cnps_surveys` | `/warranty`, `/portal/warranty/[token]`, `/portal/cnps/[token]` |
| Finance | `fiscal_periods`, `ledger_accounts`, `journal_entries`, `journal_lines`, `invoices`, `supplier_bills`, `supplier_bill_lines`, `cash_accounts`, `cash_transactions`, `cash_allocations`, `bank_statements`, `bank_statement_lines` | `/finance`, `/finance/receivables`, `/finance/payables`, `/finance/cash`, `/finance/reconciliation`, `/finance/ledger` |
| Admin & Reports | `rate_cards`, `material_items`, `mapping_config` | `/admin`, `/reports`, `/dashboard` |

---

## Auth Flow + RLS Pattern

1. Browser hits Supabase Auth (`/(auth)/login`). On success Supabase
   returns a JWT containing `sub` (auth user id) and a custom claim
   `tenant_id` resolved from the `users` membership table.
2. Server components and server actions construct a Supabase client
   with `cookies()` so RLS receives the JWT.
3. Every business table has an RLS policy of the form:

   ```sql
   tenant_id = (select tenant_id from users where id = auth.uid())
   ```

4. Service-role keys are used only inside Inngest jobs and webhook
   handlers that must operate cross-tenant (e.g. the SLA cron). These
   call sites scope manually by `tenant_id` parameter.

Roles are enforced application-side in server actions: `Owner`,
`Admin`, `Estimator`, `PM`, `Sales`, `Procurement`, `Compliance`,
`Viewer`. Role checks happen before any mutation; viewers reach
read-only queries through RLS naturally.

---

## Hash-Chained Audit Log

`audit_log` is append-only. Triggers in
`supabase/migrations/20260509164538_audit_triggers.sql` write a row on
every `INSERT / UPDATE / DELETE` on tables tagged for audit. Each row
stores:

- `actor_id`, `entity_type`, `entity_id`, `action`, `diff` (JSONB)
- `prev_hash` (last row's hash for the same tenant)
- `hash = sha256(prev_hash || canonical(row))`

A scheduled Inngest verifier walks the chain nightly and reports any
break. No application role has `UPDATE` or `DELETE` privilege on this
table; the only DDL that can touch it is migration-level.

---

## Signing Strategy

Two modes, selected by env at boot:

- **Canvas (default).** The portal renders a HTML5 canvas signing
  pad. On submit, the PNG + a JSON envelope (signer email, hashed
  document, timestamp, IP) are written to Supabase Storage and a
  `signature_sessions` row records the bundle path.
- **DocuSeal (when `DOCUSEAL_API_URL` is set).** The portal redirects
  the signer to a DocuSeal envelope. On completion, DocuSeal POSTs to
  `/api/webhooks/docuseal`; the handler verifies the HMAC against
  `DOCUSEAL_WEBHOOK_SECRET`, downloads the signed PDF, and writes the
  same `signature_sessions` envelope so downstream code does not
  branch on signing mode.

Either way, the BOM lock or turnover acceptance triggers the same
state transition on the parent entity.

---

## Background Jobs

All functions live under `apps/web/src/lib/inngest-*.ts` and are
registered through `/api/webhooks/inngest`.

| Function | Trigger | What it does |
|---|---|---|
| `sla.tick` | cron `*/30 * * * *` | Walks open `sla_logs`, emits warn / breach notifications via Resend + Semaphore |
| `cadence.daily` | cron `0 23 * * *` UTC (07:00 PHT) | Rolls daily tasks forward, snapshots progress for the S-curve |
| `warranty.cnps` | cron `0 * * * *` | Sends CNPS surveys for tickets closed > 48h without a survey row |
| `permits.staleness` | cron `0 0 * * *` UTC (08:00 PHT) | Surfaces permits stuck > 7 days to PM + GM |
| `bom.parse` | event `bom.upload.received` | Calls the Railway DXF parser, writes draft BOM lines |
| `bom.embed` | event `bom.lines.saved` | Embeds line text into `embeddings` for RAG suggestions |
| `audit.verify` | cron `0 17 * * *` UTC | Walks the audit log hash chain; alerts on break |

The legacy Supabase Edge Functions (`sla-checker`,
`permit-staleness-checker`, `cnps-survey-sender`) cover the same
ground for deploys that cannot reach Inngest.

---

## Realtime Channels

Supabase Realtime is subscribed from the browser for two surfaces:

- **Executive Dashboard.** Channel `dashboard:{tenant_id}` re-renders
  KPI cards when any of `opportunities`, `projects`, `boms`, or
  `invoices` mutate.
- **Project Workspace.** Channel `project:{project_id}` updates the
  activity feed and progress widgets as cadence jobs and PM mutations
  land.

Subscriptions are scoped by RLS — browsers cannot subscribe to a
tenant they do not belong to. Reconnects are backed off via
exponential jitter (max 30s).
