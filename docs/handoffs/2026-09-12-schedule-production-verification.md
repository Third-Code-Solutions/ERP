# Scheduling production verification

## Verified scope and target

Read-only inspection found repository `E2E_PROJECT_ID` belongs to the separately managed preview and is absent from production. Production workflow currently reuses that variable. Production health reports revision `81393e10a36a`; hosted metadata verified all 11 seeded demo roles are active in tenant `fdd60ae0-9819-4564-8626-3f5571d2dca1` (`buildops-e2e`) and active project `11111111-1111-4111-8111-111111111111` belongs to that tenant.

Main ran the existing scheduling role matrix against that exact production demo project. It passed one grouped test covering all 11 roles, zero retries/skips, in 44.8 seconds. Roles opened the page and inspected controls only; no schedule mutation occurred. Test sessions used existing local-scope logout cleanup. This is deployed-revision evidence, not pending-candidate proof or complete scheduling mutation coverage.

## Ownership and acceptance

1. Agent 12/main verified identity, target and evidence boundary read-only. Do not reuse preview project identifiers for production.
2. Agent 13/main introduces a separate `PRODUCTION_E2E_PROJECT_ID` repository variable, wires production preflight to it, and includes the existing scheduling matrix with its opt-in enabled in required production E2E. Preserve preview CI configuration, recovery holds and all existing gates.
3. Strengthen workflow contract tests to require the separate production variable and scheduling gate; independently run contracts/actionlint and verify the configured non-secret project ID. No production deployment is part of this change.

Branch depends on PR #71 and inherits all database/Storage recovery holds. Do not claim the new workflow executed in production before a future authorized release.

Completed: separate production variable configured and read back; strengthened scheduling matrix passed all 11 roles against deployed revision 81393e10a36a in 37.4 seconds, zero retries/skips. Workflow contracts and actionlint passed. The matrix additionally verifies authenticated route readiness and Labour reconciliation heading. Agent 13/main owns release verification; Agent 03/main owns the existing browser test. No scheduling mutations or hosted schema changes were performed.
