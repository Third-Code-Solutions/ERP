# Inspection evidence retention

## Changes

- Core and legacy Web reject deletion of tenant-bound inspection photos/reports
  after acquiring the document lock, before destructive database operations.
- Remove physical Storage cleanup from both Web deletion paths, including old
  Core receipt replay. Shared/reused paths cannot safely identify object ownership.
  Unreferenced records remain deletable; private bytes are retained.
- Record the retention policy in new semantic audit events and truthful deletion
  confirmation copy. Historical receipts/audit are unchanged; no migration.
- Add committed/concurrent PostgreSQL photo/report retention proof and replay
  regressions. Preserve claim/KYC retention and unrelated scope behavior.

## Verification

- PASSED: Node 22 focused API unit + actual synthetic PostgreSQL integration,
  19/19 with no skips, including existing claim-delete regressions.
- PASSED: focused Web action tests, 20/20; source ESLint; API/Web type checks;
  API production build; diff whitespace check.
- PASSED: independent Astra review after closing generic-path cleanup bypass.
- NOT RUN: rendered deletion confirmation/browser journey for this slice;
  all-role production verification. Hosted CI for this commit pending PR.

## Release and limits

Not deployed. Production recovery evidence and PR82's required server-side Storage
credential remain unresolved. Old Web cleanup instances must be replaced/drained.
Report archival atomicity and the large-photo upload transport remain follow-ons.
Retained private files consume Storage; no automatic reclamation is claimed.
