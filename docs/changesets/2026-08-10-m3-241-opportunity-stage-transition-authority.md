# M3.241 Opportunity stage-transition authority

Date: 2026-08-10

## Scope

- Add strict shared `newStage`/`reason` command and exact result contracts.
- Add `opportunity_stage_transition_requests`, a tenant-scoped, forced-RLS,
  service-only idempotency ledger.
- Add Nest `POST /v1/crm/opportunities/:opportunityId/stage-transition` with
  capability, tenant, state-machine, KYC, SLA, audit, replay, and rollback
  authority.
- Reuse the existing conversion service inside the caller transaction for
  atomic `won`/`closed_won` Project handoff.
- Add a fail-closed Next adapter and selector; default compatibility behavior
  remains unchanged.
- Document the safety defaults in `.env.example` and the stage-authority
  runbook.

## Verification

- Focused protected canary: 1/1 PASS.
- Root tests: 173 files / 751 tests PASS.
- Typecheck: 5/5 tasks PASS.
- Lint: 2/2 tasks PASS.
- Production build: PASS (Next 15.5.18; Nest webpack).
- Disposable PostgreSQL 17/Redis 7.4.9 lane: 117 migrations; database
  149/149 suites and 370/370 tests; API integration 37/37 files and 53/53
  tests; zero skips.
- Policy guards: Web DB boundary, provider-spend guard, managed-Supabase
  parity plan, workflow action refs, Actionlint, and diff hygiene PASS.

## Release boundary

This is source-only. The Supabase project, hosted rows/migrations, Railway,
Vercel, provider settings, credentials, and billing were not touched. Keep
the Core/API and Web stage selectors disabled with empty tenant allowlists
until hosted parity, exact release identity, protected production evidence,
rollback, and spend approval are separately cleared.
