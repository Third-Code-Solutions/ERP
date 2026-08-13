-- Reconcile legacy duplicate Purchase Order numbers before the tenant-scoped
-- uniqueness and idempotency migrations.
--
-- Preserve every row, UUID, downstream foreign key, amount, status, and audit
-- history. Keep the earliest row on its original number and give later rows a
-- deterministic suffix. Abort if a suffix already belongs to another row.
-- This migration is idempotent once each tenant/number pair is unique.

set local lock_timeout = '10s';
set local statement_timeout = '60s';

do $$
begin
  if exists (
    with ranked as (
      select
        id,
        tenant_id,
        po_number,
        row_number() over (
          partition by tenant_id, po_number
          order by created_at, id
        ) as occurrence
      from public.purchase_orders
    )
    select 1
      from ranked duplicate_row
      join public.purchase_orders existing_row
        on existing_row.tenant_id = duplicate_row.tenant_id
       and existing_row.po_number = duplicate_row.po_number
          || '-R'
          || lpad(duplicate_row.occurrence::text, 2, '0')
       and existing_row.id <> duplicate_row.id
     where duplicate_row.occurrence > 1
  ) then
    raise exception
      'Cannot reconcile duplicate Purchase Order numbers: deterministic suffix collision exists';
  end if;

  with ranked as (
    select
      id,
      tenant_id,
      po_number,
      row_number() over (
        partition by tenant_id, po_number
        order by created_at, id
      ) as occurrence
    from public.purchase_orders
  )
  update public.purchase_orders purchase_order
     set po_number = ranked.po_number
       || '-R'
       || lpad(ranked.occurrence::text, 2, '0'),
         updated_at = clock_timestamp()
    from ranked
   where purchase_order.id = ranked.id
     and ranked.occurrence > 1;

  if exists (
    select 1
      from public.purchase_orders
     group by tenant_id, po_number
    having count(*) > 1
  ) then
    raise exception
      'Duplicate Purchase Order numbers remain after reconciliation';
  end if;
end
$$;
