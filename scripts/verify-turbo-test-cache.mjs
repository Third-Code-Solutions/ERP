#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const requiredTestEnv = [
  'DATABASE_URL',
  'DATABASE_HARDENING_EXPECTED',
  'DATABASE_ACCOUNTING_EXPECTED',
  'DATABASE_RECEIVABLES_EXPECTED',
  'DATABASE_PAYABLES_EXPECTED',
  'DATABASE_CASH_EXPECTED',
  'DATABASE_RECONCILIATION_EXPECTED',
  'DATABASE_INVENTORY_EXPECTED',
  'DATABASE_BUDGET_EXPECTED',
  'DATABASE_STOCK_MOVEMENT_EXPECTED',
  'ERP_API_INTEGRATION_EXPECTED',
  'REDIS_URL',
  'ERP_REDIS_RESTART_EXPECTED',
  'ERP_REDIS_TEST_DISTRIBUTION',
]

export function readTurboTestEnv(
  repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
) {
  const turbo =
    typeof repositoryRoot === 'object'
      ? repositoryRoot
      : JSON.parse(readFileSync(resolve(repositoryRoot, 'turbo.json'), 'utf8'))
  return turbo.tasks?.test?.env ?? []
}

export function verifyTurboTestEnv(repositoryRoot) {
  const configured = new Set(readTurboTestEnv(repositoryRoot))
  const missing = requiredTestEnv.filter((name) => !configured.has(name))
  return {
    status: missing.length === 0 ? 'clear' : 'review_required',
    missing,
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const report = verifyTurboTestEnv()
  if (report.status !== 'clear') {
    console.error(
      `FAIL Turbo test cache env contract: missing ${report.missing.join(', ')}`
    )
    process.exit(1)
  }
  console.log(
    `PASS Turbo test cache env contract (${requiredTestEnv.length} variables)`
  )
}
