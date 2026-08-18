import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, test } from 'node:test'

const temporaryDirectories = []
const script = resolve('scripts/assert-playwright-no-skips.mjs')

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

async function reportFile(stats) {
  const directory = await mkdtemp(join(tmpdir(), 'third-code-erp-playwright-'))
  temporaryDirectories.push(directory)
  const path = join(directory, 'report.json')
  await writeFile(
    path,
    JSON.stringify({ config: {}, suites: [], errors: [], stats }),
    'utf8',
  )
  return path
}

function run(reportPath, label) {
  return spawnSync(process.execPath, [script, reportPath, label], {
    encoding: 'utf8',
  })
}

test('passes a fully executed named Playwright suite', async () => {
  const path = await reportFile({ expected: 2, skipped: 0, unexpected: 0, flaky: 0 })

  const result = run(path, 'authenticated production E2E')

  assert.equal(result.status, 0)
  assert.match(result.stdout, /PASS authenticated production E2E executed without skips \(2\/2\)/)
})

test('fails a named Playwright suite when tests were skipped', async () => {
  const path = await reportFile({ expected: 1, skipped: 1, unexpected: 0, flaky: 0 })

  const result = run(path, 'authenticated production E2E')

  assert.equal(result.status, 1)
  assert.match(result.stderr, /FAIL authenticated production E2E: 1 skipped/)
})
