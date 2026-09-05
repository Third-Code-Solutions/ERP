import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { assessDeployment, sourceSha, targets } from './deploy-railway-service.mjs'

const active = { status: 'SUCCESS', meta: { commitHash: 'a'.repeat(40), serviceManifest: { build: { builder: 'DOCKERFILE' } } } }
const skipped = { status: 'SKIPPED', meta: { serviceManifest: active.meta.serviceManifest } }

test('successful deployments and pending states are distinct', () => {
  assert.equal(assessDeployment({ status: 'SUCCESS' }), 'deployed')
  for (const status of ['INITIALIZING', 'QUEUED', 'BUILDING', 'DEPLOYING', 'WAITING']) assert.equal(assessDeployment({ status }), 'pending')
})
test('skipped is retained only with unchanged inputs and source-bound predecessor', () => {
  assert.equal(assessDeployment(skipped, active, true), 'retained-identical')
  assert.throws(() => assessDeployment(skipped, active, false), /changed container inputs/)
  assert.throws(() => assessDeployment(skipped, { status: 'SUCCESS' }, true), /source-bound/)
  assert.throws(() => assessDeployment(skipped, { ...active, status: 'REMOVED' }, true), /source-bound/)
})
test('configuration changes cannot pass through watch-path skipping', () => {
  for (const key of ['serviceManifest', 'fileServiceManifest', 'configFile', 'rootDirectory']) {
    assert.throws(() => assessDeployment({ ...skipped, meta: { ...skipped.meta, [key]: 'different' } }, active, true), /configuration differs/)
  }
})
test('failed, sleeping, removed, and unknown states fail closed', () => {
  for (const status of ['FAILED', 'CRASHED', 'REMOVED', 'REMOVING', 'SLEEPING', 'NEEDS_APPROVAL', 'UNKNOWN']) assert.throws(() => assessDeployment({ status }), /ended in/)
})
test('only exact source identities are accepted', () => {
  assert.equal(sourceSha(active), 'a'.repeat(40))
  assert.equal(sourceSha({ meta: { cliMessage: `release-sha:${'b'.repeat(40)};run:1` } }), 'b'.repeat(40))
  assert.equal(sourceSha({ meta: { commitHash: 'short-sha' } }), null)
  assert.equal(sourceSha({ meta: { cliMessage: 'arbitrary release description' } }), null)
})
test('API input comparison covers every Dockerfile copy source and CAD stays separate', () => {
  for (const path of ['apps/api', 'packages/ai', 'packages/config', 'packages/database', 'packages/shared-types', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json', '.npmrc', '.dockerignore']) assert.ok(targets.api.paths.includes(path))
  assert.deepEqual(targets.cad.paths, ['apps/workers/dxf-parser'])
  const dockerfile = readFileSync(new URL('../apps/api/Dockerfile', import.meta.url), 'utf8')
  for (const line of dockerfile.split('\n').filter((line) => line.startsWith('COPY ') && !line.includes('--from='))) {
    for (const source of line.trim().split(/\s+/).slice(1, -1)) {
      assert.ok(targets.api.paths.some((path) => source === path || source.startsWith(`${path}/`)), `Uncompared Dockerfile input: ${source}`)
    }
  }
})
