import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260817110000_explicit_server_only_rls_policies.sql'
  ),
  'utf8'
).toLowerCase()

const serverOnlyTables = [
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
  'vendor_confirmation_sessions',
] as const

describe('explicit server-only RLS policy migration', () => {
  it('covers the full advisor-reported server-only table inventory', () => {
    expect(serverOnlyTables).toHaveLength(56)
    for (const table of serverOnlyTables) {
      expect(migration).toContain(`'${table}'`)
    }
  })

  it('keeps direct Data API access denied without silently skipping a table', () => {
    expect(migration).toContain('alter table public.%i enable row level security')
    expect(migration).toContain('deny_direct_client_access')
    expect(migration).toContain('for all to anon, authenticated using (false) with check (false)')
    expect(migration).toContain('expected server-only table public.% for explicit rls policy')
    expect(migration).toContain('begin;')
    expect(migration.trimEnd().endsWith('commit;')).toBe(true)
  })
})
