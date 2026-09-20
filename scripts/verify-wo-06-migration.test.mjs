import test from 'node:test'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

test('WO-06 DUPA migration passes the static safety gate', () => {
  execFileSync(
    process.execPath,
    [join(process.cwd(), 'scripts', 'verify-wo-06-migration.mjs')],
    { cwd: process.cwd(), stdio: 'pipe' },
  )
})

test('DUPA child moves recompute both parents in deterministic lock order', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260921120000_dupa_child_move_recomputation.sql'),
    'utf8',
  )
  assert.match(sql, /create or replace function public\.dupa_recompute_from_child\(\)/u)
  assert.match(sql, /security definer\s+set search_path = public, pg_temp/u)
  assert.match(sql, /if tg_op = 'DELETE' then\s+perform public\.recompute_dupa_totals\(old\.dupa_id\);\s+return old;/u)
  assert.match(sql, /if tg_op = 'UPDATE' then\s+if old\.dupa_id is distinct from new\.dupa_id then/u)
  assert.match(sql, /if old\.dupa_id::text < new\.dupa_id::text then\s+perform public\.recompute_dupa_totals\(old\.dupa_id\);\s+perform public\.recompute_dupa_totals\(new\.dupa_id\);\s+else\s+perform public\.recompute_dupa_totals\(new\.dupa_id\);\s+perform public\.recompute_dupa_totals\(old\.dupa_id\);\s+end if;\s+return new;/u)
  assert.match(sql, /end if;\s+end if;\s+perform public\.recompute_dupa_totals\(new\.dupa_id\);/u)
  assert.match(sql, /revoke execute on function public\.dupa_recompute_from_child\(\) from public, anon, authenticated;/u)
  assert.match(sql, /grant execute on function public\.dupa_recompute_from_child\(\) to service_role;/u)
  assert.doesNotMatch(sql, /\b(?:drop|truncate|disable)\b/iu)
})
