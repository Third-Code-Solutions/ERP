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
