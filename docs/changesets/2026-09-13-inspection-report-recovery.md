# Inspection report archive recovery

## Delivered locally

- Core-only archive command with strict IDs/empty body and active capability
  admission. Opportunity/inspection locks serialize concurrent repair; document,
  link and semantic audit commit atomically. Valid legacy HTML receipts replay.
- Shared existing HTML renderer preserves print imports; canonical findings,
  photos, original inspector and submission time replace caller/current-time data.
- Bounded immutable private upload with complete SHA-256/size/MIME verification.
  Partial/corrupted/missing data cannot create an official archive. No overwrites
  or uncertain cleanup; orphan-byte retention is explicit in ADR031 and runbook.
- Web requests archiving on initial submission and replay, preserves submitted
  findings on archive failure, exposes scoped repair for latest and earlier
  unarchived inspections, and links to authenticated archive download.
- Pending/error/success/keyboard/mobile states, sanitized observability, and a
  credential-free repair browser gate in CI. No schema or dependency added.

## Verification

- PASSED: 101/101 focused API/Storage/actual synthetic PostgreSQL/HTTP/observability
  cases, no skips. Includes real Storage adapter + database bridge with controlled
  provider fetch, canonical role HTTP checks, concurrent replay and audit rollback.
- PASSED: final Storage-only run, 32/32, after one additional transport regression.
- PASSED: 281/281 focused Web action/client and page mounting tests, no skips.
- PASSED: five Chromium repair interactions, four viewport widths (320/768/1024/
  1440), keyboard retry, pending duplicate prevention and uncertain outcome recovery.
  Mobile error screenshot inspected. Browser uses real component/CSS, controlled
  server action/navigation; not an authenticated hosted end-to-end claim.
- PASSED: API/Web/shared-types checks, dedicated integration types, source ESLint,
  API production build, Actionlint and BUILD OPS static invariants.
- PASSED: independent Astra review after correcting case-insensitive receipt
  binding and older-inspection repair access.
- PASSED: corrected WO-12 static contract, 97/97 tests without skips. The gate
  recognizes only the exact approved Core archive import, removes the legacy
  writer exemption, and checks replay recovery and confirmed receipt scope.
- PASSED: downloaded CI run 34723148797 evidence at 6ddc8d46: 508 database,
  251 API, two Web integration and 90 credential-free browser cases, no skips;
  empty schema diff. That run failed the obsolete WO-12 contract before this fix,
  so build and trusted-PR E2E were skipped. Replacement CI remains required.
- NOT RUN: live Storage, full all-role hosted journeys, live archive download.

## Release

Not deployed. PR84 requires replacement CI after the static contract fix.
Base PR83 CI run34722129620
passed all ten GitHub jobs; downloaded reports had no skips and empty schema diff.
Its Supabase Preview was cancelled at the concurrent-branch limit.

Production recovery evidence and the missing Core Storage credential remain release
blockers. Core and Web must release together. This is explicit retry, not automatic
background repair; provider-admin deletion, report version history and safe orphan
reclamation remain separate work. Large-photo transport bypassing Web's request
limit remains needed; direct authenticated Core upload is the selected next design.
Read-only production checks confirmed Core database/Redis readiness and allowed
Web-origin CORS preflight for bearer and expected-owner headers. They do not prove
the not-yet-implemented multipart route or any live photo upload.
