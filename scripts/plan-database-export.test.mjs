import assert from 'node:assert/strict'
import test from 'node:test'
import { planDatabaseExport } from './lib/database-export-plan.mjs'

const sessionUrl =
  'postgresql://postgres.aqqrtkmtcsfkbyyqxowv:secret@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'

test('blocks a transaction pooler URL for database dumps', () => {
  const report = planDatabaseExport({
    databaseUrl: sessionUrl.replace(':5432/', ':6543/'),
    availableCommands: { supabase: true, docker: true },
  })

  assert.equal(report.status, 'review_required')
  assert.equal(report.method, 'supabase-cli')
  assert.equal(report.connection.poolerMode, 'transaction')
  assert.match(report.blockers.join('\n'), /6543/)
  assert.equal(report.connection.passwordPresent, true)
})

test('accepts a session pooler with Supabase CLI and Docker', () => {
  const report = planDatabaseExport({
    databaseUrl: sessionUrl,
    availableCommands: { supabase: true, docker: true },
  })

  assert.equal(report.status, 'ready')
  assert.equal(report.method, 'supabase-cli')
  assert.deepEqual(report.blockers, [])
  assert.equal(report.connection.poolerMode, 'session')
  assert.equal(report.connection.port, 5432)
})

test('falls back to pg_dump when Docker is unavailable', () => {
  const report = planDatabaseExport({
    databaseUrl: sessionUrl,
    availableCommands: { pg_dump: true },
  })

  assert.equal(report.status, 'ready')
  assert.equal(report.method, 'pg_dump')
})

test('fails closed when no URL or dump tool is available', () => {
  const report = planDatabaseExport({ databaseUrl: '', availableCommands: {} })

  assert.equal(report.status, 'review_required')
  assert.equal(report.method, 'unavailable')
  assert.match(report.blockers.join('\n'), /DATABASE_URL is missing/)
  assert.match(report.blockers.join('\n'), /No supported database dump tool/)
})
