# Demo tenant data restore

## Outcome

Restored the canonical ABI OPS demo dataset to the dedicated
`buildops-e2e` tenant after live inventory found no project or linked demo rows.

## Restored records

- 3 projects
- 5 opportunities
- 2 vendors
- 1 approved BOM with 7 line items
- 2 invoices
- 1 purchase order with 2 line items
- 3 project comments

The source of truth was `apps/web/scripts/seed-demo.sql`. All restored records
were written with that tenant id and their source-defined relationships.

## Verification

- The tenant-bound counts exactly match the canonical seed contract.
- Relationship checks found zero broken project, vendor, BOM, PO, invoice, or
  comment references.
- The deployed `/projects` page rendered all three projects for the restored
  demo Sales account.

## Notes

- The configured database URL could not authenticate directly; restoration used
  the server-only Supabase service-role path.
- No customer data was created, moved, or deleted.
