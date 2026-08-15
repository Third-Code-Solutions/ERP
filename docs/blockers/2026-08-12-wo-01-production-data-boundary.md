# WO-01 production data boundary

## Status

BLOCKED for destructive purge or tenant move. Read-only audit complete.

## Evidence

Target Supabase project currently contains two tenants:

- `buildops-e2e` (`BuildOps E2E Tenant`)
- `e2e-qa-20260513-foreign` (`E2E_QA_20260513_dd8a07a1_foreign`)

No ABI-like tenant exists in the target catalog. Therefore no safe ABI tenant
can be selected for purge, and no data may be deleted or moved by inference.

Read-only WO-01 audit found 66 E2E-prefixed field values:

- `accounts`: 2
- `bom_line_items`: 3
- `cortex_nodes`: 10
- `customer_portal_sessions`: 5
- `delivery_schedules`: 4
- `notifications`: 2
- `opportunities`: 2
- `permits`: 3
- `po_line_items`: 12
- `progress_claims`: 3
- `project_comments`: 5
- `projects`: 14
- `vendors`: 1

The target has one project named `TH/RD CODE FINAL PHASE` and two distinct
opportunity rows pointing to it. This is duplicate E2E opportunity data, not
two project rows.

`PO-0002` has 12 distinct purchase-order IDs and four delivery rows. The four
delivery IDs and four purchase-order IDs are distinct; the observed delivery
result is not join fanout. All four delivery rows point to E2E data and have no
vendor.

Read-only duplicate-key analysis confirms all 12 `PO-0002` rows belong to the
`buildops-e2e` tenant and the same project. They span `draft`, approval, and
`issued` states. This matches the repeated target Postgres error observed
while attempting to enforce tenant PO-number uniqueness. Cleanup remains
blocked because these rows are referenced by the 104 E2E foreign-key
relationships and no canonical-row or retention policy was supplied.

The audit also found 104 live single-column foreign-key references across 24
E2E parent/child relationships. The largest reference groups are:

- E2E account `76591a49-acec-4f22-890d-c41b8c00a68a` → 5 opportunities.
- E2E project `40b1773b-6da9-4665-b992-edaed28a7363` → 44 rows across BOMs,
  portal sessions, documents, invoices, permits, progress claims, progress
  updates, purchase orders, and weekly reports.
- Eight E2E cortex nodes → 49 cortex-edge rows in total.

This confirms that row-level deletion cannot be safely inferred from a screen
label or prefix. The full machine-readable inventory, including every
parent/child reference relationship, is available from the read-only audit:
`node --env-file=apps/web/.env.local scripts/audit-build-ops-demo-data.mjs --json`.

## Required authorization/evidence before mutation

1. Identify the real ABI tenant slug and confirm it exists in this Supabase
   project.
2. Confirm dedicated demo tenant and foreign-test tenant retention policy.
3. Provide or verify pre-purge backup/PITR restore evidence.
4. Approve exact tenant-scoped delete/move manifest after reference checks.

No production rows were inserted, updated, deleted, or moved.

## Revalidation — 2026-08-15

The new fail-closed promotion scanner completed a read-only hosted scan with
`buildops-e2e` as the only configured demo allowlist. It found 72 E2E-prefixed
field matches in total and two promotion violations in the foreign tenant
`e2e-qa-20260513-foreign`:

- one `cortex_nodes.title` row;
- one `projects.name` row.

No seeded test identity was outside the configured allowlist. The scanner did
not print matching business values and did not change hosted data. Promotion
therefore remains `review_required` until the foreign tenant's retention and
cleanup decision is approved with the evidence listed above.
