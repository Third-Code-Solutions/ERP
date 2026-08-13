-- BUILD OPS WO-10: make RFQ quote/award provenance first-class in price history.
-- Additive only. Existing price history remains valid and unlinked.

alter table public.price_history
  add column if not exists source_rfq_id uuid,
  add column if not exists source_rfq_quote_id uuid;

create unique index if not exists ux_rfq_quotes_tenant_id_id
  on public.rfq_quotes (tenant_id, id);

create index if not exists idx_price_history_tenant_rfq
  on public.price_history (tenant_id, source_rfq_id);

create unique index if not exists ux_price_history_tenant_rfq_quote
  on public.price_history (tenant_id, source_rfq_quote_id)
  where source_rfq_quote_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.price_history'::regclass
      and conname = 'price_history_source_rfq_tenant_fk'
  ) then
    alter table public.price_history
      add constraint price_history_source_rfq_tenant_fk
      foreign key (tenant_id, source_rfq_id)
      references public.rfqs (tenant_id, id)
      on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.price_history'::regclass
      and conname = 'price_history_source_rfq_quote_tenant_fk'
  ) then
    alter table public.price_history
      add constraint price_history_source_rfq_quote_tenant_fk
      foreign key (tenant_id, source_rfq_quote_id)
      references public.rfq_quotes (tenant_id, id)
      on delete cascade;
  end if;
end
$$;

alter table public.price_history
  validate constraint price_history_source_rfq_tenant_fk;

alter table public.price_history
  validate constraint price_history_source_rfq_quote_tenant_fk;
