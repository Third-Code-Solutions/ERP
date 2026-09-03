# Production migration-ledger reconciliation handoff

- Date: 2026-09-03
- Trigger: protected production run `33768641038`
- Production target: Supabase project `aqqrtkmtcsfkbyyqxowv`
- Safety state: no migration SQL or provider deployment executed

## Agent 04 — Supabase/Drizzle Schema Lead

1. Reconcile the seven live migration versions missing from `main` without editing
   production history.
2. Preserve the six Git-backed migration files byte-for-byte from
   `agent-04/upload-reservations`.
3. Record the read-only Supabase migration-history evidence for
   `20260901141949_allow_cad_octet_stream_uploads` as source SQL.
4. Prove a clean PostgreSQL 17 rebuild, RLS/catalog checks, database tests, and
   empty schema diff in CI.

→ Handoff to Agent 13. Reason: the source ledger must equal the already-applied
production ledger before the code-only release may resume. Inputs: a green
157-migration CI run and exact `main` SHA. Expected output: protected dry-run,
Railway and Vercel deployment, release-identity checks, authenticated browser
matrix, and password rotation/restoration proof.

## Agent 13 — CI/CD & Ops

1. Merge only through a reviewed PR after every required check is green.
2. Dispatch `.github/workflows/deploy-production.yml` from the exact merge SHA.
3. Require the production ledger to report current and the migration push to
   report no pending SQL.
4. Stop on any target, identity, health, browser, authorization, or password
   restoration failure.
