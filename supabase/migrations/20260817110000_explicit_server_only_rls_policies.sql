-- Supabase Advisor lint 0008: these tables are deliberately server-only.
-- RLS already denied Data API access because no policies existed; these
-- explicit rejection policies preserve that behavior while documenting the
-- boundary for operators and the Security Advisor. Do not add an allow policy
-- without a reviewed Core authority and tenant-isolation decision.
begin;

do $$
declare
  server_only_table text;
begin
  foreach server_only_table in array array[
    'asset_maintenance_create_requests',
    'asset_maintenance_records',
    'assets',
    'bank_statement_auto_match_requests',
    'bank_statement_import_requests',
    'bank_statement_line_match_requests',
    'bank_statement_reconcile_requests',
    'bank_statement_void_requests',
    'cad_evidence_commit_requests',
    'cash_transaction_draft_requests',
    'cash_transaction_workflow_requests',
    'change_request_create_requests',
    'cortex_assistant_generation_jobs',
    'cortex_assistant_provider_attempts',
    'cortex_assistant_provider_circuit_alerts',
    'cortex_assistant_provider_policies',
    'cortex_assistant_turn_requests',
    'cortex_conversation_turn_requests',
    'cortex_semantic_index_jobs',
    'cost_entry_create_requests',
    'cost_entry_delete_requests',
    'cost_entry_restore_requests',
    'customer_invoice_cancel_requests',
    'customer_invoice_draft_create_requests',
    'customer_invoice_issue_requests',
    'customer_invoice_reverse_requests',
    'delivery_schedule_create_requests',
    'delivery_workflow_requests',
    'document_delete_requests',
    'document_intake_requests',
    'document_processing_evidence',
    'document_processing_jobs',
    'financial_sequences',
    'journal_post_requests',
    'journal_reverse_requests',
    'notification_deliveries',
    'notification_outbox',
    'opportunity_project_conversion_requests',
    'opportunity_stage_transition_requests',
    'project_comment_create_requests',
    'project_comment_delete_requests',
    'project_create_requests',
    'public_signing_requests',
    'purchase_order_create_requests',
    'purchase_order_supplier_email_deliveries',
    'purchase_order_workflow_requests',
    'stock_movement_create_requests',
    'stock_movement_workflow_requests',
    'stock_receipt_create_requests',
    'stock_receipt_workflow_requests',
    'supplier_bill_post_requests',
    'supplier_bill_reverse_requests',
    'togal_bom_commit_requests',
    'user_role_assignment_requests',
    'vendor_confirmation_requests',
    'vendor_confirmation_sessions'
  ] loop
    if to_regclass(format('public.%I', server_only_table)) is null then
      raise exception
        'Expected server-only table public.% for explicit RLS policy',
        server_only_table
        using errcode = '55000';
    end if;

    execute format(
      'alter table public.%I enable row level security',
      server_only_table
    );

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = server_only_table
        and policyname = 'deny_direct_client_access'
    ) then
      execute format(
        'create policy deny_direct_client_access on public.%I for all to anon, authenticated using (false) with check (false)',
        server_only_table
      );
    end if;
  end loop;
end
$$;

commit;
