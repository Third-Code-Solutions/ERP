-- Transactional notification intent for the server-authoritative Purchase
-- Order approval workflow. Delivery remains asynchronous and idempotent.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notification_outbox'::regclass
      and conname = 'notification_outbox_purchase_order_workflow_payload'
  ) then
    alter table public.notification_outbox
      add constraint notification_outbox_purchase_order_workflow_payload
      check (
        event_type <> 'purchase_order.workflow_changed'
        or (
          aggregate_type = 'purchase_order'
          and payload ?& array[
            'schemaVersion',
            'purchase_order_id',
            'action',
            'from_status',
            'to_status'
          ]
          and payload - array[
            'schemaVersion',
            'purchase_order_id',
            'action',
            'from_status',
            'to_status'
          ] = '{}'::jsonb
          and payload->>'schemaVersion' = '1'
          and payload->>'purchase_order_id' = aggregate_id::text
          and payload->>'action' in (
            'submit_pm_approval',
            'pm_approve',
            'commercial_approve',
            'reject'
          )
          and payload->>'from_status' in (
            'draft',
            'pending_pm_approval',
            'pending_commercial_approval'
          )
          and payload->>'to_status' in (
            'draft',
            'pending_pm_approval',
            'pending_commercial_approval',
            'pending_scm_issuance'
          )
        )
      );
  end if;
end
$$;
