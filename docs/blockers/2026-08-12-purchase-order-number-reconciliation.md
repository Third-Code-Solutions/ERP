# Blocker: Purchase Order number reconciliation

Status: BLOCKED pending an authorized business mapping.

Observed from a read-only query against Supabase project `aqqrtkmtcsfkbyyqxowv`
on 2026-08-12:

- Tenant `2b2b039c-b066-412b-af4c-564f2af6097e` has one project-level
  duplicate group: `PO-0002` appears on 12 rows.
- All 12 rows belong to project `40b1773b-6da9-4665-b992-edaed28a7363`, have
  no vendor, and have one line item each.
- The line descriptions are synthetic E2E fixtures beginning with
  `E2E_QA_20260513_dd8a07a1`.
- Six rows are `issued`, one is `pending_pm_approval`, one is
  `pending_scm_issuance`, and four are `draft`.
- Four rows have one delivery schedule each. No row has a stock receipt or
  supplier bill. The remaining eight rows have no downstream purchase-order
  references.
- The same tenant has one non-duplicate order, `PO-2026-0001`.

The provider's first pending migration
`20260801090000_purchase_order_create_idempotency.sql` attempts to enforce
tenant-scoped Purchase Order number uniqueness and aborts on this group. No
data was changed by this audit.

## Required decision before release

An authorized owner must choose and document one of these mappings:

1. Retain all 12 synthetic rows and assign unique, approved Purchase Order
   numbers while preserving every foreign-key reference and audit trail.
2. Identify the disposable E2E rows and approve their removal only in the
   correct environment, with a recoverable backup and a verified cleanup
   report.
3. Consolidate rows only with explicit business approval; status differences
   and four delivery schedules make an automatic merge unsafe.

The release process must not guess which row is canonical or silently delete
records. After the mapping is approved, replay it on a disposable restore,
verify foreign keys, tenant isolation, audit rows, idempotency, and the
uniqueness constraint, then re-run the provider migration plan.

## Unapproved deterministic renumbering candidate

This is a review aid only. It is not authorization to mutate the hosted
database. If policy is to retain all synthetic rows, keeping earliest creation
order stable would produce this collision-free candidate mapping:

| Existing row | Status | Delivery rows | Candidate number |
|---|---|---:|---|
| `580ea7e4-871e-40a6-b049-51661f2fa1de` | draft | 0 | `PO-0002` |
| `fbb3fd2e-8c05-4b52-a4a9-de05f18b2a9f` | pending_pm_approval | 0 | `PO-0003` |
| `5efbac22-d7bb-4ba7-96c2-67170e012498` | issued | 0 | `PO-0004` |
| `511a6a50-6778-48a6-8e21-1c4c9b5e2245` | draft | 0 | `PO-0005` |
| `81551434-d552-4c51-b310-91cb36f4be63` | pending_scm_issuance | 0 | `PO-0006` |
| `4eaa5d9c-2014-442c-a7cd-dbcb435c8a1c` | draft | 0 | `PO-0007` |
| `59eaf83d-1025-4ad4-9455-b40405248a63` | issued | 1 | `PO-0008` |
| `696ed888-b347-4734-927e-52979155f6aa` | issued | 1 | `PO-0009` |
| `14e215d3-133a-4632-9434-180c55a15a7e` | issued | 1 | `PO-0010` |
| `d09a0fc8-5c89-4d50-954f-95c7a795724c` | issued | 0 | `PO-0011` |
| `063d5f99-ed50-44cc-801a-fadb7683042f` | draft | 0 | `PO-0012` |
| `b22e899c-6c45-46d9-ad0b-473e9f56941c` | issued | 1 | `PO-0013` |

Before any execution, owner must confirm whether this preserves required
business meaning, whether synthetic tenant rows should instead be purged, and
whether all downstream documents may retain their existing human-facing
number references. A migration must use a two-phase temporary namespace or an
equivalent collision-safe transaction, preserve audit history, and verify all
tenant-scoped foreign keys before enforcing the unique index.

## Evidence query

The release audit used the following read-only shape (the exact row IDs and
downstream counts are recorded in the command output for this run):

```sql
with duplicate_groups as (
  select tenant_id, po_number
  from public.purchase_orders
  group by tenant_id, po_number
  having count(*) > 1
)
select p.id, p.tenant_id, p.project_id, p.po_number, p.status,
       p.created_at, p.updated_at,
       (select count(*) from public.po_line_items li
        where li.tenant_id = p.tenant_id and li.po_id = p.id) as line_item_count,
       (select count(*) from public.delivery_schedules ds
        where ds.tenant_id = p.tenant_id and ds.purchase_order_id = p.id) as delivery_schedule_count,
       (select count(*) from public.stock_receipts sr
        where sr.tenant_id = p.tenant_id and sr.purchase_order_id = p.id) as stock_receipt_count,
       (select count(*) from public.supplier_bills sb
        where sb.tenant_id = p.tenant_id and sb.purchase_order_id = p.id) as supplier_bill_count
from public.purchase_orders p
join duplicate_groups d
  on d.tenant_id = p.tenant_id and d.po_number = p.po_number
order by p.tenant_id, p.created_at, p.id;
```
