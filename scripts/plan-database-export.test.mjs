import assert from 'node:assert/strict'
import test from 'node:test'
import { planDatabaseExport } from './lib/database-export-plan.mjs'

const sessionUrl =
  'postgresql://postgres.aqqrtkmtcsfkbyyqxowv:secret@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres'

test('blocks a transaction pooler URL for database dumps', () => {
  const report = planDatabaseExport({
    databaseUrl: sessionUrl.replace(':5432/', ':6543/'),
    availableCommands: {
      supabase: true,
      docker: true,
      pg_dump: true,
      pg_dumpall: true,
      pgDumpMajor: 17,
    },
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
    availableCommands: {
      pg_dump: true,
      pg_dumpall: true,
      pgDumpMajor: 17,
    },
  })

  assert.equal(report.status, 'ready')
  assert.equal(report.method, 'pg_dump')
  assert.equal(report.tool.postgresMajor, 17)
  assert.match(report.commands.roles, /pg_dumpall/)
  assert.match(report.commands.schema, /section=pre-data/)
  assert.match(report.commands.postData, /section=post-data/)
  assert.doesNotMatch(report.commands.postData, /no-privileges/)
})

test('rejects a pg_dump major that does not match PostgreSQL 17', () => {
  const report = planDatabaseExport({
    databaseUrl: sessionUrl,
    availableCommands: {
      pg_dump: true,
      pg_dumpall: true,
      pgDumpMajor: 16,
    },
  })

  assert.equal(report.status, 'review_required')
  assert.equal(report.method, 'unavailable')
  assert.match(report.blockers.join('\n'), /major 16/)
})

test('rejects pg_dump without pg_dumpall role export support', () => {
  const report = planDatabaseExport({
    databaseUrl: sessionUrl,
    availableCommands: { pg_dump: true, pgDumpMajor: 17 },
  })

  assert.equal(report.status, 'review_required')
  assert.match(report.blockers.join('\n'), /pg_dumpall is missing/)
})

test('fails closed when no URL or dump tool is available', () => {
  const report = planDatabaseExport({ databaseUrl: '', availableCommands: {} })

  assert.equal(report.status, 'review_required')
  assert.equal(report.method, 'unavailable')
  assert.match(report.blockers.join('\n'), /DATABASE_URL is missing/)
  assert.match(report.blockers.join('\n'), /No supported database dump tool/)
})
