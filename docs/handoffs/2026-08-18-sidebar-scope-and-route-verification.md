# Sidebar scope and route verification — 2026-08-18

## Status

**PARTIALLY VERIFIED.** The authenticated sidebar was reconciled with
`docs/PRD.md` v1.4, the accepted ADRs, current route modules, and the hosted
web configuration. This is a visibility correction, not a product rewrite or
a deletion of retained ERP capability.

## Evidence-led product decision

- The PRD explicitly retains CRM, KYC, projects, BOM/takeoff, procurement,
  inventory, permits/process, claims/invoices, punchlist, warranty/CNPS,
  documents, reports, Finance, Cortex, admin, and settings surfaces.
- The Assets route is the sole sidebar entry whose page deliberately renders a
  controlled-rollout state when its Core read flag is closed. The hosted Web
  project has no `ERP_ASSET_*` variables, so it cannot currently show a
  functioning register to ordinary users.
- The asset route, its capability guard, and its tenant-scoped rollout path
  remain intact for the approved canary. Only its ordinary sidebar exposure is
  removed until the hosted schema/RLS/audit and protected-tenant canary gates
  are complete.

## Delivery sequence

1. **Agent 01 — Product scope.** Retain all PRD-backed modules. Record the
   inactive Assets visibility decision without changing the PRD's locked
   compatibility commitments.
2. **Agent 03 — App Router navigation.** Mark Assets as intentionally hidden
   from `visibleNavSections` while preserving its existing route authorization
   in `canViewPath` for a future controlled tenant rollout.
3. **Agent 03 — Authenticated route QA.** Add one opt-in, read-only Playwright
   smoke that derives destinations from `visibleNavSections('admin')`, visits
   each visible sidebar route with the isolated demo admin, and fails on
   redirects, failed navigation, Next error overlays, rollout placeholders,
   console errors, or page errors.
4. **Agent 03 — Project route regression.** Correct the existing authenticated
   project smoke so captured browser console errors fail the test rather than
   only being logged. Resolve its project fixture from the isolated test
   tenant and validate it before navigation.
5. **Agent 13 — Verification only.** Run targeted unit/type/browser checks
   against the supplied Supabase project and hosted production. No deployment,
   provider configuration, production-data mutation, or source code deletion
   is in scope.

## Acceptance criteria

- No PRD-backed sidebar capability is removed merely for visual brevity.
- Assets is absent from ordinary sidebar navigation while its protected route
  and capability guard continue to exist for a future approved canary.
- The route smoke derives its list from the navigation source of truth, so a
  future visible sidebar entry cannot bypass authenticated route coverage.
- The smoke uses only the deterministic admin account in the separately named
  test tenant and performs navigation/read checks, not business writes.
- Targeted unit/type checks and the authenticated browser smoke pass before
  reporting a verified visible-sidebar result.

## Explicit boundaries

- This smoke proves visible destination rendering and runtime health. It does
  not prove every high-risk create/approve/post workflow; those need
  domain-specific, reversible test fixtures and their own acceptance tests.
- Asset activation remains blocked on hosted schema parity, RLS/audit review,
  and a protected tenant canary. It must not be enabled by changing an
  environment flag in this work item.
- Existing dirty work outside these files remains untouched.

## Verification record

- PASS — `pnpm --filter @third-code-erp/web test`: 946 tests passed; two
  pre-existing disposable-database integration tests remained skipped.
- PASS — `pnpm --filter @third-code-erp/web lint`.
- PASS — `pnpm --filter @third-code-erp/web typecheck`, including the new
  Playwright source.
- PASS — `pnpm --filter @third-code-erp/web build` (Next.js 15.5.23).
- PASS — the opt-in authenticated sidebar-route smoke visited all 28 visible
  destinations on `https://thirdcode-erp.vercel.app` with the deterministic
  demo admin. It observed no route redirects, Next error overlays, console
  errors, page errors, same-origin request failures, or controlled-rollout
  states.
- PASS — the hosted role-access matrix passed for all 11 deterministic demo
  roles, including notification access and protected-route enforcement.
- PASS — the corrected authenticated project-route smoke visited 23 major
  dashboard, project-detail, procurement, inventory, finance, reports, and
  settings destinations using a GUID-validated project from the isolated demo
  tenant. It observed zero browser console errors and zero page errors.
- BLOCKED (local parity only) — local `.env.local` intentionally lacks
  `ERP_CORE_API_URL`; the available Vercel OAuth credential can list the
  production variable but cannot inject its value into a local process. The
  local notification call therefore returns 503, while the hosted check passes.
- FAILED (repository-wide release gate, pre-existing) — `git diff --check`
  reports 19 trailing-whitespace/EOF diagnostics in unrelated dirty files.
  Those files were not changed here.
