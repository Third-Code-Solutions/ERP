# Opportunity stage-transition authority runbook

## Safety defaults

Keep the Core and Web selectors disabled until hosted migration parity,
protected canary evidence, exact release identity, readiness, rollback, and
spend review pass:

```text
ERP_OPPORTUNITY_STAGE_WRITES_ENABLED=false
ERP_OPPORTUNITY_STAGE_WRITES_TENANT_IDS=
ERP_OPPORTUNITY_STAGE_WRITES_VIA_API=false
ERP_OPPORTUNITY_STAGE_WRITES_VIA_API_TENANT_IDS=
```

The Nest command accepts only `newStage`, an optional bounded reason, and an
opaque `Idempotency-Key`. It derives tenant and actor from the authenticated
principal, validates the state machine and KYC evidence, and commits the stage,
SLA, audit, and replay ledger in one transaction. A `won`/`closed_won` command
also commits the Project/checklist handoff in that transaction. AI/Python may
recommend a stage but cannot approve or finalize it.

## Canary checklist

1. Apply the ordered migration only in a disposable PostgreSQL clone first.
2. Verify forced RLS, service-role grants, composite tenant FKs, and audit.
3. Exercise RBAC, disabled gates, cross-tenant concealment, KYC, valid and
   invalid state transitions, exact replay, key conflict, SLA closure, won
   handoff, and rollback.
4. Verify the exact deployed SHA, readiness, protected 401/403 behavior,
   logs, and provider spend guard. Roll back the flags before any source or
   provider rollback.

## Sales rollout targets (2026-09-22)

The Sales rehearsal found both Web and Core selectors unset, so the intended
Sales stage command was unavailable. Code alone cannot resolve this condition.
Configure both layers together after the exact release CI database replay and
protected HTTP tests pass; do not remove the selectors or loosen role/KYC checks.

- Web: Vercel project `prj_5yZX5MTJdXZYWRIeS50jVhmjqzdb`, production,
  `thirdcode-erp.vercel.app`.
- Core: Railway project `a21fd382-80b2-4218-8025-11f420a062e3`, production,
  API service `c45b3d01-036a-4663-a524-0713d782fce3`.
- Canary tenant: `fdd60ae0-9819-4564-8626-3f5571d2dca1` (`buildops-e2e`).
- Other currently populated application tenant:
  `4e19c1ae-4cdc-47ba-9ed5-b6ef23d4e5c0`.

Core requires `ERP_OPPORTUNITY_STAGE_WRITES_ENABLED=true` and the exact
comma-separated `ERP_OPPORTUNITY_STAGE_WRITES_TENANT_IDS`. Atomic Won handoff
also requires `ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED=true` and the matching
`ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS`.

Web requires matching `ERP_OPPORTUNITY_STAGE_WRITES_VIA_API=true`,
`ERP_OPPORTUNITY_STAGE_WRITES_VIA_API_TENANT_IDS`,
`ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API=true`, and
`ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API_TENANT_IDS`. Vercel snapshots these
values per deployment. Stage the Railway variables without an automatic deploy
and promote source through the protected production workflow.

After protected database canaries pass, use the two populated tenant IDs above
in both exact allowlists. Rehearse the Sales browser command only in the demo
tenant and verify persisted stage/audit/SLA evidence; do not create artificial
business activity in the other tenant. New tenant onboarding must include this
coordinated configuration check. Never use `*`.

Rollback: set both Core `*_WRITES_ENABLED` and Web `*_WRITES_VIA_API` booleans
to `false`, deploy the disabled configuration, then restore the previous reviewed
source deployments if needed. Do not erase the transition ledger or audit rows.
Pre-change recovery artifacts are Vercel `dpl_HMxCrNbMdLKGowSU7UFZK44Aqscx`
and Railway API `b9eb58b6-306b-483f-b5ed-c3ce582d56d0` (source
`acc67ab875b0d8568c7ba47325ab2d6e55bbe945`). This section specifies the rollout;
the session changeset records the actual deployment and verification outcome.
