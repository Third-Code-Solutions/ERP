[CmdletBinding()]
param(
  [ValidateSet('Preflight', 'Provision', 'Rollback', 'LedgerRegression', 'RollbackPlanRegression', 'ProvisionPlanRegression')]
  [string]$Mode = 'Preflight',

  [ValidatePattern('^third-code-erp-ci-[a-z0-9-]+$')]
  [string]$RunIdentity = 'third-code-erp-ci-20260828-stage2',

  [ValidatePattern('^[A-Za-z]:\\')]
  [string]$RunRoot = 'D:\third-code-erp-isolated-runner',

  [string]$LedgerPath = '',

  [string]$ImageArchivePath = '',

  [string]$ProvisionAuthorization = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($LedgerPath)) {
  $repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
  $LedgerPath = Join-Path $repositoryRoot "tmp\isolated-linux-runner-$RunIdentity-host-ledger.json"
}

$runRootPath = [IO.Path]::GetFullPath((Join-Path $RunRoot $RunIdentity))
$runRootPrefix = "$([IO.Path]::GetFullPath($RunRoot))$([IO.Path]::DirectorySeparatorChar)"
if (-not $runRootPath.StartsWith($runRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Run root escaped its dedicated base: $runRootPath"
}

$targets = [ordered]@{
  RunIdentity = $RunIdentity
  VmName = $RunIdentity
  SwitchName = "$RunIdentity-switch"
  NatName = "$RunIdentity-nat"
  NatPrefix = '172.31.202.0/24'
  Gateway = '172.31.202.1'
  GuestAddress = '172.31.202.10'
  RunRoot = $runRootPath
  MarkerName = '.third-code-erp-isolated-runner-owner.json'
  KnownSupabasePorts = @(54321, 54322, 54323, 54324, 54327)
  DockerOwnershipLabel = "com.thirdcode.erp.run=$RunIdentity"
  VhdDirectory = Join-Path $runRootPath 'vhd'
  EvidenceDirectory = Join-Path $runRootPath 'evidence'
  VmConfigurationDirectory = Join-Path $runRootPath 'vm-config'
  CheckpointDirectory = Join-Path $runRootPath 'checkpoints'
  SmartPagingDirectory = Join-Path $runRootPath 'smart-paging'
  ConfigDirectory = Join-Path $runRootPath 'config'
  OsVhdxPath = Join-Path $runRootPath 'vhd\ubuntu-os.vhdx'
  CidataVhdxPath = Join-Path $runRootPath 'vhd\cidata.vhdx'
  EvidenceVhdxPath = Join-Path $runRootPath 'vhd\evidence.vhdx'
  GuestEvidencePath = '/mnt/erp-evidence/precredential-containment.json'
}

$ubuntuImage = [ordered]@{
  Release = 'Ubuntu 24.04 LTS Noble 20260826'
  ArchiveName = 'noble-server-cloudimg-amd64-azure.vhd.tar.gz'
  SourceUrl = 'https://cloud-images.ubuntu.com/noble/20260826/noble-server-cloudimg-amd64-azure.vhd.tar.gz'
  ChecksumUrl = 'https://cloud-images.ubuntu.com/noble/20260826/SHA256SUMS'
  ExpectedSha256 = '843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22'
  SecureBootTemplate = 'MicrosoftUEFICertificateAuthority'
}

function Assert-Administrator {
  $principal = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent()
  )
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'This exact host script must run elevated; no host action was taken.'
  }
}

function Write-Ledger {
  param(
    [Parameter(Mandatory)]
    [object]$Ledger
  )

  $ledgerDirectory = Split-Path -Parent $LedgerPath
  New-Item -ItemType Directory -Path $ledgerDirectory -Force | Out-Null
  $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
  $temporaryLedgerPath = "$LedgerPath.$PID.tmp"
  [IO.File]::WriteAllText(
    $temporaryLedgerPath,
    ($Ledger | ConvertTo-Json -Depth 12),
    $utf8WithoutBom
  )
  if (Test-Path -LiteralPath $LedgerPath) {
    [IO.File]::Replace($temporaryLedgerPath, $LedgerPath, $null)
  } else {
    Move-Item -LiteralPath $temporaryLedgerPath -Destination $LedgerPath
  }
}

function ConvertTo-PortProxyEntries {
  param(
    [Parameter(Mandatory)]
    [string[]]$Lines,
    [Parameter(Mandatory)]
    [string]$Protocol
  )

  $entries = @()
  foreach ($line in $Lines) {
    if ($line -match '^\s*(\S+)\s+(\d+)\s+(\S+)\s+(\d+)\s*$') {
      $entries += [pscustomobject]@{
        Protocol = $Protocol
        ListenAddress = $matches[1]
        ListenPort = [int]$matches[2]
        ConnectAddress = $matches[3]
        ConnectPort = [int]$matches[4]
      }
    }
  }
  return @($entries)
}

function Get-PortProxyEntries {
  $entries = @()
  foreach ($protocol in @('v4tov4', 'v4tov6', 'v6tov4', 'v6tov6')) {
    $lines = @(& netsh interface portproxy "show" $protocol 2>$null)
    $entries += ConvertTo-PortProxyEntries -Lines $lines -Protocol $protocol
  }
  return @($entries)
}

function Get-HostListeners {
  return @(
    Get-NetTCPConnection -State Listen -ErrorAction Stop |
      Select-Object LocalAddress, LocalPort, State, OwningProcess
  )
}

function Get-HyperVFirewallState {
  $profiles = @()
  $vmSettings = @()
  if (Get-Command Get-NetFirewallHyperVProfile -ErrorAction SilentlyContinue) {
    $profiles = @(Get-NetFirewallHyperVProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction)
  }
  if (Get-Command Get-NetFirewallHyperVVMSetting -ErrorAction SilentlyContinue) {
    $vmSettings = @(Get-NetFirewallHyperVVMSetting | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction)
  }
  return [ordered]@{
    Profiles = $profiles
    VmSettings = $vmSettings
  }
}

function Get-TargetVmNicAclInventory {
  $targetVm = @(Get-VM -Name $targets.VmName -ErrorAction SilentlyContinue)
  $targetSwitch = @(Get-VMSwitch -Name $targets.SwitchName -ErrorAction SilentlyContinue)
  if ($targetVm.Count -ne 1 -or $targetSwitch.Count -ne 1) { return @() }
  return @(Get-RecordedVmNetworkAcls -Vm $targetVm[0] -Switch $targetSwitch[0])
}

function Get-DockerInventory {
  $allContainers = @()
  $allNetworks = @()
  $allVolumes = @()
  $targetContainers = @()
  $targetNetworks = @()
  $targetVolumes = @()
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    $allContainers = @(
      & docker ps --all --format '{{json .}}' 2>$null |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_ | ConvertFrom-Json }
    )
    $allNetworks = @(
      & docker network ls --format '{{json .}}' 2>$null |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_ | ConvertFrom-Json }
    )
    $allVolumes = @(
      & docker volume ls --format '{{json .}}' 2>$null |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_ | ConvertFrom-Json }
    )
    $targetContainers = @(
      & docker ps --all --filter "label=$($targets.DockerOwnershipLabel)" --format '{{json .}}' 2>$null |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_ | ConvertFrom-Json }
    )
    $targetNetworks = @(
      & docker network ls --filter "label=$($targets.DockerOwnershipLabel)" --format '{{json .}}' 2>$null |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_ | ConvertFrom-Json }
    )
    $targetVolumes = @(
      & docker volume ls --filter "label=$($targets.DockerOwnershipLabel)" --format '{{json .}}' 2>$null |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_ | ConvertFrom-Json }
    )
  }
  return [ordered]@{
    Containers = $allContainers | Select-Object ID, Names, Image, Ports, Status
    Networks = $allNetworks | Select-Object ID, Name, Driver, Scope
    Volumes = $allVolumes | Select-Object Name, Driver, Scope
    TargetContainers = $targetContainers | Select-Object ID, Names, Image, Ports, Status
    TargetNetworks = $targetNetworks | Select-Object ID, Name, Driver, Scope
    TargetVolumes = $targetVolumes | Select-Object Name, Driver, Scope
  }
}

function Get-ExactHostInventory {
  [ordered]@{
    TimestampUtc = [DateTime]::UtcNow.ToString('o')
    Windows = Get-ComputerInfo |
      Select-Object WindowsProductName, WindowsVersion, OsBuildNumber, HyperVisorPresent
    Vms = @(Get-VM | Select-Object Name, Id, State, Generation, Path)
    Switches = @(Get-VMSwitch | Select-Object Name, Id, SwitchType, NetAdapterInterfaceDescription)
    Nats = @(Get-NetNat | Select-Object Name, InternalIPInterfaceAddressPrefix)
    NatMappings = @(Get-NetNatStaticMapping | Select-Object NatName, Protocol, ExternalIPAddress, ExternalPort, InternalIPAddress, InternalPort)
    PortProxy = @(Get-PortProxyEntries)
    Listeners = @(Get-HostListeners)
    NetworkAcls = @(Get-TargetVmNicAclInventory)
    FirewallProfiles = @(Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction)
    HyperVFirewall = Get-HyperVFirewallState
    Docker = Get-DockerInventory
    VolumeD = Get-Volume -DriveLetter D | Select-Object DriveLetter, Size, SizeRemaining
  }
}

function Assert-NoHostExposureForPorts {
  param(
    [Parameter(Mandatory)]
    [int[]]$Ports,
    [Parameter(Mandatory)]
    [object[]]$PortProxies,
    [Parameter(Mandatory)]
    [object[]]$Listeners
  )

  $distinctPorts = @($Ports | Sort-Object -Unique)
  if ($distinctPorts.Count -ne $Ports.Count -or @($Ports | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -ne 0) {
    throw 'Host exposure assertion received non-unique or invalid ports.'
  }

  foreach ($port in $distinctPorts) {
    if (@($PortProxies | Where-Object { $_.ListenPort -eq $port }).Count -ne 0) {
      throw "Host port proxy exists for protected port $port."
    }
    $nonLoopbackListeners = @(
      $Listeners | Where-Object {
        $_.LocalPort -eq $port -and $_.LocalAddress -notin @('127.0.0.1', '::1')
      }
    )
    if ($nonLoopbackListeners.Count -ne 0) {
      throw "Host listener is not loopback-only for protected port $port."
    }
  }
}

function Assert-TargetVacant {
  param(
    [Parameter(Mandatory)]
    [object]$Inventory
  )

  if (@($Inventory.Vms | Where-Object { $_.Name -eq $targets.VmName }).Count -ne 0) {
    throw "Target VM already exists: $($targets.VmName)"
  }
  if (@($Inventory.Switches | Where-Object { $_.Name -eq $targets.SwitchName }).Count -ne 0) {
    throw "Target switch already exists: $($targets.SwitchName)"
  }
  if (@($Inventory.Nats | Where-Object { $_.Name -eq $targets.NatName }).Count -ne 0) {
    throw "Target NAT already exists: $($targets.NatName)"
  }
  if (@($Inventory.NetworkAcls).Count -ne 0) {
    throw 'Target VM-NIC ACLs already exist; this run identity is not vacant.'
  }
  if (@($Inventory.PortProxy).Count -ne 0) {
    throw 'This isolated runner design prohibits every netsh port proxy, including non-target mappings.'
  }
  if (@($Inventory.Docker.TargetContainers).Count -ne 0 -or @($Inventory.Docker.TargetNetworks).Count -ne 0 -or @($Inventory.Docker.TargetVolumes).Count -ne 0) {
    throw 'Target-labeled Docker resource already exists.'
  }
  if (Test-Path -LiteralPath $targets.RunRoot) {
    throw "Target run root already exists: $($targets.RunRoot)"
  }
}

function Assert-Property {
  param(
    [Parameter(Mandatory)] [object]$Value,
    [Parameter(Mandatory)] [string]$Name
  )
  if ($null -eq $Value -or ($Value -is [string] -and [string]::IsNullOrWhiteSpace($Value))) {
    throw "Rollback ledger is missing $Name."
  }
}

function Read-RollbackLedger {
  if (-not (Test-Path -LiteralPath $LedgerPath)) {
    throw "Rollback requires an existing Provisioned ledger: $LedgerPath"
  }
  $ledger = Get-Content -LiteralPath $LedgerPath -Raw | ConvertFrom-Json
  Assert-Property -Value $ledger.SchemaVersion -Name 'SchemaVersion'
  if ([int]$ledger.SchemaVersion -ne 2 -or $ledger.Lifecycle -ne 'Provisioned' -or $ledger.Outcome -ne 'PASS') {
    throw 'Rollback accepts only a successful SchemaVersion 2 Provisioned ledger.'
  }
  if ($ledger.RunIdentity -ne $RunIdentity) {
    throw 'Rollback ledger RunIdentity does not match the requested target.'
  }
  Assert-Property -Value $ledger.Resources -Name 'Resources'
  Assert-Property -Value $ledger.Resources.Vm -Name 'Resources.Vm'
  Assert-Property -Value $ledger.Resources.Switch -Name 'Resources.Switch'
  Assert-Property -Value $ledger.Resources.Nat -Name 'Resources.Nat'
  Assert-Property -Value $ledger.Resources.GatewayIp -Name 'Resources.GatewayIp'
  Assert-Property -Value $ledger.Resources.RunDirectory -Name 'Resources.RunDirectory'
  Assert-Property -Value $ledger.Resources.PortProxies -Name 'Resources.PortProxies'
  Assert-Property -Value $ledger.Resources.DynamicPorts -Name 'Resources.DynamicPorts'
  Assert-Property -Value $ledger.Resources.Disks -Name 'Resources.Disks'
  Assert-Property -Value $ledger.Resources.NetworkAcls -Name 'Resources.NetworkAcls'
  Assert-Property -Value $ledger.Resources.GuestEvidencePath -Name 'Resources.GuestEvidencePath'
  Assert-Property -Value $ledger.Resources.GuestEvidence -Name 'Resources.GuestEvidence'
  if (@($ledger.Resources.PortProxies).Count -ne 0) {
    throw 'Provisioned ledger must attest that no netsh port proxy exists.'
  }

  if ($ledger.Resources.Vm.Name -ne $targets.VmName -or -not [guid]::TryParse([string]$ledger.Resources.Vm.Id, [ref]([guid]::Empty)) -or [int]$ledger.Resources.Vm.Generation -ne 2 -or $ledger.Resources.Vm.Path -ne $targets.VmConfigurationDirectory -or $ledger.Resources.Vm.SnapshotFileLocation -ne $targets.CheckpointDirectory -or $ledger.Resources.Vm.SmartPagingFilePath -ne $targets.SmartPagingDirectory) {
    throw 'Rollback ledger VM identity is invalid.'
  }
  if ($ledger.Resources.Switch.Name -ne $targets.SwitchName -or -not [guid]::TryParse([string]$ledger.Resources.Switch.Id, [ref]([guid]::Empty)) -or $ledger.Resources.Switch.Type -ne 'Internal') {
    throw 'Rollback ledger virtual-switch identity is invalid.'
  }
  if ($ledger.Resources.Nat.Name -ne $targets.NatName -or $ledger.Resources.Nat.Prefix -ne $targets.NatPrefix) {
    throw 'Rollback ledger NAT identity is invalid.'
  }
  if ($ledger.Resources.GatewayIp.InterfaceAlias -ne "vEthernet ($($targets.SwitchName))" -or $ledger.Resources.GatewayIp.IPAddress -ne $targets.Gateway -or [int]$ledger.Resources.GatewayIp.PrefixLength -ne 24) {
    throw 'Rollback ledger gateway interface identity is invalid.'
  }
  if ($ledger.Resources.RunDirectory.Path -ne $targets.RunRoot -or $ledger.Resources.RunDirectory.MarkerName -ne $targets.MarkerName -or [string]$ledger.Resources.RunDirectory.MarkerSha256 -notmatch '^[a-fA-F0-9]{64}$') {
    throw 'Rollback ledger run-directory ownership identity is invalid.'
  }
  $expectedDiskPaths = @($targets.OsVhdxPath, $targets.CidataVhdxPath, $targets.EvidenceVhdxPath)
  $expectedDiskPaths = @($expectedDiskPaths | Sort-Object)
  $ledgerDiskPaths = @($ledger.Resources.Disks | ForEach-Object { [IO.Path]::GetFullPath([string]$_.Path) } | Sort-Object)
  if ($ledgerDiskPaths.Count -ne 3 -or (Compare-Object -ReferenceObject $expectedDiskPaths -DifferenceObject $ledgerDiskPaths)) {
    throw 'Rollback ledger virtual-disk identities are invalid.'
  }
  foreach ($disk in @($ledger.Resources.Disks)) {
    if ([string]$disk.Sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Rollback ledger virtual-disk hash evidence is invalid.' }
  }
  $guestEvidence = $ledger.Resources.GuestEvidence
  if ($ledger.Resources.GuestEvidencePath -ne $targets.GuestEvidencePath -or $guestEvidence.Path -ne $targets.EvidenceVhdxPath -or [string]$guestEvidence.Sha256 -notmatch '^[a-fA-F0-9]{64}$' -or @($guestEvidence.DynamicPorts | ForEach-Object { [int]$_ }).Count -eq 0 -or @($guestEvidence.DynamicPorts | ForEach-Object { [int]$_ } | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -ne 0) {
    throw 'Rollback ledger guest-evidence identity is invalid.'
  }
  $guestAttestation = $guestEvidence.Evidence
  if ($guestAttestation.schema_version -ne 1 -or $guestAttestation.outcome -ne 'PASS' -or $guestAttestation.credential_stage -ne 'not-entered' -or $guestAttestation.runner_user -ne 'erpci' -or $guestAttestation.docker_context -ne 'default' -or $guestAttestation.docker_socket -ne 'unix:///var/run/docker.sock' -or $guestAttestation.docker_data_filesystem -ne 'ext4' -or $guestAttestation.host_mounts -ne 'absent' -or $guestAttestation.gh_config -ne 'absent' -or $guestAttestation.ipv6 -ne 'disabled' -or $guestAttestation.guest_loopback -ne 'PASS' -or $guestAttestation.host_probe -ne 'DENY' -or $guestAttestation.private_probe -ne 'DENY' -or $guestAttestation.public_dns -ne 'PASS' -or $guestAttestation.public_ntp -ne 'PASS' -or $guestAttestation.github_https -ne 'PASS') {
    throw 'Rollback ledger guest-evidence attestation is invalid.'
  }
  Assert-LedgerVmNicAclShape -Vm $ledger.Resources.Vm -Switch $ledger.Resources.Switch -Acls @($ledger.Resources.NetworkAcls)
  Assert-Property -Value $ledger.Resources.FirewallEvidenceState -Name 'Resources.FirewallEvidenceState'
  if ($ledger.Resources.FirewallEvidenceState -ne 'not-created' -or @($ledger.Resources.FirewallRules).Count -ne 0) {
    throw 'This design forbids global host firewall rules; the ledger must attest none were created.'
  }
  $dynamicPorts = @($ledger.Resources.DynamicPorts | ForEach-Object { [int]$_ })
  Assert-Property -Value $ledger.Resources.DynamicPortEvidenceState -Name 'Resources.DynamicPortEvidenceState'
  if ($ledger.Resources.DynamicPortEvidenceState -notin @('not-started', 'validated')) {
    throw 'Rollback ledger dynamic-port evidence state is invalid.'
  }
  if (($ledger.Resources.DynamicPortEvidenceState -eq 'not-started' -and $dynamicPorts.Count -ne 0) -or @($dynamicPorts | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -ne 0 -or @($dynamicPorts | Sort-Object -Unique).Count -ne $dynamicPorts.Count) {
    throw 'Rollback ledger dynamic port set is invalid.'
  }
  return $ledger
}

function Assert-RunDirectoryOwned {
  param([Parameter(Mandatory)] [object]$RunDirectory)
  $markerPath = Join-Path $RunDirectory.Path $RunDirectory.MarkerName
  if (-not (Test-Path -LiteralPath $markerPath)) {
    throw 'Rollback refuses to delete a run directory without its exact ownership marker.'
  }
  $markerHash = (Get-FileHash -LiteralPath $markerPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($markerHash -ne ([string]$RunDirectory.MarkerSha256).ToLowerInvariant()) {
    throw 'Rollback refuses to delete a run directory whose ownership marker hash changed.'
  }
  $marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
  if ($marker.RunIdentity -ne $RunIdentity) {
    throw 'Rollback refuses to delete a run directory whose marker RunIdentity differs.'
  }
}

function Invoke-Rollback {
  param([Parameter(Mandatory)] [object]$Ledger)

  Assert-RunDirectoryOwned -RunDirectory $Ledger.Resources.RunDirectory
  foreach ($disk in @($Ledger.Resources.Disks)) {
    if (-not (Test-Path -LiteralPath $disk.Path -PathType Leaf)) {
      throw 'Rollback refuses a ledger whose exact recorded virtual disk is absent.'
    }
    if ((Get-FileHash -LiteralPath $disk.Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne ([string]$disk.Sha256).ToLowerInvariant()) {
      throw 'Rollback refuses a ledger whose exact recorded virtual-disk hash changed.'
    }
  }
  $inventory = Get-ExactHostInventory
  $vm = @($inventory.Vms | Where-Object { $_.Name -eq $Ledger.Resources.Vm.Name -and $_.Id -eq $Ledger.Resources.Vm.Id })
  if ($vm.Count -gt 1) { throw 'Rollback found duplicate exact VM identities.' }
  if ($vm.Count -eq 1) {
    $switchForAcl = @($inventory.Switches | Where-Object { $_.Name -eq $Ledger.Resources.Switch.Name -and $_.Id -eq $Ledger.Resources.Switch.Id -and $_.SwitchType -eq $Ledger.Resources.Switch.Type })
    if ($switchForAcl.Count -ne 1) { throw 'Rollback refuses to remove a VM without its exact ledgered virtual switch.' }
    Assert-ExactVmNetworkAcls -Vm $vm[0] -Switch $switchForAcl[0] -Expected @($Ledger.Resources.NetworkAcls) | Out-Null
    if ($vm[0].State -ne 'Off') { Stop-VM -Id $Ledger.Resources.Vm.Id -TurnOff -Force }
    Remove-VM -Id $Ledger.Resources.Vm.Id -Force
  }

  $nat = @($inventory.Nats | Where-Object { $_.Name -eq $Ledger.Resources.Nat.Name -and $_.InternalIPInterfaceAddressPrefix -eq $Ledger.Resources.Nat.Prefix })
  if ($nat.Count -gt 1) { throw 'Rollback found duplicate exact NAT identities.' }
  if ($nat.Count -eq 1) { Remove-NetNat -Name $Ledger.Resources.Nat.Name -Confirm:$false }

  $gatewayIp = @(Get-NetIPAddress -InterfaceAlias $Ledger.Resources.GatewayIp.InterfaceAlias -IPAddress $Ledger.Resources.GatewayIp.IPAddress -ErrorAction SilentlyContinue)
  if ($gatewayIp.Count -gt 1 -or @($gatewayIp | Where-Object { $_.PrefixLength -ne $Ledger.Resources.GatewayIp.PrefixLength }).Count -ne 0) {
    throw 'Rollback found an ambiguous or mismatched exact gateway address.'
  }
  if ($gatewayIp.Count -eq 1) { Remove-NetIPAddress -InterfaceIndex $gatewayIp[0].InterfaceIndex -IPAddress $gatewayIp[0].IPAddress -Confirm:$false }

  $switch = @($inventory.Switches | Where-Object { $_.Name -eq $Ledger.Resources.Switch.Name -and $_.Id -eq $Ledger.Resources.Switch.Id -and $_.SwitchType -eq $Ledger.Resources.Switch.Type })
  if ($switch.Count -gt 1) { throw 'Rollback found duplicate exact virtual-switch identities.' }
  if ($switch.Count -eq 1) { Remove-VMSwitch -Id $Ledger.Resources.Switch.Id -Force }

  Remove-Item -LiteralPath $Ledger.Resources.RunDirectory.Path -Recurse -Force

  $remaining = Get-ExactHostInventory
  Assert-TargetVacant -Inventory $remaining
  if (@($remaining.PortProxy).Count -ne 0) {
    throw 'Exact rollback refuses a host with any netsh port proxy; no proxy is part of this design.'
  }
  Assert-NoHostExposureForPorts -Ports @($Ledger.Resources.DynamicPorts | ForEach-Object { [int]$_ }) -PortProxies @($remaining.PortProxy) -Listeners @($remaining.Listeners)
  return $remaining
}

function Assert-ProvisionAuthorization {
  if ($ProvisionAuthorization -cne 'I_ACKNOWLEDGE_ISOLATED_RUNNER_PROVISION') {
    throw 'Provision is review-gated. Supply only the exact non-secret acknowledgement after Agent 12 accepts this provision code.'
  }
}

function Get-ExpectedImageArchivePath {
  if (-not [string]::IsNullOrWhiteSpace($ImageArchivePath)) {
    $candidate = [IO.Path]::GetFullPath($ImageArchivePath)
  } else {
    $candidate = Join-Path $targets.RunRoot $ubuntuImage.ArchiveName
  }
  $runRootPrefix = "$($targets.RunRoot)$([IO.Path]::DirectorySeparatorChar)"
  if (-not $candidate.StartsWith($runRootPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The verified Ubuntu archive must be stored beneath the exact D: run root.'
  }
  return $candidate
}

function Assert-VerifiedUbuntuArchive {
  $archivePath = Get-ExpectedImageArchivePath
  if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    throw "Verified Ubuntu archive is absent: $archivePath"
  }
  $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $ubuntuImage.ExpectedSha256) {
    throw 'Ubuntu archive SHA-256 does not match the dated official publisher checksum.'
  }
  return [pscustomobject]@{
    ArchivePath = $archivePath
    Sha256 = $actualHash
    SourceUrl = $ubuntuImage.SourceUrl
    ChecksumUrl = $ubuntuImage.ChecksumUrl
    Release = $ubuntuImage.Release
  }
}

function Write-Utf8NoBomFile {
  param([Parameter(Mandatory)] [string]$Path, [Parameter(Mandatory)] [string]$Content)
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($Path, $Content, $encoding)
}

function New-RunOwnershipMarker {
  New-Item -ItemType Directory -Path $targets.RunRoot -Force | Out-Null
  $markerPath = Join-Path $targets.RunRoot $targets.MarkerName
  Write-Utf8NoBomFile -Path $markerPath -Content (([ordered]@{
      RunIdentity = $RunIdentity
      CreatedUtc = [DateTime]::UtcNow.ToString('o')
      Purpose = 'isolated-linux-runner'
    }) | ConvertTo-Json)
  return [pscustomobject]@{
    Path = $targets.RunRoot
    MarkerName = $targets.MarkerName
    MarkerSha256 = (Get-FileHash -LiteralPath $markerPath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}

function New-CidataSeed {
  param([Parameter(Mandatory)] [string]$SeedPath)
  New-Item -ItemType Directory -Path $targets.VhdDirectory -Force | Out-Null
  New-VHD -Path $SeedPath -Dynamic -SizeBytes 64MB | Out-Null
  $mounted = $false
  try {
    Mount-VHD -Path $SeedPath -NoDriveLetter
    $mounted = $true
    $disk = Get-DiskImage -ImagePath $SeedPath | Get-Disk
    Initialize-Disk -Number $disk.Number -PartitionStyle MBR -PassThru |
      New-Partition -UseMaximumSize -AssignDriveLetter |
      Format-Volume -FileSystem FAT32 -NewFileSystemLabel 'CIDATA' -Confirm:$false | Out-Null
    $volume = Get-DiskImage -ImagePath $SeedPath | Get-Disk | Get-Partition | Get-Volume | Where-Object { $_.DriveLetter } | Select-Object -First 1
    if ($null -eq $volume) { throw 'CIDATA seed did not receive an exact temporary drive letter.' }
    $seedRoot = "$($volume.DriveLetter):\"
    $userData = @'
#cloud-config
ssh_pwauth: false
disable_root: true
users:
  - name: erpci
    shell: /usr/sbin/nologin
    lock_passwd: true
    sudo: false
    groups: [docker]
package_update: true
packages: [docker.io, curl, iproute2, ufw, netcat-openbsd]
write_files:
  - path: /etc/sysctl.d/99-third-code-erp-disable-ipv6.conf
    permissions: '0644'
    content: |
      net.ipv6.conf.all.disable_ipv6=1
      net.ipv6.conf.default.disable_ipv6=1
  - path: /usr/local/sbin/third-code-erp-precredential-evidence
    permissions: '0700'
    content: |
      #!/usr/bin/env bash
      set -euo pipefail
      test -z "${DOCKER_HOST:-}"
      test -z "${DOCKER_CONTEXT:-}"
      test ! -e /mnt/wsl
      test ! -d /mnt/c
      ! findmnt --noheadings --types 9p,cifs,smb3,fuse.drvfs >/dev/null
      systemctl is-active --quiet docker
      test "$(docker context show)" = default
      test "$(docker context inspect default --format '{{.Endpoints.docker.Host}}')" = unix:///var/run/docker.sock
      test -S /var/run/docker.sock
      test "$(findmnt --noheadings --output FSTYPE --target "$(docker info --format '{{.DockerRootDir}}')" | xargs)" = ext4
      test ! -e /home/erpci/.config/gh/hosts.yml
      test "$(sysctl --values net.ipv6.conf.all.disable_ipv6)" = 1
      probe_name=third-code-erp-precredential-probe
      docker run --detach --name "$probe_name" --publish 127.0.0.1::80 nginx:stable-alpine >/dev/null
      bindings="$(docker inspect --format '{{range $port, $bindings := .NetworkSettings.Ports}}{{range $bindings}}{{printf "%s %s\\n" .HostIp .HostPort}}{{end}}{{end}}' "$probe_name")"
      test -n "$bindings"
      while read -r host_ip host_port; do
        case "$host_ip" in 127.0.0.1|::1) ;; *) exit 1 ;; esac
        ss --listening --tcp --numeric --no-header "( sport = :${host_port} )" | grep -F ":${host_port}"
        curl --fail --silent "http://${host_ip}:${host_port}/" >/dev/null
      done <<< "$bindings"
      dynamic_ports="$(printf '%s\n' "$bindings" | awk '{print $2}' | sort --numeric-sort --unique | paste --serial --delimiters ',')"
      test -n "$dynamic_ports"
      case "$dynamic_ports" in *[!0-9,]*) exit 1 ;; esac
      docker rm --force "$probe_name" >/dev/null
      ! nc -z -w 2 172.31.202.1 29876
      ! nc -z -w 2 10.0.0.1 443
      getent ahostsv4 time.cloudflare.com >/dev/null
      nc -z -u -w 2 time.cloudflare.com 123
      curl --fail --silent --head https://api.github.com/ >/dev/null
      install --directory --mode 0700 /mnt/erp-evidence
      mount -L ERPEVIDENCE /mnt/erp-evidence
      printf '{"schema_version":1,"outcome":"PASS","credential_stage":"not-entered","runner_user":"erpci","docker_socket_residual":"guest-root","docker_context":"default","docker_socket":"unix:///var/run/docker.sock","docker_data_filesystem":"ext4","host_mounts":"absent","gh_config":"absent","ipv6":"disabled","guest_firewall":"deny-inbound-and-restricted-outbound","dynamic_ports":[%s],"guest_loopback":"PASS","host_probe":"DENY","private_probe":"DENY","public_dns":"PASS","public_ntp":"PASS","github_https":"PASS"}\n' "$dynamic_ports" > /mnt/erp-evidence/precredential-containment.json
      sync
      umount /mnt/erp-evidence
runcmd:
  - [sysctl, --system]
  - [bash, -lc, "systemctl disable --now ssh.service || true"]
  - [systemctl, enable, --now, docker]
  - [ufw, default, deny, incoming]
  - [ufw, default, deny, outgoing]
  - [ufw, allow, out, on, lo]
  - [ufw, allow, out, to, 1.1.1.1, port, '53', proto, udp]
  - [ufw, allow, out, to, 1.1.1.1, port, '53', proto, tcp]
  - [ufw, allow, out, proto, tcp, to, any, port, '443']
  - [ufw, allow, out, proto, udp, to, any, port, '123']
  - [ufw, --force, enable]
  - [/usr/local/sbin/third-code-erp-precredential-evidence]
  - [poweroff]
'@
    $networkConfig = @"
version: 2
ethernets:
  erpnic:
    match:
      name: "en*"
    set-name: eth0
    addresses: [$($targets.GuestAddress)/24]
    dhcp4: false
    dhcp6: false
    accept-ra: false
    link-local: []
    routes:
      - to: default
        via: $($targets.Gateway)
    nameservers:
      addresses: [1.1.1.1]
"@
    Write-Utf8NoBomFile -Path (Join-Path $seedRoot 'meta-data') -Content "instance-id: $RunIdentity`nlocal-hostname: $RunIdentity`n"
    Write-Utf8NoBomFile -Path (Join-Path $seedRoot 'user-data') -Content $userData
    Write-Utf8NoBomFile -Path (Join-Path $seedRoot 'network-config') -Content $networkConfig
  } finally {
    if ($mounted) { Dismount-VHD -Path $SeedPath }
  }
}

function New-EvidenceDisk {
  param([Parameter(Mandatory)] [string]$EvidencePath)
  New-VHD -Path $EvidencePath -Dynamic -SizeBytes 64MB | Out-Null
  $mounted = $false
  try {
    Mount-VHD -Path $EvidencePath -NoDriveLetter
    $mounted = $true
    $disk = Get-DiskImage -ImagePath $EvidencePath | Get-Disk
    Initialize-Disk -Number $disk.Number -PartitionStyle MBR -PassThru |
      New-Partition -UseMaximumSize -AssignDriveLetter |
      Format-Volume -FileSystem FAT32 -NewFileSystemLabel 'ERPEVIDENCE' -Confirm:$false | Out-Null
  } finally {
    if ($mounted) { Dismount-VHD -Path $EvidencePath }
  }
}

function Get-RequiredVmNicAclDestinations {
  # IPv6 is disabled in the guest before the smoke. These IPv4 ACLs bind only to
  # the named VM NIC and prohibit host/NAT, RFC1918, link-local, carrier-grade,
  # documentation, benchmarking, multicast, and reserved paths. Public DNS/NTP
  # and HTTPS retain the named-NAT egress route.
  return @(
    '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
    '169.254.0.0/16', '172.16.0.0/12', '172.31.202.0/24',
    '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16',
    '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24',
    '224.0.0.0/4', '240.0.0.0/4'
  )
}

function Get-RecordedVmNetworkAcls {
  param(
    [Parameter(Mandatory)] [object]$Vm,
    [Parameter(Mandatory)] [object]$Switch
  )
  return @(
    Get-VMNetworkAdapterExtendedAcl -VMName $Vm.Name |
      ForEach-Object {
        [pscustomobject]@{
          VmId = [string]$Vm.Id
          VmName = [string]$Vm.Name
          SwitchId = [string]$Switch.Id
          AdapterName = 'Network Adapter'
          Direction = [string]$_.Direction
          Action = [string]$_.Action
          LocalIPAddress = [string]$_.LocalIPAddress
          RemoteIPAddress = [string]$_.RemoteIPAddress
          Protocol = [string]$_.Protocol
          LocalPort = [string]$_.LocalPort
          RemotePort = [string]$_.RemotePort
          Weight = [int]$_.Weight
          Stateful = [string]$_.Stateful
        }
      }
  )
}

function Get-VmNicAclSignature {
  param([Parameter(Mandatory)] [object]$Acl)
  return @(
    [string]$Acl.VmId, [string]$Acl.VmName, [string]$Acl.SwitchId,
    [string]$Acl.AdapterName, [string]$Acl.Direction, [string]$Acl.Action,
    [string]$Acl.LocalIPAddress, [string]$Acl.RemoteIPAddress,
    [string]$Acl.Protocol, [string]$Acl.LocalPort, [string]$Acl.RemotePort,
    [string]$Acl.Weight, [string]$Acl.Stateful
  ) -join '|'
}

function Assert-LedgerVmNicAclShape {
  param(
    [Parameter(Mandatory)] [object]$Vm,
    [Parameter(Mandatory)] [object]$Switch,
    [Parameter(Mandatory)] [object[]]$Acls
  )
  $requiredDestinations = @(Get-RequiredVmNicAclDestinations | Sort-Object)
  if ($Acls.Count -ne ($requiredDestinations.Count * 2)) {
    throw 'VM-NIC ACL ledger count is incomplete.'
  }
  foreach ($direction in @('Inbound', 'Outbound')) {
    $scoped = @($Acls | Where-Object { $_.Direction -eq $direction })
    $destinations = @($scoped | ForEach-Object { [string]$_.RemoteIPAddress } | Sort-Object -Unique)
    if ($scoped.Count -ne $requiredDestinations.Count -or $destinations.Count -ne $requiredDestinations.Count -or (Compare-Object -ReferenceObject $requiredDestinations -DifferenceObject $destinations)) {
      throw "VM-NIC $direction ACLs do not cover every required private/LAN/reserved destination."
    }
  }
  if (@($Acls | Where-Object {
      $_.VmId -ne $Vm.Id -or $_.VmName -ne $Vm.Name -or $_.SwitchId -ne $Switch.Id -or $_.AdapterName -ne 'Network Adapter' -or
      $_.Action -ne 'Deny' -or $_.Protocol -ne 'Any' -or $_.RemoteIPAddress -in @('', 'Any', '*', '0.0.0.0/0', '::/0') -or
      $_.LocalIPAddress -notin @('Any', '*') -or $_.LocalPort -notin @('Any', '*') -or $_.RemotePort -notin @('Any', '*') -or [int]$_.Weight -lt 1
    }).Count -ne 0) {
    throw 'VM-NIC ACL ledger contains a global, unbound, or non-deny filter.'
  }
  $signatures = @($Acls | ForEach-Object { Get-VmNicAclSignature -Acl $_ } | Sort-Object -Unique)
  if ($signatures.Count -ne $Acls.Count) { throw 'VM-NIC ACL ledger contains duplicate exact identities.' }
}

function Assert-ExactVmNetworkAcls {
  param(
    [Parameter(Mandatory)] [object]$Vm,
    [Parameter(Mandatory)] [object]$Switch,
    [Parameter(Mandatory)] [object[]]$Expected
  )
  Assert-LedgerVmNicAclShape -Vm $Vm -Switch $Switch -Acls $Expected
  $requiredDestinations = @(Get-RequiredVmNicAclDestinations | Sort-Object)
  $actual = @(Get-RecordedVmNetworkAcls -Vm $Vm -Switch $Switch)
  $expectedSignatures = @($Expected | ForEach-Object { Get-VmNicAclSignature -Acl $_ } | Sort-Object)
  $actualSignatures = @($actual | ForEach-Object { Get-VmNicAclSignature -Acl $_ } | Sort-Object)
  if ($expectedSignatures.Count -ne ($requiredDestinations.Count * 2) -or $actualSignatures.Count -ne $expectedSignatures.Count -or (Compare-Object -ReferenceObject $expectedSignatures -DifferenceObject $actualSignatures)) {
    throw 'VM-NIC extended ACL readback differs from the exact ledgered ACL set.'
  }
  return $actual
}

function New-GuestEgressIsolationAcls {
  $vm = Get-VM -Name $targets.VmName
  $switch = Get-VMSwitch -Name $targets.SwitchName
  $weight = 100
  foreach ($direction in @('Inbound', 'Outbound')) {
    foreach ($destination in @(Get-RequiredVmNicAclDestinations)) {
      Add-VMNetworkAdapterExtendedAcl -VMName $targets.VmName -Direction $direction -Action Deny -LocalIPAddress Any -RemoteIPAddress $destination -Protocol Any -LocalPort Any -RemotePort Any -Weight $weight
      $weight += 10
    }
  }
  # Read back every ACL tuple before a guest receives egress. The inbound ACLs
  # cover host/private/LAN origins; no portproxy or NAT mapping is permitted.
  $live = @(Get-RecordedVmNetworkAcls -Vm $vm -Switch $switch)
  Assert-LedgerVmNicAclShape -Vm $vm -Switch $switch -Acls $live
  return $live
}

function Wait-ForGuestPowerOff {
  param([int]$TimeoutSeconds = 900)
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if ((Get-VM -Name $targets.VmName).State -eq 'Off') { return }
    Start-Sleep -Seconds 5
  }
  throw 'Guest did not power off within the bounded non-secret readiness window.'
}

function Start-HostContainmentProbe {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse($targets.Gateway), 29876)
  try {
    $listener.Start()
    $live = @(Get-HostListeners | Where-Object { $_.LocalAddress -eq $targets.Gateway -and $_.LocalPort -eq 29876 })
    if ($live.Count -ne 1) { throw 'The exact run-owned host containment probe did not bind once.' }
    return [pscustomobject]@{
      Listener = $listener
      Identity = [pscustomobject]@{ Address = $targets.Gateway; Port = 29876; Protocol = 'TCP'; Owner = 'current-host-script' }
    }
  } catch {
    $listener.Stop()
    throw
  }
}

function Stop-HostContainmentProbe {
  param([Parameter(Mandatory)] [object]$Probe)
  $Probe.Listener.Stop()
  $residue = @(Get-HostListeners | Where-Object { $_.LocalAddress -eq $Probe.Identity.Address -and $_.LocalPort -eq $Probe.Identity.Port })
  if ($residue.Count -ne 0) { throw 'Exact run-owned host containment probe listener remains after stop.' }
}

function Read-GuestEvidenceDisk {
  $drive = $null
  $mounted = $false
  try {
    if ((Get-VM -Name $targets.VmName).State -ne 'Off') { throw 'Guest evidence may be detached only after the exact VM is Off.' }
    $evidenceDrive = @(Get-VMHardDiskDrive -VMName $targets.VmName | Where-Object { $_.Path -eq $targets.EvidenceVhdxPath })
    if ($evidenceDrive.Count -ne 1) { throw 'Guest evidence disk is not attached exactly once to the target VM.' }
    $evidenceDrive[0] | Remove-VMHardDiskDrive
    Mount-VHD -Path $targets.EvidenceVhdxPath -ReadOnly -NoDriveLetter
    $mounted = $true
    $drive = (Get-DiskImage -ImagePath $targets.EvidenceVhdxPath | Get-Disk | Get-Partition | Get-Volume | Where-Object { $_.DriveLetter } | Select-Object -First 1).DriveLetter
    if ([string]::IsNullOrWhiteSpace($drive)) { throw 'Guest evidence disk has no exact temporary read-only drive.' }
    $evidencePath = "$drive`:\precredential-containment.json"
    $rawEvidence = Get-Content -LiteralPath $evidencePath -Raw
    if ($rawEvidence -match '(?i)"(?:token|secret|password|authorization)"\s*:') { throw 'Guest evidence must not contain a secret-bearing field.' }
    $evidenceHash = (Get-FileHash -LiteralPath $evidencePath -Algorithm SHA256).Hash.ToLowerInvariant()
    $evidence = $rawEvidence | ConvertFrom-Json
    $required = [ordered]@{
      schema_version = 1; outcome = 'PASS'; credential_stage = 'not-entered'; runner_user = 'erpci'; docker_socket_residual = 'guest-root'
      docker_context = 'default'; docker_socket = 'unix:///var/run/docker.sock'; docker_data_filesystem = 'ext4'; host_mounts = 'absent'
      gh_config = 'absent'; ipv6 = 'disabled'; guest_firewall = 'deny-inbound-and-restricted-outbound'; guest_loopback = 'PASS'
      host_probe = 'DENY'; private_probe = 'DENY'; public_dns = 'PASS'; public_ntp = 'PASS'; github_https = 'PASS'
    }
    foreach ($entry in $required.GetEnumerator()) {
      if ($evidence.$($entry.Key) -ne $entry.Value) { throw "Guest evidence has an invalid $($entry.Key) value." }
    }
    $guestDynamicPorts = @($evidence.dynamic_ports | ForEach-Object { [int]$_ })
    if ($guestDynamicPorts.Count -eq 0 -or @($guestDynamicPorts | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -ne 0 -or @($guestDynamicPorts | Sort-Object -Unique).Count -ne $guestDynamicPorts.Count) {
      throw 'Guest evidence is missing or does not prove the required non-secret containment controls.'
    }
    return [pscustomobject]@{ Path = $targets.EvidenceVhdxPath; Sha256 = $evidenceHash; DynamicPorts = $guestDynamicPorts; Evidence = $evidence }
  } finally {
    if ($mounted) { Dismount-VHD -Path $targets.EvidenceVhdxPath }
  }
}

function Write-ProvisionStage {
  param(
    [Parameter(Mandatory)] [object]$Ownership,
    [Parameter(Mandatory)] [string]$Stage
  )
  $Ownership.Stage = $Stage
  $Ownership.UpdatedUtc = [DateTime]::UtcNow.ToString('o')
  Write-Ledger -Ledger ([ordered]@{
      SchemaVersion = 2
      Lifecycle = 'Provisioning'
      Mode = 'Provision'
      Outcome = 'IN_PROGRESS'
      RunIdentity = $RunIdentity
      Ownership = $Ownership
      Notes = @('Staged ownership ledger: this is cleanup authority, not a Provision PASS.')
    })
}

function Assert-NoMappingsOrPortProxies {
  param([Parameter(Mandatory)] [object]$Inventory)
  if (@($Inventory.NatMappings).Count -ne 0) { throw 'Isolated provision refuses every NAT static mapping.' }
  if (@($Inventory.PortProxy).Count -ne 0) { throw 'Isolated provision refuses every netsh port proxy.' }
}

function Invoke-StagedProvisionRollback {
  param([Parameter(Mandatory)] [object]$Ownership)
  if ($Ownership.RunDirectory) { Assert-RunDirectoryOwned -RunDirectory $Ownership.RunDirectory }
  foreach ($disk in @($Ownership.Disks)) {
    if (-not (Test-Path -LiteralPath $disk.Path -PathType Leaf)) { throw 'Staged rollback refuses an absent exact owned virtual disk.' }
    if ((Get-FileHash -LiteralPath $disk.Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne ([string]$disk.Sha256).ToLowerInvariant()) {
      throw 'Staged rollback refuses an owned virtual disk whose recorded hash changed.'
    }
  }
  if ($Ownership.Vm -and $Ownership.Vm.Id) {
    $vm = @(Get-VM | Where-Object { $_.Id -eq $Ownership.Vm.Id -and $_.Name -eq $targets.VmName })
    if ($vm.Count -gt 1) { throw 'Staged rollback found duplicate owned VM identities.' }
    if ($vm.Count -eq 1) {
      if (@($Ownership.NetworkAcls).Count -gt 0) {
        if (-not $Ownership.Switch -or -not $Ownership.Switch.Id) { throw 'Staged rollback refuses VM-NIC ACL removal without an exact recorded switch.' }
        $switchForAcl = @(Get-VMSwitch | Where-Object { $_.Id -eq $Ownership.Switch.Id -and $_.Name -eq $targets.SwitchName })
        if ($switchForAcl.Count -ne 1) { throw 'Staged rollback found no exact virtual switch for VM-NIC ACL validation.' }
        Assert-ExactVmNetworkAcls -Vm $vm[0] -Switch $switchForAcl[0] -Expected @($Ownership.NetworkAcls) | Out-Null
      }
      if ($vm[0].State -ne 'Off') { Stop-VM -Id $vm[0].Id -TurnOff -Force }
      Remove-VM -Id $vm[0].Id -Force
    }
  }
  if ($Ownership.Nat -and $Ownership.Nat.Name) {
    $nat = @(Get-NetNat | Where-Object { $_.Name -eq $Ownership.Nat.Name -and $_.InternalIPInterfaceAddressPrefix -eq $Ownership.Nat.Prefix })
    if ($nat.Count -gt 1) { throw 'Staged rollback found duplicate owned NAT identities.' }
    if ($nat.Count -eq 1) { Remove-NetNat -Name $Ownership.Nat.Name -Confirm:$false }
  }
  if ($Ownership.GatewayIp) {
    $gatewayIp = @(Get-NetIPAddress -InterfaceAlias $Ownership.GatewayIp.InterfaceAlias -IPAddress $Ownership.GatewayIp.IPAddress -ErrorAction SilentlyContinue)
    if ($gatewayIp.Count -gt 1 -or @($gatewayIp | Where-Object { $_.PrefixLength -ne $Ownership.GatewayIp.PrefixLength }).Count -ne 0) {
      throw 'Staged rollback found an ambiguous or mismatched owned gateway address.'
    }
    if ($gatewayIp.Count -eq 1) { Remove-NetIPAddress -InterfaceIndex $gatewayIp[0].InterfaceIndex -IPAddress $gatewayIp[0].IPAddress -Confirm:$false }
  }
  if ($Ownership.Switch -and $Ownership.Switch.Id) {
    $switch = @(Get-VMSwitch | Where-Object { $_.Id -eq $Ownership.Switch.Id -and $_.Name -eq $targets.SwitchName })
    if ($switch.Count -gt 1) { throw 'Staged rollback found duplicate owned switch identities.' }
    if ($switch.Count -eq 1) { Remove-VMSwitch -Id $switch[0].Id -Force }
  }
  if ($Ownership.RunDirectory) { Remove-Item -LiteralPath $Ownership.RunDirectory.Path -Recurse -Force }
  $remaining = Get-ExactHostInventory
  Assert-TargetVacant -Inventory $remaining
  Assert-NoMappingsOrPortProxies -Inventory $remaining
  Write-Ledger -Ledger ([ordered]@{
      SchemaVersion = 2; Lifecycle = 'RolledBack'; Mode = 'Provision'; Outcome = 'PASS'; RunIdentity = $RunIdentity
      FinalZeroResidue = $true; InventoryAfter = $remaining
      Notes = @('Staged Provision failure cleanup completed with exact ownership and zero residue.')
    })
}

function Invoke-Provision {
  Assert-ProvisionAuthorization
  $preflightInventory = Get-ExactHostInventory
  Assert-TargetVacant -Inventory $preflightInventory
  Assert-NoMappingsOrPortProxies -Inventory $preflightInventory
  if (@(Get-NetNat).Count -ne 0) { throw 'Provision refuses to share or replace an existing WinNAT.' }
  $ownership = [pscustomobject]@{
    Stage = 'planned'; UpdatedUtc = [DateTime]::UtcNow.ToString('o'); RunDirectory = $null; Vm = $null; Switch = $null; Nat = $null
    GatewayIp = $null; HostProbe = $null; NetworkAcls = @(); Disks = @()
    VmConfigurationPath = $targets.VmConfigurationDirectory; CheckpointPath = $targets.CheckpointDirectory; SmartPagingPath = $targets.SmartPagingDirectory
  }
  Write-ProvisionStage -Ownership $ownership -Stage 'planned'
  $provisionSucceeded = $false
  $provisionFailure = $null
  $cleanupFailure = $null
  $hostProbe = $null
  try {
    $image = Assert-VerifiedUbuntuArchive
    $runDirectory = New-RunOwnershipMarker
    $ownership.RunDirectory = $runDirectory
    Write-ProvisionStage -Ownership $ownership -Stage 'run-root-owned'
    @($targets.VhdDirectory, $targets.EvidenceDirectory, $targets.VmConfigurationDirectory, $targets.CheckpointDirectory, $targets.SmartPagingDirectory, $targets.ConfigDirectory) | ForEach-Object { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
    $stagingDirectory = Join-Path $targets.RunRoot 'image-staging'
    New-Item -ItemType Directory -Path $stagingDirectory -Force | Out-Null
    & tar.exe -xzf $image.ArchivePath -C $stagingDirectory
    $sourceVhds = @(Get-ChildItem -LiteralPath $stagingDirectory -Recurse -File -Filter '*.vhd')
    if ($sourceVhds.Count -ne 1) { throw 'Verified archive must contain exactly one source VHD.' }
    Convert-VHD -Path $sourceVhds[0].FullName -DestinationPath $targets.OsVhdxPath -VHDType Dynamic
    $ownership.Disks += [pscustomobject]@{ Path = $targets.OsVhdxPath; Sha256 = (Get-FileHash -LiteralPath $targets.OsVhdxPath -Algorithm SHA256).Hash.ToLowerInvariant() }
    Write-ProvisionStage -Ownership $ownership -Stage 'os-vhdx-owned'
    New-CidataSeed -SeedPath $targets.CidataVhdxPath
    $ownership.Disks += [pscustomobject]@{ Path = $targets.CidataVhdxPath; Sha256 = (Get-FileHash -LiteralPath $targets.CidataVhdxPath -Algorithm SHA256).Hash.ToLowerInvariant() }
    Write-ProvisionStage -Ownership $ownership -Stage 'cidata-owned'
    New-EvidenceDisk -EvidencePath $targets.EvidenceVhdxPath
    $ownership.Disks += [pscustomobject]@{ Path = $targets.EvidenceVhdxPath; Sha256 = (Get-FileHash -LiteralPath $targets.EvidenceVhdxPath -Algorithm SHA256).Hash.ToLowerInvariant() }
    Write-ProvisionStage -Ownership $ownership -Stage 'evidence-disk-owned'
    New-VMSwitch -Name $targets.SwitchName -SwitchType Internal | Out-Null
    $ownership.Switch = Get-VMSwitch -Name $targets.SwitchName | ForEach-Object { [pscustomobject]@{ Name = $_.Name; Id = $_.Id; Type = $_.SwitchType } }
    Write-ProvisionStage -Ownership $ownership -Stage 'switch-owned'
    New-NetIPAddress -InterfaceAlias "vEthernet ($($targets.SwitchName))" -IPAddress $targets.Gateway -PrefixLength 24 | Out-Null
    $ownership.GatewayIp = [pscustomobject]@{ InterfaceAlias = "vEthernet ($($targets.SwitchName))"; IPAddress = $targets.Gateway; PrefixLength = 24 }
    Write-ProvisionStage -Ownership $ownership -Stage 'gateway-ip-owned'
    New-NetNat -Name $targets.NatName -InternalIPInterfaceAddressPrefix $targets.NatPrefix | Out-Null
    $ownership.Nat = [pscustomobject]@{ Name = $targets.NatName; Prefix = $targets.NatPrefix }
    Write-ProvisionStage -Ownership $ownership -Stage 'nat-owned'
    $hostProbe = Start-HostContainmentProbe
    $ownership.HostProbe = $hostProbe.Identity
    Write-ProvisionStage -Ownership $ownership -Stage 'host-probe-owned'
    New-VM -Name $targets.VmName -Generation 2 -MemoryStartupBytes 4GB -VHDPath $targets.OsVhdxPath -SwitchName $targets.SwitchName -Path $targets.VmConfigurationDirectory -SnapshotFileLocation $targets.CheckpointDirectory -SmartPagingFilePath $targets.SmartPagingDirectory | Out-Null
    Set-VMProcessor -VMName $targets.VmName -Count 2
    Set-VMFirmware -VMName $targets.VmName -EnableSecureBoot On -SecureBootTemplate $ubuntuImage.SecureBootTemplate
    Add-VMHardDiskDrive -VMName $targets.VmName -Path $targets.CidataVhdxPath
    Add-VMHardDiskDrive -VMName $targets.VmName -Path $targets.EvidenceVhdxPath
    $ownership.Vm = Get-VM -Name $targets.VmName | Select-Object Name, Id, Generation, State, Path, SnapshotFileLocation, SmartPagingFilePath
    Write-ProvisionStage -Ownership $ownership -Stage 'vm-owned'
    $networkAcls = New-GuestEgressIsolationAcls
    $ownership.NetworkAcls = @($networkAcls)
    Write-ProvisionStage -Ownership $ownership -Stage 'vm-nic-acls-owned'
    Start-VM -Name $targets.VmName
    Write-ProvisionStage -Ownership $ownership -Stage 'guest-booted'
    Wait-ForGuestPowerOff
    Stop-HostContainmentProbe -Probe $hostProbe
    $hostProbe = $null
    $ownership.Disks = @($ownership.Disks | Where-Object { $_.Path -ne $targets.EvidenceVhdxPath }) + @(
      [pscustomobject]@{ Path = $targets.EvidenceVhdxPath; Sha256 = (Get-FileHash -LiteralPath $targets.EvidenceVhdxPath -Algorithm SHA256).Hash.ToLowerInvariant() }
    )
    Write-ProvisionStage -Ownership $ownership -Stage 'guest-evidence-disk-returned'
    $guestEvidence = Read-GuestEvidenceDisk
    Write-ProvisionStage -Ownership $ownership -Stage 'guest-evidence-read'
    $inventory = Get-ExactHostInventory
    Assert-NoMappingsOrPortProxies -Inventory $inventory
    Assert-NoHostExposureForPorts -Ports $targets.KnownSupabasePorts -PortProxies @($inventory.PortProxy) -Listeners @($inventory.Listeners)
    $liveVm = Get-VM -Name $targets.VmName
    $liveSwitch = Get-VMSwitch -Name $targets.SwitchName
    Assert-ExactVmNetworkAcls -Vm $liveVm -Switch $liveSwitch -Expected @($ownership.NetworkAcls) | Out-Null
    $hostToGuestProbe = Test-NetConnection -ComputerName $targets.GuestAddress -Port 54321 -WarningAction SilentlyContinue
    if ($hostToGuestProbe.TcpTestSucceeded) { throw 'Host-to-guest NAT-IP probe unexpectedly succeeded.' }
    Write-Ledger -Ledger ([ordered]@{
        SchemaVersion = 2; Lifecycle = 'Provisioned'; Mode = 'Provision'; Outcome = 'PASS'; RunIdentity = $RunIdentity
        Image = $image; SecureBoot = @{ Enabled = $true; Template = $ubuntuImage.SecureBootTemplate }
        Resources = [ordered]@{
          Vm = Get-VM -Name $targets.VmName | Select-Object Name, Id, Generation, State, Path, SnapshotFileLocation, SmartPagingFilePath
          Switch = Get-VMSwitch -Name $targets.SwitchName | ForEach-Object { [ordered]@{ Name = $_.Name; Id = $_.Id; Type = $_.SwitchType } }
          Nat = @{ Name = $targets.NatName; Prefix = $targets.NatPrefix }; GatewayIp = $ownership.GatewayIp; NetworkAcls = @($ownership.NetworkAcls)
          RunDirectory = $runDirectory; FirewallRules = @(); FirewallEvidenceState = 'not-created'; PortProxies = @(); DynamicPorts = @(); DynamicPortEvidenceState = 'not-started'
          Disks = @($ownership.Disks)
          GuestEvidencePath = $targets.GuestEvidencePath
          GuestEvidence = $guestEvidence
        }
        Notes = @('No JIT configuration, runner registration, Auth, secret, or production action is present in Provision mode.', 'Guest cloud-init executes only non-secret containment checks; its evidence must be independently read and reviewed before any credential stage.')
    })
    $provisionSucceeded = $true
  } catch {
    $provisionFailure = $_
  } finally {
    if ($null -ne $hostProbe) {
      try {
        Stop-HostContainmentProbe -Probe $hostProbe
      } catch {
        $cleanupFailure = $_
      }
    }
    if (-not $provisionSucceeded) {
      try {
        Invoke-StagedProvisionRollback -Ownership $ownership
      } catch {
        if ($null -eq $cleanupFailure) { $cleanupFailure = $_ }
      }
    }
  }
  if ($null -ne $cleanupFailure) {
    if ($null -ne $provisionFailure) { throw "Provision failed: $($provisionFailure.Exception.Message). Exact staged rollback also failed: $($cleanupFailure.Exception.Message)" }
    throw "Exact staged rollback failed: $($cleanupFailure.Exception.Message)"
  }
  if ($null -ne $provisionFailure) { throw $provisionFailure }
}

if ($Mode -eq 'LedgerRegression') {
  Write-Ledger -Ledger ([ordered]@{
      Mode = $Mode
      Outcome = 'PASS'
      RunIdentity = $RunIdentity
      Encoding = 'utf-8-no-bom'
    })
  $bytes = [IO.File]::ReadAllBytes($LedgerPath)
  if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    throw 'Ledger regression wrote a UTF-8 BOM.'
  }
  $result = Get-Content -LiteralPath $LedgerPath -Raw | ConvertFrom-Json
  if ($result.Encoding -ne 'utf-8-no-bom' -or $result.RunIdentity -ne $RunIdentity) {
    throw 'Ledger regression JSON did not round-trip.'
  }
  Write-Host "PASS ledger encoding regression: $LedgerPath"
  exit 0
}

if ($Mode -eq 'RollbackPlanRegression') {
  $ledger = Read-RollbackLedger
  Write-Host "PASS rollback ledger validation only: $($ledger.RunIdentity)"
  exit 0
}

if ($Mode -eq 'ProvisionPlanRegression') {
  [pscustomobject]@{
    Mode = $Mode
    Outcome = 'PASS'
    RunIdentity = $RunIdentity
    Image = $ubuntuImage
    Targets = $targets
    Prohibited = @('JIT', 'runner-registration', 'secret', 'Auth', 'portproxy', 'static-NAT-mapping')
    ProvisionStages = @('run-root-owned', 'os-vhdx-owned', 'cidata-owned', 'evidence-disk-owned', 'switch-owned', 'gateway-ip-owned', 'nat-owned', 'host-probe-owned', 'vm-owned', 'vm-nic-acls-owned', 'guest-booted', 'guest-evidence-disk-returned', 'guest-evidence-read')
    FailureAssertions = @('empty-dynamic-ports-allowed-before-auth', 'all-static-mappings-and-portproxies-empty-after-provision', 'missing-or-invalid-evidence-fails', 'guest-timeout-fails', 'partial-stage-exact-rollback', 'no-global-host-firewall')
  } | ConvertTo-Json -Depth 8
  exit 0
}

try {
  Assert-Administrator
  $inventory = Get-ExactHostInventory

  if ($Mode -eq 'Preflight') {
    Assert-TargetVacant -Inventory $inventory
    Assert-NoHostExposureForPorts -Ports $targets.KnownSupabasePorts -PortProxies @($inventory.PortProxy) -Listeners @($inventory.Listeners)
    if (@($inventory.Nats).Count -ne 0) {
      throw 'WinNAT already has a configured NAT; this stage refuses to alter or share it.'
    }
    Write-Ledger -Ledger ([ordered]@{
        SchemaVersion = 2
        Lifecycle = 'Preflight'
        Mode = $Mode
        Outcome = 'PASS'
        RunIdentity = $RunIdentity
        Targets = $targets
        Inventory = $inventory
        Notes = @(
          'No host resource was created or changed.',
          'A separately reviewed Provision mode is required before image, VM, network, or runner creation.',
          'Rollback accepts only a future Provisioned ledger with exact D: identities, VM-NIC ACL tuples, zero portproxy/mappings, and no global host firewall rules.',
          'Host listener and port-proxy evidence is structured; Docker Desktop, WSL, Default Switch, and D:\actions-runner remain out of scope.'
        )
      })
    Write-Host "PASS elevated Hyper-V preflight; non-secret ledger: $LedgerPath"
    exit 0
  }

  if ($Mode -eq 'Provision') {
    Invoke-Provision
    Write-Host "PASS non-secret isolated Linux provision; ledger: $LedgerPath"
    exit 0
  }

  $ledger = Read-RollbackLedger
  $remaining = Invoke-Rollback -Ledger $ledger
  Write-Ledger -Ledger ([ordered]@{
      SchemaVersion = 2
      Lifecycle = 'RolledBack'
      Mode = $Mode
      Outcome = 'PASS'
      RunIdentity = $RunIdentity
      Targets = $targets
      PortProxies = @()
      InventoryAfter = $remaining
      FinalZeroResidue = $true
      Notes = @('Exact ledger-bound rollback verified zero current-run residue and no protected host-port exposure.')
    })
  Write-Host "PASS exact Hyper-V rollback; non-secret ledger: $LedgerPath"
} catch {
  $safeFailure = $_.Exception.Message
  try {
    $existingLedger = if (Test-Path -LiteralPath $LedgerPath) { Get-Content -LiteralPath $LedgerPath -Raw | ConvertFrom-Json } else { $null }
    if ($Mode -eq 'Provision' -and $existingLedger -and $existingLedger.Lifecycle -eq 'RolledBack' -and $existingLedger.FinalZeroResidue -eq $true) {
      Write-Error "Provision failed after an exact staged rollback: $safeFailure"
    } else {
      Write-Ledger -Ledger ([ordered]@{
          SchemaVersion = 2
          Mode = $Mode
          Outcome = 'FAIL'
          RunIdentity = $RunIdentity
          Targets = $targets
          Failure = $safeFailure
          Notes = @('The helper stops before provision on any failed preflight condition.')
        })
    }
  } catch {
    Write-Error "Unable to record the non-secret host preflight failure: $safeFailure"
  }
  throw
}
