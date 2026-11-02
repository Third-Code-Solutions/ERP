alter table public.tenants
  add column if not exists legal_name varchar(255),
  add column if not exists registered_address text,
  add column if not exists document_email varchar(255),
  add column if not exists document_phone varchar(64);

alter table public.invoices
  add column if not exists issuer_legal_profile jsonb;

alter table public.purchase_orders
  add column if not exists issuer_legal_profile jsonb;

create or replace function public.capture_issuer_legal_profile()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.issuer_legal_profile is not null then
      raise exception 'Issuer legal profile is controlled by issuance' using errcode='23514';
    end if;
    return new;
  end if;
  if new.issuer_legal_profile is distinct from old.issuer_legal_profile then
    raise exception 'Issuer legal profile is controlled by issuance' using errcode='23514';
  end if;
  if new.status::text = 'issued'
     and old.status::text in ('draft','submitted','pending_pm_approval','pending_commercial_approval','pending_scm_issuance')
     and old.issuer_legal_profile is null then
    select jsonb_build_object(
      'schema_version', 1,
      'workspace_name', t.name,
      'legal_name', t.legal_name,
      'registered_address', t.registered_address,
      'document_email', t.document_email,
      'document_phone', t.document_phone,
      'bir_tin', t.bir_tin,
      'pcab_license', t.pcab_license
    )
    into new.issuer_legal_profile
    from public.tenants t
    where t.id = new.tenant_id;

    if coalesce(btrim(new.issuer_legal_profile ->> 'legal_name'), '') = ''
       or coalesce(btrim(new.issuer_legal_profile ->> 'registered_address'), '') = ''
       or coalesce(btrim(new.issuer_legal_profile ->> 'bir_tin'), '') = '' then
      raise exception using
        errcode = '23514',
        message = 'Company legal document identity is incomplete',
        hint = 'Configure legal name, registered address, and BIR TIN in workspace settings before issuing.';
    end if;
  end if;

  return new;
end;
$$;
revoke all on function public.capture_issuer_legal_profile() from public, anon, authenticated;

drop trigger if exists invoices_capture_issuer_legal_profile on public.invoices;
create trigger invoices_capture_issuer_legal_profile
before insert or update on public.invoices
for each row execute function public.capture_issuer_legal_profile();

drop trigger if exists purchase_orders_capture_issuer_legal_profile on public.purchase_orders;
create trigger purchase_orders_capture_issuer_legal_profile
before insert or update on public.purchase_orders
for each row execute function public.capture_issuer_legal_profile();

comment on column public.tenants.legal_name is
  'Configured operating-company legal name for external documents; null means incomplete setup.';
comment on column public.invoices.issuer_legal_profile is
  'Immutable operating-company identity captured when invoice first becomes issued. Legacy issued rows remain null.';
comment on column public.purchase_orders.issuer_legal_profile is
  'Immutable operating-company identity captured when purchase order first becomes issued. Legacy issued rows remain null.';
