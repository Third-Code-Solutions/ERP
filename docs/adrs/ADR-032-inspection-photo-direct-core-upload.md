# ADR-032: Direct authenticated Core inspection photo upload

- Status: Accepted for implementation under approved WO-12 scope
- Date: 2026-09-13

## Decision

The browser sends multipart photo bytes directly to Core rather than through
the Web function. Vercel's 4.5 MB body limit cannot support the existing 15 MiB
photo allowance. Supabase signed upload grants are not selected: their two-hour
lifetime and shared bucket size policy do not enforce this per-photo physical cap.

Add POST `/v1/opportunities/:opportunityId/inspection-photos/upload`, preserving
the existing metadata registration endpoint. Require the browser's current bearer
session and `x-expected-actor-id` / `x-expected-tenant-id` headers. Derive authority
from verified current membership, not those precondition headers. Reject stale
ownership and inactive or unauthorized users before multipart parsing; revalidate
authority under existing locks after parsing and before privileged Storage effects.
Do not hold database locks during browser ingress.

Accept exactly one file with bounded fields, parts, total ingress time and concurrent
buffering. Enforce the 15 MiB byte cap in Core. Derive MIME from magic bytes and
construct the existing content-addressed canonical path from actual bytes. Reuse
one transaction for exact receipt replay, immutable bounded upload, stored-byte
verification, document registration and semantic audit. Do not nest a second
lock-holding registration transaction. Never overwrite or delete uncertain objects.

A same-origin authenticated Web metadata endpoint advertises only the configured
Core upload URL and owner scope. It accepts no caller-controlled destination and
returns no token. The browser obtains its existing session afresh on each retry,
keeps credentials out of durable drafts, checks exact receipt scope and preserves
the existing IndexedDB compare-and-swap and component lifetime checks.

## Verification and release

Prove real HTTP 15 MiB acceptance and oversized rejection, pre-parse authorization,
stale-owner/lifecycle rejection before Storage, bounded concurrency/time, verified
replay after response loss, and browser transfer above 4.5 MB bypassing Web.
Existing capability, tenant isolation, audit and stored-byte tests remain required.
Read-only production CORS preflight permits the Web origin and expected headers;
this is not proof of the unimplemented route or hosted upload behavior.

No schema, package or provider setting change is needed for this design. Core's
missing private Storage credential and production recovery gates still block release.

Sources: [Vercel limits](https://vercel.com/docs/functions/limitations),
[Supabase signed uploads](https://supabase.com/docs/reference/javascript/file-buckets-createsigneduploadurl),
[Nest request lifecycle](https://docs.nestjs.com/faq/request-lifecycle).
