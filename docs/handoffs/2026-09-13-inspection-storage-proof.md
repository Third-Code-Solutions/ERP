# Inspection photo stored-byte verification

## Outcome and scope

PRD WO-12 requires permanent photo findings. PR #81, commit `374937f9`, has
green hosted CI and verified no-skips artifacts. Its Core registration currently
trusts caller-declared photo metadata without reading the private stored object.
This slice prevents new registrations from claiming evidence when bytes are
missing, oversized, truncated, the wrong raster type or inconsistent with the
content-addressed path. It does not claim full WO-12 or production completion.

## Contract

- Preserve existing command/result shapes and exact persisted receipt replay.
- For a new registration, require the existing Web uploader's SHA-256-prefixed
  filename/path convention. Legacy existing receipts remain replayable; this
  does not retrospectively prove their historical bytes or hash.
- Authorize current actor, tenant and opportunity before privileged Storage
  reads. Retain admission and opportunity locks through the bounded verification,
  document insert and audit transaction.
- Read only the fixed private `documents` bucket on the configured Supabase
  origin, with encoded object-path segments, redirects disabled, a full-stream
  deadline and a hard 15 MiB streaming cap. Never fetch caller-provided URLs.
- Compare streamed byte count, raster signature, response content type and
  SHA-256 against the command and path before recording new metadata.
- Missing credentials, provider errors, timeout or contradictory bytes fail
  closed. No Storage deletion, replacement, recovery shortcut or new dependency.
- Existing production migration/recovery gates remain in force.

## Ordered ownership

1. Agent 01/main records this contract and handoff after current source review.
2. Agent 05/Astra owns the focused Storage verifier, Core service wiring and
   service/unit tests. Reproduce missing-object registration before fixing it.
3. Luna owns only the existing photo PostgreSQL integration fixtures/tests after
   Astra confirms the injected verifier contract. Preserve real authorization,
   concurrent replay, transaction/audit and tenant-negative assertions; add
   rejected-byte proof with no document/audit changes. No hosted Storage calls.
4. Main independently reviews security, validates the integrated focused tests,
   type/lint/build and database lane, then writes changeset and pushes through PR.

Agents do not edit the same files. No schema, provider configuration, hosted data
or Storage mutation is included. Fifteen-MiB Web transport, historical stored
objects and post-registration Storage mutation remain separate evidence gates.

## Confirmed follow-on WO-12 gaps

- Browser currently sends full multipart photo bodies through the Vercel Web
  function. The documented 4.5 MB request limit is below the application's
  15 MiB photo limit. A direct-to-private-Storage upload/confirmation flow is
  required; changing the server-action limit does not fix this route boundary.
- `site_inspection_photos.document_id` cascades on document deletion. Core and
  legacy Web project-document deletion guard claim/KYC references, but not
  inspection photo/report references. Add retention checks and concurrent
  attachment/deletion proof before claiming permanent inspection evidence.
- Existing receipt replay preserves committed identity, not current Storage
  availability. This slice must not be reported as historical object verification.
