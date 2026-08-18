# Local Supabase CLI migration replay failure — 2026-08-17

## State

**FAILED verification / BLOCKED release gate.** The repository cannot presently
demonstrate a complete local Supabase CLI migration replay on this Windows and
Docker host. This is not evidence that the hosted project was changed or that
the source migration history is safe to rewrite.

## Reproduction evidence

1. Verified that no `supabase_db_erp` container or volume existed before each
   probe. `supabase/seed.sql` does not define `bom_status`, and the repository
   initial migration contains its sole source definition.
2. `npx --yes supabase@2.109.1 start` failed at the first migration:
   `CREATE TYPE public.bom_status ...` with SQLSTATE `42710` (already exists).
3. The current npm-published CLI, `2.114.0`, failed identically. Its database
   was observed as healthy with `bom_status = false` before the migration
   runner began, then failed at the first `CREATE` statement.
4. A clean, unlinked temporary project with one migration reproduced the
   failure via `db reset --local`: first with `CREATE TYPE`, then with a single
   `CREATE TABLE`, which failed with SQLSTATE `42P07` (already exists).
5. The temporary project, local containers, volumes, and generated local
   credentials were removed after the probes. No linked/hosted operation,
   schema change, or data mutation was issued.

The symptom matches the public Supabase CLI bug report
[#4417](https://github.com/supabase/cli/issues/4417), which describes a fresh
local migration path reporting objects already existing. That report is
supporting evidence, not proof that it has the same root cause.

## Impact

- `supabase start` and `supabase db reset --local` cannot be used as a green
  full-chain reproducibility proof in this environment.
- Do not modify the already-applied historical initial migration solely to
  suppress duplicate-object errors. That would hide a tooling problem and
  change migration history already represented in the hosted ledger.
- Disposable PostgreSQL statement-level checks remain useful scoped evidence,
  but they do not substitute for a successful full Supabase CLI replay.

## Safe resolution path

1. Reproduce from a clean Windows/WSL/CI runner with the exact command and
   attach sanitized CLI/Docker logs to an approved upstream support ticket or
   issue. Do not include access tokens, local start secrets, database URLs, or
   customer data.
2. Evaluate a vendor-confirmed CLI/image workaround in an isolated disposable
   project first. Pin it in CI only after the fixture and full ERP replay pass.
3. Once fixed, run `npx supabase@<approved-version> db reset --local` from the
   repository, verify all 147 migrations and seed behavior, then run database
   isolation tests and the relevant application integration suites.
4. Treat the gate as failed until those commands complete successfully. A
   production migration remains separately authorized and must still have
   backup, rollback, and hosted parity evidence.
