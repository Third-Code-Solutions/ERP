# Route-transition performance — 2026-08-18

## Status

**PARTIALLY VERIFIED.** This changeset improves the authenticated dashboard and
sidebar transition path without changing the database schema, hosted data,
providers, or deployment configuration.

## Changes

- Replaced the dashboard's repeated project-cost-control calls with one
  tenant-scoped, BOM-line-grain aggregate query per dashboard concern. The
  existing cost-control metric calculation remains the source of truth for
  each aggregate line.
- Ran independent KPI, rep-scorecard, and alert base queries concurrently.
- Disabled viewport-prefetching for the large authenticated sidebar. A route
  is now warmed once only after 120 ms of pointer hover or keyboard focus;
  transient pointer movement cancels the request.
- Configured Vercel Functions for `icn1` (Seoul), matching the supplied
  Supabase database's `ap-northeast-2` region instead of the current `iad1`
  deployment default.

## Verification

- PASS — `pnpm --filter @third-code-erp/web test`: 945 tests passed; two
  existing database integration tests were skipped because a disposable
  `DATABASE_URL` and `DATABASE_HARDENING_EXPECTED=1` are unavailable.
- PASS — `pnpm --filter @third-code-erp/web lint`.
- PASS — `pnpm --filter @third-code-erp/web typecheck`.
- PASS — `pnpm --filter @third-code-erp/web build` (Next.js 15.5.23).
- PASS — local production-build browser check: a dashboard load issued no new
  sidebar RSC prefetches; an intentional Accounts hover issued one Accounts
  RSC request.
- PASS — `apps/web/vercel.json` parses as valid JSON. The active production
  deployment remains in `iad1`; `icn1` runtime placement is deployment-only
  evidence and has not been exercised.
- NOT RUN — a timing comparison against the supplied hosted Supabase project.
  The local authenticated browser's database host does not match that project.
- BLOCKED — hosted p75 request/function metrics require Vercel Observability
  Plus, and the available Speed Insights query has no samples.

## Release boundary

No commit, push, deployment, migration, or hosted-data mutation occurred.
Repository-wide release gates remain unresolved outside this focused change,
including the pre-existing dirty worktree diagnostics and the unavailable
disposable authenticated database lane.
