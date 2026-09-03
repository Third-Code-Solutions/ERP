import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

test('production recovery proof is one-shot and follows magic-link role QA', async () => {
  const workflow = await readFile(
    resolve('.github/workflows/deploy-production.yml'),
    'utf8'
  )
  const recoverySpec = await readFile(
    resolve('apps/web/e2e/production-password-recovery.spec.ts'),
    'utf8'
  )

  assert.match(
    recoverySpec,
    /test\.describe\.configure\(\{ retries: 0 \}\)/
  )
  assert.doesNotMatch(
    workflow,
    /Run authenticated production E2E[\s\S]*?e2e\/production-password-recovery\.spec\.ts[\s\S]*?assert-playwright-no-skips/
  )
  assert.match(
    workflow,
    /Run authenticated production E2E[\s\S]*?Verify production password recovery request[\s\S]*?Verify live profile password rotation and restoration/
  )
  assert.match(
    workflow,
    /playwright test e2e\/production-password-recovery\.spec\.ts[\s\S]*?--retries=0/
  )
})
