# Document upload reservation cutover and rollback

## Scope and safety boundary

This runbook controls the exact-tenant transition from legacy Web-signed project
document uploads to the Core reservation ledger. All selectors default off and
reject wildcards or malformed tenant lists. Enabling or rolling back a hosted
tenant is a production change and requires the normal release approval; this
document does not authorize a deployment, provider mutation, or data deletion.

Use one tenant UUID at a time. Never enable Web issuance unless the same tenant
is already selected for Core issuance, Core lifecycle writes, Core cleanup, and
Web lifecycle writes.

## Selector matrix

| Layer | Issuance | Completion/release | Cleanup |
| --- | --- | --- | --- |
| Core API | `ERP_DOCUMENT_UPLOAD_RESERVATION_ISSUANCE_ENABLED` plus exact tenant allowlist | `ERP_DOCUMENT_UPLOAD_RESERVATION_WRITES_ENABLED` plus exact tenant allowlist | `ERP_DOCUMENT_UPLOAD_RESERVATION_CLEANUP_ENABLED` plus exact tenant allowlist |
| Web | `ERP_DOCUMENT_UPLOAD_RESERVATION_ISSUANCE_VIA_API` plus exact tenant allowlist | `ERP_DOCUMENT_UPLOAD_RESERVATION_WRITES_VIA_API` plus exact tenant allowlist | delegated to Core; no Web cleanup selector |

Each Core and Web selector requires both its global boolean and exact-tenant
allowlist to match. Core has three independent selectors (issuance, lifecycle
writes, and cleanup); Web has two. An empty allowlist selects no tenant.

## Enablement order

1. Verify the migration and current Core/Web builds are deployed, but leave all
   reservation selectors off.
2. Enable Core lifecycle writes and cleanup for the exact tenant.
3. Enable Core issuance for the exact tenant.
4. Enable Web lifecycle writes for the exact tenant.
5. Enable Web issuance last. Confirm one controlled upload completes and that
   reserve, complete, or release logs share one `trace_id` across Web and Core.
6. Confirm quota, completion replay, explicit release, and cleanup metrics show
   no unexpected failure outcome before expanding to another tenant.

The invalid partial state “Web issuance on, Web lifecycle writes off” fails
closed by design. Do not treat its `503` response as a reason to re-enable the
legacy signer.

## Read-only drain query

Run these statements with `psql` through an approved operational read-only
identity that is verified to see the server-only reservation ledger. Pass the
exact UUID with `-v tenant_id=<uuid>`; do not paste credentials into shell
history or reports. The first query must return exactly one row. No row, more
than one row, an authorization error, or an unexpected tenant is `BLOCKED` and
must not be interpreted as a drained tenant.

```sql
\set ON_ERROR_STOP on

select id as verified_tenant_id
from tenants
where id = :'tenant_id'::uuid;

select
  :'tenant_id'::uuid as tenant_id,
  count(*) filter (where state = 'active') as active_count,
  count(*) filter (
    where state = 'active' and expires_at <= now()
  ) as overdue_active_count,
  count(*) filter (
    where state in ('released', 'expired')
      and cleanup_completed_at is null
  ) as terminal_cleanup_pending_count,
  count(*) filter (
    where cleanup_claimed_at is not null
      and cleanup_completed_at is null
  ) as cleanup_claimed_not_completed_count,
  max(updated_at) as last_reservation_update_at
from document_upload_reservations
where tenant_id = :'tenant_id'::uuid;
```

The aggregate query always returns one row after the tenant/authority check. A
tenant with no reservations has zero counts. Do not infer object deletion from
database state alone. Cleanup is complete only when Core records
`cleanup_completed_at` for every released or expired reservation selected by
the terminal cleanup lane.

## Ordered rollback and drain

1. Turn off Web issuance for the exact tenant first:
   `ERP_DOCUMENT_UPLOAD_RESERVATION_ISSUANCE_VIA_API=false`, or remove only that
   tenant from its Web issuance allowlist. Keep Web lifecycle writes on.
2. Turn off Core issuance next:
   `ERP_DOCUMENT_UPLOAD_RESERVATION_ISSUANCE_ENABLED=false`, or remove only that
   tenant from its Core issuance allowlist. Keep Core lifecycle writes and
   cleanup on.
3. Confirm legacy requests can proceed while existing reservation clients can
   still complete or release. Never route a reservation completion through the
   legacy metadata endpoint.
4. Poll the read-only drain query until `active_count = 0` and
   `overdue_active_count = 0`. Allow active reservations to complete, release,
   or expire; do not mutate ledger rows manually.
5. Keep exact-tenant Core cleanup enabled until both
   `terminal_cleanup_pending_count = 0` and
   `cleanup_claimed_not_completed_count = 0`. Investigate a nonzero or growing
   count through structured logs; do not delete inferred bucket paths.
6. When all four counts have remained zero for two consecutive observations at
   least one cleanup interval apart, turn off Web lifecycle writes, then Core
   lifecycle writes, for the exact tenant. Core cleanup may then be turned off
   for that tenant.
7. Re-run the query and retain the redacted counts, release revision, tenant
   UUID, timestamps, and approver in the release record.

## Monitoring and correlation

Web emits structured reservation outcomes containing `trace_id`, `tenant_id`,
`actor_id`, `action`, `outcome`, and `status`. The same valid inbound
`x-request-id` is sent to Core. During cutover or rollback, alert on repeated
`gate_mismatch`, `core_failed`, or `invalid_core_result` outcomes and correlate
them with Core logs by `trace_id`. Never copy bearer tokens, signed upload URLs,
Storage tokens, provider messages, or database connection strings into the
release record.

Provider timeouts can finish after Web's response. Retry reserve with the same
file-attempt idempotency key; retry complete or release by the same reservation
ID. Do not issue another Storage PUT while completion is pending.

## Roll-forward

After a rollback cause is fixed, repeat the enablement order from the beginning.
Do not simply restore all selectors simultaneously. A controlled browser upload
must pass before the tenant is considered re-enabled.
