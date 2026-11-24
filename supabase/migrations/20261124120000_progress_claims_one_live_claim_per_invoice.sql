-- NEEDS PRODUCTION MIGRATION APPROVAL (expand-only; verified dump first, never applied by the builder).
--
-- S9a: one invoice backs at most one live progress claim.
--
-- Core now refuses to link an invoice that another live claim already holds
-- (ClaimTransitionService.assertInvoice). This partial unique index is the
-- race backstop for two claims linking the same invoice at the same moment:
-- the second commit fails with 23505, which Core reports as a conflict.
-- A rejected or cancelled claim releases its invoice.
--
-- The migration aborts, changing nothing, if production already holds two live
-- claims on one invoice. Resolve those rows first (reject or cancel the
-- duplicate claim, or relink it) and rerun; no row is rewritten here.
--
-- Rollback (instant, no data effect):
--   begin;
--   set local lock_timeout = '5s';
--   drop index if exists public.ux_progress_claims_tenant_invoice_live;
--   delete from supabase_migrations.schema_migrations where version = '20261124120000';
--   commit;
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if exists (
    select 1
    from public.progress_claims
    where invoice_id is not null
      and status not in ('rejected', 'cancelled')
    group by tenant_id, invoice_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'progress_claims has an invoice linked to more than one live claim; resolve before adding ux_progress_claims_tenant_invoice_live';
  end if;
end
$preflight$;

create unique index if not exists ux_progress_claims_tenant_invoice_live
  on public.progress_claims (tenant_id, invoice_id)
  where invoice_id is not null
    and status not in ('rejected', 'cancelled');

commit;
