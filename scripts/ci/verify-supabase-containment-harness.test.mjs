import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

test('contains the disposable stack before reset, status, and the Auth proof', async () => {
  const [workflow, startHarness] = await Promise.all([
    readFile(resolve('.github/workflows/ci-self-hosted.yml'), 'utf8'),
    readFile(resolve('scripts/ci/start-contained-local-supabase.ps1'), 'utf8'),
  ])

  const proofIndex = startHarness.indexOf('verify-supabase-containment.mjs')
  const resetIndex = startHarness.indexOf("Invoke-Supabase -ArgumentList @('db', 'reset'")
  assert.notEqual(proofIndex, -1)
  assert.notEqual(resetIndex, -1)
  assert.ok(proofIndex < resetIndex, 'the binding proof must precede the reset')
  assert.match(startHarness, /'start', '--workdir', \$runWorkdir, '--network-id', \$networkId/)
  assert.match(startHarness, /Get-NetTCPConnection -State Listen -LocalPort \$port/)
  assert.match(startHarness, /-not \[string\]::IsNullOrWhiteSpace\(\$_\)/)
  assert.match(startHarness, /RequiredHostPorts = @\(@\(\$topology\.ApiPort, \$topology\.DbPort\)/)
  assert.match(workflow, /start-contained-local-supabase\.ps1/)
  assert.match(workflow, /supabase status --output env --workdir \$workdir --network-id \$state\.Network\.Id/)
})

test('uses a run-unique project and targeted teardown without historical port allowlists', async () => {
  const [workflow, startHarness, stopHarness] = await Promise.all([
    readFile(resolve('.github/workflows/ci-self-hosted.yml'), 'utf8'),
    readFile(resolve('scripts/ci/start-contained-local-supabase.ps1'), 'utf8'),
    readFile(resolve('scripts/ci/stop-contained-local-supabase.ps1'), 'utf8'),
  ])

  assert.match(startHarness, /\$projectId = "erp-ci-\$runIdentity"/)
  assert.match(startHarness, /Disposable local Supabase project identity already exists; refusing to reuse it/)
  assert.match(startHarness, /\$sourceItem\.Name -eq '\.temp'/)
  assert.doesNotMatch(`${startHarness}\n${stopHarness}`, /\$matches\s*=/)
  assert.match(stopHarness, /--project-id', \$expectedProjectId/)
  assert.match(stopHarness, /--network-id', \$state\.Network\.Id/)
  assert.match(stopHarness, /docker rm \$containerId/)
  assert.match(workflow, /stop-contained-local-supabase\.ps1/)
  assert.doesNotMatch(`${workflow}\n${startHarness}\n${stopHarness}`, /supabase stop --all/)
  assert.doesNotMatch(`${workflow}\n${startHarness}\n${stopHarness}`, /docker (system |volume |network )?prune/)
  assert.doesNotMatch(workflow, /LocalPort 54321, 54322, 54323, 54324, 54327/)
})
