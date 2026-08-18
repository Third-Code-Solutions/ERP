-- Supabase Database Advisor lint 0011: pin the two remaining functions that
-- inherited the caller search_path. Both are recreated with identical business
-- semantics; only object resolution is made deterministic.
begin;

create or replace function public.audit_entity_uuid(
  p_entity_type text,
  p_entity_key text
)
returns uuid
language sql
immutable
strict
parallel safe
set search_path = ''
as $$
  select pg_catalog.md5('audit:' || p_entity_type || ':' || p_entity_key)::pg_catalog.uuid;
$$;

create or replace function public.takeoff_ai_draft_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.ai_drafted
     and new.unit_rate_source <> 'dupa'
     and (new.unit_cost_cents <> 0 or new.line_total_cents <> 0) then
    raise exception 'AI-drafted takeoff lines cannot carry a unit rate before a DUPA is attached';
  end if;
  return new;
end;
$$;

commit;
