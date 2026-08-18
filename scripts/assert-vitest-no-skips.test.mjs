import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, test } from 'node:test'

const temporaryDirectories = []
const script = resolve('scripts/assert-vitest-no-skips.mjs')

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

async function reportFile(report) {
  const directory = await mkdtemp(join(tmpdir(), 'third-code-erp-vitest-'))
  temporaryDirectories.push(directory)
  const path = join(directory, 'report.json')
  await writeFile(path, JSON.stringify(report), 'utf8')
  return path
}

function run(reportPath, label) {
  return spawnSync(process.execPath, [script, reportPath, label], {
    encoding: 'utf8',
  })
}

test('passes a fully executed named suite', async () => {
  const path = await reportFile({
    success: true,
    numTotalTests: 2,
    numPassedTests: 2,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
  })

  const result = run(path, 'API integration tests')

  assert.equal(result.status, 0)
  assert.match(result.stdout, /PASS API integration tests executed without skips \(2\/2\)/)
})

test('fails a named suite when Vitest reports pending work', async () => {
  const path = await reportFile({
    success: true,
    numTotalTests: 2,
    numPassedTests: 1,
    numFailedTests: 0,
    numPendingTests: 1,
    numTodoTests: 0,
  })

  const result = run(path, 'API integration tests')

  assert.equal(result.status, 1)
  assert.match(result.stderr, /FAIL API integration tests: 1 skipped\/pending, passed 1 of 2/)
})
