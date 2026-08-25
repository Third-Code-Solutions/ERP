import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const source = await readFile(
  new URL('./purge-production-e2e-data.mjs', import.meta.url),
  'utf8',
)

test('production E2E purge has a fixed exact-tenant and explicit-confirmation gate', () => {
  assert.match(source, /buildops-e2e/)
  assert.match(source, /e2e-qa-20260513-foreign/)
  assert.match(source, /PURGE_E2E_PRODUCTION_DATA/)
  assert.match(source, /Purge backup safety gate requires the live tenant catalog/)
})

test('production E2E purge removes physical documents before tenant rows and redacts artifacts', () => {
  assert.match(source, /await deleteStorageObjects\(storage, manifest\)/)
  assert.match(source, /await deleteAuthUsers\(supabase, manifest\._userIds\)/)
  assert.match(source, /delete from public\.tenants where id = any/)
  assert.match(source, /Paths and user IDs are used only in-memory/)
  assert.match(source, /await verifyPostPurge\(sql, storage, manifest\._tenantIds\)/)
})
