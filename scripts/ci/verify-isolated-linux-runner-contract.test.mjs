import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const workflowPath = resolve('.github/workflows/ci-linux-runner-smoke.yml')
const hostScriptPath = resolve('scripts/ci/invoke-isolated-linux-runner-host.ps1')
const runIdentity = 'third-code-erp-ci-ledger-regression'

function runProcess(command, args, input) {
  return spawnSync(command, args, { encoding: 'utf8', input })
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

function getPowerShellEngines() {
  if (process.platform !== 'win32') return []
  return [
    { name: 'Windows PowerShell 5.1', command: 'powershell.exe' },
    { name: 'pwsh', command: resolvePwsh() },
  ].filter((engine) => engine.command)
}

function runHostScript(engine, mode, ledgerPath) {
  return runProcess(engine.command, [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    hostScriptPath,
    '-Mode',
    mode,
    '-RunIdentity',
    runIdentity,
    '-LedgerPath',
    ledgerPath,
  ])
}

function provisionedLedger() {
  return {
    SchemaVersion: 2,
    Lifecycle: 'Provisioned',
    Outcome: 'PASS',
    RunIdentity: runIdentity,
    Resources: {
      Vm: { Name: runIdentity, Id: '11111111-1111-1111-1111-111111111111', Generation: 2 },
      Switch: { Name: `${runIdentity}-switch`, Id: '22222222-2222-2222-2222-222222222222', Type: 'Internal' },
      Nat: { Name: `${runIdentity}-nat`, Prefix: '172.31.202.0/24' },
      RunDirectory: {
        Path: `D:\\third-code-erp-isolated-runner\\${runIdentity}`,
        MarkerName: '.third-code-erp-isolated-runner-owner.json',
        MarkerSha256: 'a'.repeat(64),
      },
      FirewallRules: [
        { Name: 'rule-inbound', InstanceID: '33333333-3333-3333-3333-333333333333', DisplayName: `Third Code ERP ${runIdentity} - host-inbound-deny`, Direction: 'Inbound', Action: 'Block' },
        { Name: 'rule-private', InstanceID: '44444444-4444-4444-4444-444444444444', DisplayName: `Third Code ERP ${runIdentity} - host-private-deny`, Direction: 'Inbound', Action: 'Block' },
        { Name: 'rule-probe', InstanceID: '55555555-5555-5555-5555-555555555555', DisplayName: `Third Code ERP ${runIdentity} - guest-probe-deny`, Direction: 'Inbound', Action: 'Block' },
      ],
      PortProxies: [{ Protocol: 'v4tov4', ListenAddress: '127.0.0.1', ListenPort: 60123, ConnectAddress: '172.31.202.10', ConnectPort: 54321 }],
      DynamicPorts: [60123],
      FinalZeroResidue: true,
    },
  }
}

test('the Linux smoke workflow is manual, ERP-only, group-restricted, no-token, and non-secret', async () => {
  const workflow = await readFile(workflowPath, 'utf8')

  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/m)
  assert.doesNotMatch(workflow, /pull_request|pull_request_target|workflow_run|push:/)
  assert.match(workflow, /github\.repository == 'Third-Code-Solutions\/ERP'/)
  assert.match(workflow, /github\.repository_owner == 'Third-Code-Solutions'/)
  assert.match(workflow, /github\.ref == 'refs\/heads\/codex\/release-candidate-trial-port'/)
  assert.match(workflow, /github\.actor == 'kurtgav'/)
  assert.match(workflow, /github\.triggering_actor == 'kurtgav'/)
  assert.match(workflow, /permissions: \{\}/)
  assert.match(workflow, /group: erp-ci-isolated/)
  assert.match(workflow, /labels: \[self-hosted, Linux, X64, third-code-erp-ci-linux\]/)
  assert.doesNotMatch(workflow, /Default|Windows|third-code-erp-ci\]/)
  assert.doesNotMatch(workflow, /secrets\.|GITHUB_TOKEN|actions\/checkout|gh auth|supabase|snyk/i)
})

test('the Linux smoke workflow enforces guest-local Docker and preserves main failures through cleanup', async () => {
  const workflow = await readFile(workflowPath, 'utf8')

  assert.match(workflow, /test -z "\$\{DOCKER_CONTEXT:-\}"/)
  assert.match(workflow, /test "\$\(docker context show\)" = 'default'/)
  assert.match(workflow, /docker context inspect default --format '\{\{\.Endpoints\.docker\.Host\}\}'/)
  assert.match(workflow, /test -S \/var\/run\/docker\.sock/)
  assert.match(workflow, /id -nG \| tr ' ' '\\n' \| grep -qx 'docker'/)
  assert.match(workflow, /systemctl is-active --quiet docker/)
  assert.match(workflow, /findmnt --noheadings --output FSTYPE --target/)
  assert.match(workflow, /\| xargs\)" = 'ext4'/)
  assert.match(workflow, /--publish 127\.0\.0\.1::80/)
  assert.match(workflow, /docker inspect --format '\{\{range \$containerPort, \$bindings := \.NetworkSettings\.Ports\}\}/)
  assert.match(workflow, /case "\$host_ip" in\n\s+127\.0\.0\.1\|::1/)
  assert.match(workflow, /ss --listening --tcp --numeric --no-header/)
  assert.match(workflow, /# BEGIN cleanup-contract/)
  assert.match(workflow, /docker volume rm "\$volume_name"/)
  assert.match(workflow, /on_exit\(\) \{/)
  assert.match(workflow, /main_status="\$1"/)
  assert.match(workflow, /trap 'on_exit "\$\?"' EXIT/)
  assert.doesNotMatch(workflow, /trap cleanup EXIT|docker (system |volume |network )?prune/)
})

test('cleanup failure is observable and does not mask a nonzero main exit', async (t) => {
  const bash = runProcess('where.exe', ['bash.exe'])
  if (bash.status !== 0) {
    t.skip('bash is required for the workflow-shell behavioral regression')
    return
  }

  const workflow = await readFile(workflowPath, 'utf8')
  const cleanupContract = workflow.match(/# BEGIN cleanup-contract\r?\n([\s\S]*?)# END cleanup-contract/)
  assert.ok(cleanupContract, 'cleanup contract markers are required')
  const setup = `
set -u
run_identity='contract-test'
network_name="\${run_identity}-network"
container_name="\${run_identity}-nginx"
volume_name="\${run_identity}-volume"
work_root="$(mktemp -d)"
work_directory="\${work_root}/\${run_identity}"
mkdir -p "\${work_directory}"
docker() {
  if [ "\${1:-}" = 'volume' ] && [ "\${2:-}" = 'rm' ] && [ "\${FORCE_CLEANUP_FAILURE:-0}" = '1' ]; then
    return 42
  fi
  return 0
}
${cleanupContract[1]}
`

  const mainFailure = runProcess('bash.exe', ['-s'], `${setup}\non_exit 7`)
  assert.equal(mainFailure.status, 7, mainFailure.stderr || mainFailure.stdout)

  const cleanupFailure = runProcess('bash.exe', ['-s'], `${setup}\nFORCE_CLEANUP_FAILURE=1\non_exit 0`)
  assert.equal(cleanupFailure.status, 1, cleanupFailure.stderr || cleanupFailure.stdout)
})

test('the host helper records structured containment evidence and has no wildcard rollback', async () => {
  const hostScript = await readFile(hostScriptPath, 'utf8')

  assert.match(hostScript, /ValidateSet\('Preflight', 'Rollback', 'LedgerRegression', 'RollbackPlanRegression'\)/)
  assert.match(hostScript, /\$RunRoot = 'D:\\third-code-erp-isolated-runner'/)
  assert.match(hostScript, /Get-PortProxyEntries/)
  assert.match(hostScript, /ConvertTo-PortProxyEntries/)
  assert.match(hostScript, /Get-HostListeners/)
  assert.match(hostScript, /Get-NetFirewallProfile/)
  assert.match(hostScript, /Get-NetFirewallHyperVProfile/)
  assert.match(hostScript, /TargetVolumes/)
  assert.match(hostScript, /Assert-NoHostExposureForPorts/)
  assert.match(hostScript, /Assert-RunDirectoryOwned/)
  assert.match(hostScript, /Remove-ExactFirewallRule/)
  assert.match(hostScript, /Remove-ExactPortProxy/)
  assert.match(hostScript, /Rollback accepts only a successful SchemaVersion 2 Provisioned ledger/)
  assert.match(hostScript, /Remove-NetFirewallRule -Name \$FirewallRule\.Name/)
  assert.doesNotMatch(hostScript, /FirewallPrefix|Get-NetFirewallRule\s+-DisplayName\s+"[^"\n]*\*"|Remove-NetFirewallRule\s*$/m)
  assert.doesNotMatch(hostScript, /Get-NetNat\s*\|\s*Remove-NetNat|docker (system )?prune|wsl --unregister/i)
})

test('the ledger writer round-trips BOM-less UTF-8 under every installed PowerShell engine', async (t) => {
  const engines = getPowerShellEngines()
  if (engines.length === 0) {
    t.skip('Windows PowerShell host regression runs only on Windows')
    return
  }

  const artifactDirectory = await mkdtemp(join(tmpdir(), 'third-code-erp-ledger-regression-'))
  try {
    for (const engine of engines) {
      const ledgerPath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`)
      const result = runHostScript(engine, 'LedgerRegression', ledgerPath)

      assert.equal(result.status, 0, `${engine.name} failed: ${result.stderr || result.stdout}`)
      const bytes = await readFile(ledgerPath)
      assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], `${engine.name} wrote a UTF-8 BOM`)
      const ledger = JSON.parse(bytes.toString('utf8'))
      assert.equal(ledger.Mode, 'LedgerRegression')
      assert.equal(ledger.Outcome, 'PASS')
      assert.equal(ledger.Encoding, 'utf-8-no-bom')
    }
  } finally {
    await rm(artifactDirectory, { recursive: true, force: true })
  }
})

test('rollback planning accepts only exact Provisioned ledger identities and rejects a preflight ledger', async (t) => {
  const engines = getPowerShellEngines()
  if (engines.length === 0) {
    t.skip('Windows PowerShell host regression runs only on Windows')
    return
  }

  const artifactDirectory = await mkdtemp(join(tmpdir(), 'third-code-erp-rollback-ledger-'))
  try {
    for (const engine of engines) {
      const validPath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-valid.json`)
      await writeFile(validPath, JSON.stringify(provisionedLedger()), 'utf8')
      const valid = runHostScript(engine, 'RollbackPlanRegression', validPath)
      assert.equal(valid.status, 0, `${engine.name} valid ledger failed: ${valid.stderr || valid.stdout}`)

      const rejectedLedger = provisionedLedger()
      rejectedLedger.Lifecycle = 'Preflight'
      const rejectedPath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-rejected.json`)
      await writeFile(rejectedPath, JSON.stringify(rejectedLedger), 'utf8')
      const rejected = runHostScript(engine, 'RollbackPlanRegression', rejectedPath)
      assert.notEqual(rejected.status, 0, `${engine.name} accepted a non-Provisioned rollback ledger`)

      const residueLedger = provisionedLedger()
      residueLedger.Resources.FinalZeroResidue = false
      const residuePath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-residue.json`)
      await writeFile(residuePath, JSON.stringify(residueLedger), 'utf8')
      const residue = runHostScript(engine, 'RollbackPlanRegression', residuePath)
      assert.notEqual(residue.status, 0, `${engine.name} accepted a ledger without final zero-residue attestation`)

      const foreignPortProxyLedger = provisionedLedger()
      foreignPortProxyLedger.Resources.PortProxies[0].ConnectAddress = '192.0.2.17'
      const foreignPortProxyPath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-foreign-portproxy.json`)
      await writeFile(foreignPortProxyPath, JSON.stringify(foreignPortProxyLedger), 'utf8')
      const foreignPortProxy = runHostScript(engine, 'RollbackPlanRegression', foreignPortProxyPath)
      assert.notEqual(foreignPortProxy.status, 0, `${engine.name} accepted a rollback port-proxy outside the guest target`)
    }
  } finally {
    await rm(artifactDirectory, { recursive: true, force: true })
  }
})
