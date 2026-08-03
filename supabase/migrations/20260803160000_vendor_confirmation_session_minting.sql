-- Deterministic, protected session minting at SCM issuance.
-- This source migration stores only the hashed token and the workflow request
-- association. The raw URL token is derived from the session id plus a
-- server-only secret and is not placed in PostgreSQL, audit, or outbox JSON.
-- The migration remains source-only until the ordered hosted suffix and
-- disposable replay/rollback gates are approved.

alter table public.vendor_confirmation_sessions
  add column if not exists source_workflow_request_id uuid;

create unique index if not exists
  ux_vendor_confirmation_sessions_tenant_source_request
  on public.vendor_confirmation_sessions (
    tenant_id,
    source_workflow_request_id
  );

create unique index if not exists
  ux_vendor_confirmation_sessions_pending_tenant_po
  on public.vendor_confirmation_sessions (tenant_id, purchase_order_id)
  where state = 'pending';

alter table public.vendor_confirmation_sessions
  drop constraint if exists
    vendor_confirmation_sessions_source_workflow_request_tenant_fk;

alter table public.vendor_confirmation_sessions
  add constraint vendor_confirmation_sessions_source_workflow_request_tenant_fk
    foreign key (tenant_id, source_workflow_request_id)
    references public.purchase_order_workflow_requests (tenant_id, id)
    on delete restrict
    not valid;

alter table public.vendor_confirmation_sessions
  validate constraint
    vendor_confirmation_sessions_source_workflow_request_tenant_fk;
