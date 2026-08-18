#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const reportPath = resolve(process.argv[2] ?? '')
const label = process.argv[3]?.trim() || 'Vitest tests'

if (!process.argv[2] || !existsSync(reportPath)) {
  console.error('Usage: node scripts/assert-vitest-no-skips.mjs <vitest-json-report> [label]')
  process.exit(1)
}

let report
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'))
} catch (error) {
  console.error(
    `FAIL cannot parse Vitest JSON report: ${error instanceof Error ? error.message : String(error)}`
  )
  process.exit(1)
}

const total = Number(report.numTotalTests ?? 0)
const passed = Number(report.numPassedTests ?? 0)
const failed = Number(report.numFailedTests ?? 0)
const pending = Number(report.numPendingTests ?? 0)
const todo = Number(report.numTodoTests ?? 0)

const problems = []
if (report.success !== true) problems.push('report.success is not true')
if (total === 0) problems.push('zero tests executed')
if (failed !== 0) problems.push(`${failed} failed`)
if (pending !== 0) problems.push(`${pending} skipped/pending`)
if (todo !== 0) problems.push(`${todo} todo`)
if (passed !== total) problems.push(`passed ${passed} of ${total}`)

if (problems.length > 0) {
  console.error(`FAIL ${label}: ${problems.join(', ')}`)
  process.exit(1)
}

console.log(`PASS ${label} executed without skips (${passed}/${total})`)
