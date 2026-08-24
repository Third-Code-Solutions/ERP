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

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local  # fill in Supabase + OpenAI keys
supabase start                           # requires Docker
supabase db reset --local                # ordered migrations + deterministic seed
pnpm dev                                # web + workers on turbo
```

Open `http://localhost:3000` and sign in. Reset data lives in
`supabase/seed.sql`. See [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md)
for the full env matrix.

## Folder Structure

```text
erp/
├── apps/
│   ├── api/                # NestJS core ERP modular monolith
│   ├── web/                # Next.js 15 frontend + server actions
│   └── workers/            # FastAPI services (dxf-parser and optional AI worker)
├── packages/
│   ├── database/           # Drizzle schema, migrations, seed
│   ├── shared-types/       # Zod contracts shared across Web + Core
│   ├── ai/                 # OpenAI clients, RAG retrieve/synthesize
│   ├── auth/               # Supabase helpers (server/browser/admin)
│   └── config/             # Shared TypeScript configuration
├── supabase/
│   ├── migrations/         # Ordered SQL migrations; see release checks
│   └── functions/          # Edge functions (legacy crons)
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
- [docs/PRD.md](docs/PRD.md) — current product and delivery authority
- [apps/web/REFACTOR.md](apps/web/REFACTOR.md) — historical user-story/API source retained for traceability
- [supabase/functions/README.md](supabase/functions/README.md) — edge function deploy + cron wiring

## Scripts

```bash
pnpm dev                # web + workers (turbo parallel)
pnpm build              # production build
pnpm typecheck          # strict tsc across all packages
pnpm lint               # ESLint 9 repository gate (type checking is separate)
pnpm test               # vitest unit + integration
pnpm audit --prod --audit-level moderate  # production dependency gate
```

## License & Contributing

Internal project — proprietary to Actuate Builders Inc. Contribution
guidelines live in [AGENTS.md](AGENTS.md);
agent routing rules and scope boundaries are enforced per session.
