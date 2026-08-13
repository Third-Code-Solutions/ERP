#!/usr/bin/env node

/**
 * Static gate for the local-only WO-03/M-06 foundation migration.
 *
 * This is intentionally not a substitute for replaying SQL on a disposable
 * PostgreSQL 17 database. It prevents accidental process-step fabrication or
 * destructive promotion while that database/recovery environment is absent.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationPath = join(
  process.cwd(),
  'supabase',
  'migrations',
  '20260812160000_process_sla_engine_foundation.sql'
)
const sql = readFileSync(migrationPath, 'utf8')
const failures = []

function requireText(pattern, description) {
  if (!pattern.test(sql)) failures.push(description)
}

function forbidText(pattern, description) {
  if (pattern.test(sql)) failures.push(description)
}

requireText(/M-06\s*\/\s*WO-03/i, 'migration must identify M-06/WO-03')
requireText(/NO process_steps seed rows/i, 'migration must declare the no-fabricated-seed boundary')
requireText(/create type public\.process_clock_type/i, 'clock type enum is required')
requireText(/create type public\.process_clock_scope/i, 'clock scope enum is required')
requireText(/create table if not exists public\.process_steps/i, 'process_steps table is required')
requireText(/create table if not exists public\.task_instances/i, 'task_instances table is required')
requireText(/create table if not exists public\.sla_clocks/i, 'sla_clocks table is required')
requireText(/create table if not exists public\.approval_rules/i, 'approval_rules table is required')
requireText(/create table if not exists public\.approvals/i, 'approvals table is required')
requireText(/observe_mode boolean not null default true/i, 'observe mode must default on')
requireText(/clock_scope = 'external'[\s\S]*status <> 'escalated'/i, 'external clocks must never escalate')
requireText(/responsible_bu not like '%\?%'/i, 'unresolved process-step owners must be rejected')
requireText(/80%[\s\S]*100%[\s\S]*150%/i, 'threshold contract must document 80/100/150')
requireText(/to_regprocedure\('public\.audit_log_trigger\(\)'\)/i, 'audit trigger dependency must be checked')
requireText(/to_regclass\('public\.business_calendar_holidays'\)/i, 'tenant business calendar dependency must be checked')
requireText(/create trigger %I after insert or update or delete/i, 'all M-06 tables must receive mutation audit triggers')
requireText(/enable row level security/i, 'M-06 tables must enable RLS')
requireText(/tenant_id = public\.auth_tenant_id\(\)/i, 'RLS must bind rows to the authenticated tenant')
requireText(/grant select on table public\.%I to authenticated/i, 'authenticated clients must receive read-only table grants')
requireText(/grant all privileges on table public\.%I to service_role/i, 'server workflows must retain service-role table grants')
requireText(/foreign key \(tenant_id, process_step_id\)/i, 'task step reference must preserve tenant identity')
requireText(/foreign key \(tenant_id, task_instance_id\)/i, 'SLA task reference must preserve tenant identity')
requireText(/foreign key \(tenant_id, approval_rule_id\)/i, 'approval rule reference must preserve tenant identity')
requireText(/amount_band_low bigint/i, 'approval low band must be integer centavos')
requireText(/amount_band_high bigint/i, 'approval high band must be integer centavos')

// No source deck means no defensible INSERT can appear here.
forbidText(/insert\s+into\s+public\.process_steps/i, 'migration must not fabricate process-step seed rows')
forbidText(/grant select, insert, update on table public\.%I to authenticated/i, 'authenticated clients must not receive unrestricted M-06 mutation grants')
forbidText(/process_sla_set_updated_at\(\)[\s\S]*?security definer/i, 'timestamp trigger must not add an unnecessary SECURITY DEFINER function')
forbidText(/\b(drop\s+(table|column|constraint)|truncate|delete\s+from)\b/i, 'migration must remain additive')
forbidText(/\b(double precision|real|float[48]?)\b/i, 'migration must not introduce floating-point money')

if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL ${failure}`)
  process.exitCode = 1
} else {
  console.log(
    'PASS M-06 SQL proposal: tenant-scoped tables, thresholds, observe mode, external-clock guard, audit hooks, RLS, and no fabricated seed'
  )
}
