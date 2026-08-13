#!/usr/bin/env node

/**
 * Static gate for the WO-02 database proposal.
 *
 * The proposal is deliberately outside supabase/migrations until a disposable
 * branch or restored staging database exists. This check prevents accidentally
 * turning a reviewed, additive design into an unreviewed production migration.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const proposalPath = join(
  process.cwd(),
  'docs',
  'proposals',
  '2026-08-12-wo-02-audit-calendar.sql'
)
const sql = readFileSync(proposalPath, 'utf8')
const failures = []

function requireText(pattern, description) {
  if (!pattern.test(sql)) failures.push(description)
}

function forbidText(pattern, description) {
  if (pattern.test(sql)) failures.push(description)
}

requireText(/DO NOT APPLY/i, 'proposal must declare the production-apply gate')
requireText(/alter table public\.audit_log[\s\S]*add column if not exists entity_key/i, 'audit_log must preserve a source row key')
requireText(/pg_constraint[\s\S]*audit_log_entity_key_nonempty/i, 'audit identity constraint must be replay-safe')
requireText(/create or replace function public\.audit_entity_uuid/i, 'numeric/composite row identity needs a deterministic UUID')
requireText(/create or replace function public\.audit_log_trigger/i, 'the generic audit trigger must be updated')
requireText(/when 'INSERT' then 'create'[\s\S]*when 'UPDATE' then 'update'[\s\S]*when 'DELETE' then 'delete'/i, 'audit action names must preserve create/update/delete semantics')
requireText(/insert into public\.audit_log[\s\S]*entity_key/i, 'new audit rows must persist entity_key')
requireText(/create table if not exists public\.business_calendar_holidays/i, 'holiday data must be persisted')
requireText(/tenant_id uuid not null/i, 'holiday rows must be tenant scoped')
requireText(/alter table public\.business_calendar_holidays enable row level security/i, 'holiday table must enable RLS')
for (const policyName of ['read', 'insert', 'update', 'delete']) {
  requireText(
    new RegExp(`create policy business_calendar_holidays_tenant_${policyName}`, 'i'),
    `holiday table missing ${policyName} policy`
  )
}
requireText(/create trigger audit_business_calendar_holidays/i, 'holiday mutations must be audited')
requireText(/create trigger business_calendar_holidays_set_actor/i, 'holiday actor and updated_at trigger is required')
requireText(/pg_policies[\s\S]*business_calendar_holidays_tenant_read/i, 'holiday policies must be replay-safe')
requireText(/pg_trigger[\s\S]*audit_business_calendar_holidays/i, 'holiday audit trigger must be replay-safe')
requireText(/pg_trigger[\s\S]*business_calendar_holidays_set_actor/i, 'holiday actor trigger must be replay-safe')
requireText(/create or replace function public\.seed_business_calendar_holidays_for_tenant/i, 'new tenants must receive the national calendar seed')
requireText(/create trigger seed_business_calendar_holidays_for_tenant/i, 'tenant calendar seed trigger is required')
requireText(/on conflict \(tenant_id, holiday_date\) do nothing/i, 'official seed must be idempotent')
requireText(/role::text in \('owner', 'admin', 'finance'\)/i, 'holiday writes must be role-restricted')

for (const tableName of [
  'cortex_conversations',
  'cortex_edges',
  'cortex_messages',
  'cortex_nodes',
  'cortex_provenance',
  'documents',
  'embeddings',
  'financial_sequences',
  'notification_deliveries',
  'notification_outbox',
  'po_line_items',
  'project_comments',
  'scope_items',
  'users',
  'vendors',
]) {
  requireText(new RegExp(`'${tableName}'`), `missing audit target: ${tableName}`)
}

forbidText(/\bdrop\s+(table|column|constraint|policy|trigger)\b/i, 'proposal must remain additive')
forbidText(/\btruncate\b/i, 'proposal must not truncate data')
forbidText(/\bdelete\s+from\b/i, 'proposal must not delete data')
forbidText(/\b(double precision|real|float[48]?)\b/i, 'proposal must not introduce floating-point fields')

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`)
  process.exitCode = 1
} else {
  console.log('PASS WO-02 SQL proposal: additive audit identity, coverage targets, RLS, seed idempotency, and no destructive operations')
}
