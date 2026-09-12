# Inspection photo direct Core transport

## Delivered locally

- Additive authenticated Core multipart endpoint bypasses Web's 4.5 MB body
  ceiling while enforcing the existing physical 15 MiB photo limit. Existing
  metadata registration and legacy Web upload endpoints remain compatible.
- Current membership/capability/opportunity checks precede parsing; locked
  authorization repeats before privileged effects. Four retained requests per
  process, bounded multipart fields/overhead and 90-second ingress termination
  protect buffering. Parser cancellation settles before capacity is released.
- Server-derived MIME/hash/path, immutable bounded Storage POST and full stored-byte
  verification precede atomic document/audit registration. Exact receipts replay
  without provider effects; uncertain outcomes never overwrite or delete evidence.
- Web returns only configured owner-bound destination metadata. Browser obtains its
  own current session, sends canonical ASCII filenames directly to Core, verifies
  receipt scope and content address, and preserves durable draft/CAS/lifetime fencing.
  Upload work has a 120-second browser deadline; no tokens enter saved drafts.
- Sanitized photo-upload observability and operational guidance. No schema, package,
  deployment setting or production data changed.

## Verification

- PASSED: 160/160 consolidated Core unit, actual HTTP, Storage, actual synthetic
  PostgreSQL and observability cases; no skips. Includes physical 15 MiB acceptance,
  oversized denial, all 13 capability roles, repeated partial-upload timeout and
  disconnect cancellation, capacity recovery, active-owner races, exact replay and
  a real Storage-adapter/database bridge with corrupted provider bytes rejected.
- PASSED: 97/97 focused Web transport, old upload route, durable draft and mounted
  form tests; no skips. Covers scoped metadata, credential destination, receipt
  binding, canonical filenames, timeouts and late session refresh.
- PASSED: 19 Chromium journeys with real React/CSS/IndexedDB, controlled Auth/Core
  responses. Includes a 5 MiB multipart request sent directly to Core, zero Web
  photo bytes, receipt reuse after reload, Unicode/path-separator filenames,
  ownership changes, frozen retries and four viewport widths.
- PASSED: API/Web type checks, dedicated integration types, API production build,
  source ESLint, WO-12 contract 97/97, Actionlint, BUILD OPS static invariants.
- PASSED: independent Astra review after correcting parser cancellation and
  multipart filename normalization. Review is not hosted runtime proof.
- PASSED (follow-up): full local Next.js production build, including type validation
  and 112 generated pages. CI exposed a client import through the mixed Auth barrel;
  the transport now imports the existing `/client` export. Its 22 focused tests pass.
- NOT RUN: hosted Auth/Storage upload and all-role live journeys. Browser uses
  controlled boundaries, not a deployed Core service.

## Release

Not deployed. Parent PR84 run34723600911 passed all ten jobs. Initial PR85
run34724416753 passed its earlier gates but failed Web build on the Auth import;
the correction requires a fresh green CI run and exact release verification.

The existing production Storage credential was verified against the private
`documents` bucket and staged on the verified Railway production API service through
stdin with `--skip-deploys`. The stored value was compared without exposing it;
the latest deployment ID remained unchanged. This is configuration staging, not
proof that a running release has loaded the credential or completed an upload.

Pending migration/recovery evidence and Supabase preview branch capacity still
gate production. No environments were deleted and no safeguard was disabled.
Full ERP roadmap remains incomplete.
