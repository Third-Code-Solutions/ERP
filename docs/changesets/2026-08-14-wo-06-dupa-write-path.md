# WO-06 DUPA write path and BOM editor

## Status

Implementation complete for the repository-owned DUPA write path; hosted
authenticated browser parity remains unverified. The canonical ABI arithmetic
fixture and VAT-base owner decisions remain explicit release gates documented in
`docs/blockers/2026-08-12-wo-06-canonical-math-contradiction.md`.

## Changes

- Added strict Zod schemas for decimal quantities, centavo rates, rate sources,
  and complete DUPA upsert payloads.
- Added a tenant- and role-scoped server action that validates BOM/work-item
  identity, referenced library ownership, persists all child rows in one
  transaction, and reconciles PostgreSQL trigger totals against the exact
  arithmetic engine before commit.
- Added a responsive BOM DUPA editor for header assumptions, VAT-base selection,
  material/labour/equipment rows, and compatible assembly-template application.
- Added server-side loading of active assembly templates and current catalog,
  crew, and equipment rates; the existing read-only DUPA disclosure now labels
  the VAT base honestly.
- Added regression coverage for the strict persisted-input contract.

## Verification

- PASS focused shared-types DUPA suite: 6/6.
- PASS web typecheck, including E2E typecheck projects.
- PASS production read-only WO-06 database verifier: schema, RLS, grants,
  audit triggers, cascade triggers, computed-column permissions, and tenant
  constraints.
- NOT RUN authenticated production DUPA browser flow: no authorized production
  identity is configured.
