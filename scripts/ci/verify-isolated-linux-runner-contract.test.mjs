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
  const vmId = '11111111-1111-1111-1111-111111111111'
  const switchId = '22222222-2222-2222-2222-222222222222'
  const switchName = `${runIdentity}-switch`
  const interfaceAlias = `vEthernet (${switchName})`
  const firewallRule = (name, instanceId, suffix) => ({
    Name: name,
    InstanceID: instanceId,
    DisplayName: `Third Code ERP ${runIdentity} - ${suffix}`,
    Direction: 'Inbound',
    Action: 'Block',
    Enabled: 'True',
    Profile: ['Private'],
    Scope: {
      PortFilter: { Protocol: 'TCP', LocalPort: '443', RemotePort: '443' },
      AddressFilter: { LocalAddress: '172.31.202.1', RemoteAddress: '172.31.202.10' },
      InterfaceFilter: { InterfaceAlias: interfaceAlias, InterfaceType: 'Wired' },
      Binding: { Kind: 'HostFirewallInterfaceFilter', SupportedFilter: 'Get-NetFirewallInterfaceFilter', VmId: vmId, SwitchId: switchId, InterfaceAlias: interfaceAlias },
    },
  })
  return {
    SchemaVersion: 2,
    Lifecycle: 'Provisioned',
    Outcome: 'PASS',
    RunIdentity: runIdentity,
    Resources: {
      Vm: { Name: runIdentity, Id: vmId, Generation: 2 },
      Switch: { Name: switchName, Id: switchId, Type: 'Internal' },
      Nat: { Name: `${runIdentity}-nat`, Prefix: '172.31.202.0/24' },
      RunDirectory: {
        Path: `D:\\third-code-erp-isolated-runner\\${runIdentity}`,
        MarkerName: '.third-code-erp-isolated-runner-owner.json',
        MarkerSha256: 'a'.repeat(64),
      },
      FirewallRules: [
        firewallRule('rule-inbound', '33333333-3333-3333-3333-333333333333', 'host-inbound-deny'),
        firewallRule('rule-private', '44444444-4444-4444-4444-444444444444', 'host-private-deny'),
        firewallRule('rule-probe', '55555555-5555-5555-5555-555555555555', 'guest-probe-deny'),
      ],
      PortProxies: [],
      DynamicPorts: [60123],
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
container_present=1
network_present=1
volume_present=1
docker() {
  case "\${1:-}:\${2:-}" in
    ps:*) [ "\${container_present}" -eq 1 ] && printf 'container-id\\n' ;;
    network:ls) [ "\${network_present}" -eq 1 ] && printf 'network-id\\n' ;;
    volume:ls) [ "\${volume_present}" -eq 1 ] && printf 'volume-name\\n' ;;
    rm:--force) container_present=0 ;;
    network:rm) network_present=0 ;;
    volume:rm)
      if [ "\${FORCE_CLEANUP_FAILURE:-0}" = '1' ]; then return 42; fi
      volume_present=0
      ;;
  esac
  return 0
}
${cleanupContract[1]}
`

  const mainFailure = runProcess('bash.exe', ['-s'], `${setup}\non_exit 7`)
  assert.equal(mainFailure.status, 7, mainFailure.stderr || mainFailure.stdout)

  const absentResourceFailure = runProcess('bash.exe', ['-s'], `${setup}\ncontainer_present=0; network_present=0; volume_present=0\non_exit 7`)
  assert.equal(absentResourceFailure.status, 7, absentResourceFailure.stderr || absentResourceFailure.stdout)

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
  assert.match(hostScript, /Get-FirewallRuleEvidence/)
  assert.match(hostScript, /Get-NetFirewallPortFilter/)
  assert.match(hostScript, /Get-NetFirewallAddressFilter/)
  assert.match(hostScript, /Get-NetFirewallInterfaceFilter/)
  assert.match(hostScript, /Assert-NarrowFirewallScope/)
  assert.match(hostScript, /Assert-FirewallRuleMatchesLedger/)
  assert.match(hostScript, /Remove-ExactFirewallRule/)
  assert.match(hostScript, /Provisioned ledger must attest that no netsh port proxy exists/)
  assert.match(hostScript, /Rollback accepts only a successful SchemaVersion 2 Provisioned ledger/)
  assert.match(hostScript, /Remove-NetFirewallRule -Name \$FirewallRule\.Name/)
  assert.doesNotMatch(hostScript, /FirewallPrefix|Get-NetFirewallRule\s+-DisplayName\s+"[^"\n]*\*"|Remove-NetFirewallRule\s*$/m)
  assert.doesNotMatch(hostScript, /Remove-ExactPortProxy|netsh interface portproxy delete|Get-NetNat\s*\|\s*Remove-NetNat|docker (system )?prune|wsl --unregister/i)
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

      const portProxyLedger = provisionedLedger()
      portProxyLedger.Resources.PortProxies = [{ Protocol: 'v4tov4', ListenAddress: '127.0.0.1', ListenPort: 60123, ConnectAddress: '172.31.202.10', ConnectPort: 54321 }]
      const portProxyPath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-portproxy.json`)
      await writeFile(portProxyPath, JSON.stringify(portProxyLedger), 'utf8')
      const portProxy = runHostScript(engine, 'RollbackPlanRegression', portProxyPath)
      assert.notEqual(portProxy.status, 0, `${engine.name} accepted a forbidden netsh port proxy`)

      const globalFirewallLedger = provisionedLedger()
      globalFirewallLedger.Resources.FirewallRules[0].Scope.AddressFilter.LocalAddress = 'Any'
      const globalFirewallPath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-global-firewall.json`)
      await writeFile(globalFirewallPath, JSON.stringify(globalFirewallLedger), 'utf8')
      const globalFirewall = runHostScript(engine, 'RollbackPlanRegression', globalFirewallPath)
      assert.notEqual(globalFirewall.status, 0, `${engine.name} accepted a globally scoped firewall rule`)
    }
  } finally {
    await rm(artifactDirectory, { recursive: true, force: true })
  }
})
