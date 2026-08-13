# M3.160 handoff - Cortex conversation user-turn authority

New Core command:

```text
POST /v1/cortex/conversations/user-turns
Idempotency-Key: <unique request key>
```

Keep these closed:

```text
ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_ENABLED=false
ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_TENANT_IDS=
ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API=false
ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API_TENANT_IDS=
```

Core accepts only a human turn and hard-codes role `user`. Tenant, actor, role,
capability, ownership, and context authority are server-derived and rechecked
transactionally. Selected Core failure does not fall back. Exact replay returns
the first result; reuse with changed content/context conflicts. Assistant turns
must not use this browser-facing endpoint.

Rollback is both user-turn flags false; leave migration `20260807170000` inert
and do not drop its ledger. Before canary: complete M3.152 backup/PITR proof,
replay all 105 source migrations in an isolated complete clone, and run the
documented exact-tenant legacy/Core comparison. Do not deploy merely to
exercise the command.
