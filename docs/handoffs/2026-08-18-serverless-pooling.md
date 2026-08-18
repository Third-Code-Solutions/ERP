# Serverless database pooling handoff — 2026-08-18

## Scope and ownership

1. **Agent 04 — Supabase/Drizzle Schema Lead**
   - Changes only the application database-client configuration and adds
     deterministic unit coverage. No migration, RLS, hosted-data, or
     migration-pooler configuration changes are in scope.
2. **Agent 03 — Next.js App Router Engineer**
   - Ensures the protected-preview Playwright client suppresses only Vercel's
     external toolbar so its console assertion remains about ABI OPS.
3. **Agent 13 — CI/CD & Ops**
   - Requires a fresh trusted-PR E2E run against the disposable preview tenant
     before merge. Production remains gated by the canonical main workflow.

## Handoff evidence

- The hosted trusted-PR E2E reached the protected preview and authenticated the
  isolated user, then encountered database errors caused by Supabase session
  pool exhaustion (`EMAXCONNSESSION`, pool size 15) across dashboard routes.
- Supabase documents transaction pooling on port `6543` for temporary
  serverless/edge clients; ADR-020 retains port `5432` only for write-scoped
  migration operations.
- Postgres.js defaults to a ten-connection client pool, so the runtime client
  must be bounded in addition to selecting Supavisor transaction mode.

## → Handoff to Agent 13

Reason: run the fresh protected-preview browser gate after the runtime repair.
Inputs: a deterministic connection-config test, no provider credential changes,
and the existing isolated preview tenant. Expected output: all PR checks green
before any merge or production promotion is considered.
