-- A provider submission ID identifies exactly one signable source globally.
-- The partial unique indexes reject same-table duplicates. The trigger below
-- serializes cross-table assignments by submission ID and rejects ambiguity
-- before a callback can select a source by query order.

begin;

do $$
begin
  if exists (
    select docuseal_submission_id
    from (
      select docuseal_submission_id
      from public.bom_portal_tokens
      where docuseal_submission_id is not null
      union all
      select docuseal_submission_id
      from public.variation_orders
      where docuseal_submission_id is not null
      union all
      select docuseal_submission_id
      from public.certificates_of_completion
      where docuseal_submission_id is not null
    ) as provider_submissions
    group by docuseal_submission_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = 'unique_violation',
      message = 'DocuSeal submission ID is already assigned to multiple signing sources';
  end if;
end;
$$;

create unique index if not exists ux_bom_portal_tokens_docuseal_submission_id
  on public.bom_portal_tokens (docuseal_submission_id)
  where docuseal_submission_id is not null;

create unique index if not exists ux_variation_orders_docuseal_submission_id
  on public.variation_orders (docuseal_submission_id)
  where docuseal_submission_id is not null;

create unique index if not exists ux_certificates_of_completion_docuseal_submission_id
  on public.certificates_of_completion (docuseal_submission_id)
  where docuseal_submission_id is not null;

create or replace function public.enforce_docuseal_submission_id_uniqueness()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.docuseal_submission_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.docuseal_submission_id, 0::bigint)
  );

  if tg_table_name <> 'bom_portal_tokens'
    and exists (
      select 1
      from public.bom_portal_tokens
      where docuseal_submission_id = new.docuseal_submission_id
    ) then
    raise exception using
      errcode = 'unique_violation',
      message = 'DocuSeal submission ID is already assigned to another signing source';
  end if;

  if tg_table_name <> 'variation_orders'
    and exists (
      select 1
      from public.variation_orders
      where docuseal_submission_id = new.docuseal_submission_id
    ) then
    raise exception using
      errcode = 'unique_violation',
      message = 'DocuSeal submission ID is already assigned to another signing source';
  end if;

  if tg_table_name <> 'certificates_of_completion'
    and exists (
      select 1
      from public.certificates_of_completion
      where docuseal_submission_id = new.docuseal_submission_id
    ) then
    raise exception using
      errcode = 'unique_violation',
      message = 'DocuSeal submission ID is already assigned to another signing source';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_bom_portal_tokens_docuseal_submission_id on public.bom_portal_tokens;
create trigger trg_bom_portal_tokens_docuseal_submission_id
before insert or update of docuseal_submission_id on public.bom_portal_tokens
for each row execute function public.enforce_docuseal_submission_id_uniqueness();

drop trigger if exists trg_variation_orders_docuseal_submission_id on public.variation_orders;
create trigger trg_variation_orders_docuseal_submission_id
before insert or update of docuseal_submission_id on public.variation_orders
for each row execute function public.enforce_docuseal_submission_id_uniqueness();

drop trigger if exists trg_certificates_of_completion_docuseal_submission_id on public.certificates_of_completion;
create trigger trg_certificates_of_completion_docuseal_submission_id
before insert or update of docuseal_submission_id on public.certificates_of_completion
for each row execute function public.enforce_docuseal_submission_id_uniqueness();

commit;

-- Rollback: disable DocuSeal template initiation and confirm no callback is in
-- flight before dropping the three triggers, function, and additive indexes in
-- a separate reviewed migration. Never delete signed documents or audit rows.
