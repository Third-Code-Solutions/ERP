# BUILD OPS Working Agreement

> Markdown copy extracted from `output/pdf/AGENTS.pdf` on 2026-08-12.
> Root `AGENTS.md` remains repository instruction; this file preserves attached BUILD OPS authority.
BUILD OPS — working agreement
Construction ERP for Actuate Builders Inc. (ABI), a Philippine design-and-build, fit-out and
MEP contractor. Next.js on Vercel, Supabase/Postgres.
Read docs/PRD.md before any schema, pricing or migration work. It holds the locked
decisions, migration DDL, invariants and the WO-01→WO-18 sequence. It is too large to
load automatically — open it when the task touches those areas. Where anything here and
the PRD disagree, the PRD wins.
This is a refactor, not a rewrite
Three schema facts are verified against the live database and are not open:
1. Money is BIGINT centavos; percentages are integer basis points. No floats.
2. tenant_id is NOT NULL on all application tables, with RLS in place.
3. bom_line_items.id is a stable UUID already referenced by cost, budget, PO and RFQ
records.
The relational spine exists. The defect is grain and pricing, not identity.
Hard constraints
Additive migrations only. No DROP COLUMN, no DROP TABLE, no re-pointing an existing
foreign key.
Never create a scope_items table or a scope_item_id column. bom_line_items is
the scope item (ADR-03). This is the most likely wrong instinct in this codebase and it
costs a four-domain migration.
No general ledger work. No journals, posting periods, cash accounts or reconciliation.
ABI runs SAP; we build the interface, not a second book of record (ADR-07). The
existing Finance module is frozen.
No float, double precision, unscaled numeric, or JS number in any monetary path.
Every new table: tenant_id NOT NULL, matching RLS policy, created_at / updated_at
/ created_by, audit participation.

Every acceptance criterion ships as an automated test, not a manual check.
Takeoff imports upsert, never delete-and-reinsert — that orphans downstream POs and
vendor assignments.
Pricing model
Unit rates are derived from a DUPA (Detailed Unit Price Analysis), never typed. Material +
labour (crew × hourly rate ÷ productivity) + equipment → Direct → OCM 800 bps + Profit
700 bps → VAT 1200 bps → Total → Unit Rate.
Intermediates compute unrounded; round half-up to centavos only at persistence and
presentation. Full spec and the two canonical tests are in PRD §4.
Working style
One work order per session. Confirm the plan before running any migration.
Show migrations before running them, on staging first.
State assumptions not covered by the PRD, and flag the expensive ones.
If asked to do something that contradicts the constraints above, say so rather than
complying.
Commands
Migrations run on staging first, never straight to production. Show me the SQL and the
rollback before applying anywhere.
Ask before
Applying any migration
Adding a dependency
Touching supabase/migrations/ history
[pnpm dev]         # dev server
[pnpm test]        # full suite — must pass before any work order is called done
[pnpm lint]
[supabase db diff] # generate a migration
[supabase db push --dry-run]  # ALWAYS dry-run before applying

Anything under src/modules/finance/ (frozen — see ADR-07)
