# Inspection photo evidence and offline prerequisites

## Requirement and current evidence

PRD WO-12 requires photo capture, offline-tolerant sync and permanent opportunity
findings. PR #78 added scoped durable RFI commands, not photo-byte persistence.
This branch follows PR #80, head `4dd500f7acf9b4691455df35746801474a7fdadd`.

The current upload route creates a content-addressed Storage object before Core
records metadata. On every reported Core failure it deletes a newly created
object, including a lost response after commit. A failure from one request also
cannot prove a concurrent exact request did not reference that object. This is
an evidence-retention prerequisite, not a complete offline-photo implementation.

## Ordered ownership

1. Agent 03/main: reproduce lost-response and concurrent-reference cleanup risks
   in the existing route tests. Remove unproven destructive compensation and
   contain unknown failures without claiming no commit. Preserve bounded file
   validation, private content-addressed paths, non-overwriting uploads and the
   existing success contract. Do not create a generic orphan-deletion mechanism.
2. Agent 05/Astra: review completed. Implement active actor/tenant SHARE NOWAIT
   admission through audit, exact persisted metadata equality on path replay, and
   case-insensitive route/body UUID identity without changing case-sensitive
   Storage paths or the existing response schema. Own only the inspection-photo
   service/controller and their tests, plus focused actual PostgreSQL integration
   coverage. Reproduce failures first. Preserve owner/admin/commercial capability,
   same-tenant deduplication and replay after opportunity/project conversion.
   No migration or Storage provider calls in this step. Missing-object/byte proof
   remains a separate upload-protocol prerequisite, not solved by path validation.
3. Frontend/Luna: read-only map of photo capture, inspection submission, existing
   offline stores and attachment APIs. Establish how permanent inspection links
   are created; do not invent limits, automatic retry or ownership policy. Then
   own only the existing photo Core adapter and its focused tests: bind returned
   opportunity, tenant, exact Storage path and filename; contain access/network
   errors and never describe an unknown mutation outcome as not committed.
   Preserve the current response and project-conversion replay compatibility.
4. Main: integrate findings into the next bounded slice, verify actual boundaries,
   update the required changeset and gate any push on applicable checks. Use
   existing recovery prerequisites for release; no hosted writes are authorized
   by this investigation.

No two agents edit the same files. The initial route fix needs no schema,
dependency, provider configuration or new sensitive-data category. Retained
unconfirmed private objects require separately proven reconciliation; preserving
them is not a claim that metadata committed or that sync completed.

## Next-slice findings (not implementation)

The existing inspection form already stores full photo data URLs, document IDs
and upload state locally, but its draft key is opportunity-only scoped. There is
no caption UI and no inspection ID until final submission. Permanent
`site_inspection_photos` links are created in the successful inspection submission
transaction. Future offline completion must address actor/tenant ownership,
durable upload settlement and verified stored bytes, not duplicate this existing
capture mechanism. Delivery priority now shifts to integrating the accumulated
verified PR stack before beginning that protocol expansion.
