# M3.161 handoff - Cortex assistant-turn authority

Trusted Core commands:

```text
POST /v1/cortex/conversations/assistant-turns/claims
POST /v1/cortex/conversations/assistant-turns/complete
Idempotency-Key: <derived assistant request key>
X-Third-Code-Timestamp: <epoch seconds>
X-Third-Code-Cortex-Signature: v1=<HMAC-SHA256>
```

Keep all user-turn and assistant-turn Core/Web gates false, both allowlists
empty, and `ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET` unset. The browser must never
receive the secret or claim token and cannot select role `assistant`.

Core accepts claims only for an official M3.160 user message. One durable
60-second lease fences provider work; only its hashed token is stored. Exact
completion/replay is safe, changed or stale completion conflicts, citation IDs
are reauthorized at completion/replay, and selected Next failure never restores
direct database authority. Provider quota denial uses the free grounded answer.

Rollback is assistant Web/Core flags false; leave migration
`20260807190000` inert. Before canary: complete M3.152 backup/PITR proof, replay
all 106 source migrations on an isolated complete clone, configure one new
shared server-only secret, and run the documented exact-tenant comparison. Do
not deploy merely to exercise this boundary.
