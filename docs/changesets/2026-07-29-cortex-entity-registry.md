# Cortex Canonical Entity Registry

Date: 2026-07-29

## Outcome

Third Code ERP now defines all 48 Cortex entity types in one typed application
registry. Graph permissions, labels, colors, source-table ownership, and record
navigation no longer depend on independent partial maps.

Four reserved enum values without an actual UUID-backed mirror table remain
explicitly non-queryable. The registry does not invent source names.

The entity context endpoint resolves records by authenticated tenant, verifies
that the requested source belongs to the resolved node type, preserves
non-enumerating permission denial, and applies the caller's role scope to
related citations.

## Scope

- Application source and tests only.
- No database migration or hosted write.
- No Auth, Storage, Redis, queue, provider-variable, or deployment change.
- No landing-page visual or copy change.

## Validation

- Focused Cortex tests: 24 passed.
- Root lint: passed.
- All-package typecheck: passed.
- Root tests: 296 passed; 132 database-gated cases skipped without a writable
  test database.
- Production build: passed; 77/77 static-generation steps.
- Local production smoke: health 200, readiness 200, unauthenticated entity
  request 401.
- Gitleaks 8.30.1 full-history scan and prohibited-provenance scan: clean.
- Hosted read-only evidence: 48 enum types and 385 active nodes across 14
  currently populated types.

## Release and rollback

Vercel Git remains disconnected. This source candidate must share the next
explicitly approved consolidated frontend build; no separate preview is
required. Roll back by reverting the registry, derived consumers, route guard,
and tests. Runtime and database state are unchanged.
