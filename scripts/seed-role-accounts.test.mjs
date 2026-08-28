import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

test('role seeding creates a hash-only invitation before its Auth API request', async () => {
  const source = await readFile(resolve('scripts/seed-role-accounts.mjs'), 'utf8')

  assert.match(source, /randomBytes\(32\)/)
  assert.match(source, /createHash\('sha256'\)/)
  assert.match(source, /tenant_invitation_intents/)
  assert.match(source, /provisioning_mode: 'tenant_invitation_v1'/)
  assert.match(source, /tenant_invitation_token_v1: invitation\.token/)
  assert.doesNotMatch(source, /app_metadata/)
  assert.doesNotMatch(source, /tenant_invite_v1/)
})
