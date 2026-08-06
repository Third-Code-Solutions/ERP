#!/usr/bin/env node

/**
 * Read-only migration/catalog verifier.
 *
 * Default mode is fail-closed: DATABASE_URL must point at the disposable
 * database produced by `supabase db reset`. `--files-only` validates the
 * repository ledger without opening a database connection.
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(scriptDirectory, '..')
const migrationDirectory = join(repoRoot, 'supabase', 'migrations')
const seedPath = join(repoRoot, 'supabase', 'seed.sql')
const filesOnly = process.argv.includes('--files-only')

const requiredMigrations = [
  '20260613184358_handle_new_user_auto_provision.sql',
  '20260613192311_cortex_substrate_schema.sql',
  '20260613192346_cortex_substrate_functions.sql',
  '20260613192426_cortex_fix_digest_search_path.sql',
  '20260613192810_cortex_revoke_rpc_execute.sql',
  '20260613193116_cortex_mirror_opportunities_documents.sql',
  '20260613195156_cortex_mirror_execution_core.sql',
  '20260614035348_cortex_nodes_embedding_hnsw_index.sql',
  '20260614044012_cortex_agent_memory.sql',
  '20260614052018_cortex_node_type_expand.sql',
  '20260614052136_cortex_generic_mirror.sql',
  '20260614053117_cortex_generic_mirror_redact_attributes.sql',
  '20260614063911_cost_entries_phase3.sql',
  '20260726192929_cortex_cost_security_hardening.sql',
  '20260726201606_accounting_ledger_foundation.sql',
  '20260726210500_customer_receivables_foundation.sql',
  '20260726220000_supplier_payables_foundation.sql',
  '20260726225000_cash_allocation_schema.sql',
  '20260726230000_cash_allocation_foundation.sql',
  '20260726231000_bank_reconciliation_schema.sql',
  '20260726232000_bank_reconciliation_foundation.sql',
  '20260726233000_inventory_stock_schema.sql',
  '20260726234000_inventory_stock_foundation.sql',
  '20260726235000_supplier_bill_receipt_match_schema.sql',
  '20260726240000_supplier_bill_three_way_match.sql',
  '20260726241000_supplier_bill_three_way_posting.sql',
  '20260726242000_project_budget_schema.sql',
  '20260726243000_project_budget_controls.sql',
  '20260726244000_stock_movement_schema.sql',
  '20260726245000_stock_movement_controls.sql',
  '20260727162024_security_advisor_hardening.sql',
  '20260727194749_fix_receivable_mirror_return.sql',
  '20260727194757_fix_cash_posting_alias_resolution.sql',
  '20260727194805_fix_finance_workflow_guards.sql',
  '20260728005112_fix_purchase_order_status_catalog.sql',
  '20260729233017_notification_outbox_foundation.sql',
  '20260806110000_asset_register_foundation.sql',
  '20260806120000_delivery_in_transit_workflow.sql',
]

const requiredTables = [
  'cortex_provenance',
  'cortex_nodes',
  'cortex_edges',
  'cortex_conversations',
  'cortex_messages',
  'audit_log',
  'cost_entries',
  'fiscal_periods',
  'ledger_accounts',
  'financial_sequences',
  'journal_entries',
  'journal_lines',
  'invoices',
  'supplier_bills',
  'supplier_bill_lines',
  'cash_accounts',
  'cash_transactions',
  'cash_allocations',
  'bank_statements',
  'bank_statement_lines',
  'units_of_measure',
  'warehouses',
  'stock_receipts',
  'stock_receipt_lines',
  'stock_ledger_entries',
  'cost_codes',
  'project_budgets',
  'project_budget_lines',
  'stock_movements',
  'stock_movement_lines',
  'notification_outbox',
  'notification_deliveries',
]

// Service-only command ledgers and the operational asset register are
// intentionally excluded from the authenticated tenant policy set above.
// They still require forced RLS and explicit service-role authority in every
// clean replay and hosted clone.
const requiredServerOnlyTables = [
  'stock_movement_create_requests',
  'stock_movement_workflow_requests',
  'assets',
]

const requiredPolicies = [
  ['cortex_nodes', 'cortex_nodes_tenant_read'],
  ['cortex_edges', 'cortex_edges_tenant_read'],
  ['cortex_provenance', 'cortex_provenance_tenant_read'],
  ['cortex_conversations', 'cortex_conversations_owner_read'],
  ['cortex_messages', 'cortex_messages_parent_owner_read'],
  ['audit_log', 'audit_log_tenant_read'],
  ['cost_entries', 'cost_entries_tenant_read'],
  ['cost_entries', 'cost_entries_tenant_insert'],
  ['cost_entries', 'cost_entries_tenant_update'],
  ['cost_entries', 'cost_entries_tenant_delete'],
  ['fiscal_periods', 'fiscal_periods_finance_read'],
  ['fiscal_periods', 'fiscal_periods_finance_insert'],
  ['fiscal_periods', 'fiscal_periods_finance_update'],
  ['fiscal_periods', 'fiscal_periods_finance_delete'],
  ['ledger_accounts', 'ledger_accounts_finance_read'],
  ['ledger_accounts', 'ledger_accounts_finance_insert'],
  ['ledger_accounts', 'ledger_accounts_finance_update'],
  ['ledger_accounts', 'ledger_accounts_finance_delete'],
  ['journal_entries', 'journal_entries_finance_read'],
  ['journal_entries', 'journal_entries_finance_insert'],
  ['journal_entries', 'journal_entries_finance_update'],
  ['journal_entries', 'journal_entries_finance_delete'],
  ['journal_lines', 'journal_lines_finance_read'],
  ['journal_lines', 'journal_lines_finance_insert'],
  ['journal_lines', 'journal_lines_finance_update'],
  ['journal_lines', 'journal_lines_finance_delete'],
  ['invoices', 'invoices_finance_read'],
  ['invoices', 'invoices_finance_insert'],
  ['invoices', 'invoices_finance_update'],
  ['supplier_bills', 'supplier_bills_finance_read'],
  ['supplier_bills', 'supplier_bills_finance_insert'],
  ['supplier_bills', 'supplier_bills_finance_update'],
  ['supplier_bills', 'supplier_bills_finance_delete'],
  ['supplier_bill_lines', 'supplier_bill_lines_finance_read'],
  ['supplier_bill_lines', 'supplier_bill_lines_finance_insert'],
  ['supplier_bill_lines', 'supplier_bill_lines_finance_update'],
  ['supplier_bill_lines', 'supplier_bill_lines_finance_delete'],
  ['cash_accounts', 'cash_accounts_finance_read'],
  ['cash_accounts', 'cash_accounts_finance_insert'],
  ['cash_accounts', 'cash_accounts_finance_update'],
  ['cash_accounts', 'cash_accounts_finance_delete'],
  ['cash_transactions', 'cash_transactions_finance_read'],
  ['cash_transactions', 'cash_transactions_finance_insert'],
  ['cash_transactions', 'cash_transactions_finance_update'],
  ['cash_transactions', 'cash_transactions_finance_delete'],
  ['cash_allocations', 'cash_allocations_finance_read'],
  ['cash_allocations', 'cash_allocations_finance_insert'],
  ['cash_allocations', 'cash_allocations_finance_update'],
  ['cash_allocations', 'cash_allocations_finance_delete'],
  ['bank_statements', 'bank_statements_finance_read'],
  ['bank_statements', 'bank_statements_finance_insert'],
  ['bank_statements', 'bank_statements_finance_update'],
  ['bank_statements', 'bank_statements_finance_delete'],
  ['bank_statement_lines', 'bank_statement_lines_finance_read'],
  ['bank_statement_lines', 'bank_statement_lines_finance_insert'],
  ['bank_statement_lines', 'bank_statement_lines_finance_update'],
  ['bank_statement_lines', 'bank_statement_lines_finance_delete'],
  ['units_of_measure', 'units_of_measure_inventory_read'],
  ['units_of_measure', 'units_of_measure_inventory_insert'],
  ['units_of_measure', 'units_of_measure_inventory_update'],
  ['units_of_measure', 'units_of_measure_inventory_delete'],
  ['warehouses', 'warehouses_inventory_read'],
  ['warehouses', 'warehouses_inventory_insert'],
  ['warehouses', 'warehouses_inventory_update'],
  ['warehouses', 'warehouses_inventory_delete'],
  ['stock_receipts', 'stock_receipts_inventory_read'],
  ['stock_receipts', 'stock_receipts_inventory_insert'],
  ['stock_receipts', 'stock_receipts_inventory_update'],
  ['stock_receipts', 'stock_receipts_inventory_delete'],
  ['stock_receipt_lines', 'stock_receipt_lines_inventory_read'],
  ['stock_receipt_lines', 'stock_receipt_lines_inventory_insert'],
  ['stock_receipt_lines', 'stock_receipt_lines_inventory_update'],
  ['stock_receipt_lines', 'stock_receipt_lines_inventory_delete'],
  ['stock_ledger_entries', 'stock_ledger_entries_inventory_read'],
  ['cost_codes', 'cost_codes_budget_read'],
  ['cost_codes', 'cost_codes_budget_insert'],
  ['cost_codes', 'cost_codes_budget_update'],
  ['cost_codes', 'cost_codes_budget_delete'],
  ['project_budgets', 'project_budgets_budget_read'],
  ['project_budgets', 'project_budgets_budget_insert'],
  ['project_budgets', 'project_budgets_budget_update'],
  ['project_budgets', 'project_budgets_budget_delete'],
  ['project_budget_lines', 'project_budget_lines_budget_read'],
  ['project_budget_lines', 'project_budget_lines_budget_insert'],
  ['project_budget_lines', 'project_budget_lines_budget_update'],
  ['project_budget_lines', 'project_budget_lines_budget_delete'],
  ['stock_movements', 'stock_movements_inventory_read'],
  ['stock_movements', 'stock_movements_inventory_insert'],
  ['stock_movements', 'stock_movements_inventory_update'],
  ['stock_movements', 'stock_movements_inventory_delete'],
  ['stock_movement_lines', 'stock_movement_lines_inventory_read'],
  ['stock_movement_lines', 'stock_movement_lines_inventory_insert'],
  ['stock_movement_lines', 'stock_movement_lines_inventory_update'],
  ['stock_movement_lines', 'stock_movement_lines_inventory_delete'],
]

const requiredIndexes = [
  'ux_cortex_nodes_current',
  'ux_notification_outbox_tenant_event',
  'ux_notification_deliveries_recipient_channel',
  'ux_notification_deliveries_tenant_idempotency',
  'ux_notifications_tenant_source_delivery',
  'ux_cortex_edges_current',
  'idx_cortex_nodes_embedding',
  'idx_cortex_conversations_tenant_user',
  'idx_cortex_messages_conversation',
  'idx_cost_entries_tenant_category',
  'idx_cost_entries_incurred',
  'idx_cost_entries_bom_line_item_id',
  'idx_cost_entries_po_line_item_id',
  'ux_fiscal_periods_tenant_name',
  'ux_ledger_accounts_tenant_code',
  'ux_journal_entries_tenant_number',
  'ux_journal_entries_reverses_entry',
  'ux_journal_lines_entry_line',
  'idx_journal_entries_tenant_posting_date',
  'idx_journal_lines_tenant_account',
  'ux_accounts_tenant_id_id',
  'ux_invoices_tenant_id_id',
  'ux_invoices_tenant_issuance_journal',
  'ux_invoices_tenant_reversal_journal',
  'idx_invoices_tenant_account',
  'idx_journal_lines_tenant_business_account',
  'ux_vendors_tenant_id_id',
  'ux_purchase_orders_tenant_id_id',
  'ux_supplier_bills_tenant_id_id',
  'ux_supplier_bills_vendor_number',
  'ux_supplier_bills_tenant_internal_number',
  'ux_supplier_bills_posting_journal',
  'ux_supplier_bills_reversal_journal',
  'ux_supplier_bill_lines_bill_line',
  'idx_journal_lines_tenant_vendor',
  'ux_cash_accounts_tenant_id_id',
  'ux_cash_accounts_tenant_ledger',
  'ux_cash_accounts_tenant_name',
  'ux_cash_transactions_tenant_id_id',
  'ux_cash_transactions_reference',
  'ux_cash_transactions_internal_number',
  'ux_cash_transactions_posting_journal',
  'ux_cash_transactions_reversal_journal',
  'ux_cash_allocations_transaction_line',
  'idx_cash_allocations_invoice',
  'idx_cash_allocations_supplier_bill',
  'ux_bank_statements_tenant_id_id',
  'ux_bank_statements_reference',
  'idx_bank_statements_tenant_status',
  'idx_bank_statements_tenant_period',
  'ux_bank_statement_lines_statement_line',
  'ux_bank_statement_lines_fingerprint',
  'ux_bank_statement_lines_cash_transaction',
  'idx_bank_statement_lines_statement_date',
  'idx_bank_statement_lines_unmatched',
  'ux_units_of_measure_tenant_id_id',
  'ux_units_of_measure_tenant_code',
  'ux_warehouses_tenant_id_id',
  'ux_warehouses_tenant_code',
  'ux_stock_receipts_tenant_id_id',
  'ux_stock_receipts_tenant_number',
  'ux_stock_receipts_posting_journal',
  'ux_stock_receipts_reversal_journal',
  'ux_stock_receipt_lines_receipt_line',
  'ux_stock_receipt_lines_receipt_po_line',
  'ux_stock_ledger_receipt_line_event',
  'idx_stock_ledger_balance',
  'idx_supplier_bill_lines_po_line',
  'idx_supplier_bill_lines_receipt_line',
  'ux_cost_codes_tenant_id_id',
  'ux_cost_codes_tenant_code',
  'idx_cost_codes_tenant_category',
  'ux_project_budgets_tenant_id_id',
  'ux_project_budgets_project_revision',
  'ux_project_budgets_current_approved',
  'ux_project_budgets_open_revision',
  'ux_project_budget_lines_tenant_id_id',
  'ux_project_budget_lines_budget_line',
  'ux_project_budget_lines_budget_cost_code',
  'idx_po_line_items_cost_code',
  'idx_supplier_bill_lines_cost_code',
  'idx_cost_entries_cost_code',
  'ux_stock_movements_tenant_id_id',
  'ux_stock_movements_tenant_number',
  'ux_stock_movement_lines_tenant_id_id',
  'ux_stock_movement_lines_movement_line',
  'ux_stock_movement_lines_movement_item',
  'ux_stock_ledger_entries_tenant_id_id',
  'ux_stock_ledger_movement_line_event_warehouse',
  'ux_stock_ledger_movement_reversal',
  'ux_assets_tenant_id_id',
  'ux_assets_tenant_tag',
  'ux_assets_tenant_serial',
  'idx_assets_tenant_status',
  'idx_assets_tenant_project',
]

const requiredServerOnlyIndexes = [
  'ux_stock_movement_create_requests_tenant_id_id',
  'ux_stock_movement_create_requests_tenant_key',
  'idx_stock_movement_create_requests_tenant_state',
  'ux_stock_movement_workflow_requests_tenant_id_id',
  'ux_stock_movement_workflow_requests_tenant_key',
  'idx_stock_movement_workflow_requests_tenant_state',
]

const requiredExpandedNodeTypes = [
  'contact',
  'permit',
  'claim',
  'ticket',
  'delivery',
  'rfq',
  'contract',
  'certificate',
  'punchlist',
  'inspection',
  'design',
  'change_request',
  'material',
  'weekly_report',
  'fiscal_period',
  'ledger_account',
  'journal_entry',
  'journal_line',
  'supplier_bill',
  'cash_account',
  'cash_transaction',
  'bank_statement',
  'warehouse',
  'stock_receipt',
  'stock_ledger_entry',
  'cost_code',
  'project_budget',
  'stock_movement',
]

const requiredPurchaseOrderStatuses = [
  'draft',
  'submitted',
  'confirmed',
  'partial_delivery',
  'delivered',
  'cancelled',
  'pending_pm_approval',
  'pending_commercial_approval',
  'pending_scm_issuance',
  'issued',
  'partial_delivered',
  'fully_delivered',
]

const requiredOrganizationTypes = [
  'construction',
  'developer',
  'design-engineering',
  'supply-manufacturing',
  'professional-services',
  'other',
]

const requiredTriggers = [
  ['auth.users', 'on_auth_user_created'],
  ['public.projects', 'cortex_mirror_projects'],
  ['public.accounts', 'cortex_mirror_accounts'],
  ['public.users', 'cortex_mirror_users'],
  ['public.opportunities', 'cortex_mirror_opportunities'],
  ['public.documents', 'cortex_mirror_documents'],
  ['public.boms', 'cortex_mirror_boms'],
  ['public.purchase_orders', 'cortex_mirror_purchase_orders'],
  ['public.invoices', 'cortex_mirror_invoices'],
  ['public.daily_tasks', 'cortex_mirror_daily_tasks'],
  ['public.vendors', 'cortex_mirror_g'],
  ['public.scope_items', 'cortex_mirror_g'],
  ['public.contacts', 'cortex_mirror_g'],
  ['public.permits', 'cortex_mirror_g'],
  ['public.variation_orders', 'cortex_mirror_g'],
  ['public.progress_claims', 'cortex_mirror_g'],
  ['public.warranty_tickets', 'cortex_mirror_g'],
  ['public.delivery_schedules', 'cortex_mirror_g'],
  ['public.rfqs', 'cortex_mirror_g'],
  ['public.contracts', 'cortex_mirror_g'],
  ['public.certificates_of_completion', 'cortex_mirror_g'],
  ['public.punchlist_items', 'cortex_mirror_g'],
  ['public.site_inspections', 'cortex_mirror_g'],
  ['public.design_files', 'cortex_mirror_g'],
  ['public.change_requests', 'cortex_mirror_g'],
  ['public.master_schedules', 'cortex_mirror_g'],
  ['public.material_items', 'cortex_mirror_g'],
  ['public.weekly_reports', 'cortex_mirror_g'],
  ['public.pre_con_checklist_items', 'cortex_mirror_g'],
  ['public.cost_entries', 'audit_cost_entries'],
  ['public.cost_entries', 'cortex_mirror_g'],
  ['public.fiscal_periods', 'guard_fiscal_period_row'],
  ['public.fiscal_periods', 'audit_fiscal_periods'],
  ['public.ledger_accounts', 'audit_ledger_accounts'],
  ['public.journal_entries', 'guard_posted_journal_entry_row'],
  ['public.journal_entries', 'audit_journal_entries'],
  ['public.journal_lines', 'guard_posted_journal_line_row'],
  ['public.journal_lines', 'audit_journal_lines'],
  ['public.fiscal_periods', 'cortex_mirror_finance'],
  ['public.ledger_accounts', 'cortex_mirror_finance'],
  ['public.journal_entries', 'cortex_mirror_finance'],
  ['public.journal_lines', 'cortex_mirror_finance'],
  ['public.invoices', 'guard_customer_invoice'],
  ['public.invoices', 'cortex_mirror_receivable_dimensions'],
  ['public.journal_lines', 'cortex_mirror_receivable_dimensions'],
  ['public.supplier_bills', 'guard_supplier_bill'],
  ['public.supplier_bill_lines', 'guard_supplier_bill_line'],
  ['public.supplier_bills', 'audit_supplier_bills'],
  ['public.supplier_bill_lines', 'audit_supplier_bill_lines'],
  ['public.supplier_bills', 'cortex_mirror_payables'],
  ['public.journal_lines', 'cortex_mirror_payables'],
  ['public.cash_accounts', 'guard_cash_account'],
  ['public.cash_transactions', 'guard_cash_transaction'],
  ['public.cash_allocations', 'guard_cash_allocation'],
  ['public.cash_accounts', 'audit_cash_accounts'],
  ['public.cash_transactions', 'audit_cash_transactions'],
  ['public.cash_allocations', 'audit_cash_allocations'],
  ['public.cash_accounts', 'cortex_mirror_cash'],
  ['public.cash_transactions', 'cortex_mirror_cash'],
  ['public.bank_statements', 'guard_bank_statement'],
  ['public.bank_statement_lines', 'guard_bank_statement_line'],
  ['public.bank_statements', 'audit_bank_statements'],
  ['public.bank_statement_lines', 'audit_bank_statement_lines'],
  ['public.bank_statements', 'cortex_mirror_bank_statement'],
  ['public.units_of_measure', 'guard_units_of_measure'],
  ['public.warehouses', 'guard_warehouses'],
  ['public.material_items', 'guard_inventory_item'],
  ['public.po_line_items', 'guard_po_line_stock_fields'],
  ['public.stock_receipts', 'guard_stock_receipt'],
  ['public.stock_receipt_lines', 'guard_stock_receipt_line'],
  ['public.stock_ledger_entries', 'guard_stock_ledger_entry'],
  ['public.journal_entries', 'guard_stock_journal_reversal'],
  ['public.units_of_measure', 'audit_units_of_measure'],
  ['public.warehouses', 'audit_warehouses'],
  ['public.stock_receipts', 'audit_stock_receipts'],
  ['public.stock_receipt_lines', 'audit_stock_receipt_lines'],
  ['public.stock_ledger_entries', 'audit_stock_ledger_entries'],
  ['public.warehouses', 'cortex_mirror_warehouse'],
  ['public.stock_receipts', 'cortex_mirror_stock_receipt'],
  ['public.stock_ledger_entries', 'cortex_mirror_stock_ledger_entry'],
  ['public.supplier_bill_lines', 'enforce_supplier_bill_line_match'],
  ['public.supplier_bills', 'enforce_supplier_bill_three_way_posting'],
  ['public.cost_codes', 'guard_cost_code'],
  ['public.project_budgets', 'guard_project_budget'],
  ['public.project_budget_lines', 'guard_project_budget_line'],
  ['public.project_budget_lines', 'refresh_project_budget_total'],
  ['public.po_line_items', 'guard_po_line_budget_dimension'],
  ['public.supplier_bill_lines', 'guard_supplier_bill_cost_dimension'],
  ['public.cost_entries', 'guard_cost_entry_dimension'],
  ['public.purchase_orders', 'enforce_project_budget_commitment'],
  ['public.cost_codes', 'audit_cost_codes'],
  ['public.project_budgets', 'audit_project_budgets'],
  ['public.project_budget_lines', 'audit_project_budget_lines'],
  ['public.cost_codes', 'cortex_mirror_budget_cost_code'],
  ['public.project_budgets', 'cortex_mirror_project_budget'],
  ['public.stock_movements', 'guard_stock_movement'],
  ['public.stock_movement_lines', 'guard_stock_movement_line'],
  ['public.units_of_measure', 'guard_inventory_movement_uom'],
  ['public.warehouses', 'guard_inventory_movement_warehouse'],
  ['public.stock_movements', 'audit_stock_movements'],
  ['public.stock_movement_lines', 'audit_stock_movement_lines'],
  ['public.stock_movements', 'cortex_mirror_stock_movement'],
  ['public.assets', 'audit_assets'],
]

const requiredSecurityDefinerFunctions = [
  'auth_tenant_id',
  'audit_log_trigger',
  'handle_new_user',
  'cortex_provenance_append',
  'cortex_node_current',
  'cortex_upsert_node',
  'cortex_close_node',
  'cortex_upsert_edge',
  'cortex_mirror_project',
  'cortex_mirror_account',
  'cortex_mirror_user',
  'cortex_mirror_opportunity',
  'cortex_mirror_document',
  'cortex_mirror_bom',
  'cortex_mirror_purchase_order',
  'cortex_mirror_invoice',
  'cortex_mirror_daily_task',
  'cortex_mirror_generic',
]

const requiredTrustedOnlyFunctions = requiredSecurityDefinerFunctions.filter(
  (name) => name !== 'auth_tenant_id'
)

const requiredAccountingSecurityDefinerFunctions = [
  'auth_can_manage_finance',
  'guard_fiscal_period',
  'guard_posted_journal_entry',
  'guard_posted_journal_line',
  'post_journal_entry',
  'reverse_journal_entry',
  'close_fiscal_period',
  'cortex_mirror_finance',
  'auth_can_read_cortex_node_type',
  'auth_can_read_cortex_subject',
  'guard_customer_invoice',
  'issue_customer_invoice',
  'cancel_customer_invoice',
  'reverse_customer_invoice',
  'cortex_mirror_receivable_dimensions',
  'guard_supplier_bill',
  'guard_supplier_bill_line',
  'post_supplier_bill',
  'reverse_supplier_bill',
  'cortex_mirror_payables',
  'guard_cash_account',
  'guard_cash_transaction',
  'guard_cash_allocation',
  'refresh_customer_invoice_cash_status',
  'post_cash_transaction',
  'reverse_cash_transaction',
  'cortex_mirror_cash',
  'guard_bank_statement',
  'guard_bank_statement_line',
  'match_bank_statement_line',
  'unmatch_bank_statement_line',
  'auto_match_bank_statement',
  'reconcile_bank_statement',
  'void_bank_statement',
  'cortex_mirror_bank_statement',
  'auth_can_read_inventory',
  'auth_can_manage_inventory',
  'guard_inventory_master',
  'guard_inventory_item',
  'guard_po_line_stock_fields',
  'guard_stock_receipt',
  'guard_stock_receipt_line',
  'guard_stock_ledger_entry',
  'guard_stock_journal_reversal',
  'enforce_supplier_bill_line_match',
  'enforce_supplier_bill_three_way_posting',
  'post_stock_receipt',
  'reverse_stock_receipt',
  'cortex_mirror_inventory_record',
  'auth_can_read_budgets',
  'auth_can_manage_budgets',
  'guard_cost_code',
  'guard_project_budget',
  'guard_project_budget_line',
  'refresh_project_budget_total',
  'guard_po_line_budget_dimension',
  'guard_supplier_bill_cost_dimension',
  'guard_cost_entry_dimension',
  'submit_project_budget',
  'review_project_budget',
  'reject_project_budget',
  'create_project_budget_revision',
  'enforce_project_budget_commitment',
  'guard_stock_movement',
  'guard_stock_movement_line',
  'guard_inventory_movement_master',
  'post_stock_movement',
  'reverse_stock_movement',
]

const accountingRlsFunctions = new Set([
  'auth_can_manage_finance',
  'auth_can_read_cortex_node_type',
  'auth_can_read_cortex_subject',
  'auth_can_read_inventory',
  'auth_can_manage_inventory',
  'auth_can_read_budgets',
  'auth_can_manage_budgets',
])

const requiredAccountingTrustedOnlyFunctions =
  requiredAccountingSecurityDefinerFunctions.filter(
    (name) => !accountingRlsFunctions.has(name)
  )

let failures = 0

function pass(label) {
  console.log(`PASS ${label}`)
}

function fail(label, detail = '') {
  failures += 1
  console.error(`FAIL ${label}${detail ? `: ${detail}` : ''}`)
}

function assert(label, condition, detail = '') {
  if (condition) pass(label)
  else fail(label, detail)
}

const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('.sql'))
  .sort()

const invalidMigrationNames = migrationFiles.filter(
  (name) => !/^\d{14}_[a-z0-9_]+\.sql$/.test(name)
)
const migrationVersions = migrationFiles.map((name) => name.slice(0, 14))
const duplicateVersions = migrationVersions.filter(
  (version, index) => migrationVersions.indexOf(version) !== index
)

assert(
  'all migration filenames use <14-digit timestamp>_<snake_case>.sql',
  invalidMigrationNames.length === 0,
  invalidMigrationNames.join(', ')
)
assert(
  'migration timestamps are unique',
  duplicateVersions.length === 0,
  [...new Set(duplicateVersions)].join(', ')
)

for (const migration of requiredMigrations) {
  const migrationPath = join(migrationDirectory, migration)
  assert(
    `required migration ${migration}`,
    existsSync(migrationPath) && statSync(migrationPath).size > 0
  )
}

assert('supabase/seed.sql exists', existsSync(seedPath))
if (existsSync(seedPath)) {
  const seed = readFileSync(seedPath, 'utf8')
  assert('supabase/seed.sql is non-empty', seed.trim().length > 0)
  assert(
    'seed contains no environment interpolation',
    !/\benv\s*\(|\$\{|\{\{/.test(seed),
    'seed must remain deterministic and secret-free'
  )
}

if (failures > 0 || filesOnly) {
  if (filesOnly && failures === 0) {
    console.log(`PASS repository migration ledger (${migrationFiles.length} files)`)
  }
  process.exit(failures === 0 ? 0 : 1)
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  fail(
    'DATABASE_URL is required',
    'refusing to skip database catalog verification; use --files-only for static checks'
  )
  process.exit(1)
}

const requireFromDatabasePackage = createRequire(
  join(repoRoot, 'packages', 'database', 'package.json')
)
const postgres = requireFromDatabasePackage('postgres')
const sql = postgres(databaseUrl, {
  prepare: false,
  max: 1,
  connect_timeout: 10,
  idle_timeout: 5,
})

async function query(label, statement, predicate, describe) {
  try {
    const rows = await sql.unsafe(statement)
    const ok = predicate(rows)
    assert(label, ok, ok ? '' : describe(rows))
    return rows
  } catch (error) {
    fail(label, error instanceof Error ? error.message : String(error))
    return []
  }
}

try {
  await query(
    'database is PostgreSQL 17',
    'show server_version_num',
    (rows) => {
      const version = Number(rows[0]?.server_version_num)
      return version >= 170000 && version < 180000
    },
    (rows) => `server_version_num=${rows[0]?.server_version_num ?? 'missing'}`
  )

  await query(
    'database migration ledger exactly matches repository',
    `select version::text
       from supabase_migrations.schema_migrations
      order by version`,
    (rows) => {
      const applied = rows.map((row) => row.version)
      return JSON.stringify(applied) === JSON.stringify(migrationVersions)
    },
    (rows) => {
      const applied = rows.map((row) => row.version)
      const missing = migrationVersions.filter((version) => !applied.includes(version))
      const unexpected = applied.filter((version) => !migrationVersions.includes(version))
      return `missing=[${missing.join(',')}], unexpected=[${unexpected.join(',')}]`
    }
  )

  await query(
    'required protected tables exist and have RLS enabled',
    `select c.relname, c.relrowsecurity
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and c.relname in (${requiredTables.map((name) => `'${name}'`).join(', ')})`,
    (rows) => {
      const byName = new Map(rows.map((row) => [row.relname, row.relrowsecurity]))
      return requiredTables.every((name) => byName.get(name) === true)
    },
    (rows) => {
      const byName = new Map(rows.map((row) => [row.relname, row.relrowsecurity]))
      return requiredTables
        .filter((name) => byName.get(name) !== true)
        .map((name) => `${name}:${byName.has(name) ? 'RLS_OFF' : 'MISSING'}`)
        .join(', ')
    }
  )

  await query(
    'service-only operational tables are forced-RLS and service-role-only',
    `select c.relname,
            c.relrowsecurity,
            c.relforcerowsecurity,
            has_table_privilege(
              'anon',
              format('public.%I', c.relname),
              'select,insert,update,delete'
            ) as anon_privileges,
            has_table_privilege(
              'authenticated',
              format('public.%I', c.relname),
              'select,insert,update,delete'
            ) as authenticated_privileges,
            has_table_privilege(
              'service_role',
              format('public.%I', c.relname),
              'select,insert,update,delete'
            ) as service_role_privileges
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and c.relname in (${requiredServerOnlyTables.map((name) => `'${name}'`).join(', ')})`,
    (rows) =>
      rows.length === requiredServerOnlyTables.length
      && rows.every(
        (row) =>
          row.relrowsecurity === true
          && row.relforcerowsecurity === true
          && row.anon_privileges === false
          && row.authenticated_privileges === false
          && row.service_role_privileges === true
      ),
    (rows) =>
      rows.length === 0
        ? `missing=[${requiredServerOnlyTables.join(',')}]`
        : JSON.stringify(rows)
  )

  await query(
    'required final RLS policy set is authenticated and tenant-scoped',
    `select tablename,
            policyname,
            array_to_string(roles, ',') as roles,
            coalesce(qual, '') as using_expression,
            coalesce(with_check, '') as check_expression
       from pg_policies
      where schemaname = 'public'
        and tablename in (${requiredTables.map((name) => `'${name}'`).join(', ')})`,
    (rows) => {
      const expected = new Set(
        requiredPolicies.map(([table, policy]) => `${table}.${policy}`)
      )
      const actual = new Set(
        rows.map((row) => `${row.tablename}.${row.policyname}`)
      )
      const exactSet =
        expected.size === actual.size
        && [...expected].every((name) => actual.has(name))
      const secureExpressions = rows.every((row) => {
        const expression = `${row.using_expression} ${row.check_expression}`
        const ownershipPolicy =
          row.tablename === 'cortex_conversations'
          || row.tablename === 'cortex_messages'
        return row.roles === 'authenticated'
          && expression.includes('auth_tenant_id()')
          && (!ownershipPolicy || expression.includes('auth.uid()'))
      })
      return exactSet && secureExpressions
    },
    (rows) => {
      const expected = new Set(
        requiredPolicies.map(([table, policy]) => `${table}.${policy}`)
      )
      const actual = new Set(
        rows.map((row) => `${row.tablename}.${row.policyname}`)
      )
      const missing = [...expected].filter((name) => !actual.has(name))
      const unexpected = [...actual].filter((name) => !expected.has(name))
      const weak = rows
        .filter((row) => {
          const expression = `${row.using_expression} ${row.check_expression}`
          const ownershipPolicy =
            row.tablename === 'cortex_conversations'
            || row.tablename === 'cortex_messages'
          return row.roles !== 'authenticated'
            || !expression.includes('auth_tenant_id()')
            || (ownershipPolicy && !expression.includes('auth.uid()'))
        })
        .map((row) => `${row.tablename}.${row.policyname}`)
      return `missing=[${missing.join(',')}], unexpected=[${unexpected.join(',')}], weak=[${weak.join(',')}]`
    }
  )

  await query(
    'notification outbox and delivery authority is server-only',
    `select
       has_table_privilege(
         'authenticated',
         'public.notification_outbox',
         'select,insert,update,delete'
       ) as authenticated_outbox,
       has_table_privilege(
         'authenticated',
         'public.notification_deliveries',
         'select,insert,update,delete'
       ) as authenticated_deliveries,
       has_table_privilege(
         'authenticated',
         'public.notifications',
         'insert,update,delete'
       ) as authenticated_notification_write,
       has_table_privilege(
         'authenticated',
         'public.notifications',
         'select'
       ) as authenticated_notification_read`,
    (rows) =>
      rows.length === 1
      && rows[0].authenticated_outbox === false
      && rows[0].authenticated_deliveries === false
      && rows[0].authenticated_notification_write === false
      && rows[0].authenticated_notification_read === true,
    (rows) => JSON.stringify(rows[0] ?? {})
  )

  await query(
    'Cortex conversations have durable paired record context',
    `select issue
       from (
         select 'missing context_ref_table' as issue
          where not exists (
            select 1
              from information_schema.columns
             where table_schema = 'public'
               and table_name = 'cortex_conversations'
               and column_name = 'context_ref_table'
               and data_type = 'character varying'
          )
         union all
         select 'missing context_ref_id'
          where not exists (
            select 1
              from information_schema.columns
             where table_schema = 'public'
               and table_name = 'cortex_conversations'
               and column_name = 'context_ref_id'
               and data_type = 'uuid'
          )
         union all
         select 'missing context pair check'
          where not exists (
            select 1
              from pg_constraint
             where conrelid = 'public.cortex_conversations'::regclass
               and conname = 'cortex_conversations_context_pair_check'
               and contype = 'c'
               and convalidated
          )
       ) as problems`,
    (rows) => rows.length === 0,
    (rows) => rows.map((row) => row.issue).join(', ')
  )

  await query(
    'required database indexes exist and are valid',
    `select c.relname, i.indisvalid
       from pg_class c
       join pg_index i on i.indexrelid = c.oid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (${requiredIndexes.map((name) => `'${name}'`).join(', ')})`,
    (rows) => {
      const byName = new Map(rows.map((row) => [row.relname, row.indisvalid]))
      return requiredIndexes.every((name) => byName.get(name) === true)
    },
    (rows) => {
      const byName = new Map(rows.map((row) => [row.relname, row.indisvalid]))
      return requiredIndexes
        .filter((name) => byName.get(name) !== true)
        .map((name) => `${name}:${byName.has(name) ? 'INVALID' : 'MISSING'}`)
        .join(', ')
    }
  )

  await query(
    'Stock Movement idempotency indexes exist and are valid',
    `select c.relname, i.indisvalid
       from pg_class c
       join pg_index i on i.indexrelid = c.oid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (${requiredServerOnlyIndexes.map((name) => `'${name}'`).join(', ')})`,
    (rows) => {
      const byName = new Map(rows.map((row) => [row.relname, row.indisvalid]))
      return requiredServerOnlyIndexes.every((name) => byName.get(name) === true)
    },
    (rows) => {
      const byName = new Map(rows.map((row) => [row.relname, row.indisvalid]))
      return requiredServerOnlyIndexes
        .filter((name) => byName.get(name) !== true)
        .map((name) => `${name}:${byName.has(name) ? 'INVALID' : 'MISSING'}`)
        .join(', ')
    }
  )

  await query(
    'expanded Cortex node taxonomy exists',
    `select e.enumlabel
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = 'cortex_node_type'`,
    (rows) => {
      const labels = new Set(rows.map((row) => row.enumlabel))
      return requiredExpandedNodeTypes.every((label) => labels.has(label))
    },
    (rows) => {
      const labels = new Set(rows.map((row) => row.enumlabel))
      return requiredExpandedNodeTypes
        .filter((label) => !labels.has(label))
        .join(', ')
    }
  )

  await query(
    'purchase order status catalog matches the application contract',
    `select e.enumlabel
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = 'purchase_order_status'
      order by e.enumsortorder`,
    (rows) =>
      rows.length === requiredPurchaseOrderStatuses.length
      && rows.every(
        (row, index) => row.enumlabel === requiredPurchaseOrderStatuses[index]
      ),
    (rows) => {
      const actual = rows.map((row) => row.enumlabel)
      return `expected=[${requiredPurchaseOrderStatuses.join(',')}], actual=[${actual.join(',')}]`
    }
  )

  await query(
    'tenant organization type contract is constrained and validated',
    `select
       column_info.is_nullable,
       column_info.column_default,
       constraint_info.convalidated,
       pg_get_constraintdef(constraint_info.oid, true) as definition
     from information_schema.columns column_info
     join pg_constraint constraint_info
       on constraint_info.conrelid = 'public.tenants'::regclass
      and constraint_info.conname = 'tenants_organization_type_check'
    where column_info.table_schema = 'public'
      and column_info.table_name = 'tenants'
      and column_info.column_name = 'organization_type'`,
    (rows) => {
      const row = rows[0]
      return rows.length === 1
        && row.is_nullable === 'NO'
        && /'other'/.test(row.column_default ?? '')
        && row.convalidated === true
        && requiredOrganizationTypes.every((value) =>
          row.definition.includes(`'${value}'`)
        )
    },
    (rows) => JSON.stringify(rows)
  )

  await query(
    'cost domain constraints exist and are validated',
    `select conname, convalidated
       from pg_constraint
      where conrelid = 'public.cost_entries'::regclass
        and conname in (
          'cost_entries_amount_nonnegative',
          'cost_entries_quantity_positive',
          'cost_entries_bom_line_tenant_fk',
          'cost_entries_po_line_tenant_fk'
        )`,
    (rows) => {
      const constraints = new Map(
        rows.map((row) => [row.conname, row.convalidated])
      )
      return constraints.get('cost_entries_amount_nonnegative') === true
        && constraints.get('cost_entries_quantity_positive') === true
        && constraints.get('cost_entries_bom_line_tenant_fk') === true
        && constraints.get('cost_entries_po_line_tenant_fk') === true
    },
    (rows) =>
      rows
        .map((row) => `${row.conname}:${row.convalidated ? 'VALID' : 'NOT_VALID'}`)
        .join(', ')
  )

  const requiredAccountingConstraints = [
    'fiscal_periods_date_order',
    'fiscal_periods_closed_state',
    'ledger_accounts_normal_balance_matches_type',
    'journal_entries_posted_state',
    'journal_entries_reversal_source',
    'journal_entries_reverses_tenant_fk',
    'journal_lines_one_sided_positive_amount',
    'journal_lines_entry_tenant_fk',
    'journal_lines_account_tenant_fk',
    'journal_lines_project_tenant_fk',
    'journal_lines_business_account_tenant_fk',
    'journal_lines_vendor_tenant_fk',
    'invoices_project_tenant_fk',
    'invoices_account_tenant_fk',
    'invoices_issued_by_tenant_fk',
    'invoices_issuance_journal_tenant_fk',
    'invoices_reversed_by_tenant_fk',
    'invoices_reversal_journal_tenant_fk',
    'invoices_amounts_consistent',
    'invoices_issuance_state',
    'invoices_reversal_state',
    'supplier_bills_number_nonempty',
    'supplier_bills_due_date_valid',
    'supplier_bills_amounts_consistent',
    'supplier_bills_posting_state',
    'supplier_bills_po_tenant_fk',
    'supplier_bills_project_tenant_fk',
    'supplier_bills_vendor_tenant_fk',
    'supplier_bills_posting_journal_tenant_fk',
    'supplier_bills_reversal_journal_tenant_fk',
    'supplier_bills_created_by_tenant_fk',
    'supplier_bills_posted_by_tenant_fk',
    'supplier_bills_reversed_by_tenant_fk',
    'supplier_bill_lines_description_nonempty',
    'supplier_bill_lines_number_positive',
    'supplier_bill_lines_amount_positive',
    'supplier_bill_lines_bill_tenant_fk',
    'supplier_bill_lines_account_tenant_fk',
    'supplier_bill_lines_project_tenant_fk',
    'cash_accounts_name_nonempty',
    'cash_accounts_currency_format',
    'cash_accounts_identifier_format',
    'cash_accounts_ledger_tenant_fk',
    'cash_accounts_created_by_tenant_fk',
    'cash_transactions_reference_nonempty',
    'cash_transactions_currency_format',
    'cash_transactions_amount_positive',
    'cash_transactions_counterparty',
    'cash_transactions_posting_state',
    'cash_transactions_cash_account_tenant_fk',
    'cash_transactions_business_account_tenant_fk',
    'cash_transactions_vendor_tenant_fk',
    'cash_transactions_posting_journal_tenant_fk',
    'cash_transactions_reversal_journal_tenant_fk',
    'cash_transactions_created_by_tenant_fk',
    'cash_transactions_posted_by_tenant_fk',
    'cash_transactions_reversed_by_tenant_fk',
    'cash_allocations_line_positive',
    'cash_allocations_amount_positive',
    'cash_allocations_target',
    'cash_allocations_transaction_tenant_fk',
    'cash_allocations_invoice_tenant_fk',
    'cash_allocations_supplier_bill_tenant_fk',
    'bank_statements_reference_nonempty',
    'bank_statements_source_file_nonempty',
    'bank_statements_source_sha256_format',
    'bank_statements_date_order',
    'bank_statements_currency_format',
    'bank_statements_state',
    'bank_statements_cash_account_tenant_fk',
    'bank_statements_created_by_tenant_fk',
    'bank_statements_reconciled_by_tenant_fk',
    'bank_statements_voided_by_tenant_fk',
    'bank_statement_lines_number_positive',
    'bank_statement_lines_description_nonempty',
    'bank_statement_lines_reference_trimmed',
    'bank_statement_lines_amount_nonzero',
    'bank_statement_lines_match_state',
    'bank_statement_lines_statement_tenant_fk',
    'bank_statement_lines_cash_transaction_tenant_fk',
    'bank_statement_lines_matched_by_tenant_fk',
    'units_of_measure_code_nonempty',
    'units_of_measure_decimal_places_range',
    'units_of_measure_created_by_tenant_fk',
    'material_items_base_uom_tenant_fk',
    'po_line_items_quantity_micros_nonnegative',
    'po_line_items_received_micros_range',
    'warehouses_project_tenant_fk',
    'warehouses_created_by_tenant_fk',
    'stock_receipts_state',
    'stock_receipts_warehouse_tenant_fk',
    'stock_receipts_purchase_order_tenant_fk',
    'stock_receipts_delivery_tenant_fk',
    'stock_receipts_posting_journal_tenant_fk',
    'stock_receipts_reversal_journal_tenant_fk',
    'stock_receipt_lines_total_exact',
    'stock_receipt_lines_receipt_tenant_fk',
    'stock_receipt_lines_po_line_tenant_fk',
    'stock_receipt_lines_material_tenant_fk',
    'stock_receipt_lines_uom_tenant_fk',
    'supplier_bill_lines_po_line_tenant_fk',
    'supplier_bill_lines_receipt_line_tenant_fk',
    'supplier_bill_lines_receipt_match_complete',
    'stock_ledger_entries_signed_values',
    'stock_ledger_entries_receipt_tenant_fk',
    'stock_ledger_entries_receipt_line_tenant_fk',
    'stock_ledger_entries_warehouse_tenant_fk',
    'stock_ledger_entries_material_tenant_fk',
    'stock_ledger_entries_uom_tenant_fk',
  ]

  await query(
    'accounting constraints exist and are validated',
    `select conname, convalidated
       from pg_constraint
      where connamespace = 'public'::regnamespace
        and conname in (${requiredAccountingConstraints
          .map((name) => `'${name}'`)
          .join(', ')})`,
    (rows) => {
      const constraints = new Map(
        rows.map((row) => [row.conname, row.convalidated])
      )
      return requiredAccountingConstraints.every(
        (name) => constraints.get(name) === true
      )
    },
    (rows) => {
      const constraints = new Map(
        rows.map((row) => [row.conname, row.convalidated])
      )
      return requiredAccountingConstraints
        .filter((name) => constraints.get(name) !== true)
        .map((name) => `${name}:${constraints.has(name) ? 'NOT_VALID' : 'MISSING'}`)
        .join(', ')
    }
  )

  await query(
    'required database triggers are enabled',
    `select n.nspname || '.' || c.relname as relation, t.tgname, t.tgenabled
       from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal`,
    (rows) => {
      const found = new Map(
        rows.map((row) => [`${row.relation}.${row.tgname}`, row.tgenabled])
      )
      return requiredTriggers.every(
        ([relation, trigger]) => found.get(`${relation}.${trigger}`) !== undefined
          && found.get(`${relation}.${trigger}`) !== 'D'
      )
    },
    (rows) => {
      const found = new Map(
        rows.map((row) => [`${row.relation}.${row.tgname}`, row.tgenabled])
      )
      return requiredTriggers
        .map(([relation, trigger]) => `${relation}.${trigger}`)
        .filter((name) => !found.has(name) || found.get(name) === 'D')
        .join(', ')
    }
  )

  await query(
    'required June functions are SECURITY DEFINER with fixed search_path',
    `select p.proname,
            p.prosecdef,
            coalesce(array_to_string(p.proconfig, ','), '') as config
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (${requiredSecurityDefinerFunctions
          .map((name) => `'${name}'`)
          .join(', ')})`,
    (rows) => {
      const byName = new Map(rows.map((row) => [row.proname, row]))
      return requiredSecurityDefinerFunctions.every((name) => {
        const fn = byName.get(name)
        const hasExpectedSearchPath =
          name === 'handle_new_user'
            ? fn?.config === 'search_path=""' ||
              fn?.config === 'search_path='
            : /(?:^|,)search_path=public(?:,|$)/.test(
                fn?.config ?? ''
              )
        return fn?.prosecdef === true && hasExpectedSearchPath
      })
    },
    (rows) => {
      const byName = new Map(rows.map((row) => [row.proname, row]))
      return requiredSecurityDefinerFunctions
        .filter((name) => {
          const fn = byName.get(name)
          const hasExpectedSearchPath =
            name === 'handle_new_user'
              ? fn?.config === 'search_path=""' ||
                fn?.config === 'search_path='
              : /(?:^|,)search_path=public(?:,|$)/.test(
                  fn?.config ?? ''
                )
          return !fn || fn.prosecdef !== true || !hasExpectedSearchPath
        })
        .join(', ')
    }
  )

  await query(
    'client roles can execute the tenant identity helper used by RLS',
    `select
       has_function_privilege(
         'authenticated',
         'public.auth_tenant_id()',
         'EXECUTE'
       ) as authenticated_execute,
       has_function_privilege(
         'anon',
         'public.auth_tenant_id()',
         'EXECUTE'
       ) as anon_execute`,
    (rows) =>
      rows[0]?.authenticated_execute === true
      && rows[0]?.anon_execute === true,
    (rows) => JSON.stringify(rows[0] ?? {})
  )

  await query(
    'accounting functions are SECURITY DEFINER with an empty search_path',
    `select p.proname,
            p.prosecdef,
            coalesce(array_to_string(p.proconfig, ','), '') as config
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (${requiredAccountingSecurityDefinerFunctions
          .map((name) => `'${name}'`)
          .join(', ')})`,
    (rows) => {
      const byName = new Map(rows.map((row) => [row.proname, row]))
      return requiredAccountingSecurityDefinerFunctions.every((name) => {
        const fn = byName.get(name)
        return fn?.prosecdef === true
          && (fn.config === 'search_path=""' || fn.config === 'search_path=')
      })
    },
    (rows) => {
      const byName = new Map(rows.map((row) => [row.proname, row]))
      return requiredAccountingSecurityDefinerFunctions
        .filter((name) => {
          const fn = byName.get(name)
          return !fn
            || fn.prosecdef !== true
            || (fn.config !== 'search_path=""' && fn.config !== 'search_path=')
        })
        .join(', ')
    }
  )

  await query(
    'audit and optional platform maintenance helpers are not browser-callable',
    `select p.proname,
            coalesce(array_to_string(p.proconfig, ','), '') as config,
            exists (
              select 1
                from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
               where a.grantee = 0
                 and a.privilege_type = 'EXECUTE'
            ) as public_execute,
            has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
            has_function_privilege('service_role', p.oid, 'EXECUTE') as service_execute
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in ('jsonb_diff', 'rls_auto_enable')
      order by p.proname`,
    (rows) => {
      const byName = new Map(rows.map((row) => [row.proname, row]))
      const jsonbDiff = byName.get('jsonb_diff')
      const rlsAutoEnable = byName.get('rls_auto_enable')
      const rlsAutoEnableIsLocked =
        rlsAutoEnable === undefined
        || (
          rlsAutoEnable.public_execute === false
          && rlsAutoEnable.anon_execute === false
          && rlsAutoEnable.authenticated_execute === false
          && rlsAutoEnable.service_execute === false
        )
      return (jsonbDiff?.config === 'search_path=""'
          || jsonbDiff?.config === 'search_path=')
        && jsonbDiff?.public_execute === false
        && jsonbDiff?.anon_execute === false
        && jsonbDiff?.authenticated_execute === false
        && jsonbDiff?.service_execute === true
        && rlsAutoEnableIsLocked
    },
    (rows) => JSON.stringify(rows)
  )

  await query(
    'authenticated can execute scoped RLS helpers',
    `select
       has_function_privilege(
         'authenticated',
         'public.auth_can_manage_finance()',
         'EXECUTE'
       ) as finance_authenticated,
       has_function_privilege(
         'anon',
         'public.auth_can_manage_finance()',
         'EXECUTE'
       ) as finance_anon,
       has_function_privilege(
         'authenticated',
         'public.auth_can_read_cortex_node_type(public.cortex_node_type)',
         'EXECUTE'
       ) as node_authenticated,
       has_function_privilege(
         'anon',
         'public.auth_can_read_cortex_node_type(public.cortex_node_type)',
         'EXECUTE'
       ) as node_anon,
       has_function_privilege(
         'authenticated',
         'public.auth_can_read_cortex_subject(public.cortex_subject_kind,uuid)',
         'EXECUTE'
       ) as subject_authenticated,
       has_function_privilege(
         'anon',
         'public.auth_can_read_cortex_subject(public.cortex_subject_kind,uuid)',
         'EXECUTE'
       ) as subject_anon,
       has_function_privilege(
         'authenticated',
         'public.auth_can_read_inventory()',
         'EXECUTE'
       ) as inventory_read_authenticated,
       has_function_privilege(
         'anon',
         'public.auth_can_read_inventory()',
         'EXECUTE'
       ) as inventory_read_anon,
       has_function_privilege(
         'authenticated',
         'public.auth_can_manage_inventory()',
         'EXECUTE'
       ) as inventory_manage_authenticated,
        has_function_privilege(
          'anon',
          'public.auth_can_manage_inventory()',
          'EXECUTE'
        ) as inventory_manage_anon,
       has_function_privilege(
          'authenticated',
          'public.auth_can_read_budgets()',
          'EXECUTE'
        ) as budget_read_authenticated,
       has_function_privilege(
          'anon',
          'public.auth_can_read_budgets()',
          'EXECUTE'
        ) as budget_read_anon,
       has_function_privilege(
          'authenticated',
          'public.auth_can_manage_budgets()',
          'EXECUTE'
        ) as budget_manage_authenticated,
       has_function_privilege(
          'anon',
          'public.auth_can_manage_budgets()',
          'EXECUTE'
        ) as budget_manage_anon`,
    (rows) =>
      rows[0]?.finance_authenticated === true
      && rows[0]?.finance_anon === false
      && rows[0]?.node_authenticated === true
      && rows[0]?.node_anon === false
      && rows[0]?.subject_authenticated === true
      && rows[0]?.subject_anon === false
      && rows[0]?.inventory_read_authenticated === true
      && rows[0]?.inventory_read_anon === false
      && rows[0]?.inventory_manage_authenticated === true
      && rows[0]?.inventory_manage_anon === false
      && rows[0]?.budget_read_authenticated === true
      && rows[0]?.budget_read_anon === false
      && rows[0]?.budget_manage_authenticated === true
      && rows[0]?.budget_manage_anon === false,
    (rows) => JSON.stringify(rows[0] ?? {})
  )

  await query(
    'privileged June functions are closed to PUBLIC, anon, and authenticated',
    `select p.proname,
            coalesce(r.rolname, 'PUBLIC') as grantee,
            a.privilege_type
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       left join pg_roles r on r.oid = a.grantee
      where n.nspname = 'public'
        and p.proname in (${requiredTrustedOnlyFunctions
          .map((name) => `'${name}'`)
          .join(', ')})
        and a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or r.rolname in ('anon', 'authenticated'))`,
    (rows) => rows.length === 0,
    (rows) => rows.map((row) => `${row.proname}:${row.grantee}`).join(', ')
  )

  await query(
    'privileged accounting functions are closed to PUBLIC, anon, and authenticated',
    `select p.proname,
            coalesce(r.rolname, 'PUBLIC') as grantee,
            a.privilege_type
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       left join pg_roles r on r.oid = a.grantee
      where n.nspname = 'public'
        and p.proname in (${requiredAccountingTrustedOnlyFunctions
          .map((name) => `'${name}'`)
          .join(', ')})
        and a.privilege_type = 'EXECUTE'
        and (a.grantee = 0 or r.rolname in ('anon', 'authenticated'))`,
    (rows) => rows.length === 0,
    (rows) => rows.map((row) => `${row.proname}:${row.grantee}`).join(', ')
  )

  await query(
    'service_role can execute required privileged June functions',
    `select p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (${requiredSecurityDefinerFunctions
          .map((name) => `'${name}'`)
          .join(', ')})
        and not has_function_privilege('service_role', p.oid, 'EXECUTE')`,
    (rows) => rows.length === 0,
    (rows) => rows.map((row) => row.proname).join(', ')
  )

  await query(
    'service_role can execute required accounting functions',
    `select p.proname
       from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (${requiredAccountingSecurityDefinerFunctions
          .map((name) => `'${name}'`)
          .join(', ')})
        and not has_function_privilege('service_role', p.oid, 'EXECUTE')`,
    (rows) => rows.length === 0,
    (rows) => rows.map((row) => row.proname).join(', ')
  )

  await query(
    'service_role retains required June table privileges',
    `select table_name, privilege
       from unnest(array[${requiredTables.map((name) => `'${name}'`).join(', ')}]) as table_name
       cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege
      where not has_table_privilege(
        'service_role',
        'public.' || quote_ident(table_name),
        privilege
      )`,
    (rows) => rows.length === 0,
    (rows) => rows.map((row) => `${row.table_name}:${row.privilege}`).join(', ')
  )

  await query(
    'service_role retains append-only sequence privileges',
    `select sequence_name, privilege
       from unnest(array[
         'cortex_provenance_id_seq',
         'audit_log_id_seq'
       ]) as sequence_name
       cross join unnest(array['USAGE', 'SELECT', 'UPDATE']) as privilege
      where not has_sequence_privilege(
        'service_role',
        'public.' || quote_ident(sequence_name),
        privilege
      )`,
    (rows) => rows.length === 0,
    (rows) =>
      rows.map((row) => `${row.sequence_name}:${row.privilege}`).join(', ')
  )

  await query(
    'client roles have no maintenance privileges on June tables',
    `select role_name, table_name, privilege
       from unnest(array['anon', 'authenticated']) as role_name
       cross join unnest(array[${requiredTables.map((name) => `'${name}'`).join(', ')}]) as table_name
       cross join unnest(array['TRUNCATE', 'TRIGGER', 'REFERENCES']) as privilege
      where has_table_privilege(role_name, 'public.' || quote_ident(table_name), privilege)`,
    (rows) => rows.length === 0,
    (rows) => rows.map((row) => `${row.role_name}:${row.table_name}:${row.privilege}`).join(', ')
  )

  await query(
    'anon has no direct privileges on June tables',
    `select table_name, privilege
       from unnest(array[${requiredTables.map((name) => `'${name}'`).join(', ')}]) as table_name
       cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege
      where has_table_privilege('anon', 'public.' || quote_ident(table_name), privilege)`,
    (rows) => rows.length === 0,
    (rows) => rows.map((row) => `${row.table_name}:${row.privilege}`).join(', ')
  )

  await query(
    'authenticated cannot directly mutate trigger-owned graph tables',
    `select table_name, privilege
       from unnest(array['cortex_nodes', 'cortex_edges', 'cortex_provenance']) as table_name
       cross join unnest(array['INSERT', 'UPDATE', 'DELETE']) as privilege
      where has_table_privilege(
        'authenticated',
        'public.' || quote_ident(table_name),
        privilege
      )`,
    (rows) => rows.length === 0,
    (rows) => rows.map((row) => `${row.table_name}:${row.privilege}`).join(', ')
  )

  await query(
    'authenticated cannot forge audit rows',
    `select privilege
       from unnest(array['INSERT', 'UPDATE', 'DELETE']) as privilege
      where has_table_privilege(
        'authenticated',
        'public.audit_log',
        privilege
      )`,
    (rows) => rows.length === 0,
    (rows) => rows.map((row) => row.privilege).join(', ')
  )

  const authenticatedReadableTables = requiredTables.filter(
    (table) =>
      table !== 'financial_sequences' &&
      table !== 'notification_outbox' &&
      table !== 'notification_deliveries'
  )

  const minimumAuthenticatedTableGrants = [
    ...authenticatedReadableTables.map((table) => [table, 'SELECT']),
    ['cost_entries', 'DELETE'],
    ['fiscal_periods', 'DELETE'],
    ['ledger_accounts', 'DELETE'],
    ['journal_entries', 'DELETE'],
    ['journal_lines', 'DELETE'],
    ['supplier_bills', 'DELETE'],
    ['supplier_bill_lines', 'DELETE'],
    ['cash_accounts', 'DELETE'],
    ['cash_transactions', 'DELETE'],
    ['cash_allocations', 'DELETE'],
    ['bank_statements', 'DELETE'],
    ['bank_statement_lines', 'DELETE'],
    ['units_of_measure', 'DELETE'],
    ['warehouses', 'DELETE'],
    ['stock_receipts', 'DELETE'],
    ['stock_receipt_lines', 'DELETE'],
    ['cost_codes', 'DELETE'],
    ['project_budgets', 'DELETE'],
    ['project_budget_lines', 'DELETE'],
  ]

  await query(
    'authenticated role has minimum RLS-scoped table grants',
    `select table_name, privilege
       from (values ${minimumAuthenticatedTableGrants
         .map(([table, privilege]) => `('${table}', '${privilege}')`)
         .join(', ')}) as required(table_name, privilege)
      where not has_table_privilege(
        'authenticated',
        'public.' || quote_ident(table_name),
        privilege
      )`,
    (rows) => rows.length === 0,
    (rows) => rows.map((row) => `${row.table_name}:${row.privilege}`).join(', ')
  )

  const minimumAuthenticatedColumnGrants = [
    ['cost_entries', 'tenant_id', 'INSERT'],
    ['cost_entries', 'project_id', 'INSERT'],
    ['cost_entries', 'cost_code_id', 'INSERT'],
    ['cost_entries', 'created_by', 'INSERT'],
    ['cost_entries', 'cost_category', 'INSERT'],
    ['cost_entries', 'description', 'INSERT'],
    ['cost_entries', 'amount_cents', 'INSERT'],
    ['cost_entries', 'quantity', 'INSERT'],
    ['cost_entries', 'cost_category', 'UPDATE'],
    ['cost_entries', 'description', 'UPDATE'],
    ['cost_entries', 'amount_cents', 'UPDATE'],
    ['cost_entries', 'cost_code_id', 'UPDATE'],
    ['cost_entries', 'quantity', 'UPDATE'],
    ['fiscal_periods', 'tenant_id', 'INSERT'],
    ['fiscal_periods', 'name', 'INSERT'],
    ['fiscal_periods', 'starts_on', 'INSERT'],
    ['fiscal_periods', 'ends_on', 'INSERT'],
    ['fiscal_periods', 'created_by', 'INSERT'],
    ['fiscal_periods', 'name', 'UPDATE'],
    ['ledger_accounts', 'tenant_id', 'INSERT'],
    ['ledger_accounts', 'code', 'INSERT'],
    ['ledger_accounts', 'name', 'INSERT'],
    ['ledger_accounts', 'account_type', 'INSERT'],
    ['ledger_accounts', 'normal_balance', 'INSERT'],
    ['ledger_accounts', 'created_by', 'INSERT'],
    ['ledger_accounts', 'name', 'UPDATE'],
    ['ledger_accounts', 'is_active', 'UPDATE'],
    ['journal_entries', 'tenant_id', 'INSERT'],
    ['journal_entries', 'posting_date', 'INSERT'],
    ['journal_entries', 'description', 'INSERT'],
    ['journal_entries', 'created_by', 'INSERT'],
    ['journal_entries', 'posting_date', 'UPDATE'],
    ['journal_entries', 'description', 'UPDATE'],
    ['journal_lines', 'tenant_id', 'INSERT'],
    ['journal_lines', 'journal_entry_id', 'INSERT'],
    ['journal_lines', 'ledger_account_id', 'INSERT'],
    ['journal_lines', 'line_number', 'INSERT'],
    ['journal_lines', 'debit_cents', 'INSERT'],
    ['journal_lines', 'credit_cents', 'INSERT'],
    ['journal_lines', 'business_account_id', 'INSERT'],
    ['journal_lines', 'vendor_id', 'INSERT'],
    ['journal_lines', 'ledger_account_id', 'UPDATE'],
    ['journal_lines', 'debit_cents', 'UPDATE'],
    ['journal_lines', 'credit_cents', 'UPDATE'],
    ['journal_lines', 'business_account_id', 'UPDATE'],
    ['journal_lines', 'vendor_id', 'UPDATE'],
    ['invoices', 'tenant_id', 'INSERT'],
    ['invoices', 'project_id', 'INSERT'],
    ['invoices', 'account_id', 'INSERT'],
    ['invoices', 'created_by', 'INSERT'],
    ['invoices', 'invoice_number', 'INSERT'],
    ['invoices', 'status', 'INSERT'],
    ['invoices', 'subtotal_cents', 'INSERT'],
    ['invoices', 'net_amount_cents', 'INSERT'],
    ['invoices', 'project_id', 'UPDATE'],
    ['invoices', 'account_id', 'UPDATE'],
    ['invoices', 'subtotal_cents', 'UPDATE'],
    ['invoices', 'net_amount_cents', 'UPDATE'],
    ['supplier_bills', 'tenant_id', 'INSERT'],
    ['supplier_bills', 'purchase_order_id', 'INSERT'],
    ['supplier_bills', 'project_id', 'INSERT'],
    ['supplier_bills', 'vendor_id', 'INSERT'],
    ['supplier_bills', 'vendor_bill_number', 'INSERT'],
    ['supplier_bills', 'status', 'INSERT'],
    ['supplier_bills', 'bill_date', 'INSERT'],
    ['supplier_bills', 'subtotal_cents', 'INSERT'],
    ['supplier_bills', 'total_payable_cents', 'INSERT'],
    ['supplier_bills', 'created_by', 'INSERT'],
    ['supplier_bills', 'purchase_order_id', 'UPDATE'],
    ['supplier_bills', 'project_id', 'UPDATE'],
    ['supplier_bills', 'vendor_id', 'UPDATE'],
    ['supplier_bills', 'vendor_bill_number', 'UPDATE'],
    ['supplier_bills', 'bill_date', 'UPDATE'],
    ['supplier_bills', 'subtotal_cents', 'UPDATE'],
    ['supplier_bills', 'total_payable_cents', 'UPDATE'],
    ['supplier_bill_lines', 'tenant_id', 'INSERT'],
    ['supplier_bill_lines', 'supplier_bill_id', 'INSERT'],
    ['supplier_bill_lines', 'ledger_account_id', 'INSERT'],
    ['supplier_bill_lines', 'project_id', 'INSERT'],
    ['supplier_bill_lines', 'line_number', 'INSERT'],
    ['supplier_bill_lines', 'description', 'INSERT'],
    ['supplier_bill_lines', 'amount_cents', 'INSERT'],
    ['supplier_bill_lines', 'po_line_item_id', 'INSERT'],
    ['supplier_bill_lines', 'stock_receipt_line_id', 'INSERT'],
    ['supplier_bill_lines', 'quantity_micros', 'INSERT'],
    ['supplier_bill_lines', 'cost_code_id', 'INSERT'],
    ['supplier_bill_lines', 'ledger_account_id', 'UPDATE'],
    ['supplier_bill_lines', 'project_id', 'UPDATE'],
    ['supplier_bill_lines', 'line_number', 'UPDATE'],
    ['supplier_bill_lines', 'description', 'UPDATE'],
    ['supplier_bill_lines', 'amount_cents', 'UPDATE'],
    ['supplier_bill_lines', 'po_line_item_id', 'UPDATE'],
    ['supplier_bill_lines', 'stock_receipt_line_id', 'UPDATE'],
    ['supplier_bill_lines', 'quantity_micros', 'UPDATE'],
    ['supplier_bill_lines', 'cost_code_id', 'UPDATE'],
    ['cash_accounts', 'tenant_id', 'INSERT'],
    ['cash_accounts', 'ledger_account_id', 'INSERT'],
    ['cash_accounts', 'name', 'INSERT'],
    ['cash_accounts', 'account_kind', 'INSERT'],
    ['cash_accounts', 'currency', 'INSERT'],
    ['cash_accounts', 'is_active', 'INSERT'],
    ['cash_accounts', 'created_by', 'INSERT'],
    ['cash_accounts', 'ledger_account_id', 'UPDATE'],
    ['cash_accounts', 'name', 'UPDATE'],
    ['cash_accounts', 'account_kind', 'UPDATE'],
    ['cash_accounts', 'currency', 'UPDATE'],
    ['cash_accounts', 'is_active', 'UPDATE'],
    ['cash_transactions', 'tenant_id', 'INSERT'],
    ['cash_transactions', 'cash_account_id', 'INSERT'],
    ['cash_transactions', 'direction', 'INSERT'],
    ['cash_transactions', 'business_account_id', 'INSERT'],
    ['cash_transactions', 'vendor_id', 'INSERT'],
    ['cash_transactions', 'reference_number', 'INSERT'],
    ['cash_transactions', 'status', 'INSERT'],
    ['cash_transactions', 'transaction_date', 'INSERT'],
    ['cash_transactions', 'currency', 'INSERT'],
    ['cash_transactions', 'amount_cents', 'INSERT'],
    ['cash_transactions', 'created_by', 'INSERT'],
    ['cash_transactions', 'cash_account_id', 'UPDATE'],
    ['cash_transactions', 'direction', 'UPDATE'],
    ['cash_transactions', 'business_account_id', 'UPDATE'],
    ['cash_transactions', 'vendor_id', 'UPDATE'],
    ['cash_transactions', 'reference_number', 'UPDATE'],
    ['cash_transactions', 'transaction_date', 'UPDATE'],
    ['cash_transactions', 'currency', 'UPDATE'],
    ['cash_transactions', 'amount_cents', 'UPDATE'],
    ['cash_allocations', 'tenant_id', 'INSERT'],
    ['cash_allocations', 'cash_transaction_id', 'INSERT'],
    ['cash_allocations', 'allocation_type', 'INSERT'],
    ['cash_allocations', 'invoice_id', 'INSERT'],
    ['cash_allocations', 'supplier_bill_id', 'INSERT'],
    ['cash_allocations', 'line_number', 'INSERT'],
    ['cash_allocations', 'amount_cents', 'INSERT'],
    ['cash_allocations', 'allocation_type', 'UPDATE'],
    ['cash_allocations', 'invoice_id', 'UPDATE'],
    ['cash_allocations', 'supplier_bill_id', 'UPDATE'],
    ['cash_allocations', 'line_number', 'UPDATE'],
    ['cash_allocations', 'amount_cents', 'UPDATE'],
    ['bank_statements', 'tenant_id', 'INSERT'],
    ['bank_statements', 'cash_account_id', 'INSERT'],
    ['bank_statements', 'reference_number', 'INSERT'],
    ['bank_statements', 'source_file_name', 'INSERT'],
    ['bank_statements', 'source_sha256', 'INSERT'],
    ['bank_statements', 'status', 'INSERT'],
    ['bank_statements', 'statement_start', 'INSERT'],
    ['bank_statements', 'statement_end', 'INSERT'],
    ['bank_statements', 'currency', 'INSERT'],
    ['bank_statements', 'opening_balance_cents', 'INSERT'],
    ['bank_statements', 'closing_balance_cents', 'INSERT'],
    ['bank_statements', 'created_by', 'INSERT'],
    ['bank_statements', 'cash_account_id', 'UPDATE'],
    ['bank_statements', 'reference_number', 'UPDATE'],
    ['bank_statements', 'source_file_name', 'UPDATE'],
    ['bank_statements', 'source_sha256', 'UPDATE'],
    ['bank_statements', 'statement_start', 'UPDATE'],
    ['bank_statements', 'statement_end', 'UPDATE'],
    ['bank_statements', 'currency', 'UPDATE'],
    ['bank_statements', 'opening_balance_cents', 'UPDATE'],
    ['bank_statements', 'closing_balance_cents', 'UPDATE'],
    ['bank_statement_lines', 'tenant_id', 'INSERT'],
    ['bank_statement_lines', 'bank_statement_id', 'INSERT'],
    ['bank_statement_lines', 'line_number', 'INSERT'],
    ['bank_statement_lines', 'transaction_date', 'INSERT'],
    ['bank_statement_lines', 'reference_number', 'INSERT'],
    ['bank_statement_lines', 'description', 'INSERT'],
    ['bank_statement_lines', 'amount_cents', 'INSERT'],
    ['bank_statement_lines', 'line_number', 'UPDATE'],
    ['bank_statement_lines', 'transaction_date', 'UPDATE'],
    ['bank_statement_lines', 'reference_number', 'UPDATE'],
    ['bank_statement_lines', 'description', 'UPDATE'],
    ['bank_statement_lines', 'amount_cents', 'UPDATE'],
    ['units_of_measure', 'tenant_id', 'INSERT'],
    ['units_of_measure', 'code', 'INSERT'],
    ['units_of_measure', 'name', 'INSERT'],
    ['units_of_measure', 'decimal_places', 'INSERT'],
    ['units_of_measure', 'is_active', 'INSERT'],
    ['units_of_measure', 'created_by', 'INSERT'],
    ['units_of_measure', 'code', 'UPDATE'],
    ['units_of_measure', 'name', 'UPDATE'],
    ['units_of_measure', 'decimal_places', 'UPDATE'],
    ['units_of_measure', 'is_active', 'UPDATE'],
    ['warehouses', 'tenant_id', 'INSERT'],
    ['warehouses', 'code', 'INSERT'],
    ['warehouses', 'name', 'INSERT'],
    ['warehouses', 'project_id', 'INSERT'],
    ['warehouses', 'is_active', 'INSERT'],
    ['warehouses', 'created_by', 'INSERT'],
    ['warehouses', 'code', 'UPDATE'],
    ['warehouses', 'name', 'UPDATE'],
    ['warehouses', 'project_id', 'UPDATE'],
    ['warehouses', 'is_active', 'UPDATE'],
    ['stock_receipts', 'tenant_id', 'INSERT'],
    ['stock_receipts', 'warehouse_id', 'INSERT'],
    ['stock_receipts', 'purchase_order_id', 'INSERT'],
    ['stock_receipts', 'delivery_schedule_id', 'INSERT'],
    ['stock_receipts', 'status', 'INSERT'],
    ['stock_receipts', 'received_date', 'INSERT'],
    ['stock_receipts', 'currency', 'INSERT'],
    ['stock_receipts', 'created_by', 'INSERT'],
    ['stock_receipts', 'warehouse_id', 'UPDATE'],
    ['stock_receipts', 'purchase_order_id', 'UPDATE'],
    ['stock_receipts', 'delivery_schedule_id', 'UPDATE'],
    ['stock_receipts', 'received_date', 'UPDATE'],
    ['stock_receipts', 'currency', 'UPDATE'],
    ['stock_receipt_lines', 'tenant_id', 'INSERT'],
    ['stock_receipt_lines', 'stock_receipt_id', 'INSERT'],
    ['stock_receipt_lines', 'po_line_item_id', 'INSERT'],
    ['stock_receipt_lines', 'material_item_id', 'INSERT'],
    ['stock_receipt_lines', 'uom_id', 'INSERT'],
    ['stock_receipt_lines', 'line_number', 'INSERT'],
    ['stock_receipt_lines', 'quantity_micros', 'INSERT'],
    ['stock_receipt_lines', 'unit_cost_cents', 'INSERT'],
    ['stock_receipt_lines', 'line_total_cents', 'INSERT'],
    ['stock_receipt_lines', 'po_line_item_id', 'UPDATE'],
    ['stock_receipt_lines', 'material_item_id', 'UPDATE'],
    ['stock_receipt_lines', 'uom_id', 'UPDATE'],
    ['stock_receipt_lines', 'line_number', 'UPDATE'],
    ['stock_receipt_lines', 'quantity_micros', 'UPDATE'],
    ['stock_receipt_lines', 'unit_cost_cents', 'UPDATE'],
    ['stock_receipt_lines', 'line_total_cents', 'UPDATE'],
    ['po_line_items', 'bom_line_item_id', 'INSERT'],
    ['po_line_items', 'cost_code_id', 'INSERT'],
    ['po_line_items', 'bom_line_item_id', 'UPDATE'],
    ['po_line_items', 'cost_code_id', 'UPDATE'],
    ['cost_codes', 'tenant_id', 'INSERT'],
    ['cost_codes', 'parent_id', 'INSERT'],
    ['cost_codes', 'code', 'INSERT'],
    ['cost_codes', 'name', 'INSERT'],
    ['cost_codes', 'category', 'INSERT'],
    ['cost_codes', 'is_active', 'INSERT'],
    ['cost_codes', 'created_by', 'INSERT'],
    ['cost_codes', 'parent_id', 'UPDATE'],
    ['cost_codes', 'code', 'UPDATE'],
    ['cost_codes', 'name', 'UPDATE'],
    ['cost_codes', 'category', 'UPDATE'],
    ['cost_codes', 'is_active', 'UPDATE'],
    ['cost_codes', 'updated_at', 'UPDATE'],
    ['project_budgets', 'tenant_id', 'INSERT'],
    ['project_budgets', 'project_id', 'INSERT'],
    ['project_budgets', 'source_bom_id', 'INSERT'],
    ['project_budgets', 'supersedes_budget_id', 'INSERT'],
    ['project_budgets', 'revision', 'INSERT'],
    ['project_budgets', 'status', 'INSERT'],
    ['project_budgets', 'control_mode', 'INSERT'],
    ['project_budgets', 'commitment_tolerance_bps', 'INSERT'],
    ['project_budgets', 'currency', 'INSERT'],
    ['project_budgets', 'effective_from', 'INSERT'],
    ['project_budgets', 'revision_reason', 'INSERT'],
    ['project_budgets', 'created_by', 'INSERT'],
    ['project_budgets', 'source_bom_id', 'UPDATE'],
    ['project_budgets', 'control_mode', 'UPDATE'],
    ['project_budgets', 'commitment_tolerance_bps', 'UPDATE'],
    ['project_budgets', 'currency', 'UPDATE'],
    ['project_budgets', 'effective_from', 'UPDATE'],
    ['project_budgets', 'revision_reason', 'UPDATE'],
    ['project_budgets', 'updated_at', 'UPDATE'],
    ['project_budget_lines', 'tenant_id', 'INSERT'],
    ['project_budget_lines', 'project_budget_id', 'INSERT'],
    ['project_budget_lines', 'cost_code_id', 'INSERT'],
    ['project_budget_lines', 'bom_line_item_id', 'INSERT'],
    ['project_budget_lines', 'line_number', 'INSERT'],
    ['project_budget_lines', 'description', 'INSERT'],
    ['project_budget_lines', 'amount_cents', 'INSERT'],
    ['project_budget_lines', 'cost_code_id', 'UPDATE'],
    ['project_budget_lines', 'bom_line_item_id', 'UPDATE'],
    ['project_budget_lines', 'line_number', 'UPDATE'],
    ['project_budget_lines', 'description', 'UPDATE'],
    ['project_budget_lines', 'amount_cents', 'UPDATE'],
    ['project_budget_lines', 'updated_at', 'UPDATE'],
  ]

  await query(
    'authenticated role has minimum owner-scoped column grants',
    `select table_name, column_name, privilege
       from (values ${minimumAuthenticatedColumnGrants
         .map(
           ([table, column, privilege]) =>
             `('${table}', '${column}', '${privilege}')`
         )
         .join(', ')}) as required(table_name, column_name, privilege)
      where not has_column_privilege(
        'authenticated',
        'public.' || quote_ident(table_name),
        column_name,
        privilege
      )`,
    (rows) => rows.length === 0,
    (rows) =>
      rows
        .map((row) => `${row.table_name}.${row.column_name}:${row.privilege}`)
        .join(', ')
  )

  await query(
    'authenticated cannot mutate immutable cost identity columns',
    `select column_name, privilege
       from (values
         ('tenant_id', 'UPDATE'),
         ('project_id', 'UPDATE'),
         ('created_by', 'UPDATE'),
         ('cost_source', 'UPDATE'),
         ('bom_line_item_id', 'UPDATE'),
         ('po_line_item_id', 'UPDATE'),
         ('created_at', 'UPDATE'),
         ('cost_source', 'INSERT'),
         ('bom_line_item_id', 'INSERT'),
         ('po_line_item_id', 'INSERT'),
         ('created_at', 'INSERT'),
         ('updated_at', 'INSERT')
       ) as forbidden(column_name, privilege)
      where has_column_privilege(
        'authenticated',
        'public.cost_entries',
        column_name,
        privilege
      )`,
    (rows) => rows.length === 0,
    (rows) =>
      rows
        .map((row) => `cost_entries.${row.column_name}:${row.privilege}`)
        .join(', ')
  )

  await query(
    'authenticated cannot forge Project Budget workflow authority',
    `select table_name, column_name, privilege
       from (values
         ('cost_codes', 'tenant_id', 'UPDATE'),
         ('cost_codes', 'created_by', 'UPDATE'),
         ('project_budgets', 'tenant_id', 'UPDATE'),
         ('project_budgets', 'project_id', 'UPDATE'),
         ('project_budgets', 'revision', 'UPDATE'),
         ('project_budgets', 'supersedes_budget_id', 'UPDATE'),
         ('project_budgets', 'created_by', 'UPDATE'),
         ('project_budgets', 'status', 'UPDATE'),
         ('project_budgets', 'total_budget_cents', 'UPDATE'),
         ('project_budgets', 'submitted_by', 'UPDATE'),
         ('project_budgets', 'submitted_at', 'UPDATE'),
         ('project_budgets', 'commercial_approved_by', 'UPDATE'),
         ('project_budgets', 'commercial_approved_at', 'UPDATE'),
         ('project_budgets', 'finance_approved_by', 'UPDATE'),
         ('project_budgets', 'finance_approved_at', 'UPDATE'),
         ('project_budgets', 'rejected_by', 'UPDATE'),
         ('project_budgets', 'rejected_at', 'UPDATE'),
         ('project_budgets', 'rejection_reason', 'UPDATE'),
         ('project_budgets', 'total_budget_cents', 'INSERT'),
         ('project_budgets', 'submitted_by', 'INSERT'),
         ('project_budgets', 'submitted_at', 'INSERT'),
         ('project_budgets', 'commercial_approved_by', 'INSERT'),
         ('project_budgets', 'commercial_approved_at', 'INSERT'),
         ('project_budgets', 'finance_approved_by', 'INSERT'),
         ('project_budgets', 'finance_approved_at', 'INSERT'),
         ('project_budgets', 'rejected_by', 'INSERT'),
         ('project_budgets', 'rejected_at', 'INSERT'),
         ('project_budgets', 'rejection_reason', 'INSERT'),
         ('project_budget_lines', 'tenant_id', 'UPDATE'),
         ('project_budget_lines', 'project_budget_id', 'UPDATE')
       ) as forbidden(table_name, column_name, privilege)
      where has_column_privilege(
        'authenticated',
        'public.' || quote_ident(table_name),
        column_name,
        privilege
      )`,
    (rows) => rows.length === 0,
    (rows) =>
      rows
        .map(
          (row) =>
            `${row.table_name}.${row.column_name}:${row.privilege}`
        )
        .join(', ')
  )

  await query(
    'authenticated cannot mutate finance authority columns',
    `select table_name, column_name, privilege
       from (values
         ('fiscal_periods', 'tenant_id', 'UPDATE'),
         ('fiscal_periods', 'starts_on', 'UPDATE'),
         ('fiscal_periods', 'ends_on', 'UPDATE'),
         ('fiscal_periods', 'status', 'UPDATE'),
         ('fiscal_periods', 'closed_by', 'UPDATE'),
         ('fiscal_periods', 'closed_at', 'UPDATE'),
         ('ledger_accounts', 'tenant_id', 'UPDATE'),
         ('ledger_accounts', 'code', 'UPDATE'),
         ('ledger_accounts', 'account_type', 'UPDATE'),
         ('ledger_accounts', 'normal_balance', 'UPDATE'),
         ('ledger_accounts', 'system_key', 'UPDATE'),
         ('journal_entries', 'tenant_id', 'UPDATE'),
         ('journal_entries', 'fiscal_period_id', 'UPDATE'),
         ('journal_entries', 'entry_number', 'UPDATE'),
         ('journal_entries', 'status', 'UPDATE'),
         ('journal_entries', 'source_type', 'UPDATE'),
         ('journal_entries', 'reverses_entry_id', 'UPDATE'),
         ('journal_entries', 'posted_by', 'UPDATE'),
         ('journal_entries', 'posted_at', 'UPDATE'),
         ('journal_entries', 'entry_number', 'INSERT'),
         ('journal_entries', 'fiscal_period_id', 'INSERT'),
         ('journal_entries', 'reverses_entry_id', 'INSERT'),
         ('journal_entries', 'posted_by', 'INSERT'),
         ('journal_entries', 'posted_at', 'INSERT'),
         ('journal_lines', 'tenant_id', 'UPDATE'),
         ('journal_lines', 'journal_entry_id', 'UPDATE'),
         ('invoices', 'tenant_id', 'UPDATE'),
         ('invoices', 'created_by', 'UPDATE'),
         ('invoices', 'invoice_number', 'UPDATE'),
         ('invoices', 'status', 'UPDATE'),
         ('invoices', 'issued_by', 'UPDATE'),
         ('invoices', 'issued_at', 'UPDATE'),
         ('invoices', 'issuance_journal_entry_id', 'UPDATE'),
         ('invoices', 'reversed_by', 'UPDATE'),
         ('invoices', 'reversed_at', 'UPDATE'),
         ('invoices', 'reversal_reason', 'UPDATE'),
         ('invoices', 'reversal_journal_entry_id', 'UPDATE'),
         ('invoices', 'issued_by', 'INSERT'),
         ('invoices', 'issued_at', 'INSERT'),
         ('invoices', 'issuance_journal_entry_id', 'INSERT'),
         ('invoices', 'reversed_by', 'INSERT'),
         ('invoices', 'reversed_at', 'INSERT'),
         ('invoices', 'reversal_reason', 'INSERT'),
         ('invoices', 'reversal_journal_entry_id', 'INSERT')
         ,('supplier_bills', 'tenant_id', 'UPDATE')
         ,('supplier_bills', 'status', 'UPDATE')
         ,('supplier_bills', 'internal_number', 'UPDATE')
         ,('supplier_bills', 'posting_journal_entry_id', 'UPDATE')
         ,('supplier_bills', 'posted_by', 'UPDATE')
         ,('supplier_bills', 'posted_at', 'UPDATE')
         ,('supplier_bills', 'reversal_journal_entry_id', 'UPDATE')
         ,('supplier_bills', 'reversed_by', 'UPDATE')
         ,('supplier_bills', 'reversed_at', 'UPDATE')
         ,('supplier_bills', 'reversal_reason', 'UPDATE')
         ,('supplier_bills', 'internal_number', 'INSERT')
         ,('supplier_bills', 'posting_journal_entry_id', 'INSERT')
         ,('supplier_bills', 'posted_by', 'INSERT')
         ,('supplier_bills', 'posted_at', 'INSERT')
         ,('supplier_bills', 'reversal_journal_entry_id', 'INSERT')
         ,('supplier_bills', 'reversed_by', 'INSERT')
         ,('supplier_bills', 'reversed_at', 'INSERT')
         ,('supplier_bills', 'reversal_reason', 'INSERT')
         ,('supplier_bill_lines', 'tenant_id', 'UPDATE')
         ,('supplier_bill_lines', 'supplier_bill_id', 'UPDATE')
         ,('cash_accounts', 'tenant_id', 'UPDATE')
         ,('cash_accounts', 'created_by', 'UPDATE')
         ,('cash_transactions', 'tenant_id', 'UPDATE')
         ,('cash_transactions', 'status', 'UPDATE')
         ,('cash_transactions', 'internal_number', 'UPDATE')
         ,('cash_transactions', 'posting_journal_entry_id', 'UPDATE')
         ,('cash_transactions', 'posted_by', 'UPDATE')
         ,('cash_transactions', 'posted_at', 'UPDATE')
         ,('cash_transactions', 'reversal_journal_entry_id', 'UPDATE')
         ,('cash_transactions', 'reversed_by', 'UPDATE')
         ,('cash_transactions', 'reversed_at', 'UPDATE')
         ,('cash_transactions', 'reversal_reason', 'UPDATE')
         ,('cash_transactions', 'internal_number', 'INSERT')
         ,('cash_transactions', 'posting_journal_entry_id', 'INSERT')
         ,('cash_transactions', 'posted_by', 'INSERT')
         ,('cash_transactions', 'posted_at', 'INSERT')
         ,('cash_transactions', 'reversal_journal_entry_id', 'INSERT')
         ,('cash_transactions', 'reversed_by', 'INSERT')
         ,('cash_transactions', 'reversed_at', 'INSERT')
         ,('cash_transactions', 'reversal_reason', 'INSERT')
         ,('cash_allocations', 'tenant_id', 'UPDATE')
         ,('cash_allocations', 'cash_transaction_id', 'UPDATE')
         ,('bank_statements', 'tenant_id', 'UPDATE')
         ,('bank_statements', 'created_by', 'UPDATE')
         ,('bank_statements', 'status', 'UPDATE')
         ,('bank_statements', 'reconciled_by', 'UPDATE')
         ,('bank_statements', 'reconciled_at', 'UPDATE')
         ,('bank_statements', 'voided_by', 'UPDATE')
         ,('bank_statements', 'voided_at', 'UPDATE')
         ,('bank_statements', 'void_reason', 'UPDATE')
         ,('bank_statements', 'reconciled_by', 'INSERT')
         ,('bank_statements', 'reconciled_at', 'INSERT')
         ,('bank_statements', 'voided_by', 'INSERT')
         ,('bank_statements', 'voided_at', 'INSERT')
         ,('bank_statements', 'void_reason', 'INSERT')
         ,('bank_statement_lines', 'tenant_id', 'UPDATE')
         ,('bank_statement_lines', 'bank_statement_id', 'UPDATE')
         ,('bank_statement_lines', 'matched_cash_transaction_id', 'UPDATE')
         ,('bank_statement_lines', 'matched_by', 'UPDATE')
         ,('bank_statement_lines', 'matched_at', 'UPDATE')
         ,('bank_statement_lines', 'matched_cash_transaction_id', 'INSERT')
         ,('bank_statement_lines', 'matched_by', 'INSERT')
         ,('bank_statement_lines', 'matched_at', 'INSERT')
         ,('units_of_measure', 'tenant_id', 'UPDATE')
         ,('units_of_measure', 'created_by', 'UPDATE')
         ,('warehouses', 'tenant_id', 'UPDATE')
         ,('warehouses', 'created_by', 'UPDATE')
         ,('stock_receipts', 'tenant_id', 'UPDATE')
         ,('stock_receipts', 'created_by', 'UPDATE')
         ,('stock_receipts', 'status', 'UPDATE')
         ,('stock_receipts', 'internal_number', 'UPDATE')
         ,('stock_receipts', 'posting_journal_entry_id', 'UPDATE')
         ,('stock_receipts', 'posted_by', 'UPDATE')
         ,('stock_receipts', 'posted_at', 'UPDATE')
         ,('stock_receipts', 'reversal_journal_entry_id', 'UPDATE')
         ,('stock_receipts', 'reversed_by', 'UPDATE')
         ,('stock_receipts', 'reversed_at', 'UPDATE')
         ,('stock_receipts', 'reversal_reason', 'UPDATE')
         ,('stock_receipts', 'internal_number', 'INSERT')
         ,('stock_receipts', 'posting_journal_entry_id', 'INSERT')
         ,('stock_receipts', 'posted_by', 'INSERT')
         ,('stock_receipts', 'posted_at', 'INSERT')
         ,('stock_receipts', 'reversal_journal_entry_id', 'INSERT')
         ,('stock_receipts', 'reversed_by', 'INSERT')
         ,('stock_receipts', 'reversed_at', 'INSERT')
         ,('stock_receipts', 'reversal_reason', 'INSERT')
         ,('stock_receipt_lines', 'tenant_id', 'UPDATE')
         ,('stock_receipt_lines', 'stock_receipt_id', 'UPDATE')
       ) as forbidden(table_name, column_name, privilege)
      where has_column_privilege(
        'authenticated',
        'public.' || quote_ident(table_name),
        column_name,
        privilege
      )`,
    (rows) => rows.length === 0,
    (rows) =>
      rows
        .map(
          (row) =>
            `${row.table_name}.${row.column_name}:${row.privilege}`
        )
        .join(', ')
  )

  await query(
    'authenticated role has no column-level chat mutation grants',
    `select table_name, column_name, privilege_type as privilege
       from information_schema.column_privileges
      where table_schema = 'public'
        and grantee = 'authenticated'
        and table_name in ('cortex_conversations', 'cortex_messages')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')`,
    (rows) => rows.length === 0,
    (rows) =>
      rows
        .map(
          (row) =>
            `${row.table_name}.${row.column_name}:${row.privilege}`
        )
        .join(', ')
  )

  await query(
    'authenticated role has no broad chat mutation grants',
    `select table_name, privilege
       from (values
         ('cortex_conversations', 'INSERT'),
         ('cortex_conversations', 'UPDATE'),
         ('cortex_conversations', 'DELETE'),
         ('cortex_messages', 'INSERT'),
         ('cortex_messages', 'UPDATE'),
         ('cortex_messages', 'DELETE')
       ) as forbidden(table_name, privilege)
      where has_table_privilege(
        'authenticated',
        'public.' || quote_ident(table_name),
        privilege
      )`,
    (rows) => rows.length === 0,
    (rows) => rows.map((row) => `${row.table_name}:${row.privilege}`).join(', ')
  )

  await query(
    'authenticated role has no broad finance insert or update grants',
    `select table_name, privilege
       from unnest(array[
         'fiscal_periods',
         'ledger_accounts',
         'journal_entries',
         'journal_lines',
         'invoices',
         'supplier_bills',
         'supplier_bill_lines',
         'cash_accounts',
         'cash_transactions',
         'cash_allocations',
         'bank_statements',
         'bank_statement_lines',
         'units_of_measure',
         'warehouses',
         'stock_receipts',
         'stock_receipt_lines',
         'stock_ledger_entries',
         'cost_codes',
         'project_budgets',
         'project_budget_lines'
       ]) as table_name
       cross join unnest(array['INSERT', 'UPDATE']) as privilege
      where has_table_privilege(
        'authenticated',
        'public.' || quote_ident(table_name),
        privilege
      )`,
    (rows) => rows.length === 0,
    (rows) => rows.map((row) => `${row.table_name}:${row.privilege}`).join(', ')
  )

  await query(
    'client roles cannot access financial sequence state',
    `select role_name, privilege
       from unnest(array['anon', 'authenticated']) as role_name
       cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) as privilege
      where has_table_privilege(
        role_name,
        'public.financial_sequences',
        privilege
      )`,
    (rows) => rows.length === 0,
    (rows) => rows.map((row) => `${row.role_name}:${row.privilege}`).join(', ')
  )
} finally {
  await sql.end({ timeout: 5 })
}

if (failures > 0) {
  console.error(`Database reproducibility verification failed: ${failures} invariant(s)`)
  process.exit(1)
}

console.log(
  `PASS database reproducibility verification (${migrationFiles.length} migrations, ${requiredTables.length} protected tables, ${requiredServerOnlyTables.length} service-only tables)`
)
