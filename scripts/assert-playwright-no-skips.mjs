#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const reportPath = resolve(process.argv[2] ?? '')
const label = process.argv[3]?.trim() || 'Playwright tests'

if (!process.argv[2] || !existsSync(reportPath)) {
  console.error('Usage: node scripts/assert-playwright-no-skips.mjs <playwright-json-report> [label]')
  process.exit(1)
}

let report
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'))
} catch (error) {
  console.error(
    `FAIL cannot parse Playwright JSON report: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
}

const stats = report?.stats
if (!stats || typeof stats !== 'object') {
  console.error(`FAIL ${label}: report.stats is missing`)
  process.exit(1)
}

const expected = Number(stats.expected)
const skipped = Number(stats.skipped)
const unexpected = Number(stats.unexpected)
const flaky = Number(stats.flaky)
const errorCount = Array.isArray(report.errors) ? report.errors.length : Number.NaN
const values = [expected, skipped, unexpected, flaky, errorCount]

if (values.some((value) => !Number.isInteger(value) || value < 0)) {
  console.error(`FAIL ${label}: report statistics are invalid`)
  process.exit(1)
}

const problems = []
if (expected === 0) problems.push('zero tests executed')
if (skipped !== 0) problems.push(`${skipped} skipped`)
if (unexpected !== 0) problems.push(`${unexpected} unexpected`)
if (flaky !== 0) problems.push(`${flaky} flaky`)
if (errorCount !== 0) problems.push(`${errorCount} report errors`)

if (problems.length > 0) {
  console.error(`FAIL ${label}: ${problems.join(', ')}`)
  process.exit(1)
}

console.log(`PASS ${label} executed without skips (${expected}/${expected})`)
