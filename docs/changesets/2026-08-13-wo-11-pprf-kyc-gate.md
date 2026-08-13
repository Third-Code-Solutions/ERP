# WO-11 PPRF intake and KYC dual-track gate

## Outcome

Implemented the BUILD OPS WO-11 workflow:

- Added an atomic PPRF intake that creates the tenant-scoped client,
  opportunity, PPRF v1 submission, and two independent Finance review tracks.
- Added durable `opportunity_kyc_tracks` schema, tenant-composite foreign keys,
  RLS, append-only audit trigger, lifecycle checks, and two-business-day due
  dates through the tenant business calendar.
- Added Finance review actions for start/recommend/flag and President
  approve/reject, with visible reasons and audit events.
- Added KYC queue and PPRF review-panel UI, protected API route, and a
  defense-in-depth pipeline lock until both tracks are approved.
- Moved the client-safe KYC contract/labels into shared-types so server-only
  auth modules never enter the browser bundle.

## Verification

- PASS: shared-types and web typechecks.
- PASS: targeted API/service/pipeline tests, 11 tests.
- PASS: full web Vitest suite: 141 files, 357 tests, 0 failures; 2 CAD/worker
  integration tests skipped because their external worker/DB setup was not
  enabled.
- PASS: disposable PostgreSQL 17 + Redis 7.4.9 lane: 63 migrations,
  251/251 database tests, zero skips, API DB integration 3/3, schema hash
  unchanged before/after tests.
- PASS: Next production build, 80 generated pages, including PPRF intake and
  KYC API routes.
- PASS: local production-server Chromium smoke: 4/4 for public branding,
  protected-route redirects, headers, and invalid-credential handling.
- PASS: local public responsive Chromium smoke: ABI OPS title/manifest,
  structured data, health/readiness, desktop/tablet/mobile layout, and zero
  console/page errors.

## Release boundary

- No hosted Supabase write or migration push was performed.
- Hosted promotion remains blocked by provider migration/source divergence,
  duplicate PO mapping, and hosted WO-02 audit/calendar gates.
- Authenticated browser mutation of the new PPRF flow was not run against the
  hosted environment; local E2E covered unauthenticated route protection and
  the production artifact's public/protected surfaces.
