# M3.31 - Supabase reconciliation audit (read-only)

Verified 2026-08-04 against the authorized Supabase project
`aqqrtkmtcsfkbyyqxowv` (`https://aqqrtkmtcsfkbyyqxowv.supabase.co`).

## M3.65 read-only planner refresh (2026-08-05)

The repository planner was rerun against the same target using
`node --env-file=apps/web/.env.local scripts/plan-database-release.mjs --json`.
It reports PostgreSQL 17, 55 applied migrations, source head
`20260804090000_project_create_idempotency`, and a `review_required` linear
prefix with 32 pending versions, no unexpected versions, and no versions
applied after the first gap. The pending suffix scan reports 26
`DROP CONSTRAINT IF EXISTS` findings and six transaction-control findings; no
`DROP TABLE`, `DELETE FROM`, `TRUNCATE`, or data-rewrite finding. Planner is
read-only; no SQL, migration history, data, Storage object, flag, or provider
setting changed. These values supersede older 85/86-file and 30/31-file
historical sections below; those sections remain preserved as audit history.

## M3.39 update (read-only after provider preflight)

Source now contains 87 ordered migrations with head
`20260804090000_project_create_idempotency`; hosted Supabase remains the exact
55-row prefix at `20260729233017_notification_outbox_foundation`. The
disposable PostgreSQL 17 + Redis replay passed all 87 migrations, database
306/306 with zero skips, and API integration 15 files / 22 tests.

The connected Supabase apply tool rejected the first real source migration
with `INVALID_ARGUMENT`. The project also reports a pre-existing branch named
`main` in `MIGRATIONS_FAILED` state. Two temporary no-op connector probes were
created and removed to validate the error boundary; a follow-up SQL check
confirmed no probe table and zero `x_*` history rows, with the hosted ledger
back at 55. No source suffix DDL, business data, Storage object, or net
migration-history change was applied. Hand-inserting history or bypassing the
ordered suffix remains prohibited until the supported provider path, backup,
catalog/data/RLS diff, and owner/release gates are available.

## M3.37 update (read-only)

After M3.36, source contains 86 migrations and the hosted target remains at
the exact 55-row prefix. The new source head is
`20260803170000_purchase_order_supplier_session_payload`; the 31-file suffix
still has not been applied. A fresh PostgreSQL 17 replay produces 111 public
tables; the target catalog currently exposes 88, leaving the 23 expected
suffix-created table objects absent. The target enum check confirms
`purchase_order_status` already includes `partial_delivered`.

Vercel runtime evidence for the reported digest points to an older deployment
and is not evidence for a current failure. No hosted SQL, data, Storage,
provider setting, or deployment changed in this update. The original M3.31
audit below remains the historical baseline; the hosted-apply block is still
active until backup/clone, catalog/data/RLS, recovery, zero-skip, owner,
provider, and spend gates clear.

## Status

`BLOCKED_FOR_HOSTED_APPLY`. This is a source and catalog audit only. No SQL,
migration history, feature flag, provider setting, hosted data, Storage object,
Railway variable, or Vercel deployment was changed.

## Ledger and target identity

- Source ledger: 85 files under `supabase/migrations`.
- Source head: `20260803160000_vendor_confirmation_session_minting`.
- Hosted ledger: 55 rows in `supabase_migrations.schema_migrations`.
- Hosted head: `20260729233017_notification_outbox_foundation`.
- The hosted ledger is an exact prefix of the source ledger. There are 30
  source migrations after the hosted head; no history repair was attempted.
- Supabase reports PostgreSQL `server_version_num = 170006`.
- Source suffix manifest (ordered JSON rows of version, filename, byte length,
  and SHA-256):
  `9fb0a2f55000bdddc7bb6c3b3dcea9f6243a8b49873609b7490323259eb4a260`.

## Ordered source suffix not present on the hosted target

1. `20260801090000_purchase_order_create_idempotency.sql`
2. `20260801100000_purchase_order_workflow_idempotency.sql`
3. `20260801110000_purchase_order_workflow_notifications.sql`
4. `20260801120000_stock_receipt_create_idempotency.sql`
5. `20260801130000_cad_evidence_commit_idempotency.sql`
6. `20260801140000_document_processing_jobs.sql`
7. `20260801150000_document_processing_evidence.sql`
8. `20260802090000_change_request_create_idempotency.sql`
9. `20260802100000_purchase_order_workflow_scm_rejection.sql`
10. `20260802110000_purchase_order_supplier_issuance.sql`
11. `20260802120000_finance_journal_post_idempotency.sql`
12. `20260802130000_stock_receipt_workflow_idempotency.sql`
13. `20260802140000_delivery_receipt_workflow_idempotency.sql`
14. `20260802150000_finance_journal_reverse_idempotency.sql`
15. `20260802160000_delivery_inspection_start_workflow.sql`
16. `20260802170000_delivery_inspection_complete_workflow.sql`
17. `20260802180000_delivery_cancel_workflow.sql`
18. `20260802190000_delivery_site_preparation_start_workflow.sql`
19. `20260802200000_delivery_site_preparation_complete_workflow.sql`
20. `20260802210000_supplier_bill_post_workflow.sql`
21. `20260802220000_supplier_bill_reverse_workflow.sql`
22. `20260802230000_cash_transaction_workflow_idempotency.sql`
23. `20260803090000_customer_invoice_issue_workflow.sql`
24. `20260803100000_customer_invoice_reverse_workflow.sql`
25. `20260803110000_customer_invoice_cancel_workflow.sql`
26. `20260803120000_cash_transaction_draft_workflow.sql`
27. `20260803130000_document_delete_workflow.sql`
28. `20260803140000_public_signing_workflow.sql`
29. `20260803150000_vendor_confirmation_workflow.sql`
30. `20260803160000_vendor_confirmation_session_minting.sql`

## Read-only safety checks

- The local release planner found 30 pending versions. SQL risk aggregate:
  24 `drop-object` findings and 6 transaction-control findings.
- The 24 `drop-object` findings are `DROP CONSTRAINT IF EXISTS`; no
  `DROP TABLE` was found.
- The six transaction-control files contain explicit `BEGIN`/`COMMIT` blocks.
- The scan found no `DELETE FROM`, `TRUNCATE`, or data-changing `UPDATE ... SET`
  statements in the suffix.
- A catalog query covering 23 expected suffix-created tables returned zero
  rows. The target therefore does not contain those pending table objects.
- All inspected public tables have RLS enabled. Security advisor output has
  14 findings: three RLS-enabled tables without policies, one public `vector`
  extension, one anon-executable security-definer function, eight
  authenticated-executable security-definer functions, and leaked-password
  protection disabled.
- Performance advisor output has 282 findings: 148 unindexed foreign keys,
  132 unused indexes, one duplicate index, and one auth connection warning.
  These are tracked separately from the migration-apply gate; no advisor fix
  was applied in this audit.

## Apply blockers

The ordered suffix cannot be applied to production until all of the following
are evidenced in an isolated PostgreSQL 17 rehearsal:

1. Restorable PITR/physical backup, encrypted logical schema/role/data dumps,
   and a separate Supabase Storage object inventory.
2. Restore of the target into a disposable clone, replay of all 30 files, and
   catalog, constraint, function, RLS, and business-data diff against the
   target.
3. Zero skipped database tests, Nest integration tests, RLS/security checks,
   duplicate-Purchase-Order mapping, audit-chain recovery, rollback, and
   idempotency/replay evidence.
4. Independent database-owner/release-owner review of the exact commit,
   planner hashes, target project, rollback point, provider identity, and
   spend-bounded canary.

Applying the final session-minting file alone, inserting rows into
`supabase_migrations.schema_migrations`, or using a blind hosted apply would
break the release policy and is prohibited.

## Exact next action

Obtain the approved backup/clone authority, restore the target into an
isolated PostgreSQL 17 clone, replay the 85-file source ledger, and produce a
catalog/data/RLS diff. Then author one forward-only reconciliation migration
for any remaining target drift. Re-run the release planner and required
integration/recovery gates before requesting a production apply. Until that
evidence exists, keep all supplier-confirmation controls false/empty and keep
Supabase and Vercel read-only.
