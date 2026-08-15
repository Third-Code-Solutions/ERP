begin;

-- WO-12: the mobile client keeps this UUID in IndexedDB and reuses it when a
-- reconnect or browser retry repeats the same report submission. It is
-- intentionally nullable so historical rows remain valid.
alter table public.site_inspections
  add column if not exists client_submission_id uuid;

create unique index if not exists ux_site_inspections_tenant_submission
  on public.site_inspections (tenant_id, client_submission_id)
  where client_submission_id is not null;

commit;
