# Won-to-Project authority runbook

## Scope

This command owns the side effects of moving an Opportunity in `won` or
`closed_won` to a Project. It is an original Third Code ERP boundary; the
browser supplies only the UUID path, `{}`, and `Idempotency-Key`.

## Safety defaults

Keep both API and Web selectors disabled until hosted migration parity,
rollback, protected canary, exact provider identity, readiness, and spend
review pass:

```text
ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED=false
ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS=
ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API=false
ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API_TENANT_IDS=
```

The service rejects a missing/overlong key, rechecks tenant membership and
`opportunity.convert`, locks the opportunity/project, and commits the project
back-link, checklist, notification intent, idempotency result, and audit rows
in one transaction. Retries with the same key replay the stored result; reusing
the key for a different opportunity is a conflict. A selected Core failure is
returned to the caller and never falls back to a direct browser write.

## Canary checklist

1. Reconcile/apply the ordered migration only in a disposable clone first.
2. Verify forced RLS, service-role grants, composite tenant FKs, and audit.
3. Exercise one approved tenant: new project, existing lead project, signed
   contract/document requirement, duplicate retry, key conflict, and
   cross-tenant denial.
4. Verify the exact deployed SHA, `/ready`, protected 401 behavior, logs, and
   provider spend guard. Roll back the flag before any source/provider rollback.
