# Architecture

ABI OPS is a transitional ERP architecture: a Next.js 15 Web application and a
NestJS 11 Core API share a Supabase Postgres 17 data plane while authority moves
incrementally from compatibility Server Actions into typed Core REST modules.
Redis/BullMQ runs Core queues, Inngest runs Web-compatible scheduled/event jobs,
and Railway hosts the Core and CAD worker. An AI FastAPI worker is implemented
but is not part of the canonical production promotion workflow.

The current product authority is [`docs/PRD.md`](PRD.md). This document describes
executable topology; it does not override PRD data-model or rollout constraints.

## System map

```text
Browser (React 19 / Next App Router)
  |
  +-> Vercel: apps/web
  |     +-> RSC and compatibility Server Actions -> Drizzle/Postgres
  |     +-> 34 Next route handlers
  |     +-> selective REST calls -> Railway Core
  |     +-> Supabase Auth, signed Storage uploads and Realtime
  |     +-> Inngest event/cron functions
  |
  +-> Supabase Auth / Realtime / private Storage

Railway Core: apps/api (NestJS 11)
  +-> Supabase JWT verification + fail-closed capability guard
  +-> Drizzle/Postgres 17
  +-> Redis/BullMQ queues and processors
  +-> CAD worker and optional AI worker boundaries

Supabase data plane
  +-> tenant-scoped operational tables and RLS
  +-> append-only audit evidence
  +-> pgvector embeddings
  +-> Auth, Storage and Realtime

External integrations
  +-> OpenAI / optional Anthropic
  +-> DocuSeal or Canvas signing
  +-> Resend and Semaphore
```

## Runtime components and authority

| Component | Source | Production | Current authority |
| --- | --- | --- | --- |
| Web | `apps/web` | Vercel `thirdcode-erp` | UI, RSC reads, compatibility actions/routes, portals, Inngest |
| Core API | `apps/api` | Railway `Third Code ERP API` | Nest REST modules, capability guard, queues, selected system-of-record writes |
| CAD worker | `apps/workers/dxf-parser` | Railway `ABI OPS CAD Worker` | Evidence-only DXF/DWG extraction; no database authority |
| AI worker | `apps/workers/ai` | No canonical target | Optional private embedding/grounded-answer boundary |
| Database/Auth/Storage | `packages/database`, `supabase` | Supabase | Postgres 17, RLS, Auth, private objects, Realtime, pgvector |
| Shared contracts | `packages/shared-types` | Bundled with Web/Core | Zod domain/API contracts and authorization matrix |

The Web/Core migration is deliberately incremental. Do not infer that every Web
write already routes through Core. The source of truth for each route is its
actual Server Action/handler and `apps/web/src/lib/erp-core-client.ts` adapter.

## Request and data boundaries

### Web

- Supabase validates the browser session.
- `getUserProfile()` reads the canonical `tenant_id` and role from `public.users`;
  user metadata is not trusted for authorization.
- Server Components and Server Actions use a mix of authenticated Supabase reads,
  direct Drizzle compatibility queries, and Core REST calls.
- Every direct Drizzle query must repeat the tenant predicate. RLS does not excuse
  missing application authorization for a mutation.
- Client modules cannot import server/database packages; the App Router and
  client-boundary verification scripts enforce that structural boundary.

### Core

- `SupabaseJwtGuard` validates the bearer token and hydrates the principal from
  `public.users`.
- `CapabilityGuard` is global and fail-closed: a non-public route without an
  explicit capability policy is rejected.
- Controllers accept Zod-backed shared contracts and services repeat tenant scope
  in database operations.
- Redis/BullMQ handles bounded, retryable CAD, procurement and Cortex work.

ADR-022 keeps `tenant_memberships` dormant in Phase 0. Active tenant and role are
still derived from `public.users`; do not implement tenant switching by assuming
membership activation.

## Commercial data spine

The PRD locks `bom_line_items` as the stable commercial identity used by DUPA,
takeoff/import, approval, budget, procurement and cost control. Legacy
`scope_items` remains a CAD/manual compatibility input; it must not become a
second commercial scope model or trigger foreign-key repointing.

```text
tenant
  +-> users (active tenant + role)
  +-> accounts -> opportunities -> proposals
  |                              +-> award/project conversion
  +-> projects
       +-> documents / scope_items compatibility input
       +-> boms -> bom_line_items -> DUPA resources
       |                         +-> budgets / RFQs / PO lines
       +-> permits / cadence / process instances
       +-> cost control / billing / claims / finance
       +-> turnover / warranty / portal evidence

audit_log  append-only evidence
embeddings pgvector tenant-scoped retrieval data
```

Money remains integer centavos and rates basis points. Fractional BOM quantity is
currently blocked by the exact-representation decision recorded in
`docs/blockers/2026-08-17-bom-fractional-quantity-schema.md`.

## Background execution

The Inngest endpoint is `apps/web/src/app/api/webhooks/inngest/route.ts`. It
registers exactly these nine functions:

| Function id | Trigger | Purpose |
| --- | --- | --- |
| `embed-bom-line-items` | `bom/approved` | Embed approved BOM line items |
| `generate-daily-cadence-tasks` | `0 23 * * *` UTC | Generate next-day Manila cadence tasks |
| `generate-cadence-on-demand` | `cadence/generate.requested` | Generate bounded tenant/project cadence on demand |
| `dispatch-cnps-surveys` | hourly | Find warranty tickets due for CNPS survey |
| `cnps-survey-scheduled` | `cnps/survey.scheduled` | Dispatch a scheduled survey event |
| `sla-checker` | every 30 minutes | Warn/breach legacy open SLA logs |
| `permit-staleness-checker` | daily UTC | Surface stale permit records |
| `on-bom-internal-approved-create-rfq` | BOM approval events | Auto-create the RFQ workflow |
| `process-sla-checker` | every 15 minutes | Evaluate Process/SLA instances |

Core also registers seven BullMQ queues and six processors across CAD,
procurement and Cortex. The legacy Supabase Edge functions remain separately
deployed compatibility schedulers; the canonical GitHub production workflow does
not deploy them.

## Realtime subscriptions

The browser has three concrete subscriptions:

- `dashboard-realtime`: changes to `opportunities`, `purchase_orders`, `invoices`
  and `boms`, debounced into a route refresh.
- `pipeline-board-realtime`: changes to `opportunities`.
- `notif:{userId}`: `notifications` filtered by `recipient_user_id`.

Channel names are not tenant authorization. Supabase RLS and the filter/predicate
remain the security boundary.

## Signing

Canvas and DocuSeal are selected server-side. Current operator configuration must
use the exact runtime variable names. Audit findings AUD-005 and AUD-014 document
two unresolved production blockers: DocuSeal completion does not yet guarantee a
durable private-bucket artifact, and signer/configuration assurance can diverge.
Do not represent those paths as production-verified until their regressions pass.

## Deployment topology

- Web: Vercel project `thirdcode-erp`, canonical URL
  `https://thirdcode-erp.vercel.app`, Node 22.x.
- Core: Railway service `Third Code ERP API`, readiness `/ready`.
- CAD: Railway service `ABI OPS CAD Worker`, health `/health`.
- Data plane: fixed Supabase project in the production workflow.
- Promotion: `.github/workflows/deploy-production.yml` on `main` only, applying
  additive migrations before Core/CAD/Web deploy and authenticated E2E.

ADR-020 calls this a protected workflow. Provider verification on 2026-08-24
found that `main` and environment `production` currently have no GitHub protection
rules. See `docs/audit/FULL_REPOSITORY_AUDIT.md` AUD-015 before any promotion.

## Observability and current gaps

Core emits health/readiness and structured application logs. Repository evidence
does not currently prove Sentry, Axiom or Better Stack projects, alert ownership,
or synthetic alert delivery. The full current gap and other release blockers are
tracked in `docs/audit/FULL_REPOSITORY_AUDIT.md`; provider dashboards must be
verified rather than inferred from a stack table.
