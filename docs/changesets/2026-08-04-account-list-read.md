# M3.62 — Nest CRM account collection read handoff

## Scope

- add the shared `GET /v1/crm/accounts` read contract;
- enforce verified-principal tenant scope and `account.read` capability;
- bound search, industry/KYC filters, sorting, and pagination;
- return opportunity counts in a strict camelCase read envelope;
- add an opt-in Next adapter while preserving the existing direct DB path.

## Validation

- shared types: 16 files / 170 tests;
- API: 65 files / 323 tests;
- Web: 76 files / 488 tests;
- workspace lint and typecheck;
- Nest production build;
- Next production build: 80/80 routes;
- `git diff --check`.

## Release boundary

The feature flag and tenant allowlist remain disabled. No Supabase migration or
data repair, Vercel build/deployment, or provider setting change is included.
Promotion requires the supported Supabase backup/export, dependent/audit
export, owner-approved duplicate-PO mapping, disposable PostgreSQL 17 replay,
protected browser evidence, and rollback proof.
