import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

test('production scheduling QA uses its own project and cannot omit the role matrix', async () => {
  const production = await readFile(resolve('.github/workflows/deploy-production.yml'), 'utf8')
  const ci = await readFile(resolve('.github/workflows/ci.yml'), 'utf8')
  const schedule = await readFile(resolve('apps/web/e2e/project-schedule-role-matrix.spec.ts'), 'utf8')
  assert.match(production, /E2E_PROJECT_ID: \$\{\{ vars\.PRODUCTION_E2E_PROJECT_ID \}\}/)
  assert.doesNotMatch(production, /vars\.E2E_PROJECT_ID/)
  assert.match(ci, /E2E_PROJECT_ID: \$\{\{ vars\.E2E_PROJECT_ID \}\}/)
  assert.match(production, /E2E_SCHEDULE_AUTH: "1"/)
  assert.match(production, /e2e\/project-schedule-role-matrix\.spec\.ts/)
  assert.match(production, /PRODUCTION_DATABASE_URL E2E_PROJECT_ID E2E_USER_EMAIL/)
  assert.match(schedule, /await assertAuthenticatedSmokeReady\(page, baseUrl!,/)
  assert.match(schedule, /name: 'Labour reconciliation', exact: true/)
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
  assert.match(
    workflow,
    /verify_password_rotation:[\s\S]*?type: boolean[\s\S]*?default: true/
  )
  assert.match(
    workflow,
    /Verify live profile password rotation and restoration[\s\S]*?if: \$\{\{ inputs\.verify_password_rotation \}\}/
  )
  assert.match(
    workflow,
    /Record excluded password rotation verification[\s\S]*?if: \$\{\{ always\(\) && !inputs\.verify_password_rotation \}\}[\s\S]*?Password recovery and all non-password production gates remained mandatory\./
  )
  assert.match(workflow, /e2e\/complete-route-audit\.spec\.ts/)
})
