# Controlled project document uploads

Authority: ADR-043. Core reserves capacity before accepting bytes. Web's
`/api/upload/sign` is now a reservation adapter, not a provider signing endpoint.
The browser sends authenticated raw `application/octet-stream` bytes directly to
Core `PUT /v1/document-uploads/:id/content`; Content-Length must match the reservation.
The original filename and MIME type stay in the reservation. Core verifies Storage
object size again before document registration.

Set Web `ERP_CORE_API_URL` to the installation's **browser-reachable HTTPS Core
origin**. Core `ERP_API_CORS_ORIGINS` must list the exact Web origin. Core alone
holds `SUPABASE_SERVICE_ROLE_KEY`; no provider write token reaches the browser.
Deployment proxy limits/deadlines must permit a 100 MB raw request and the bounded
120-second ingress/provider stages. Core stages at most two uploads per process,
using at most 200 MB temporary file data, then removes staging files in `finally`.
A process crash can leave temp files; remove only this application's abandoned
`erp-document-*` directories while its process is stopped, or replace its ephemeral
container. Do not sweep another running instance's staging files.

The 500 MB project limit counts completed documents and every uncompleted
reservation whose cleanup has not been confirmed. This includes expired/released
reservations and completed reservations whose document row was deleted while the
object remains retained. Legacy project-document deletion through Core or Web is
blocked until verified Storage cleanup exists; no untracked retained bytes may
silently free quota. Database-owner lifecycle operations remain explicit operator
work and must reconcile retained objects. Project row locks serialize admission; database triggers protect the
same aggregate against other document writers. Existing document rows are preserved.
Existing reservations are marked `core_controlled = false` and are excluded from
automatic transport/cleanup. Their provenance requires operator reconciliation.

Retry the same reservation and same bytes after a request failure. A definite
provider rejection with verified object absence may retry. A timeout/disconnect
after provider-write intent is persisted is **uncertain**, including when Storage
currently returns 404; that does not prove an earlier remote write has stopped.
Such capacity remains charged. A same-reservation retry can resolve uncertainty
when Storage positively reports the expected object size. Changed bytes are denied.
Confirmed expired uploads are cleaned through the Storage API, at most one per new
admission request. Cleanup failure stays charged and is audited. Confirmed cleanup
is committed even when the new requested file still exceeds remaining capacity.

For unresolved writes, stop admissions for the affected project, retain the
reservation/object path and audit evidence, and establish from provider request
logs that the original write terminated. Reconcile the exact object through the
Storage API before a reviewed offline repair marks transport settled. Never
delete Storage metadata directly, clear upload intent, forge cleanup success, or
drop the reservation to make quota available. No automated uncertain-write reset
is implemented.

Cutover requires a compatible Web/Core pair. Stop the old signing endpoint first.
Previously minted provider tokens remain usable for their two-hour lifetime; wait
for those tokens and known in-flight uploads to finish, then reconcile pre-existing
orphan objects before asserting a physical-storage baseline. Do not reopen direct
authenticated bucket writes as rollback. Hosted Storage, public Core reachability,
CORS, maximum-size uploads and provider-specific failure reconciliation require an
installation acceptance check; local PostgreSQL bootstrap does not emulate Storage.

Provider references inspected during implementation:
[Storage schema](https://supabase.com/docs/guides/storage/schema/design),
[signed upload behavior](https://github.com/supabase/storage/blob/master/src/http/routes/object/uploadSignedObject.ts),
[upload completion](https://github.com/supabase/storage/blob/master/src/storage/uploader.ts).
