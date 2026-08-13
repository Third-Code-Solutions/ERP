# M3.11 — Grouped BOM Purchase Order authority

## Scope

Move the existing group-by-supplier BOM Purchase Order action behind a strict
NestJS command without changing the visible wizard, copy, or layout.

## Delivered

- Added strict shared grouped-BOM command/result contracts.
- Added `POST /v1/procurement/purchase-orders/from-bom/grouped` with an
  idempotency-key boundary and Nest capability guard.
- Moved supplier/rate-card selection, tenant and membership checks, approved
  budget cost-code mapping, exact cent totals, deterministic PO numbering,
  multi-PO/line inserts, BOM locking, idempotency replay, and semantic audit
  into one PostgreSQL transaction.
- Added independent closed-by-default API and Next selectors. A selected core
  request fails closed and never falls back to the legacy writer.
- Added a stable browser retry key so a lost response replays the complete PO
  group instead of creating a partial second set.

## Validation

- Shared focused contract: 21/21.
- API focused/full suite: 150/150 across 30 files.
- Web focused/full suite: 44 focused; 361 across 58 files.
- Workspace lint/typecheck, Next 78-route build, Nest build, Actionlint,
  Gitleaks, and diff checks passed.
- GitHub Actions run `30742910106` passed Actionlint, secret scan, lint,
  typecheck, unit tests, Postgres 17/Redis reproducibility (67/67 migrations,
  260/260 database assertions, Nest integration, container smoke), and build.
  E2E remained skipped by its explicit credential gate.

## Release boundary

No migration, hosted SQL, provider setting, business-data mutation, Railway
deployment, or Vercel deployment occurred. All grouped API/Next flags and
tenant allowlists remain false/empty. Hosted Supabase migration/data/audit
review and spend-bounded provider approval remain required before canarying.
