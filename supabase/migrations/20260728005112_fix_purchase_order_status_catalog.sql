begin;

alter type public.purchase_order_status
  add value if not exists 'partial_delivered' after 'issued';

commit;
