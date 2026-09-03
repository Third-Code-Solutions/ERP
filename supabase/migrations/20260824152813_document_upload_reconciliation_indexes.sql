begin;

create index idx_document_upload_reservations_reconcile_terminal
  on public.document_upload_reservations (tenant_id, id)
  where state in ('released', 'expired')
    and cleanup_completed_at is null;

create index idx_document_upload_reservations_reconcile_completed
  on public.document_upload_reservations (tenant_id, id)
  where state = 'completed';

commit;
