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
  const adapterId = '33333333-3333-3333-3333-333333333333'
  const switchName = `${runIdentity}-switch`
  const runRoot = `D:\\third-code-erp-isolated-runner\\${runIdentity}`
  const aclDestinations = [
    '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
    '169.254.0.0/16', '172.16.0.0/12', '172.31.202.0/24',
    '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16',
    '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24',
    '224.0.0.0/4', '240.0.0.0/4',
  ]
  return {
    SchemaVersion: 2,
    Lifecycle: 'Provisioned',
    Outcome: 'PASS',
    RunIdentity: runIdentity,
    Image: {
      CacheRoot: 'D:\\third-code-erp-isolated-runner-cache',
      CacheOwnershipScope: 'immutable-cache-not-run-root',
      CacheInventory: {
        Root: 'D:\\third-code-erp-isolated-runner-cache',
        OwnershipScope: 'immutable-cache-not-run-root',
        Archive: { Path: 'D:\\third-code-erp-isolated-runner-cache\\noble-server-cloudimg-amd64-azure.vhd.tar.gz', Name: 'noble-server-cloudimg-amd64-azure.vhd.tar.gz' },
      },
      ArchivePath: 'D:\\third-code-erp-isolated-runner-cache\\noble-server-cloudimg-amd64-azure.vhd.tar.gz',
      ArchiveName: 'noble-server-cloudimg-amd64-azure.vhd.tar.gz',
      Sha256: '843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22',
      Release: 'Ubuntu 24.04 LTS Noble 20260826',
    },
    Resources: {
      Vm: {
        Name: runIdentity, Id: vmId, Generation: 2,
        Path: `${runRoot}\\vm-config`, SnapshotFileLocation: `${runRoot}\\checkpoints`, SmartPagingFilePath: `${runRoot}\\smart-paging`,
      },
      Switch: { Name: switchName, Id: switchId, Type: 'Internal' },
      NetworkAdapter: {
        VmId: vmId, VmName: runIdentity, AdapterId: adapterId, AdapterName: 'Network Adapter', MacAddress: '001122334455',
        SwitchId: switchId, SwitchName: switchName, SwitchType: 'Internal', IsLegacy: false,
      },
      Nat: { Name: `${runIdentity}-nat`, Prefix: '172.31.202.0/24' },
      GatewayIp: { InterfaceAlias: `vEthernet (${switchName})`, IPAddress: '172.31.202.1', PrefixLength: 24 },
      RunDirectory: {
        Path: runRoot,
        MarkerName: '.third-code-erp-isolated-runner-owner.json',
        MarkerSha256: 'a'.repeat(64),
      },
      FirewallRules: [],
      FirewallEvidenceState: 'not-created',
      PortProxies: [],
      DynamicPorts: [60123],
      DynamicPortEvidenceState: 'host-reconciled',
      HostPortReconciliation: { Outcome: 'PASS', GuestDynamicPorts: [60123], ListenerBaseline: [], ListenerAfter: [], NatMappings: [], PortProxies: [] },
      Disks: [
        { Role: 'mutable-guest-os-vhdx', Path: `${runRoot}\\vhd\\ubuntu-os.vhdx`, InitialSha256: 'b'.repeat(64) },
        { Role: 'immutable-cidata-seed', Path: `${runRoot}\\vhd\\cidata.vhdx`, Sha256: 'c'.repeat(64) },
        { Role: 'mutable-guest-evidence-vhdx', Path: `${runRoot}\\vhd\\evidence.vhdx` },
      ],
      VmDisks: [
        { VmId: vmId, VmName: runIdentity, Path: `${runRoot}\\vhd\\ubuntu-os.vhdx`, ControllerType: 'IDE', ControllerNumber: 0, ControllerLocation: 0 },
        { VmId: vmId, VmName: runIdentity, Path: `${runRoot}\\vhd\\cidata.vhdx`, ControllerType: 'SCSI', ControllerNumber: 0, ControllerLocation: 0 },
        { VmId: vmId, VmName: runIdentity, Path: `${runRoot}\\vhd\\evidence.vhdx`, ControllerType: 'SCSI', ControllerNumber: 0, ControllerLocation: 1 },
      ],
      GuestEvidencePath: '/mnt/erp-evidence/precredential-containment.json',
      GuestEvidence: {
        Path: `${runRoot}\\vhd\\evidence.vhdx`, Sha256: 'e'.repeat(64), DynamicPorts: [60123],
        Evidence: {
          schema_version: 1, outcome: 'PASS', credential_stage: 'not-entered', runner_user: 'erpci', smoke_execution_user: 'erpci', smoke_execution_uid_nonroot: 'PASS', erpci_account: 'locked-nologin-no-sudo', root_account: 'locked', home_accounts: 'erpci-only', ssh: 'disabled-no-listener', authorized_keys: 'absent', docker_socket_residual: 'guest-root',
          docker_context: 'default', docker_socket: 'unix:///var/run/docker.sock', docker_data_filesystem: 'ext4', host_mounts: 'absent',
          gh_config: 'absent', ipv6: 'disabled', guest_firewall: 'deny-inbound-and-restricted-outbound', guest_loopback: 'PASS',
          host_probe: 'DENY', private_probe: 'DENY', public_dns: 'PASS', public_ntp: 'PASS', github_https: 'PASS', docker_published_bindings: ['127.0.0.1:60123'],
        },
      },
      NetworkAcls: [
        { VmId: vmId, VmName: runIdentity, SwitchId: switchId, AdapterId: adapterId, AdapterName: 'Network Adapter', Direction: 'Inbound', Action: 'Deny', LocalIPAddress: 'Any', RemoteIPAddress: 'Any', Protocol: 'Any', LocalPort: 'Any', RemotePort: 'Any', Weight: 100, Stateful: 'False' },
        ...aclDestinations.map((RemoteIPAddress, index) => ({
          VmId: vmId, VmName: runIdentity, SwitchId: switchId, AdapterId: adapterId, AdapterName: 'Network Adapter',
          Direction: 'Outbound', Action: 'Deny', LocalIPAddress: 'Any', RemoteIPAddress, Protocol: 'Any', LocalPort: 'Any', RemotePort: 'Any',
          Weight: 110 + index * 10, Stateful: 'False',
        })),
      ],
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

test('the host helper uses exact VM-NIC ACL/evidence-disk containment without global host firewall rules', async () => {
  const hostScript = await readFile(hostScriptPath, 'utf8')

  assert.match(hostScript, /ValidateSet\('Preflight', 'Provision', 'Rollback', 'LedgerRegression', 'RollbackPlanRegression', 'ProvisionPlanRegression', 'PortProxyRegression'\)/)
  assert.match(hostScript, /\$RunRoot = 'D:\\third-code-erp-isolated-runner'/)
  assert.match(hostScript, /\$ImageCacheRoot = 'D:\\third-code-erp-isolated-runner-cache'/)
  assert.match(hostScript, /immutable-cache-not-run-root/)
  assert.match(hostScript, /Get-PortProxyEntries/)
  assert.match(hostScript, /ConvertTo-PortProxyEntries/)
  assert.match(hostScript, /Invoke-PortProxyShow/)
  assert.match(hostScript, /\$netshExitCode = \$LASTEXITCODE/)
  assert.match(hostScript, /netsh interface portproxy show \$Protocol exited \$netshExitCode; preflight fails closed/)
  assert.match(hostScript, /netsh interface portproxy show \$protocol reported nonzero exit/)
  assert.match(hostScript, /AllowEmptyCollection\(\)/)
  assert.match(hostScript, /AllowEmptyString\(\)/)
  assert.match(hostScript, /netsh portproxy returned a malformed nonempty line; preflight fails closed/)
  assert.match(hostScript, /Global zero-proxy assertion accepted a nonempty parsed portproxy mapping/)
  assert.match(hostScript, /Get-HostListeners/)
  assert.match(hostScript, /Get-NetFirewallProfile/)
  assert.match(hostScript, /Get-NetFirewallHyperVProfile/)
  assert.match(hostScript, /Assert-NoHostExposureForPorts/)
  assert.match(hostScript, /Assert-RunDirectoryOwned/)
  assert.match(hostScript, /Get-RequiredVmNicAclDestinations/)
  assert.match(hostScript, /Get-RecordedVmNetworkAcls/)
  assert.match(hostScript, /Get-ExactVmNetworkAdapter/)
  assert.match(hostScript, /Get-VMNetworkAdapter -VMName \$Vm\.Name/)
  assert.match(hostScript, /VM NIC verification requires exactly one target VM network adapter/)
  assert.match(hostScript, /Get-RecordedVmHardDriveAttachments/)
  assert.match(hostScript, /Assert-ExactVmHardDriveAttachments/)
  assert.match(hostScript, /mutable-guest-os-vhdx/)
  assert.match(hostScript, /Mutable OS VHD must not be cleanup-authorized by content hash/)
  assert.match(hostScript, /Assert-HostReconcilesGuestDynamicPorts/)
  assert.match(hostScript, /Assert-LedgerVmNicAclShape/)
  assert.match(hostScript, /Assert-ExactVmNetworkAcls/)
  assert.match(hostScript, /Add-VMNetworkAdapterExtendedAcl/)
  assert.match(hostScript, /Get-VMNetworkAdapterExtendedAcl/)
  assert.match(hostScript, /New-EvidenceDisk/)
  assert.match(hostScript, /Read-GuestEvidenceDisk/)
  assert.match(hostScript, /Start-HostContainmentProbe/)
  assert.match(hostScript, /Stop-HostContainmentProbe/)
  assert.match(hostScript, /TcpListener/)
  assert.match(hostScript, /172\.31\.202\.1 29876/)
  assert.match(hostScript, /Guest did not power off within the bounded non-secret readiness window/)
  assert.match(hostScript, /FinalZeroResidue = \$true/)
  assert.match(hostScript, /Write-ProvisionStage/)
  assert.match(hostScript, /Invoke-StagedProvisionRollback/)
  assert.match(hostScript, /GatewayIp/)
  assert.match(hostScript, /Provisioned ledger must attest that no netsh port proxy exists/)
  assert.match(hostScript, /Assert-ProvisionAuthorization/)
  assert.match(hostScript, /I_ACKNOWLEDGE_ISOLATED_RUNNER_PROVISION/)
  assert.match(hostScript, /Ubuntu 24\.04 LTS Noble 20260826/)
  assert.match(hostScript, /MicrosoftUEFICertificateAuthority/)
  assert.match(hostScript, /New-CidataSeed/)
  assert.match(hostScript, /runuser -u erpci -- \/usr\/local\/sbin\/third-code-erp-guest-smoke/)
  assert.match(hostScript, /smoke_execution_user/)
  assert.match(hostScript, /ssh":"disabled-no-listener/)
  assert.match(hostScript, /docker_published_bindings/)
  assert.match(hostScript, /New-VMSwitch -Name \$targets\.SwitchName -SwitchType Internal/)
  assert.match(hostScript, /New-NetNat -Name \$targets\.NatName/)
  assert.match(hostScript, /New-VM -Name \$targets\.VmName -Generation 2/)
  assert.match(hostScript, /-Path \$targets\.VmConfigurationDirectory -SnapshotFileLocation \$targets\.CheckpointDirectory -SmartPagingFilePath \$targets\.SmartPagingDirectory/)
  assert.match(hostScript, /Add-VMHardDiskDrive -VMName \$targets\.VmName -Path \$targets\.EvidenceVhdxPath/)
  assert.match(hostScript, /Set-VMFirmware -VMName \$targets\.VmName -EnableSecureBoot On/)
  assert.match(hostScript, /no JIT configuration, runner registration, Auth, secret, or production action is present/i)
  assert.match(hostScript, /Rollback accepts only a successful SchemaVersion 2 Provisioned ledger/)
  assert.doesNotMatch(hostScript, /New-NetFirewallRule|Remove-NetFirewallRule|Get-NetFirewallRule/)
  assert.match(hostScript, /-Direction Inbound -Action Deny -LocalIPAddress Any -RemoteIPAddress Any -Protocol Any/)
  assert.doesNotMatch(hostScript, /Remove-ExactPortProxy|netsh interface portproxy delete|Get-NetNat\s*\|\s*Remove-NetNat|New-NetNatStaticMapping|docker (system )?prune|wsl --unregister/i)
  assert.doesNotMatch(hostScript, /gh api|config\.sh|run\.sh|JIT.*token/i)
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

test('the host helper treats empty netsh portproxy output as zero state and fails closed for nonempty output', async (t) => {
  const engines = getPowerShellEngines()
  if (engines.length === 0) {
    t.skip('Windows PowerShell host regression runs only on Windows')
    return
  }

  for (const engine of engines) {
    const result = runHostScript(engine, 'PortProxyRegression', join(tmpdir(), `third-code-erp-portproxy-${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`))
    assert.equal(result.status, 0, `${engine.name} portproxy regression failed: ${result.stderr || result.stdout}`)
    const regression = JSON.parse(result.stdout)
    assert.equal(regression.Outcome, 'PASS')
    assert.equal(regression.EmptyCollectionCount, 0)
    assert.equal(regression.EmptyStringCount, 0)
    assert.equal(regression.NullInputCount, 0)
    assert.equal(regression.ValidMappingCount, 1)
    assert.equal(regression.GlobalZeroProxyRejected, true)
    assert.equal(regression.MalformedRejected, true)
    assert.equal(regression.OutOfRangeRejected, true)
    assert.equal(regression.NonzeroBlankRejected, true)
    assert.equal(regression.NonzeroOutputRejected, true)
    assert.equal(regression.StderrRejected, true)
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

      const hostFirewallLedger = provisionedLedger()
      hostFirewallLedger.Resources.FirewallRules = [{ Name: 'forbidden-host-rule' }]
      const hostFirewallPath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-host-firewall.json`)
      await writeFile(hostFirewallPath, JSON.stringify(hostFirewallLedger), 'utf8')
      const hostFirewall = runHostScript(engine, 'RollbackPlanRegression', hostFirewallPath)
      assert.notEqual(hostFirewall.status, 0, `${engine.name} accepted a host firewall rule in the VM-NIC ACL design`)

      const unreconciledPortsLedger = provisionedLedger()
      unreconciledPortsLedger.Resources.DynamicPorts = [60124]
      const unreconciledPortsPath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-unreconciled-dynamic.json`)
      await writeFile(unreconciledPortsPath, JSON.stringify(unreconciledPortsLedger), 'utf8')
      const unreconciledPorts = runHostScript(engine, 'RollbackPlanRegression', unreconciledPortsPath)
      assert.notEqual(unreconciledPorts.status, 0, `${engine.name} accepted a guest dynamic-port union without exact host reconciliation`)

      const aclGapLedger = provisionedLedger()
      aclGapLedger.Resources.NetworkAcls.pop()
      const aclGapPath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-acl-gap.json`)
      await writeFile(aclGapPath, JSON.stringify(aclGapLedger), 'utf8')
      const aclGap = runHostScript(engine, 'RollbackPlanRegression', aclGapPath)
      assert.notEqual(aclGap.status, 0, `${engine.name} accepted an incomplete VM-NIC ACL set`)

      const pathEscapeLedger = provisionedLedger()
      pathEscapeLedger.Resources.Vm.Path = 'C:\\outside-run-root'
      const pathEscapePath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-path-escape.json`)
      await writeFile(pathEscapePath, JSON.stringify(pathEscapeLedger), 'utf8')
      const pathEscape = runHostScript(engine, 'RollbackPlanRegression', pathEscapePath)
      assert.notEqual(pathEscape.status, 0, `${engine.name} accepted a VM path outside the D: run root`)

      const missingEvidenceLedger = provisionedLedger()
      delete missingEvidenceLedger.Resources.GuestEvidence
      const missingEvidencePath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-missing-evidence.json`)
      await writeFile(missingEvidencePath, JSON.stringify(missingEvidenceLedger), 'utf8')
      const missingEvidence = runHostScript(engine, 'RollbackPlanRegression', missingEvidencePath)
      assert.notEqual(missingEvidence.status, 0, `${engine.name} accepted a Provisioned ledger without guest evidence`)

      const cacheRunRootConflict = provisionedLedger()
      cacheRunRootConflict.Image.CacheRoot = `D:\\third-code-erp-isolated-runner\\${runIdentity}`
      const cacheRunRootConflictPath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-cache-runroot-conflict.json`)
      await writeFile(cacheRunRootConflictPath, JSON.stringify(cacheRunRootConflict), 'utf8')
      const cacheRunRootConflictResult = runHostScript(engine, 'RollbackPlanRegression', cacheRunRootConflictPath)
      assert.notEqual(cacheRunRootConflictResult.status, 0, `${engine.name} accepted an image cache under the per-run vacant root`)

      const mutableVhdHashLedger = provisionedLedger()
      mutableVhdHashLedger.Resources.Disks[0].Sha256 = 'f'.repeat(64)
      const mutableVhdHashPath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-mutable-vhd-hash.json`)
      await writeFile(mutableVhdHashPath, JSON.stringify(mutableVhdHashLedger), 'utf8')
      const mutableVhdHash = runHostScript(engine, 'RollbackPlanRegression', mutableVhdHashPath)
      assert.notEqual(mutableVhdHash.status, 0, `${engine.name} accepted mutable OS VHD content hash as cleanup authority`)

      const spoofedNicLedger = provisionedLedger()
      spoofedNicLedger.Resources.NetworkAdapter.SwitchId = '44444444-4444-4444-4444-444444444444'
      const spoofedNicPath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-spoofed-nic.json`)
      await writeFile(spoofedNicPath, JSON.stringify(spoofedNicLedger), 'utf8')
      const spoofedNic = runHostScript(engine, 'RollbackPlanRegression', spoofedNicPath)
      assert.notEqual(spoofedNic.status, 0, `${engine.name} accepted a spoofed VM NIC/switch attachment`)

      const rootSmokeLedger = provisionedLedger()
      rootSmokeLedger.Resources.GuestEvidence.Evidence.smoke_execution_user = 'root'
      const rootSmokePath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-root-smoke.json`)
      await writeFile(rootSmokePath, JSON.stringify(rootSmokeLedger), 'utf8')
      const rootSmoke = runHostScript(engine, 'RollbackPlanRegression', rootSmokePath)
      assert.notEqual(rootSmoke.status, 0, `${engine.name} accepted a root-executed guest Docker smoke`)

      const listenerResidueLedger = provisionedLedger()
      listenerResidueLedger.Resources.HostPortReconciliation.ListenerAfter = [{ LocalAddress: '127.0.0.1', LocalPort: 60123, State: 'Listen', OwningProcess: 42 }]
      const listenerResiduePath = join(artifactDirectory, `${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-listener-residue.json`)
      await writeFile(listenerResiduePath, JSON.stringify(listenerResidueLedger), 'utf8')
      const listenerResidue = runHostScript(engine, 'RollbackPlanRegression', listenerResiduePath)
      assert.notEqual(listenerResidue.status, 0, `${engine.name} accepted unreconciled host listener evidence for a guest dynamic port`)
    }
  } finally {
    await rm(artifactDirectory, { recursive: true, force: true })
  }
})

test('the Provision plan regression exposes only a non-secret, review-gated design', async (t) => {
  const engines = getPowerShellEngines()
  if (engines.length === 0) {
    t.skip('Windows PowerShell host regression runs only on Windows')
    return
  }

  for (const engine of engines) {
    const result = runHostScript(engine, 'ProvisionPlanRegression', join(tmpdir(), `third-code-erp-provision-plan-${engine.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.json`))
    assert.equal(result.status, 0, `${engine.name} provision plan failed: ${result.stderr || result.stdout}`)
    const plan = JSON.parse(result.stdout)
    assert.equal(plan.Outcome, 'PASS')
    assert.equal(plan.Image.Release, 'Ubuntu 24.04 LTS Noble 20260826')
    assert.deepEqual(plan.Prohibited, ['JIT', 'runner-registration', 'secret', 'Auth', 'portproxy', 'static-NAT-mapping'])
    assert.deepEqual(plan.ProvisionStages, ['run-root-owned', 'os-vhdx-owned', 'cidata-owned', 'evidence-disk-owned', 'switch-owned', 'gateway-ip-owned', 'nat-owned', 'host-probe-owned', 'vm-owned', 'vm-nic-acls-owned', 'host-listener-baseline', 'guest-booted', 'guest-evidence-disk-returned', 'guest-evidence-read'])
    assert.deepEqual(plan.FailureAssertions, ['all-static-mappings-and-portproxies-empty-after-provision', 'guest-dynamic-port-union-reconciled-against-host-baseline-and-post-state', 'missing-or-invalid-evidence-fails', 'guest-timeout-fails', 'partial-stage-exact-rollback', 'mutable-vhd-cleanup-is-marker-path-and-live-attachment-not-content-hash', 'no-global-host-firewall'])
  }
})
