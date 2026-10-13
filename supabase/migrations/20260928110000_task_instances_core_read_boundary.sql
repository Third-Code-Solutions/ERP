-- Process tasks contain cross-BU handoff details. Browser clients must read
-- them through Core's capability-checked task endpoints, not the Data API.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('public.task_instances') is null then
    raise exception 'Expected public.task_instances before task read hardening'
      using errcode = '55000';
  end if;
end
$$;

alter table public.task_instances enable row level security;

revoke select on table public.task_instances from public, anon, authenticated;
drop policy if exists task_instances_tenant_read on public.task_instances;

-- Core uses a server-owned connection; retain its explicit table authority.
grant select on table public.task_instances to service_role;

commit;
