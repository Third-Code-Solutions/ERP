-- RFQ auto-dispatch is one logical result per tenant BOM. The parent and
-- idempotency keys are tenant-composite so a retry cannot cross tenant scope
-- or create a second official RFQ.

do $$
begin
  if exists (
    select 1
    from public.rfqs
    group by tenant_id, bom_id
    having count(*) > 1
  ) then
    raise exception
      'Cannot enforce RFQ idempotency while duplicate tenant/BOM rows exist';
  end if;
end
$$;

create unique index if not exists ux_boms_tenant_id_id
  on public.boms (tenant_id, id);

create unique index if not exists ux_rfqs_tenant_bom
  on public.rfqs (tenant_id, bom_id);

alter table public.rfqs
  drop constraint if exists rfqs_bom_id_fkey;

alter table public.rfqs
  drop constraint if exists rfqs_bom_tenant_fk;

alter table public.rfqs
  add constraint rfqs_bom_tenant_fk
  foreign key (tenant_id, bom_id)
  references public.boms (tenant_id, id)
  on delete cascade
  not valid;

alter table public.rfqs
  validate constraint rfqs_bom_tenant_fk;
