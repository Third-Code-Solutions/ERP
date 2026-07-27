-- Third Code ERP receipt-linked Supplier Bill schema.
-- Forward-only: adds PO-line and Stock Receipt evidence to payable lines.

alter table public.supplier_bill_lines
  add column if not exists po_line_item_id uuid;
alter table public.supplier_bill_lines
  add column if not exists stock_receipt_line_id uuid;
alter table public.supplier_bill_lines
  add column if not exists quantity_micros bigint;

alter table public.supplier_bill_lines
  drop constraint if exists supplier_bill_lines_po_line_tenant_fk;
alter table public.supplier_bill_lines
  add constraint supplier_bill_lines_po_line_tenant_fk
  foreign key (tenant_id, po_line_item_id)
  references public.po_line_items(tenant_id, id)
  on delete restrict;

alter table public.supplier_bill_lines
  drop constraint if exists supplier_bill_lines_receipt_line_tenant_fk;
alter table public.supplier_bill_lines
  add constraint supplier_bill_lines_receipt_line_tenant_fk
  foreign key (tenant_id, stock_receipt_line_id)
  references public.stock_receipt_lines(tenant_id, id)
  on delete restrict;

alter table public.supplier_bill_lines
  drop constraint if exists supplier_bill_lines_receipt_match_complete;
alter table public.supplier_bill_lines
  add constraint supplier_bill_lines_receipt_match_complete
  check (
    (
      stock_receipt_line_id is null
      and quantity_micros is null
    ) or (
      stock_receipt_line_id is not null
      and quantity_micros > 0
    )
  );

create index if not exists idx_supplier_bill_lines_po_line
  on public.supplier_bill_lines (tenant_id, po_line_item_id);
create index if not exists idx_supplier_bill_lines_receipt_line
  on public.supplier_bill_lines (tenant_id, stock_receipt_line_id)
  where stock_receipt_line_id is not null;

grant insert (
  po_line_item_id,
  stock_receipt_line_id,
  quantity_micros
)
on table public.supplier_bill_lines
to authenticated;

grant update (
  po_line_item_id,
  stock_receipt_line_id,
  quantity_micros
)
on table public.supplier_bill_lines
to authenticated;
