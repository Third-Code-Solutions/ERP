import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

test('production provisions platform identity only after gates and before the Core deployment', async () => {
  const workflow = await readFile(resolve('.github/workflows/deploy-production.yml'), 'utf8')
  const marker = '      - name: Configure Core platform identity environment'
  const start = workflow.indexOf(marker)
  assert.ok(start > 0, 'platform identity environment must be provisioned')
  const end = workflow.indexOf('\n      - name:', start + marker.length)
  const step = workflow.slice(start, end)
  assert.ok(workflow.indexOf('Require current production migration ledger') < start)
  assert.ok(workflow.indexOf('Verify and bootstrap the sole platform owner') < start)
  assert.ok(workflow.indexOf('Deploy Nest API to exact Railway service') > start)
  assert.match(step, /set -euo pipefail/)
  assert.match(step, /printf '%s' "\$SUPABASE_SERVICE_ROLE_KEY" \|/)
  assert.match(step, /variable set SUPABASE_SERVICE_ROLE_KEY --stdin/)
  assert.doesNotMatch(step, /SUPABASE_SERVICE_ROLE_KEY=/)
  assert.equal((step.match(/--skip-deploys/g) ?? []).length, 2)
  assert.equal((step.match(/--project "\$RAILWAY_PROJECT_ID"/g) ?? []).length, 2)
  assert.equal((step.match(/--environment production --service "\$RAILWAY_API_SERVICE_ID"/g) ?? []).length, 2)
  assert.match(step, /ERP_WEB_BASE_URL=https:\/\/thirdcode-erp\.vercel\.app/)
  assert.doesNotMatch(step, /--json|set -x/)
})

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
