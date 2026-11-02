import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseBootstrapOptions } from './bootstrap-platform-owner.mjs'

const args = ['--user-id', '11111111-1111-4111-8111-111111111111', '--email', 'OWNER@company.example', '--reason', 'Approved first install', '--expected-host', 'localhost:55439', '--expected-database', 'synthetic']
const environment = { MIGRATION_DATABASE_URL: 'postgresql://operator:fixture@localhost:55439/synthetic' }

test('explicit owner/target previews by default; only --apply enables bootstrap', () => {
  assert.equal(parseBootstrapOptions(args, environment).apply, false)
  assert.equal(parseBootstrapOptions([...args, '--apply'], environment).apply, true)
  assert.equal(parseBootstrapOptions(args, environment).email, 'owner@company.example')
})
test('runtime credentials or environment owner emails cannot grant ownership', () => {
  assert.throws(() => parseBootstrapOptions(args, { DATABASE_URL: environment.MIGRATION_DATABASE_URL }), /MIGRATION_DATABASE_URL is required/)
  assert.throws(() => parseBootstrapOptions([], { ...environment, PLATFORM_OWNER_EMAIL: 'owner@company.example' }), /user-id/)
})
test('mismatched targets and invalid owner input fail before connecting', () => {
  assert.throws(() => parseBootstrapOptions(args, { MIGRATION_DATABASE_URL: environment.MIGRATION_DATABASE_URL.replace('/synthetic', '/different') }), /must match/)
  assert.throws(() => parseBootstrapOptions(args.map((v) => v === 'localhost:55439' ? 'other:55439' : v), environment), /must match/)
  assert.throws(() => parseBootstrapOptions(args.map((v) => v === '11111111-1111-4111-8111-111111111111' ? 'not-a-uuid' : v), environment), /UUID/)
  assert.throws(() => parseBootstrapOptions(args.map((v) => v === 'OWNER@company.example' ? 'not-an-email' : v), environment), /email/)
})
