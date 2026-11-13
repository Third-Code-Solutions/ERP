/**
 * Cortex coverage classification (docs/erp/specs/cortex-coverage.md §4).
 * Every public table with a `tenant_id` column must appear in exactly one
 * class; the coverage guard in cortex-substrate.test.ts fails on a new table
 * until it is classified here.
 */

/** Mirrored by hand-written or domain triggers (not the registry). */
export const CORTEX_HANDWRITTEN_MIRRORS = [
  'accounts',
  'users',
  'projects',
  'opportunities',
  'documents',
  'boms',
  'purchase_orders',
  'invoices',
  'daily_tasks',
  // Finance, payables, cash, bank and inventory projections.
  'fiscal_periods',
  'ledger_accounts',
  'journal_entries',
  'journal_lines',
  'supplier_bills',
  'cash_accounts',
  'cash_transactions',
  'bank_statements',
  'warehouses',
  'stock_receipts',
  'stock_ledger_entries',
] as const

/** The 23 tables Batch 1 moves from cortex_mirror_generic to the registry. */
export const CORTEX_BATCH1_REGISTRY = [
  'vendors',
  'cost_codes',
  'material_items',
  'contacts',
  'scope_items',
  'permits',
  'variation_orders',
  'progress_claims',
  'warranty_tickets',
  'delivery_schedules',
  'rfqs',
  'contracts',
  'certificates_of_completion',
  'punchlist_items',
  'site_inspections',
  'design_files',
  'change_requests',
  'master_schedules',
  'weekly_reports',
  'pre_con_checklist_items',
  'cost_entries',
  'project_budgets',
  'stock_movements',
] as const

/**
 * Covered in Batch 1 without a trigger of their own: one-hop `via` lookups on
 * registry edges, the KYC re-title trigger, and receipts read by the
 * opportunity mirror for stage history.
 */
export const CORTEX_BATCH1_SUPPORT = {
  quality_hold_point_punchlist_handoffs: 'punchlist_items edge via source_handoff_id',
  pre_con_checklists: 'pre_con_checklist_items edge via checklist_id',
} as const

/** Classified (a) or (b) and shipped by a later batch (spec §4.1 to §4.6). */
export const CORTEX_PLANNED = {
  2: [
    'opportunity_kyc_tracks',
    'award_handoffs',
    'pprf_submissions',
    'tender_packages',
    'tender_deviations',
    'tender_vendor_profiles',
    'tender_evaluation_criteria',
    'tender_evaluation_scores',
    'opportunity_stage_transition_requests',
  ],
  3: [
    'bom_line_items',
    'dupas',
    'material_catalog',
    'crew_roles',
    'equipment_catalog',
    'assemblies',
    'price_history',
    'takeoff_imports',
    'drawing_revisions',
    'project_locations',
    'dupa_material_lines',
    'dupa_labour_lines',
    'dupa_equipment_lines',
    'assembly_material_templates',
    'assembly_labour_templates',
    'assembly_equipment_templates',
    'bom_line_item_grain_reviews',
    'bom_line_item_location_reviews',
    'boq_divisions',
    'takeoff_unresolved_items',
  ],
  4: [
    'rfq_quotes',
    'rate_cards',
    'po_line_items',
    'procurement_requisitions',
    'price_lists',
    'price_list_items',
    'procurement_requisition_lines',
    'landed_cost_documents',
    'inventory_reservations',
    'project_budget_lines',
    'supplier_bill_lines',
    'cash_allocations',
    'bank_statement_lines',
    'stock_receipt_lines',
    'stock_movement_lines',
    'landed_cost_lines',
    'landed_cost_allocations',
    'fiscal_period_close_runs',
  ],
  5: [
    'project_schedule_tasks',
    'project_rfis',
    'project_submittals',
    'site_diary_entries',
    'project_comments',
    'quality_hold_points',
    'project_weekly_progress',
    'mobilization_readiness',
    'turnover_packages',
    'task_instances',
    'approvals',
    'assets',
    'progress_updates',
    'project_submittal_documents',
    'permit_documents',
    'punchlist_photos',
    'site_inspection_photos',
    'progress_claim_documents',
    'permit_duration_profiles',
    'site_inspection_rfis',
    'delivery_inspections',
    'change_logs',
    'design_file_versions',
    'ticket_messages',
    'cnps_surveys',
    'sla_clocks',
    'asset_maintenance_records',
    'document_processing_jobs',
  ],
  // Planned catalogue tables; they may not exist yet.
  6: ['catalogue_items', 'catalogue_prices'],
} as const

const reason = (why: string, tables: readonly string[]) =>
  Object.fromEntries(tables.map((table) => [table, why]))

/** Class (c): never mirrored, each with a reason (spec §4.7). */
export const CORTEX_NEVER_MIRROR: Record<string, string> = {
  ...reason('secret, token or session (bearer credentials or signer PII)', [
    'bom_portal_tokens',
    'customer_portal_sessions',
    'signature_sessions',
    'warranty_portal_tokens',
    'vendor_confirmation_sessions',
    'platform_support_sessions',
  ]),
  ...reason('command or idempotency receipt (outcome is on the mirrored parent)', [
    'journal_post_requests',
    'journal_reverse_requests',
    'customer_invoice_cancel_requests',
    'customer_invoice_draft_create_requests',
    'customer_invoice_issue_requests',
    'customer_invoice_reverse_requests',
    'supplier_bill_post_requests',
    'supplier_bill_reverse_requests',
    'cash_transaction_draft_requests',
    'cash_transaction_workflow_requests',
    'bank_statement_auto_match_requests',
    'bank_statement_import_requests',
    'bank_statement_line_match_requests',
    'bank_statement_reconcile_requests',
    'bank_statement_void_requests',
    'cost_entry_create_requests',
    'cost_entry_delete_requests',
    'cost_entry_restore_requests',
    'stock_movement_create_requests',
    'stock_movement_workflow_requests',
    'stock_receipt_create_requests',
    'stock_receipt_workflow_requests',
    'purchase_order_create_requests',
    'purchase_order_workflow_requests',
    'delivery_schedule_create_requests',
    'delivery_workflow_requests',
    'change_request_create_requests',
    'project_comment_create_requests',
    'project_comment_delete_requests',
    'project_create_requests',
    'project_retirement_requests',
    'user_role_assignment_requests',
    'asset_maintenance_create_requests',
    'document_delete_requests',
    'document_intake_requests',
    'document_upload_reservations',
    'cad_evidence_commit_requests',
    'togal_bom_commit_requests',
    'opportunity_project_conversion_requests',
    'public_signing_requests',
    'vendor_confirmation_requests',
  ]),
  ...reason('outbox, delivery, attempt or event log (recipients; state is on the parent)', [
    'notification_outbox',
    'notification_deliveries',
    'notifications',
    'purchase_order_supplier_email_deliveries',
    'provider_delivery_outbox',
    'provider_delivery_attempts',
    'sap_posting_outbox',
    'sap_posting_attempts',
    'sla_logs',
    'roadmap_workflow_events',
    'procurement_requisition_events',
    'inventory_reservation_events',
    'document_processing_evidence',
  ]),
  ...reason('pure config, sequence or lookup', [
    'financial_sequences',
    'tax_profiles',
    'tenant_currencies',
    'exchange_rates',
    'units_of_measure',
    'mapping_config',
    'takeoff_mapping_profiles',
    'pre_con_checklist_templates',
    'process_steps',
    'approval_rules',
    'approval_delegations',
    'business_calendar_holidays',
    'tenant_feature_flags',
  ]),
  ...reason('raw PII or authorization data', [
    'account_kyc_artifacts',
    'statutory_outputs',
    'platform_user_invitations',
    'tenant_memberships',
  ]),
  ...reason('embedding, AI runtime or Cortex itself', [
    'embeddings',
    'cortex_nodes',
    'cortex_edges',
    'cortex_provenance',
    'cortex_conversations',
    'cortex_messages',
    'cortex_assistant_generation_jobs',
    'cortex_assistant_provider_policies',
    'cortex_assistant_provider_attempts',
    'cortex_assistant_provider_circuit_alerts',
    'cortex_assistant_turn_requests',
    'cortex_conversation_turn_requests',
    'cortex_semantic_index_jobs',
  ]),
  ...reason('audit chain (already hash-chained)', ['audit_log']),
}

/**
 * Registry column decisions for the Batch 1 tables, a snapshot of
 * 20261106101000 step 9. `copy` must equal the migration's attr_cols (same
 * order); `omit` names every other live column. A column added to one of these
 * tables fails the snapshot test until it is placed in one list here and, if
 * copied, in a migration. Title and summary templates may read an omitted
 * column (the record's own name), always redacted.
 */
export const CORTEX_REGISTRY_COLUMNS: Record<
  (typeof CORTEX_BATCH1_REGISTRY)[number],
  { copy: readonly string[]; omit: readonly string[] }
> = {
  vendors: {
    copy: ['created_at'],
    omit: ['id', 'tenant_id', 'name', 'contact_name', 'email', 'phone', 'address', 'bir_tin', 'notes', 'updated_at'],
  },
  cost_codes: {
    copy: ['parent_id', 'code', 'category', 'is_active', 'created_at'],
    omit: ['id', 'tenant_id', 'name', 'created_by', 'updated_at'],
  },
  material_items: {
    copy: ['code', 'category', 'unit', 'base_uom_id', 'inventory_tracked', 'wastage_bps', 'is_active', 'created_at'],
    omit: ['id', 'tenant_id', 'description', 'created_by', 'updated_at'],
  },
  contacts: {
    copy: ['account_id', 'role_title', 'is_primary', 'created_at'],
    omit: ['id', 'tenant_id', 'full_name', 'email', 'phone', 'updated_at'],
  },
  scope_items: {
    copy: ['project_id', 'code', 'unit', 'quantity', 'unit_cost_cents', 'line_total_cents', 'sort_order', 'created_at'],
    omit: ['id', 'tenant_id', 'created_by', 'description', 'notes', 'updated_at'],
  },
  permits: {
    copy: [
      'project_id', 'permit_type', 'status', 'submitted_at', 'expected_approval_at', 'expected_return_at',
      'approved_at', 'actual_return_at', 'refunded_at', 'lgu_name', 'duration_profile_id', 'min_duration_days',
      'expected_duration_days', 'max_duration_days', 'escalation_at', 'escalated_at', 'last_status_change_at',
      'created_at',
    ],
    omit: [
      'id', 'tenant_id', 'responsible_user_id', 'escalation_reason', 'created_by', 'updated_by', 'notes',
      'updated_at',
    ],
  },
  variation_orders: {
    copy: [
      'project_id', 'vo_number', 'change_type', 'cost_impact_cents', 'time_impact_days', 'status', 'signed_at',
      'created_at',
    ],
    omit: ['id', 'tenant_id', 'description', 'docuseal_submission_id', 'signed_document_id', 'created_by'],
  },
  progress_claims: {
    copy: [
      'project_id', 'claim_number', 'milestone_pct', 'amount_cents', 'status', 'submitted_at', 'certified_at',
      'handed_over_to_finance_at', 'invoice_id', 'paid_at', 'rejected_at', 'created_at',
    ],
    omit: [
      'id', 'tenant_id', 'description', 'submitted_by', 'certified_by', 'certificate_document_id',
      'handed_over_to_finance_by', 'rejected_reason', 'updated_at', 'created_by',
    ],
  },
  warranty_tickets: {
    copy: [
      'project_id', 'account_id', 'ticket_number', 'category', 'status', 'acknowledged_at', 'scheduled_at',
      'closed_at', 'sla_breached_ack', 'sla_breached_schedule', 'created_at',
    ],
    omit: [
      'id', 'tenant_id', 'description', 'location', 'submitted_by_name', 'submitted_by_email',
      'service_report_document_id', 'updated_at',
    ],
  },
  delivery_schedules: {
    copy: [
      'purchase_order_id', 'status', 'scheduled_date', 'site_prepared_at', 'received_at', 'rejected_at',
      'cancelled_at', 'accepted_at', 'created_at',
    ],
    omit: [
      'id', 'tenant_id', 'site_address', 'site_contact_name', 'site_contact_phone', 'site_preparation_notes',
      'site_prepared_by', 'received_by', 'received_notes', 'rejected_reason', 'cancelled_by', 'cancellation_reason',
      'accepted_by', 'updated_at', 'created_by',
    ],
  },
  rfqs: {
    copy: ['bom_id', 'status', 'created_at'],
    omit: ['id', 'tenant_id', 'line_items', 'updated_at'],
  },
  contracts: {
    copy: ['project_id', 'bom_id', 'status', 'signed_at', 'created_at'],
    omit: ['id', 'tenant_id', 'docuseal_submission_id', 'docuseal_slug', 'signed_document_id', 'updated_at'],
  },
  certificates_of_completion: {
    copy: ['project_id', 'status', 'signed_at', 'warranty_period_starts_at', 'warranty_period_ends_at', 'created_at'],
    omit: ['id', 'tenant_id', 'docuseal_submission_id', 'signed_document_id'],
  },
  punchlist_items: {
    copy: [
      'project_id', 'trade', 'priority', 'status', 'due_date', 'pe_signed_off_at', 'closed_at', 'created_at',
      'source_handoff_id',
    ],
    omit: [
      'id', 'tenant_id', 'description', 'location', 'assigned_to_user_id', 'assigned_to_text', 'pe_signed_off_by',
      'created_by',
    ],
  },
  site_inspections: {
    copy: ['opportunity_id', 'status', 'submitted_at', 'created_at'],
    omit: ['id', 'tenant_id', 'client_submission_id', 'payload', 'pdf_document_id', 'submitted_by', 'updated_at'],
  },
  design_files: {
    copy: [
      'opportunity_id', 'file_type', 'is_ready_for_presentation', 'is_client_approved', 'client_approved_at',
      'created_at',
    ],
    omit: ['id', 'tenant_id', 'name', 'updated_at'],
  },
  change_requests: {
    copy: ['opportunity_id', 'priority', 'affected_design_file_id', 'resolved_at', 'created_at'],
    omit: ['id', 'tenant_id', 'requested_by_name', 'description', 'resolved_by'],
  },
  master_schedules: {
    copy: ['project_id', 'imported_at'],
    omit: ['id', 'tenant_id', 'name', 'tasks', 'imported_by'],
  },
  weekly_reports: {
    copy: ['project_id', 'week_ending', 'generated_at', 'created_at'],
    omit: ['id', 'tenant_id', 'snapshot', 'report_document_id', 'generated_by'],
  },
  pre_con_checklist_items: {
    copy: [
      'checklist_id', 'owner_role', 'sla_days', 'status', 'depends_on_item_id', 'completed_at',
      'sla_clock_started_at', 'sla_breached_at', 'sort_order', 'created_at',
    ],
    omit: ['id', 'tenant_id', 'title', 'blocker_reason', 'completed_by', 'attachment_document_id', 'updated_at'],
  },
  cost_entries: {
    copy: [
      'project_id', 'bom_line_item_id', 'po_line_item_id', 'cost_code_id', 'voided_at', 'cost_category',
      'cost_source', 'amount_cents', 'quantity', 'unit', 'incurred_at', 'created_at',
    ],
    omit: [
      'id', 'tenant_id', 'created_by', 'voided_by', 'void_reason', 'description', 'reference_number', 'notes',
      'updated_at',
    ],
  },
  project_budgets: {
    copy: [
      'project_id', 'source_bom_id', 'supersedes_budget_id', 'revision', 'status', 'control_mode',
      'commitment_tolerance_bps', 'currency', 'effective_from', 'total_budget_cents', 'original_gp_margin_bps',
      'submitted_at', 'commercial_approved_at', 'finance_approved_at', 'rejected_at', 'created_at',
    ],
    omit: [
      'id', 'tenant_id', 'revision_reason', 'submitted_by', 'commercial_approved_by', 'finance_approved_by',
      'rejected_by', 'rejection_reason', 'created_by', 'updated_at',
    ],
  },
  stock_movements: {
    copy: [
      'movement_type', 'status', 'internal_number', 'source_warehouse_id', 'target_warehouse_id', 'project_id',
      'movement_date', 'currency', 'posting_journal_entry_id', 'reversal_journal_entry_id', 'posted_at',
      'reversed_at', 'created_at',
    ],
    omit: ['id', 'tenant_id', 'reason', 'posted_by', 'reversed_by', 'reversal_reason', 'created_by', 'updated_at'],
  },
}

/** Spec §3.2 global exclusion regex (case-insensitive). */
export const CORTEX_ATTR_EXCLUDE =
  /token|_hash$|password|secret|email|phone|address|contact_name|_ip$|user_agent|signer_|responder_|submitted_by_name|sender_name|bir_tin|(^|_)tin$|docuseal_|idempotency_key|request_hash|storage_path|sha256/i

/**
 * SEC-M7 compensating control (spec §10): the pre-Batch-1 finance, cash, bank
 * and inventory mirrors still copy `row - removed`, so every source column
 * not removed reaches `attributes`. `copied` is the decided key set; a new
 * column fails the snapshot test until someone decides. Converting these
 * mirrors to literal lists is planned for the next Cortex batch.
 */
export const CORTEX_DENYLIST_MIRRORS: Record<string, { mirror: string; removed: string[]; copied: string[] }> = {
  fiscal_periods: {
    mirror: 'cortex_mirror_finance',
    removed: ['created_by', 'posted_by', 'closed_by'],
    copied: ['closed_at', 'created_at', 'ends_on', 'id', 'name', 'starts_on', 'status', 'tenant_id', 'updated_at'],
  },
  ledger_accounts: {
    mirror: 'cortex_mirror_finance',
    removed: ['created_by', 'posted_by', 'closed_by'],
    copied: [
      'account_type', 'code', 'created_at', 'id', 'is_active', 'name', 'normal_balance', 'parent_id', 'system_key',
      'tenant_id', 'updated_at',
    ],
  },
  journal_entries: {
    mirror: 'cortex_mirror_finance',
    removed: ['created_by', 'posted_by', 'closed_by'],
    copied: [
      'created_at', 'currency', 'description', 'entry_number', 'fiscal_period_id', 'id', 'posted_at', 'posting_date',
      'reference_id', 'reference_type', 'reverses_entry_id', 'source_type', 'status', 'tenant_id', 'updated_at',
    ],
  },
  journal_lines: {
    mirror: 'cortex_mirror_finance',
    removed: ['created_by', 'posted_by', 'closed_by'],
    copied: [
      'business_account_id', 'created_at', 'credit_cents', 'debit_cents', 'description', 'id', 'journal_entry_id',
      'ledger_account_id', 'line_number', 'project_id', 'tenant_id', 'vendor_id',
    ],
  },
  supplier_bills: {
    mirror: 'cortex_mirror_payables',
    removed: ['created_by', 'posted_by', 'reversed_by'],
    copied: [
      'bill_date', 'created_at', 'currency', 'due_date', 'id', 'input_vat_cents', 'internal_number', 'notes',
      'posted_at', 'posting_journal_entry_id', 'project_id', 'purchase_order_id', 'reversal_journal_entry_id',
      'reversal_reason', 'reversed_at', 'status', 'subtotal_cents', 'tenant_id', 'total_payable_cents', 'updated_at',
      'vendor_bill_number', 'vendor_id', 'withholding_tax_cents',
    ],
  },
  cash_accounts: {
    mirror: 'cortex_mirror_cash',
    removed: ['created_by', 'account_identifier_last4'],
    copied: [
      'account_kind', 'bank_name', 'created_at', 'currency', 'id', 'is_active', 'ledger_account_id', 'name',
      'tenant_id', 'updated_at',
    ],
  },
  cash_transactions: {
    mirror: 'cortex_mirror_cash',
    removed: ['created_by', 'posted_by', 'reversed_by'],
    copied: [
      'amount_cents', 'business_account_id', 'cash_account_id', 'created_at', 'currency', 'direction', 'id',
      'internal_number', 'notes', 'posted_at', 'posting_journal_entry_id', 'reference_number',
      'reversal_journal_entry_id', 'reversal_reason', 'reversed_at', 'status', 'tenant_id', 'transaction_date',
      'updated_at', 'vendor_id',
    ],
  },
  bank_statements: {
    mirror: 'cortex_mirror_bank_statement',
    removed: ['created_by', 'reconciled_by', 'voided_by'],
    copied: [
      'cash_account_id', 'closing_balance_cents', 'created_at', 'currency', 'id', 'opening_balance_cents',
      'reconciled_at', 'reference_number', 'source_file_name', 'source_sha256', 'source_storage_path',
      'statement_end', 'statement_start', 'status', 'tenant_id', 'updated_at', 'void_reason', 'voided_at',
    ],
  },
  warehouses: {
    mirror: 'cortex_mirror_inventory_record',
    removed: ['created_by', 'posted_by', 'reversed_by'],
    copied: ['code', 'created_at', 'id', 'is_active', 'name', 'project_id', 'tenant_id', 'updated_at'],
  },
  stock_receipts: {
    mirror: 'cortex_mirror_inventory_record',
    removed: ['created_by', 'posted_by', 'reversed_by'],
    copied: [
      'created_at', 'currency', 'delivery_schedule_id', 'id', 'internal_number', 'notes', 'posted_at',
      'posting_journal_entry_id', 'purchase_order_id', 'received_date', 'reversal_journal_entry_id',
      'reversal_reason', 'reversed_at', 'status', 'supplier_delivery_reference', 'tenant_id', 'updated_at',
      'warehouse_id',
    ],
  },
  stock_ledger_entries: {
    mirror: 'cortex_mirror_inventory_record',
    removed: ['created_by', 'posted_by', 'reversed_by'],
    copied: [
      'created_at', 'event_type', 'id', 'landed_cost_allocation_id', 'landed_cost_document_id', 'material_item_id',
      'occurred_on', 'quantity_delta_micros', 'reverses_stock_ledger_entry_id', 'stock_movement_id',
      'stock_movement_line_id', 'stock_receipt_id', 'stock_receipt_line_id', 'tenant_id', 'uom_id',
      'value_delta_cents', 'warehouse_id',
    ],
  },
}
