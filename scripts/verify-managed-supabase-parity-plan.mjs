#!/usr/bin/env node

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateManagedSupabaseParityPlan } from './lib/managed-supabase-parity-plan.mjs'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(scriptDirectory, '..')
const planPath = join(
  repositoryRoot,
  'docs',
  'operations',
  'managed-supabase-parity-plan.json'
)
const migrationDirectory = join(repositoryRoot, 'supabase', 'migrations')

const plan = JSON.parse(readFileSync(planPath, 'utf8'))
const migrationFiles = readdirSync(migrationDirectory)
  .filter((file) => file.endsWith('.sql'))
  .sort()
const result = validateManagedSupabaseParityPlan(plan, migrationFiles)

if (!result.ok) {
  for (const error of result.errors) console.error(`FAIL ${error}`)
  process.exit(1)
}

console.log(
  `PASS managed Supabase parity manifest: ${result.appliedCount}/${result.sourceCount} applied, ${result.pendingCount} pending in ${result.batchCount} ordered review batches`
)
console.log(
  `PASS linear boundary: ${result.appliedHead} -> ${result.sourceHead}`
)
console.log('No database or provider state was queried or changed.')
