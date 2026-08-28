import assert from 'node:assert/strict'
import { mkdtemp, readFile, readFile as readFileBytes, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const workflowPath = resolve('.github/workflows/ci-linux-runner-smoke.yml')
const hostScriptPath = resolve('scripts/ci/invoke-isolated-linux-runner-host.ps1')

test('the Linux smoke workflow is manual, ERP-only, group-restricted, and non-secret', async () => {
  const workflow = await readFile(workflowPath, 'utf8')

  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m)
  assert.doesNotMatch(workflow, /pull_request|pull_request_target|workflow_run|push:/)
  assert.match(workflow, /github\.repository == 'Third-Code-Solutions\/ERP'/)
  assert.match(workflow, /github\.repository_owner == 'Third-Code-Solutions'/)
  assert.match(workflow, /github\.ref == 'refs\/heads\/codex\/release-candidate-trial-port'/)
  assert.match(workflow, /github\.actor == 'kurtgav'/)
  assert.match(workflow, /github\.triggering_actor == 'kurtgav'/)
  assert.match(workflow, /group: erp-ci-isolated/)
  assert.match(workflow, /labels: \[self-hosted, Linux, X64, third-code-erp-ci-linux\]/)
  assert.doesNotMatch(workflow, /Default|Windows|third-code-erp-ci\]/)
  assert.doesNotMatch(workflow, /secrets\.|GITHUB_TOKEN|actions\/checkout|gh auth|supabase|snyk/i)
})

test('the Linux smoke workflow dynamically verifies Docker metadata, guest listeners, and exact cleanup', async () => {
  const workflow = await readFile(workflowPath, 'utf8')

  assert.match(workflow, /--publish 127\.0\.0\.1::80/)
  assert.match(workflow, /docker inspect --format '\{\{range \$containerPort, \$bindings := \.NetworkSettings\.Ports\}\}/)
  assert.match(workflow, /case "\$host_ip" in\n\s+127\.0\.0\.1\|::1/)
  assert.match(workflow, /ss --listening --tcp --numeric --no-header/)
  assert.match(workflow, /docker rm --force "\$container_name"/)
  assert.match(workflow, /docker network rm "\$network_name"/)
  assert.match(workflow, /trap cleanup EXIT/)
  assert.doesNotMatch(workflow, /docker (system |volume |network )?prune/)
})

test('the elevated host helper is exact-target-only and fails rather than sharing a WinNAT or deleting broad resources', async () => {
  const hostScript = await readFile(hostScriptPath, 'utf8')

  assert.match(hostScript, /ValidateSet\('Preflight', 'Rollback', 'LedgerRegression'\)/)
  assert.match(hostScript, /\$RunRoot = 'D:\\third-code-erp-isolated-runner'/)
  assert.match(hostScript, /Assert-Administrator/)
  assert.match(hostScript, /WinNAT already has a configured NAT; this stage refuses to alter or share it/)
  assert.match(hostScript, /Remove-NetNat -Name \$targets\.NatName -Confirm:\$false/)
  assert.match(hostScript, /Remove-VM -Name \$targets\.VmName -Force/)
  assert.match(hostScript, /Remove-VMSwitch -Name \$targets\.SwitchName -Force/)
  assert.doesNotMatch(hostScript, /Get-NetNat\s*\|\s*Remove-NetNat/)
  assert.doesNotMatch(hostScript, /Get-NetNat\s*\|\s*Remove-NetNat|docker (system )?prune|wsl --unregister/i)
})

function runProcess(command, args) {
  return spawnSync(command, args, { encoding: 'utf8' })
}

function resolvePwsh() {
  if (process.platform !== 'win32') return null

  const result = runProcess('powershell.exe', [
    '-NoProfile',
    '-Command',
    '(Get-Command pwsh.exe -ErrorAction SilentlyContinue).Source',
  ])
  if (result.status !== 0) return null

  const candidate = result.stdout.trim()
  return candidate.length > 0 ? candidate : null
}

test('the ledger writer round-trips BOM-less UTF-8 under every installed PowerShell engine', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('Windows PowerShell host regression runs only on Windows')
    return
  }

  const engines = [
    { name: 'Windows PowerShell 5.1', command: 'powershell.exe' },
    { name: 'pwsh', command: resolvePwsh() },
  ].filter((engine) => engine.command)
  assert.ok(engines.length > 0, 'a Windows PowerShell engine must be available')

  const artifactDirectory = await mkdtemp(join(tmpdir(), 'third-code-erp-ledger-regression-'))
  try {
    for (const engine of engines) {
      const ledgerPath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`)
      const result = runProcess(engine.command, [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        hostScriptPath,
        '-Mode',
        'LedgerRegression',
        '-RunIdentity',
        'third-code-erp-ci-ledger-regression',
        '-LedgerPath',
        ledgerPath,
      ])

      assert.equal(result.status, 0, `${engine.name} failed: ${result.stderr || result.stdout}`)
      const bytes = await readFileBytes(ledgerPath)
      assert.notDeepEqual(
        [...bytes.subarray(0, 3)],
        [0xef, 0xbb, 0xbf],
        `${engine.name} wrote a UTF-8 BOM`,
      )
      const ledger = JSON.parse(bytes.toString('utf8'))
      assert.equal(ledger.Mode, 'LedgerRegression')
      assert.equal(ledger.Outcome, 'PASS')
      assert.equal(ledger.Encoding, 'utf-8-no-bom')
    }
  } finally {
    await rm(artifactDirectory, { recursive: true, force: true })
  }
})
