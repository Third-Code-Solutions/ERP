import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(
  resolve(
    __dirname,
    '../../../../supabase/migrations/20260817100000_harden_function_search_paths.sql'
  ),
  'utf8'
).toLowerCase()

describe('function search-path hardening migration', () => {
  it('pins every advisor-flagged function to an empty search path', () => {
    expect(migration).toMatch(
      /create or replace function public\.audit_entity_uuid\([\s\S]*?set search_path = ''\s*as \$\$/
    )
    expect(migration).toMatch(
      /create or replace function public\.takeoff_ai_draft_guard\(\)[\s\S]*?set search_path = ''\s*as \$\$/
    )
  })

  it('keeps the deterministic audit UUID and the AI-draft guard semantics', () => {
    expect(migration).toContain("select pg_catalog.md5('audit:' || p_entity_type || ':' || p_entity_key)::pg_catalog.uuid;")
    expect(migration).toContain("new.unit_rate_source <> 'dupa'")
    expect(migration).toContain('new.unit_cost_cents <> 0 or new.line_total_cents <> 0')
    expect(migration).toContain('begin;')
    expect(migration.trimEnd().endsWith('commit;')).toBe(true)
  })
})
