# M3.159 handoff - Cortex conversation read authority

New Core reads:

```text
GET /v1/cortex/conversations
GET /v1/cortex/conversations/:id
```

Keep these closed:

```text
ERP_CORTEX_CONVERSATION_READS_ENABLED=false
ERP_CORTEX_CONVERSATION_READS_TENANT_IDS=
ERP_CORTEX_CONVERSATION_READS_VIA_API=false
ERP_CORTEX_CONVERSATION_READS_VIA_API_TENANT_IDS=
```

Core derives tenant/user/role from the authenticated principal. Selected Core
failure does not fall back to direct database reads. Rollback is both flags
false. No migration is part of this milestone.

Before any canary: complete M3.152 managed backup/PITR proof, then compare
legacy/Core behavior for two users and every role in one exact tenant. Do not
deploy merely to exercise the endpoints.
