# Database history recovery and hardening

## Added

- Thirteen missing June migrations recovered from the deployed Supabase
  ledger.
- All 20 deployed migrations verified byte-for-byte against the fetched
  production history.
- Forward-only Cortex, audit, and cost security hardening migration.
- Deterministic, secret-free reset seed.
- PostgreSQL 17 CI reset, ledger/catalog verification, fail-on-skip database
  tests, and empty-schema-diff gate.
- Same-tenant user isolation tests for Cortex conversations/messages.
- Role-aware cost write tests and direct audit-forgery denial.

## Hardened

- Client roles lose maintenance privileges and direct graph/provenance writes.
- Cortex messages are append-only and inherit ownership from their conversation.
- Privileged server chat writes verify tenant plus current-user ownership.
- Provenance and audit chains serialize appends per tenant.
- Audit rows are trigger/server-authored; public portal audit writes use the
  centralized locked writer.
- Costs enforce nonnegative amounts, positive quantities, authorized write
  roles, immutable identity/source fields, and tenant-consistent BOM/PO
  references.
- Demo account seeding requires an explicit 14+ character password.

## Release boundary

- No migration was applied, pushed, or repaired in production.
- Six May migration versions remain local-only; `supabase db push` is unsafe.
- Local fresh reset could not run because Docker virtualization is unavailable.
- GitHub CI must prove reset, runtime tests with zero skips, catalog ACLs, and an
  empty schema diff before this slice is releasable.

## Local verification

- Production build: passed, 62 static pages generated.
- Shared types: 76/76 tests passed.
- Web: 29/29 tests passed.
- Database: 35 passed; 14 forward-migration runtime tests correctly skipped
  because production has not received the hardening migration.
- Playwright inventory: 56 tests across 27 files.
- Built/source forbidden-origin and legacy-brand trace scans: zero.
- Runtime `/api/health` and `/api/ready`: HTTP 200.
- Official actionlint v1.7.12: passed.
