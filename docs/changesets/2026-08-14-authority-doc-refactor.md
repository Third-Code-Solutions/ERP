# Authority-document refactor — 2026-08-14

## Status

PARTIALLY VERIFIED. The three requested BUILD OPS Markdown authorities now match
the current repository architecture and no longer instruct the agent to wait for
a conversational go-ahead for repository work. Application reconciliation is
locally green, and the Web/Core changes are deployed to live production. The
production schema/RLS gates pass, but audit-hash integrity and BUILD OPS data
gates are not green.

## Changed

- `docs/PRD.md` bumped to v1.4. Added current Web/Core/API/Storage/hosting
  inventory; documented legacy `scope_items` compatibility input; preserved
  `bom_line_items` as the commercial spine; clarified existing Finance/Cortex/CAD
  surfaces; replaced stale Codex permission/wait language; retained all tenant,
  audit, additive-migration, pricing and release safety constraints.
- `docs/PROMPTS.md` bumped to v1.4. Removed conversational approval pauses and
  source-file assumptions; added current source contract; converted migration,
  template and delegation guidance to evidence-led execution with explicit
  BLOCKED boundaries.
- `docs/BUILD_OPS_AGENTS.md` bumped to v1.1. Added current stack/surface inventory,
  removed `Ask before` workflow gates, corrected legacy scope and Finance wording,
  and retained bounded migration/provider checks.
- `tasks/plan.md` and `tasks/todo.md` refreshed for this bounded reconciliation.
- `docs/operations/managed-supabase-parity-plan.json` repaired to the current
  142-file source ledger: 55 recorded applied, 87 pending, 19 ordered review
  batches. This is source bookkeeping only; no hosted migration was run.
- `apps/web/src/app/page.tsx` now uses the existing five-node structured-data
  builder instead of an inline three-node duplicate.
- `/api/health` and `/api/ready` now return baseline security headers even though
  middleware intentionally bypasses auth/session work for monitoring probes.
- `apps/web/src/app/(dashboard)/projects/[id]/bom/actions.test.ts` was aligned
  with the current AI-pricing approval query shape.
- Root `build` and `test` scripts are serialized with Turbo concurrency `1` so
  Windows local verification does not race shared `.next` or test resources.

## Evidence

- PASS — repository root `D:\thirdcode\ERP`, remote `Third-Code-Solutions/ERP`,
  branch `main`, dirty worktree preserved.
- PASS — actual `AGENTS.md`, `CLAUDE.md`, requested Markdown files and relevant
  current-state/deployment documents read.
- PASS — source inventory found Next.js 15 Web, NestJS Core, Supabase/Drizzle,
  Redis/BullMQ, Inngest/Edge compatibility, Railway CAD worker, portals, Finance,
  Inventory, Cortex, procurement, cost-control and document/storage routes.
- PASS — live read-only probes after deployment: Vercel `/`, `/api/health`,
  `/api/ready`; Railway Core `/health`, `/ready`; CAD worker `/health` all returned
  HTTP 200. Web revision prefix observed as `dpl_Ve91H9uL`.
- PASS — Vercel production deployment `dpl_Ve91H9uLJQ7MqmDRPoyPo5osnvDC`
  reached `READY` and the `thirdcode-erp.vercel.app` alias was promoted.
- PASS — Railway Core deployment `190d69df-8efd-41cf-b7a1-de86c9977aff`
  reached `SUCCESS`; the `/ready` healthcheck passed and runtime logs showed
  the Nest application listening on port 8080.
- PASS — focused structured-data unit test: 1 test.
- PASS — local Playwright public frontend smoke: 1 test; desktop/tablet/mobile,
  metadata, manifest, robots, sitemap, health/ready headers and interactions.
- PASS — `pnpm typecheck`.
- PASS — `pnpm lint` (repository currently performs TypeScript-only lint checks;
  ESLint flat config is not yet configured).
- PASS — `pnpm test`: shared-types 380, database suite with environment-gated
  integration skips, API 790, Web 892 with 4 explicit skips.
- PASS — `pnpm build`: Next.js 15 Web build generated 85 routes; Nest Core build
  compiled successfully.
- PASS — BUILD OPS invariants and managed Supabase parity-plan verifier.
- PASS — production database read-only inspection: PostgreSQL 17, 142 applied
  migrations, maximum migration `20260814130000` (the current source head).
- PASS — production audit coverage: 170/170 tenant-scoped tables have exactly
  one enabled audit trigger.
- PASS — production WO-02, WO-04, WO-05 and WO-06 database gates.
- PASS — live Vercel browser smoke after deployment: JSON-LD, responsive
  desktop/tablet/mobile behavior, metadata, manifest, robots, sitemap,
  health/ready headers and interactions.
- FAIL — production audit-hash integrity: across 2 tenants, only 1 has a
  canonical recovery UUID; that tenant has 46 legacy-JSON profiles, 147 unknown
  profiles and 2 predecessor-chain gaps. No database state was changed.
- BLOCKED — production BUILD OPS data scan: `BUILD_OPS_DEMO_TENANT_IDS` or
  `BUILD_OPS_DEMO_TENANT_SLUGS` is not configured, so the scan cannot establish
  the allowed synthetic-data boundary.
- WARN — Railway provider metadata still exposes a stale Web build command next
  to the active Dockerfile deployment; the deployed Core image nevertheless
  built and passed its readiness check. Vercel/Railway builds also reported
  ignored dependency build scripts as warnings.

## Safety boundary

Production Web and Core were deployed from the current working tree. No
production migration write, business-row mutation, secret change or provider
environment change was performed. The CAD worker was not redeployed because no
worker source change was present. The worktree remains dirty and no commit or
push was created. See the live deployment record for exact provider IDs and
remaining release gates.
