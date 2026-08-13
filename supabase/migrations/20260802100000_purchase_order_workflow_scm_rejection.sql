-- Extend the existing Purchase Order workflow notification contract for
-- rejection from the SCM issuance step. This is forward-only because the
-- original workflow notification constraint may already be applied.

alter table public.notification_outbox
  drop constraint if exists notification_outbox_purchase_order_workflow_payload;

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
        'pending_commercial_approval',
        'pending_scm_issuance'
      )
      and payload->>'to_status' in (
        'draft',
        'pending_pm_approval',
        'pending_commercial_approval',
        'pending_scm_issuance'
      )
    )
  );
