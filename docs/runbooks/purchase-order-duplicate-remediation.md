# Purchase Order Duplicate Remediation

## Purpose

Validate an owner-approved Purchase Order-number mapping before any hosted
repair or migration replay. This runbook is read-only. It never emits SQL,
updates `purchase_orders`, edits migration history, or approves production.

## Mapping file

Create JSON outside the repository and outside public build output. Do not
commit it or paste its business values into logs, issues, or chat.

```json
{
  "version": 1,
  "entries": [
    {
      "tenantId": "<tenant UUID>",
      "purchaseOrderId": "<Purchase Order UUID>",
      "currentNumber": "<number from the owner-approved snapshot>",
      "replacementNumber": "<unique number approved by the owner>"
    }
  ]
}
```

Include every row in every duplicate `(tenant_id, po_number)` group. One
canonical row may keep its current number; every other row needs a unique
replacement within that tenant. Mapping must use the exact current number from
the same snapshot so stale or cross-tenant edits fail closed.

## Read-only preflight

If the owner needs a review skeleton from the current snapshot, create it in
an approved secure directory first. The command refuses repository/build
paths, refuses to overwrite an existing file, and exits `2` while duplicate
rows remain unresolved:

```powershell
node --env-file=apps/web/.env.local scripts/plan-purchase-order-mapping-template.mjs `
  --template-file="C:\secure\thirdcode-po-mapping-template.json"
```

The generated file contains the exact tenant IDs, Purchase Order IDs, and
current numbers from one repeatable-read snapshot. Every
`replacementNumber` is intentionally blank; the command never guesses a
canonical row or renumbers a record. Treat the file as sensitive, keep it
outside Git/public build output, and have the database owner fill and approve
it before running the validator below.

```powershell
node --env-file=apps/web/.env.local scripts/plan-purchase-order-mapping.mjs `
  --mapping-file="C:\secure\thirdcode-po-mapping.json"
```

Use `--json` for machine capture. Output contains only status, counts, a
mapping-file SHA-256, and opaque conflict references. `status: "ready"` means
the mapping matches the current repeatable-read snapshot and has no occupied
targets. It does not authorize SQL or a deployment.

## Required release gates after preflight

1. Database owner signs off mapping and business consequences.
2. Supported Supabase backup/PITR and managed auth/storage/roles/grants/vector
   catalog evidence exist.
3. Disposable PostgreSQL 17 replay passes in order with zero skipped protected
   flow/database checks.
4. Rollback, exact SHA/provider identity, readiness, security-advisor, and
   spend-cap gates pass.
5. Only then schedule one bounded hosted repair/migration action.

If any gate fails, keep hosted Supabase unchanged.
