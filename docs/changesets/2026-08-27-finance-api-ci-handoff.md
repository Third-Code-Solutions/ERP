# Finance reconciliation HTTP-canary CI handoff

> **Superseded Finance/API lead, 2026-08-27:** retained for traceability only.

## Scope

Documentation-only release-control handoff for an initially misattributed
protected Finance reconciliation HTTP integration report.

## Initial observation (superseded)

- The API integration report recorded 78 passed of 79 tests, one failure, and
  zero pending/skipped tests.
- The failed test is
  `apps/api/integration/finance-reconciliation-workflow.http.integration.spec.ts`.
- Its JSON failure preserves only `STACK_TRACE_ERROR` and a runner stack, so a
  root cause cannot be truthfully claimed yet.

This report was initially attributed to self-hosted run `33075859440`. Agent 05
later proved that the run failed in raw database Vitest before the API
integration matrix began. The report is preserved but must not be used as
evidence about that workflow run.

## Superseding evidence

- A fresh Node 22 raw PostgreSQL 17/Redis replay passed the complete API
  integration matrix: 79 of 79 tests, zero failed/pending/skipped.
- The exact Finance reconciliation protected HTTP canary passed with verbose
  output in 1.03 seconds.
- Agent 05 made no code, test, schema, or workflow change. No database
  contract evidence requires Agent 04 involvement.

## Current decision

The Finance/API branch is closed without an implementation change. Agent 13 now
owns a fresh full dual-lane self-hosted CI run; it must include raw PostgreSQL,
local Supabase Auth, complete API integration, build, runtime smoke, secret
scan, and cleanup. Agent 12 rereviews the final CI/security evidence. No skips,
suppression, production change, or deployment is authorized.

## Verification

- PASSED: Agent 05's fresh Node 22 raw-lane replay (full API 79/79) and verbose
  focused canary (1.03 seconds).
- PASSED: corrected the record that run `33075859440` never reached API
  integration.
- NOT RUN: fresh complete self-hosted CI and Agent 12 security rereview; this
  changeset adds no application, database, or workflow implementation.
