-- Sales intake starts as an opportunity, not as a delivery project.
-- The optional name records the work being pursued and becomes the delivery
-- project name only through the existing guarded won-opportunity conversion.

begin;

alter table public.opportunities
  add column if not exists prospective_project_name text;

alter table public.opportunities
  drop constraint if exists opportunities_prospective_project_name_check;

alter table public.opportunities
  add constraint opportunities_prospective_project_name_check
  check (
    prospective_project_name is null
    or (
      char_length(btrim(prospective_project_name)) between 1 and 200
      and prospective_project_name = btrim(prospective_project_name)
    )
  );

comment on column public.opportunities.prospective_project_name is
  'Sales-entered prospective project name. It is not a delivery project and is used when a won opportunity is converted.';

commit;

-- Rollback (after confirming no production reader still requires the field):
-- alter table public.opportunities drop constraint if exists opportunities_prospective_project_name_check;
-- alter table public.opportunities drop column if exists prospective_project_name;
