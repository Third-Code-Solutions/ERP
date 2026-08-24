# Document upload reservation reconciliation

## Outcome

Added a default-off, exact-tenant, report-only reconciliation lane for durable
document upload reservations. The internal BullMQ worker advances one bounded,
versioned page at a time and reports only:

- released or expired reservations with incomplete cleanup evidence;
- completed reservations whose exact tenant/project/document Storage link is
  absent or inconsistent; and
- canonical reservation-owned objects older than 24 hours that have no ledger
  row for the same tenant.

The lane does not delete objects, mutate provider state, infer ownership for
legacy/unmapped paths, or expose a public controller.

## Configuration

- `ERP_DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_ENABLED` defaults to `false`.
- `ERP_DOCUMENT_UPLOAD_RESERVATION_RECONCILIATION_TENANT_IDS` accepts at most
  20 explicit tenant UUIDs; wildcards and malformed/empty list segments fail
  environment validation. UUIDs are normalized to lowercase before deduping so
  DB scope, scheduler identity, cursor identity, and Storage prefixes agree.

## Security and operations

- Supabase Storage `listV2` is used with an exact tenant prefix, deterministic
  name ordering, a maximum page size of 50, and the existing 30-second server
  Storage request deadline.
- Reservation ownership inference accepts only Core's exact sanitized filename
  grammar: 1–200 ASCII letters, digits, dots, underscores, or hyphens, with no
  `..` sequence. Legacy-looking spaces, backslashes, unsafe characters, empty
  suffixes, nested paths, and overlength suffixes are ignored.
- Cursors are versioned, tenant-bound, strict, canonical base64url envelopes.
- Every continuation increments a shared traversal counter. At the 1,000-page
  limit, the next exact cursor is durably moved into the tenant's BullMQ job
  scheduler and resumed by the next scheduled run instead of restarting at the
  head or silently truncating. Completed scans reset the scheduler to the head.
  A queue-wide concurrency limit serializes checkpoint changes across workers.
- Storage creation timestamps must be bounded ISO 8601 strings with an explicit
  timezone before parsing; null, missing, numeric, invalid, or noncanonical
  provider values fail closed.
- Logs contain bounded counts and identifier hashes only. Provider diagnostics,
  raw paths, URLs, tokens, and document content are excluded.
- The existing destructive cleanup lane is unchanged and independently gated.

## Verification

- Added tenant-keyset partial indexes for terminal cleanup gaps and completed
  link reconciliation. The PostgreSQL 16 disposable verifier now validates
  catalog readiness and the actual query plans for both access paths.

- Focused Vitest: 5 files, 133 tests passed.
- API TypeScript check: passed.
- Database static contract: 8 tests passed.
- Database TypeScript check: passed.
- Disposable PostgreSQL 16 migration/catalog/plan verifier: passed.
- Scoped production ESLint: passed with zero warnings.
- Scoped `git diff --check`: passed.

The index migration is additive. If local rollback is required before hosted
application, drop only
`idx_document_upload_reservations_reconcile_terminal` and
`idx_document_upload_reservations_reconcile_completed`, then revert the Drizzle
definitions together. Hosted rollback requires the separately approved
forward-repair procedure; this changeset does not authorize direct provider SQL.

No deployment or hosted scheduler activation was performed.

→ Handoff to Agent 13. Reason: schedule/flag activation is an operations concern.
Inputs: the two reconciliation environment selectors and the internal queue.
Expected output: staged exact-tenant canary configuration and monitoring only
after hosted migration/cutover readiness is confirmed.
