# ABI Ops

> Unified fit-out operations platform for **Actuate Builders Inc.** — built by **Th/rd Code Solutions**. ABI Ops collapses the seven disconnected systems (Account/CRM → Proposal → BOM → Pre-Construction → Construction → Post-Construction → Warranty) used by a Philippine commercial fit-out contractor into a single source of truth with role-based RLS, append-only audit, and SLA-driven automation.

![status](https://img.shields.io/badge/status-internal_alpha-orange) ![stack](https://img.shields.io/badge/stack-Next.js%2015%20%C2%B7%20Supabase%20%C2%B7%20Inngest-blue)

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js 15 (App Router) on Vercel · React 19 · Tailwind v4 |
| Backend | Next.js Server Actions + Route Handlers · Zod at every boundary |
| Database | Supabase Postgres 16 · Drizzle ORM · pgvector |
| Storage | Supabase Storage (project documents, signature bundles) |
| Auth | Supabase Auth with RLS (`tenant_id`-scoped) |
| RAG / AI | OpenAI `gpt-4o-mini` + `text-embedding-3-small`, optional Anthropic |
| Jobs | Inngest (preferred) · Supabase Edge Functions (legacy crons) |
| Email | Resend (optional — stdout fallback) |
| SMS | Semaphore (optional — stdout fallback) |
| E-Sign | Built-in canvas signing pad · DocuSeal envelope flow (optional) |

## Quick Start

```bash
pnpm install
cp .env.example .env.local              # fill in Supabase + OpenAI keys
pnpm --filter @buildops/database push   # apply Drizzle schema
pnpm dev                                # web + workers on turbo
```

Open `http://localhost:3000` and sign in. Seed data lives in
`packages/database/src/seed.ts`. See [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md)
for the full env matrix.

## Folder Structure

```text
erp/
├── apps/
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
│   ├── migrations/         # SQL migrations (12 files; see DEPLOYMENT.md)
│   └── functions/          # Edge functions (legacy crons)
├── infra/                  # Scripts, docker, GH actions support
├── scripts/                # Repo-wide one-shots
└── docs/                   # Architecture, deployment, user story index
```

## Module Map

The platform is built as ten user-facing modules. Each line lists the
top-level route under `apps/web/src/app/(dashboard)`.

| Module | Route | One-liner |
|---|---|---|
| CRM — Accounts & Pipeline | `/crm/accounts`, `/pipeline` | Accounts with KYC + 8-stage opportunity pipeline |
| Projects | `/projects` | Project workspace (parent for all post-Won activity) |
| Proposal Workflow | `/crm/opportunities/[id]/proposal` | PPRF, site inspection, design upload, change log |
| BOM Engine | `/bom`, `/projects/[id]/bom` | Togal import, line editor, client portal + e-sign |
| Procurement | `/procurement`, `/purchase-orders` | RFQ dispatch, AR codes, two-step PO approval |
| Pre-Construction | `/permits`, `/projects/[id]/checklist` | Auto-checklist, permit tracker, PO generation |
| Construction Cadence | `/tasks`, `/projects/[id]/progress` | Daily/weekly tasks, variation orders, S-curve |
| Post-Construction | `/punchlist`, `/projects/[id]/turnover` | Punchlist, COC, turnover package |
| Warranty & CX | `/warranty`, `/portal/warranty/[token]` | Client portal, ticket triage, auto CNPS surveys |
| Admin & Reports | `/admin`, `/reports`, `/dashboard` | Rate cards, mapping, executive KPIs |

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — system map, data model, auth/RLS, jobs
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel + Supabase + Inngest + Railway setup
- [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) — every env var, scope, where to get it
- [docs/USER_STORY_INDEX.md](docs/USER_STORY_INDEX.md) — REFACTOR.md user stories mapped to code paths
- [apps/web/REFACTOR.md](apps/web/REFACTOR.md) — full software PRD (user stories, API spec, sprint plan)
- [supabase/functions/README.md](supabase/functions/README.md) — edge function deploy + cron wiring

## Scripts

```bash
pnpm dev                # web + workers (turbo parallel)
pnpm build              # production build
pnpm typecheck          # strict tsc across all packages
pnpm lint               # eslint + prettier check
pnpm test               # vitest unit + integration
```

## License & Contributing

Internal project — proprietary to Th/rd Code Solutions Inc. and Actuate
Builders Inc. Contribution guidelines live in [AGENTS.md](AGENTS.md);
agent routing rules and scope boundaries are enforced per session.
