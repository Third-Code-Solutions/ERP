-- NEEDS PRODUCTION MIGRATION APPROVAL (verified dump first; production has no PITR).
-- Release batch B: privilege-only and instantly reversible. HIGH BLAST RADIUS, read all of this.
--
-- S12A: the browser JWT roles (authenticated, anon) keep SELECT only where the
-- product reads through them.
--
-- Why. Every ERP read and write runs as postgres (Drizzle SSR and the Nest Core
-- API), through the service-role client, or through SECURITY DEFINER RPCs. Yet
-- the postgres default ACL in public still granted SELECT on every table to
-- authenticated and anon, so any signed-in user could read a table directly
-- through PostgREST, limited only by that table's tenant-only RLS policy and
-- not by the role checks the pages enforce. 20261104055626 retired the writes;
-- this retires the reads.
--
-- What the product reads through the user JWT (audit of main at ff97f39d:
-- server supabase-js clients built from the session cookie, browser clients,
-- Realtime subscriptions, RPCs, RLS policy and view dependencies, edge
-- functions). Each of these keeps SELECT for authenticated and is NOT revoked:
--   users            packages/auth/src/server.ts getUserProfile: server client from the session cookie
--   notifications    Realtime in components/nav/notifications-dropdown.tsx
--   opportunities    Realtime in components/dashboard/realtime-refresher.tsx and components/pipeline/pipeline-board.tsx
--   purchase_orders  Realtime in components/dashboard/realtime-refresher.tsx
--   invoices         Realtime in components/dashboard/realtime-refresher.tsx
--   boms             Realtime in components/dashboard/realtime-refresher.tsx
-- Realtime evaluates RLS as the subscriber, so those tables need SELECT.
-- tenants has no user-JWT reader (settings reads it through Drizzle;
-- auth_tenant_id() reads it as SECURITY DEFINER), so it is revoked too.
-- No anon read of any public table exists. The only other user-JWT calls are the
-- SECURITY DEFINER RPCs activate_current_invited_user() and is_platform_owner()
-- and Storage (signed upload URLs); none of them need table SELECT. The RLS
-- policies on the kept tables call only auth_tenant_id() and
-- auth_can_manage_finance() (both SECURITY DEFINER), never another table. No
-- views exist in public.
-- NOT touched here: audit_log and the cortex_* tables. The hardening that owns
-- their grants (#147) decides them; this migration neither revokes nor grants.
--
-- Method (how the revoke list was produced). A statement-level replay of
-- supabase/migrations in filename order (packages/database/src/__tests__/
-- _migration-replay.ts: comments and dollar quotes skipped, create / drop /
-- rename table applied, nothing executed) through THIS file gives 215 public
-- tables. Minus the 6 kept above and minus audit_log plus the 12 cortex_*
-- tables, 196 remain. client-table-read-privileges.test.ts re-runs the replay on
-- every build and fails if this list and the replay ever differ.
-- Stamped after every migration that creates a listed table (unit_aliases comes
-- from 20261124140000). A table on the list that does not exist in production
-- aborts the whole migration (transaction), changing nothing. A table that
-- exists in production but in no migration keeps SELECT: run the verification
-- query below.
--
-- Default privileges: the postgres default ACL for public no longer grants
-- SELECT to authenticated or anon, so tables created later stay server-only.
-- A migration that needs a browser read must grant it explicitly and add the
-- table to ALLOWED_BROWSER_READS in client-table-read-privileges.test.ts.
--
-- Locks: privilege changes only. Each REVOKE rewrites the table's pg_class ACL
-- entry; there is no table rewrite and no data scan, and reads and writes on the
-- tables are not blocked. It can wait only on concurrent DDL or GRANT on the
-- same table, bounded by lock_timeout 5s. Sessions already connected see the
-- new privileges on their next statement.
--
-- BEFORE applying, save the exact current grants (this is the precise rollback
-- script; column-level SELECT grants are cleared by the table-level REVOKE and
-- are not listed because no migration grants SELECT by column):
--   select format('grant select on table public.%I to %s;', c.relname, r.rolname)
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    cross join (values ('authenticated'), ('anon')) as r(rolname)
--    where n.nspname = 'public'
--      and c.relkind in ('r', 'p', 'v', 'm', 'f')
--      and has_table_privilege(r.rolname, c.oid, 'SELECT')
--    order by 1;
-- ROLLBACK: run the saved statements (a grant, instant, no data effect), restore
-- the default ACL, and delete the ledger row:
--   alter default privileges for role postgres in schema public
--     grant select on tables to authenticated, anon;
--   delete from supabase_migrations.schema_migrations where version = '20261124200000';
-- If login or the dashboard breaks, first run only:
--   grant select on table public.users to authenticated;
-- AFTER applying, this must return only the kept tables, audit_log and cortex_*:
--   select c.relname, r.rolname
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--    cross join (values ('authenticated'), ('anon')) as r(rolname)
--    where n.nspname = 'public'
--      and c.relkind in ('r', 'p', 'v', 'm', 'f')
--      and has_table_privilege(r.rolname, c.oid, 'SELECT')
--    order by 1, 2;
-- Smoke after applying: sign in, open the dashboard (it must still refresh on a
-- change), open the notification bell, move a deal on the pipeline.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Table-level REVOKE also clears any column-level SELECT grant.
revoke select on table
  public.account_kyc_artifacts,
  public.accounts,
  public.approval_delegations,
  public.approval_rules,
  public.approvals,
  public.assemblies,
  public.assembly_equipment_templates,
  public.assembly_labour_templates,
  public.assembly_material_templates,
  public.asset_maintenance_create_requests,
  public.asset_maintenance_records,
  public.assets,
  public.award_handoffs,
  public.bank_statement_auto_match_requests,
  public.bank_statement_import_requests,
  public.bank_statement_line_match_requests,
  public.bank_statement_lines,
  public.bank_statement_reconcile_requests,
  public.bank_statement_void_requests,
  public.bank_statements,
  public.bom_line_item_grain_reviews,
  public.bom_line_item_location_reviews,
  public.bom_line_items,
  public.bom_portal_tokens,
  public.boq_divisions,
  public.business_calendar_holidays,
  public.cad_evidence_commit_requests,
  public.cash_accounts,
  public.cash_allocations,
  public.cash_transaction_draft_requests,
  public.cash_transaction_workflow_requests,
  public.cash_transactions,
  public.certificates_of_completion,
  public.change_logs,
  public.change_request_create_requests,
  public.change_requests,
  public.cnps_surveys,
  public.contacts,
  public.contracts,
  public.cost_codes,
  public.cost_entries,
  public.cost_entry_create_requests,
  public.cost_entry_delete_requests,
  public.cost_entry_restore_requests,
  public.crew_roles,
  public.customer_invoice_cancel_requests,
  public.customer_invoice_draft_create_requests,
  public.customer_invoice_issue_requests,
  public.customer_invoice_reverse_requests,
  public.customer_portal_sessions,
  public.daily_tasks,
  public.delivery_inspections,
  public.delivery_schedule_create_requests,
  public.delivery_schedules,
  public.delivery_workflow_requests,
  public.design_file_versions,
  public.design_files,
  public.document_delete_requests,
  public.document_intake_requests,
  public.document_processing_evidence,
  public.document_processing_jobs,
  public.document_upload_reservations,
  public.documents,
  public.drawing_revisions,
  public.dupa_equipment_lines,
  public.dupa_labour_lines,
  public.dupa_material_lines,
  public.dupas,
  public.embeddings,
  public.equipment_catalog,
  public.exchange_rates,
  public.financial_sequences,
  public.fiscal_period_close_runs,
  public.fiscal_periods,
  public.inventory_reservation_events,
  public.inventory_reservations,
  public.journal_entries,
  public.journal_lines,
  public.journal_post_requests,
  public.journal_reverse_requests,
  public.landed_cost_allocations,
  public.landed_cost_documents,
  public.landed_cost_lines,
  public.ledger_accounts,
  public.mapping_config,
  public.master_schedules,
  public.material_catalog,
  public.material_items,
  public.mobilization_readiness,
  public.notification_deliveries,
  public.notification_outbox,
  public.opportunity_kyc_tracks,
  public.opportunity_project_conversion_requests,
  public.opportunity_stage_transition_requests,
  public.permit_documents,
  public.permit_duration_profiles,
  public.permits,
  public.platform_audit_events,
  public.platform_role_assignments,
  public.platform_support_sessions,
  public.platform_user_invitations,
  public.po_line_items,
  public.pprf_submissions,
  public.pre_con_checklist_items,
  public.pre_con_checklist_templates,
  public.pre_con_checklists,
  public.price_history,
  public.price_list_items,
  public.price_lists,
  public.process_steps,
  public.procurement_requisition_events,
  public.procurement_requisition_lines,
  public.procurement_requisitions,
  public.progress_claim_documents,
  public.progress_claims,
  public.progress_updates,
  public.project_budget_lines,
  public.project_budgets,
  public.project_comment_create_requests,
  public.project_comment_delete_requests,
  public.project_comments,
  public.project_create_requests,
  public.project_locations,
  public.project_retirement_requests,
  public.project_rfis,
  public.project_schedule_tasks,
  public.project_submittal_documents,
  public.project_submittals,
  public.project_weekly_progress,
  public.projects,
  public.provider_delivery_attempts,
  public.provider_delivery_outbox,
  public.public_signing_requests,
  public.punchlist_items,
  public.punchlist_photos,
  public.purchase_order_create_requests,
  public.purchase_order_supplier_email_deliveries,
  public.purchase_order_workflow_requests,
  public.quality_hold_point_punchlist_handoffs,
  public.quality_hold_points,
  public.rate_cards,
  public.rfq_quotes,
  public.rfqs,
  public.roadmap_workflow_events,
  public.sap_posting_attempts,
  public.sap_posting_outbox,
  public.scope_items,
  public.signature_sessions,
  public.site_diary_entries,
  public.site_inspection_photos,
  public.site_inspection_rfis,
  public.site_inspections,
  public.sla_clocks,
  public.sla_logs,
  public.statutory_outputs,
  public.stock_ledger_entries,
  public.stock_movement_create_requests,
  public.stock_movement_lines,
  public.stock_movement_workflow_requests,
  public.stock_movements,
  public.stock_receipt_create_requests,
  public.stock_receipt_lines,
  public.stock_receipt_workflow_requests,
  public.stock_receipts,
  public.supplier_bill_lines,
  public.supplier_bill_post_requests,
  public.supplier_bill_reverse_requests,
  public.supplier_bills,
  public.takeoff_imports,
  public.takeoff_mapping_profiles,
  public.takeoff_unresolved_items,
  public.task_instances,
  public.tax_profiles,
  public.tenant_currencies,
  public.tenant_feature_flags,
  public.tenant_memberships,
  public.tenants,
  public.tender_deviations,
  public.tender_evaluation_criteria,
  public.tender_evaluation_scores,
  public.tender_packages,
  public.tender_vendor_profiles,
  public.ticket_messages,
  public.togal_bom_commit_requests,
  public.turnover_packages,
  public.unit_aliases,
  public.units_of_measure,
  public.user_role_assignment_requests,
  public.variation_orders,
  public.vendor_confirmation_requests,
  public.vendor_confirmation_sessions,
  public.vendors,
  public.warehouses,
  public.warranty_portal_tokens,
  public.warranty_tickets,
  public.weekly_reports
from authenticated, anon;

-- Tables created later by postgres in public must not regain SELECT.
alter default privileges for role postgres in schema public
  revoke select on tables from authenticated, anon;

commit;
