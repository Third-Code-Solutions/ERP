import assert from 'node:assert/strict'
import test from 'node:test'
import { compareReleaseSource } from './release-source.mjs'

test('passes only for a clean exact source match', () => {
  const report = compareReleaseSource({
    workingTreeEntries: [],
    head: 'abc',
    originMain: 'abc',
    localMigrations: ['001.sql', '002.sql'],
    originMigrations: ['001.sql', '002.sql'],
  })
  assert.equal(report.passed, true)
  assert.deepEqual(report.blockers, [])
})

test('blocks dirty source and provider migration drift', () => {
  const report = compareReleaseSource({
    workingTreeEntries: ['M package.json'],
    head: 'local',
    originMain: 'remote',
    localMigrations: ['001.sql'],
    originMigrations: ['001.sql', '002.sql'],
  })
  assert.equal(report.passed, false)
  assert.deepEqual(report.blockers, [
    'working tree contains uncommitted changes',
    'HEAD does not equal provider-linked origin/main',
    'local and provider-linked migration sets differ',
  ])
  assert.deepEqual(report.migrations.originOnly, ['002.sql'])
})
