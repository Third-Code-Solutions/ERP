import assert from 'node:assert/strict'
import test from 'node:test'
import { installationTargets, databaseTargets } from './lib/installation-targets.mjs'

const ref = 'a'.repeat(20)
const uuid = '11111111-1111-4111-8111-111111111111'
const environment = () => ({
  SUPABASE_PROJECT_REF: ref, NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  RAILWAY_PROJECT_ID: uuid, RAILWAY_ENVIRONMENT_ID: uuid, RAILWAY_API_SERVICE_ID: uuid, RAILWAY_CAD_SERVICE_ID: uuid,
  ERP_CORE_API_URL: 'https://api.example.test', CAD_WORKER_URL: 'https://cad.example.test', PRODUCTION_URL: 'https://erp.example.test',
  VERCEL_SCOPE: 'team_fixture', VERCEL_PROJECT_ID: 'prj_fixture', VERCEL_PROJECT_NAME: 'fixture-erp',
  SUPABASE_MIGRATION_DATABASE_URL: `postgresql://postgres.${ref}:fixture@aws-0.pooler.supabase.com:5432/postgres`,
  PRODUCTION_DATABASE_URL: `postgresql://verifier.${ref}:fixture@aws-0.pooler.supabase.com:5432/postgres`,
  RUNTIME_DATABASE_URL: `postgresql://runtime.${ref}:fixture@aws-0.pooler.supabase.com:6543/postgres`,
})

test('accepts explicit independent installation and separate roles', () => {
  const env = environment()
  assert.equal(installationTargets(env).webOrigin, env.PRODUCTION_URL)
  assert.equal(databaseTargets(env, ref).RUNTIME_DATABASE_URL.role, 'runtime')
})
test('every target is mandatory; no seller defaults', () => {
  for (const key of Object.keys(environment()).filter(key => !key.endsWith('DATABASE_URL'))) {
    const env = environment()
    delete env[key]
    assert.throws(() => installationTargets(env), new RegExp(key))
  }
})
test('rejects foreign project, unsafe origin and reused credentials', () => {
  assert.throws(() => installationTargets({ ...environment(), NEXT_PUBLIC_SUPABASE_URL: 'https://other.supabase.co' }), /does not match/)
  for (const value of ['http://erp.example.test', 'https://user:secret@erp.example.test', 'https://erp.example.test/path', 'https://erp.example.test?token=secret']) {
    assert.throws(() => installationTargets({ ...environment(), PRODUCTION_URL: value }), /HTTPS origin/)
  }
  const env = environment()
  assert.throws(() => databaseTargets({ ...env, RUNTIME_DATABASE_URL: env.PRODUCTION_DATABASE_URL }, ref), /distinct/)
  assert.throws(() => databaseTargets({ ...env, RUNTIME_DATABASE_URL: env.RUNTIME_DATABASE_URL.replace(ref, 'b'.repeat(20)) }, ref), /exact Supabase/)
  assert.throws(() => databaseTargets({ ...env, SUPABASE_MIGRATION_DATABASE_URL: env.SUPABASE_MIGRATION_DATABASE_URL.replace('5432', '6543') }, ref), /exact Supabase/)
})
