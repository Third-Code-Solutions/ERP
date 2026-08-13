#!/usr/bin/env node

/**
 * Read-only release-source identity gate.
 *
 * A production release must use one clean commit and one migration set. This
 * script never fetches, merges, stages, commits, pushes, or changes provider
 * state; it compares the current checkout with locally available origin/main.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { compareReleaseSource } from './lib/release-source.mjs'

const repoRoot = process.cwd()

function git(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function migrationNames(ref) {
  const tree = git(['ls-tree', '-r', '--name-only', ref, '--', 'supabase/migrations'])
  return tree
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((path) => path.endsWith('.sql'))
    .map((path) => path.slice(path.lastIndexOf('/') + 1))
    .sort()
}

let report
try {
  const workingTree = git(['status', '--porcelain'])
  const localMigrations = readdirSync(join(repoRoot, 'supabase', 'migrations'))
    .filter((name) => name.endsWith('.sql'))
    .sort()
  const originMigrations = migrationNames('origin/main')
  report = compareReleaseSource({
    workingTreeEntries: workingTree ? workingTree.split(/\r?\n/) : [],
    head: git(['rev-parse', 'HEAD']),
    originMain: git(['rev-parse', 'origin/main']),
    localMigrations,
    originMigrations,
  })
} catch (error) {
  console.error(
    `BLOCKED release source inspection failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  )
  process.exit(2)
}

console.log(`Release source: ${report.passed ? 'PASS' : 'BLOCKED'}`)
console.log(
  `Working tree: ${report.workingTree.clean ? 'clean' : `${report.workingTree.changedEntryCount} changed entries`}`
)
console.log(
  `Commits: HEAD=${report.commits.head}; origin/main=${report.commits.originMain}; exact=${report.commits.exactMatch}`
)
console.log(
  `Migrations: local=${report.migrations.localCount}; origin/main=${report.migrations.originCount}; exact=${report.migrations.exactMatch}`
)
if (report.migrations.localOnly.length > 0) {
  console.log(`Local-only migrations: ${report.migrations.localOnly.join(', ')}`)
}
if (report.migrations.originOnly.length > 0) {
  console.log(`Provider-only migrations: ${report.migrations.originOnly.join(', ')}`)
}
for (const blocker of report.blockers) console.log(`- ${blocker}`)

if (!report.passed) process.exitCode = 1
