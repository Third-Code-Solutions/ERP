-- Extend the strict supplier-issuance outbox contract for the server-owned
-- confirmation-session association. The raw public token remains excluded.

alter table public.notification_outbox
  drop constraint if exists notification_outbox_purchase_order_supplier_issued_payload;

alter table public.notification_outbox
  add constraint notification_outbox_purchase_order_supplier_issued_payload
  check (
    event_type <> 'purchase_order.supplier_issued'
    or (
      aggregate_type = 'purchase_order'
      and payload ?& array['schemaVersion', 'purchase_order_id']
      and payload - array[
        'schemaVersion',
        'purchase_order_id',
        'vendor_confirmation_session_id'
      ] = '{}'::jsonb
      and payload->>'schemaVersion' = '1'
      and payload->>'purchase_order_id' = aggregate_id::text
      and (
        not (payload ? 'vendor_confirmation_session_id')
        or jsonb_typeof(payload->'vendor_confirmation_session_id') = 'null'
        or (
          jsonb_typeof(payload->'vendor_confirmation_session_id') = 'string'
          and payload->>'vendor_confirmation_session_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        )
      )
    )
  );
