# ADR-027: Durable signed-upload quota reservations

- Status: Accepted
- Date: 2026-08-24
- Owners: Third Code Solutions Inc.
- Finding: AUD-004

## Context

The current upload-sign route trusts the caller's declared size, counts only
committed `documents` rows, and creates no durable claim on project capacity.
The completion path accepts caller-supplied path, size, and MIME metadata and
does not prove that the Storage object exists. Concurrent or abandoned signed
uploads can therefore exceed quota or create a document row that disagrees
with Storage.

This ADR preserves the existing F2.1 limits already encoded by
`apps/web/src/app/api/upload/sign/route.ts`: 100 MiB (104,857,600 bytes) per
file and 500 MiB (524,288,000 bytes) per project. It changes enforcement, not
the product limits, and adds no dependency.

## Decision

### Authority and reservation record

Nest Core becomes the authority for signed-upload reservation, release, and
completion. The Web route is a server-only adapter and never supplies tenant,
actor, project membership, storage path, quota, or reservation state as
authority.

Add a `public.document_upload_reservations` table scoped by immutable
`tenant_id`, `project_id`, `actor_id`, reservation UUID, server-generated
Storage path, original file name, declared byte size, normalized declared
content type, request hash, idempotency key, `expires_at`, state, and optional
completed document ID. Tenant-composite foreign keys bind the project and
actor. The Storage path is unique and includes the tenant, project, and
reservation UUID; overwrites are disabled.

Signing requires an idempotency key. A unique tenant/actor/key constraint
returns the same reservation for an exact replay and rejects reuse with a
different request hash. The response adds `reservationId`; signed URL/token
values remain ephemeral and are never persisted or logged.

### Serialized quota accounting

Reservation creation runs in one database transaction which:

1. revalidates the current Core principal, `document.manage` capability,
   tenant membership, and active project;
2. locks the tenant/project row `FOR UPDATE`;
3. transitions due active reservations for that project to `expired`;
4. sums committed project `documents.size_bytes` plus declared bytes from
   unexpired `active` reservations; and
5. rejects a file over 100 MiB or a total over 500 MiB, otherwise inserts the
   reservation and semantic audit event atomically.

Every project-document create/delete path that affects the same quota must use
the same project-row lock before this feature is enabled. That shared lock,
not an unlocked preflight sum, is the serialization boundary.

After commit, Core creates a non-upsert signed upload for the exact reserved
path. Provider failure conditionally releases the still-active reservation in
a new transaction. A crash leaves an active, expiring record for deterministic
retry or cleanup; it cannot lose quota evidence.

### Completion and object truth

The completion contract requires `reservationId`. Core derives project, path,
file name, declared size, and declared content type from the reservation;
legacy client copies are non-authoritative and any contradiction is rejected.

Before opening the completion database transaction, Core calls the existing
Supabase Storage client
`storage.from('documents').info(reservedPath)`. Missing objects and Storage
errors fail closed. The returned actual byte size and normalized content type
must match the reservation and the object must remain within 100 MiB. This
checks provider metadata, not file magic; existing parser/content validation
continues to validate the actual format.

Core then opens one transaction, revalidates membership/capability/project and
the exact tenant/project/actor reservation binding, locks the same project row
and reservation, rechecks expiry and quota, inserts the `documents` row using
the verified provider metadata, transitions the reservation to `completed`,
links its document ID, and appends the audit event atomically. No provider
network call occurs inside the transaction.

Completion replay returns the linked document result. A conflicting,
released, expired, foreign-actor, or foreign-tenant completion fails. If the
final transaction fails, no document or terminal transition commits; the
active reservation and immutable object can be retried safely.

### State machine and reconciliation

Only these transitions are valid:

| From | To | Cause |
| --- | --- | --- |
| `active` | `completed` | verified object and atomic document commit |
| `active` | `released` | explicit cancel, sign failure, or rejected metadata |
| `active` | `expired` | `expires_at` reached before completion |

Terminal states never reopen. `expires_at` is Core issuance time plus two
hours, matching the current Storage signed-upload-token validity, and is not
caller-configurable. Request-path expiry enforces correctness even if the
cleanup worker is delayed.

The existing job/operations runtime, with no new package, processes ordered,
bounded batches idempotently. It conditionally expires due reservations,
removes objects for released/expired reservations through the Storage API,
and retries recorded cleanup failures. A reconciler reports and safely repairs
only provable cases: terminal non-completed reservations with objects,
completed reservations whose document link is inconsistent, and reservation-
prefixed objects without a ledger row after a fixed 24-hour grace period. It
never deletes legacy/unmapped objects by inference.

### Storage and access controls

The private `documents` bucket must enforce `fileSizeLimit: 104857600`; the
project's global Storage limit must be at least that value. Apply and read back
the bucket setting through the supported Storage API. Do not update
`storage.buckets` or `storage.objects` directly. If the provider plan/global
limit cannot represent 100 MiB, rollout is blocked rather than silently
changing F2.1.

The reservation table enables and forces RLS, denies direct `anon` and
`authenticated` access, revokes their table/sequence privileges, and grants
only the existing server role required by Core. Direct browser
insert/update/delete access to `storage.objects` for the `documents` bucket is
denied by RLS; browsers upload only with the exact-path signed token and read
only through server-authorized signed reads. Core alone releases, deletes, or
reconciles objects.

Supabase's April 21, 2025 restrictions prohibit creating application objects or
indexes in the managed `storage` schema and prohibit revoking its API-role
table privileges. Current guidance also treats Storage rows as read-only and
requires object operations through the API. Therefore the ledger belongs in
`public`, while Storage access is constrained with supported RLS policies and
API calls.

Supabase also changed Data API defaults in 2026: new-project opt-in began April
28, non-exposure became the default for new projects May 30, and existing
projects are scheduled for enforcement October 30. Grants and RLS are separate
controls. This migration explicitly declares grants/revokes and does not rely
on either old automatic exposure or the new non-exposure default.

### Observability

Every reserve, sign, complete, release, expire, cleanup, and reconcile outcome
emits the repository's structured fields: `trace_id`, `tenant_id`, `actor_id`,
`action`, and `outcome`, plus project/reservation identifiers. Metrics cover
active/reserved bytes, quota rejections, expiry age, metadata mismatch,
cleanup retries, and reconciliation inconsistencies. Signed tokens, URLs,
document content, raw provider errors, and unbounded object paths are redacted.

## Implementation, rollout, and rollback

1. Create the migration only with
   `supabase migration new <descriptive-name>` and use the CLI-generated
   filename. Add the public table, constraints, indexes, RLS, explicit grants,
   and migration/reproducibility tests; do not place application objects in
   `storage`.
2. Add strict shared reservation/sign/release/completion contracts and Core
   services; adapt Web without changing the successful upload response shape
   beyond `reservationId`.
3. Add deterministic cleanup/reconciliation and close direct browser Storage
   writes. Keep issuance and completion cutover flags false/empty.
4. In a disposable environment, replay from zero and run database,
   concurrency, API, Storage-contract, and browser tests. In a separately
   approved provider change, set/read back the exact private bucket limit.
5. Canary one controlled tenant, monitor quota and cleanup metrics, then widen
   only after hosted parity, release identity, rollback, and security gates
   pass.

Rollback closes the reservation/cutover flags, stops new issuance, drains or
expires active reservations, and reverts adapters to the retained path. Keep
the additive table and terminal audit evidence; an applied migration is not
dropped during an incident. The 100 MiB provider limit remains because it is
the accepted product/security limit. Schema changes use an additive forward
fix after rollback review.

## Required verification

- Zero-to-current and fresh migration replay; catalog, grants, RLS, constraints,
  and empty-schema-diff checks.
- Same-tenant success plus cross-tenant, foreign-project, foreign-actor,
  revoked-membership, and direct-browser denial tests.
- Parallel reservations at the 500 MiB boundary, completion/release/expiry
  races, same-key replay, different-payload conflict, and all other document
  writers using the project lock.
- Missing object, size mismatch, content-type mismatch, over-limit object,
  Storage timeout, post-upload transaction failure, and idempotent completion.
- Cleanup retry, orphan grace, terminal-state immutability, reconciliation
  mismatch, and no-legacy-object-deletion tests.
- Provider bucket configuration readback and one real signed-upload canary with
  audit/metrics evidence. No production change is implied by this ADR.

## Consequences

- Pending uploads consume quota durably, concurrent requests serialize, and
  committed document metadata comes from the provider rather than the caller.
- One extra Core round trip and ledger write are accepted to gain quota and
  evidence integrity.
- Database and Storage cannot be atomically committed together; immutable
  paths, no-upsert uploads, terminal transitions, and reconciliation make the
  failure window explicit and recoverable.

## Rejected alternatives

- Counting only completed documents: preserves the concurrent/abandoned-upload
  bypass.
- Trusting completion metadata or querying `storage.objects` directly: does not
  prove provider object truth and conflicts with current Storage guidance.
- Holding a database transaction open during `info(path)`: couples project-row
  availability to provider latency and failure.
- Placing the reservation ledger in `storage`: conflicts with Supabase's
  managed-schema restrictions.

## References

- [AUD-004 evidence](../audit/FULL_REPOSITORY_AUDIT.md#aud-004--upload-quota-and-object-metadata-are-bypassable)
- [Supabase Storage `info`](https://supabase.com/docs/reference/javascript/file-buckets-info)
- [Supabase Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits)
- [Supabase `updateBucket`](https://supabase.com/docs/reference/javascript/file-buckets-updatebucket)
- [Supabase Storage schema guidance](https://supabase.com/docs/guides/storage/schema/design)
- [April 2025 managed-schema restriction](https://supabase.com/changelog/34270-restricting-access-on-auth-storage-and-realtime-schemas-on-april-21-2025)
- [2026 Data API exposure change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)
