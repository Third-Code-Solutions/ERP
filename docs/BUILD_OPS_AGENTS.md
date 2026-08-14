# BUILD OPS Working Agreement v1.1

> Repository execution copy, reconciled with current source on 2026-08-14.
> Root `AGENTS.md` remains repository instruction; this file preserves BUILD OPS authority.
BUILD OPS — working agreement
Construction ERP for Actuate Builders Inc. (ABI), a Philippine design-and-build, fit-out and
MEP contractor. Next.js on Vercel, NestJS Core on Railway, Supabase/Postgres, Redis and a
Railway CAD evidence worker.
Read docs/PRD.md before any schema, pricing or migration work. It holds the locked
decisions, migration DDL, invariants and the WO-01→WO-18 sequence. It is too large to
load automatically — open it when the task touches those areas. Where anything here and
the PRD disagree, the PRD wins.

Execution rule
The requesting task authorizes repository inspection, documentation edits, implementation,
tests and reversible local build work. Execute those without an interactive go-ahead. Record
assumptions, commands, results and rollback in a changeset. Hosted provider/data mutations
still use exact-target, dry-run, backup/restore and health evidence; missing evidence is a
BLOCKED release gate, not a reason to fabricate success.

Current surfaces to preserve
- Web: Next.js 15 App Router, auth, dashboard, portals, server actions and compatibility API routes.
- Core: NestJS modules for auth, CRM, projects, procurement, documents/CAD, process, inventory,
  finance, notifications, search, Today and Cortex under `apps/api/src`.
- Data: Supabase Postgres/Auth/Storage/Realtime, Drizzle, tenant RLS, append-only audit and
  additive migrations. Redis/BullMQ supports Core jobs; Inngest/Edge functions remain adapters.
- Hosting: Vercel Web, Railway Core API/CAD worker, Supabase and Redis. Do not delete a working
  route or module solely because an older PRD omitted it.
This is a refactor, not a rewrite
Three schema facts are verified against repository migrations and replay evidence and are not
open for the refactor:
1. Money is BIGINT centavos; percentages are integer basis points. No floats.
2. tenant_id is NOT NULL on tenant-scoped application tables, with RLS in place.
3. bom_line_items.id is a stable UUID already referenced by cost, budget, PO and RFQ
records.
The relational spine exists. The defect is grain and pricing, not identity.
Hard constraints
Additive migrations only. No DROP COLUMN, no DROP TABLE, no re-pointing an existing
foreign key.
Do not create a second scope model or scope_item_id column. The initial schema already
contains legacy `scope_items` for CAD evidence; new commercial refactor work uses
`bom_line_items` as the stable spine (ADR-03).
No new general-ledger expansion. ABI runs SAP as statutory book of record; existing Finance
ledger, journals, cash and reconciliation routes remain compatibility surfaces and are not
deleted or silently replaced (ADR-07).
No float, double precision, unscaled numeric, or JS number in any monetary path.
Every new table: tenant_id NOT NULL, matching RLS policy, created_at / updated_at
/ created_by, audit participation.

Every machine-verifiable acceptance criterion ships automated coverage. Human,
provider, real-template and owner sign-offs remain explicit release evidence;
they are never replaced by a passing local test.
Takeoff imports upsert, never delete-and-reinsert — that orphans downstream POs and
vendor assignments.
Pricing model
Unit rates are derived from a DUPA (Detailed Unit Price Analysis), never typed. Material +
labour (crew × hourly rate ÷ productivity) + equipment → Direct → OCM 800 bps + Profit
700 bps → VAT 1200 bps → Total → Unit Rate.
Intermediates compute unrounded; round half-up to centavos only at persistence and
presentation. Full spec and the two canonical tests are in PRD §4.
Working style
One work order per slice. Record plan and rollback before any migration. Run migration
replay/dry-run checks before any isolated or hosted apply; do not pause for a conversational
approval.
State assumptions not covered by the PRD, and flag the expensive ones.
If asked to do something that contradicts the constraints above, say so rather than
complying.
Migration execution
Create additive SQL, verify no destructive statements or foreign-key repoints, verify tenant
and audit coverage, run disposable/staging replay and dry-run, then apply only to the exact
authorized target. Adding a dependency requires an ADR. Do not rewrite migration history.
[pnpm dev]         # dev server
[pnpm test]        # full suite — must pass before any work order is called done
[pnpm lint]
[supabase db diff] # generate a migration
[supabase db push --dry-run]  # ALWAYS dry-run before applying

Existing `apps/api/src/finance/` and `/finance/*` routes remain compatibility surfaces; do not
expand statutory accounting scope without a separate ADR and release evidence.
