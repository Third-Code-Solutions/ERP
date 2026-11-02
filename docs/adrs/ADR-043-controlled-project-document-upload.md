# ADR-043 — Controlled project document upload

Accepted for local implementation, 12 October 2026, under the owner's request
to fix the turnover audit for independent ABI OPS installations.

## Problem

Provider-signed upload capabilities accept bytes independently of the size the
browser declared. They remain usable for their provider lifetime. Counting only
completed document rows, or reserving the declared size, cannot enforce the
project's 500 MB quota against oversized or abandoned uploads. The repository
already has a durable upload-reservation table and denies direct authenticated
writes to the documents Storage bucket.

## Decision

Use the existing Core API as the authenticated streaming upload authority for
project documents. The browser obtains a scoped reservation and the installation's
configured Core upload URL; it sends its authenticated request directly to Core.
Core validates the current principal, tenant, project, reservation and expiry,
then enforces the declared byte limit while streaming to private Storage using
server-only credentials. No provider-signed write capability reaches the browser.
Keep the 100 MB per-file and 500 MB per-project limits. Atomically count pending
reservations alongside completed documents. Only verified stored bytes may become
a completed document. Object paths remain unique and non-overwritable.

Core is used because large documents exceed the Web hosting request-body boundary.
Expose only the upload endpoint URL, never Storage secrets or database credentials.
Use the existing authenticated Core guards and exact installation-origin CORS.
No new runtime dependency or unsupported trigger on Supabase-owned Storage
metadata is required. Reuse existing reservation, cleanup and intake contracts
where possible; update the browser and API contract together.

Disconnects, size mismatches, provider rejection and uncertain provider outcomes
must fail truthfully. Do not release reserved capacity while an in-flight or
unreconciled upload can still create an object. Cleanup must be retryable and
scoped to the exact reserved object. Preserve existing documents and audit history.

## Verification and recovery

Prove quota races, maximum-size enforcement, smaller/larger actual byte counts,
expired reservations, duplicate requests, actor and tenant mismatch, provider
failure, partial-stream abort and retry/cleanup. Verify browser progress/error
behavior. Synthetic adapter tests establish local contracts; actual hosted
Storage/CORS acceptance remains a separate installation check.

Roll forward to a compatible Web/Core pair. Keep upload admission closed if that
pair or Storage is unavailable; do not restore the unrestricted signed-upload
path or browser bucket-write grants as a rollback shortcut.
