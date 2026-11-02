# ABI OPS

> A connected construction and project-business operating system built by
> **Actuate Builders Inc.** ABI OPS unifies Account/CRM → Proposal →
> BOM → Pre-Construction → Construction → Billing → Post-Construction →
> Warranty with tenant-scoped access, append-only audit, automation, and Cortex.

![status](https://img.shields.io/badge/status-internal_alpha-orange) ![stack](https://img.shields.io/badge/stack-Next.js%2015%20%C2%B7%20NestJS%2011%20%C2%B7%20PostgreSQL-blue)

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) on Vercel · React 19 · Tailwind v4 |
| Backend | NestJS 11 modular monolith (incremental authority) · legacy Next.js actions/handlers during migration |
| Database | Supabase Postgres 17 · Drizzle ORM · pgvector |
| Storage | Supabase Storage (project documents, signature bundles) |
| Auth | Supabase Auth with RLS (`tenant_id`-scoped) |
| RAG / AI | OpenAI `gpt-4o-mini` + `text-embedding-3-small`, optional Anthropic |
| Jobs | Redis + BullMQ for the new core · Inngest and Edge Functions during migration |
| Email | Resend (optional — stdout fallback) |
| SMS | Semaphore (optional — stdout fallback) |
| E-Sign | Built-in canvas signing pad · DocuSeal envelope flow (optional) |

## Quick Start

Use Node.js 22 and pnpm 10.33.0. ABI OPS needs both Web and Core API, PostgreSQL/Auth/Storage through Supabase, and Redis. Python workers are separate processes.

```bash
pnpm install --frozen-lockfile
supabase start                           # Docker required; use this repo's CLI version
supabase status                         # obtain this local project's URLs and keys
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

Fill both files with values from the **same local Supabase project**. Web needs `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL=http://localhost:3000` and `ERP_CORE_API_URL=http://localhost:3001`. Core needs `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and a running `REDIS_URL`. Root `.env.local` is not automatically shared with Core. On PowerShell use `Copy-Item` instead of `cp` if needed.

For a **disposable local project only**, `supabase db reset --local` applies ordered migrations and `supabase/seed.sql`. It deletes existing local data; never use it on an installation containing company data. Start Redis separately, then run `pnpm dev` for Web and Core. Confirm `http://localhost:3001/ready`, `http://localhost:3000/api/ready` and `http://localhost:3000/api/health?deep=1` report readiness before signing in at `http://localhost:3000`.

Create and verify the initial administrator through the installation's Supabase Auth flow; seed rows are synthetic fixtures, not login credentials. Configure company identity and team roles before entering business data. Optional AI, CAD, email and signing services require their own credentials/workers and acceptance checks; a successful Web startup does not verify them. See [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) for the service-specific matrix and [docs/adrs/ADR-040-independent-company-installations.md](docs/adrs/ADR-040-independent-company-installations.md) for independent ownership boundaries.

## Folder Structure

```text
erp/
├── apps/
│   ├── api/                # NestJS core ERP modular monolith
│   ├── web/                # Next.js 15 frontend + server actions
│   └── workers/            # Railway Python services (dxf-parser)
├── packages/
│   ├── database/           # Drizzle schema, migrations, seed
│   ├── shared-types/       # Zod schemas shared across web + workers
│   ├── ai/                 # OpenAI clients, RAG retrieve/synthesize
│   ├── auth/               # Supabase helpers (server/browser/admin)
│   ├── ui/                 # Shared shadcn-based components
│   └── config/             # Shared eslint/tsconfig/tailwind
├── supabase/
│   ├── migrations/         # Ordered SQL migrations; see release checks
│   └── functions/          # Edge functions (legacy crons)
├── infra/                  # Scripts, docker, GH actions support
├── scripts/                # Repo-wide one-shots
└── docs/                   # Architecture, deployment, user story index
```

## Module Map

The platform is built as thirteen user-facing modules. Each line lists the
top-level route under `apps/web/src/app/(dashboard)`.

| Module | Route | One-liner |
|---|---|---|
| CRM — Accounts & Pipeline | `/crm/accounts`, `/pipeline` | Accounts with KYC + 8-stage opportunity pipeline |
| Projects | `/projects` | Project workspace (parent for all post-Won activity) |
| Proposal Workflow | `/crm/opportunities/[id]/proposal` | PPRF, site inspection, design upload, change log |
| BOM Engine | `/bom`, `/projects/[id]/bom` | Togal import, line editor, client portal + e-sign |
| Project Cost Control | `/projects/[id]/cost`, `/projects/[id]/cost/budget` | Versioned Cost Code budgets, dual approval, commitments, actuals, forecast, and variance |
| Procurement | `/procurement`, `/purchase-orders` | RFQ dispatch, AR codes, PM/Commercial/SCM PO approval |
| Inventory | `/inventory`, `/inventory/receipts`, `/inventory/movements` | UOM/Item/Warehouse masters, controlled receipts, transfers, project consumption, count adjustments, and perpetual stock evidence |
| Pre-Construction | `/permits`, `/projects/[id]/checklist` | Auto-checklist, permit tracker, PO generation |
| Construction Cadence | `/tasks`, `/projects/[id]/progress` | Daily/weekly tasks, variation orders, S-curve |
| Post-Construction | `/punchlist`, `/projects/[id]/turnover` | Punchlist, COC, turnover package |
| Warranty & CX | `/warranty`, `/portal/warranty/[token]` | Client portal, ticket triage, auto CNPS surveys |
| Finance | `/finance`, `/finance/receivables`, `/finance/payables`, `/finance/cash`, `/finance/reconciliation`, `/finance/ledger` | Three-way-matched payables, controlled subledgers, allocated cash, bank reconciliation, immutable journals, reversals, aging, and ledger |
| Admin & Reports | `/admin`, `/reports`, `/dashboard` | Rate cards, mapping, executive KPIs |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system map, data model, auth/RLS, jobs
- [docs/architecture/CURRENT_STATE.md](docs/architecture/CURRENT_STATE.md) — verified migration baseline
- [docs/architecture/MIGRATION_PLAN.md](docs/architecture/MIGRATION_PLAN.md) — incremental NestJS transaction migration
- [docs/operations/NEXT_ACTIONS.md](docs/operations/NEXT_ACTIONS.md) — exact operational handoff
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel + Supabase + Inngest + Railway setup
- [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) — every env var, scope, where to get it
- [docs/USER_STORY_INDEX.md](docs/USER_STORY_INDEX.md) — REFACTOR.md user stories mapped to code paths
- [apps/web/REFACTOR.md](apps/web/REFACTOR.md) — full software PRD (user stories, API spec, sprint plan)
- [supabase/functions/README.md](supabase/functions/README.md) — edge function deploy + cron wiring

## Scripts

```bash
pnpm dev                # Web + Core API (Python workers run separately)
pnpm build              # production build
pnpm typecheck          # strict tsc across all packages
pnpm lint               # ESLint, warnings treated as failures
pnpm test               # vitest unit + integration
pnpm audit --prod --audit-level moderate  # production dependency gate
```

## License & Contributing

Internal project — proprietary to Actuate Builders Inc. Contribution
guidelines live in [AGENTS.md](AGENTS.md);
agent routing rules and scope boundaries are enforced per session.
