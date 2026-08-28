[CmdletBinding()]
param(
  [ValidateSet('Preflight', 'Provision', 'Rollback', 'LedgerRegression', 'RollbackPlanRegression', 'ProvisionPlanRegression')]
  [string]$Mode = 'Preflight',

  [ValidatePattern('^third-code-erp-ci-[a-z0-9-]+$')]
  [string]$RunIdentity = 'third-code-erp-ci-20260828-stage2',

  [ValidatePattern('^[A-Za-z]:\\')]
  [string]$RunRoot = 'D:\third-code-erp-isolated-runner',

  [ValidatePattern('^[A-Za-z]:\\')]
  [string]$ImageCacheRoot = 'D:\third-code-erp-isolated-runner-cache',

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
$imageCacheRootPath = [IO.Path]::GetFullPath($ImageCacheRoot)
$expectedImageCacheRoot = [IO.Path]::GetFullPath('D:\third-code-erp-isolated-runner-cache')
if ($imageCacheRootPath -ne $expectedImageCacheRoot -or $imageCacheRootPath.StartsWith("$runRootPath$([IO.Path]::DirectorySeparatorChar)", [StringComparison]::OrdinalIgnoreCase) -or $imageCacheRootPath -eq $runRootPath) {
  throw "Image cache root must be the exact dedicated D: immutable cache outside the per-run vacant root: $expectedImageCacheRoot"
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
  ImageCacheRoot = $imageCacheRootPath
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
  $targetAdapter = Get-ExactVmNetworkAdapter -Vm $targetVm[0] -Switch $targetSwitch[0]
  return @(Get-RecordedVmNetworkAcls -Vm $targetVm[0] -Switch $targetSwitch[0] -Adapter $targetAdapter)
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
    ImageCache = Get-ImageCacheInventory
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

function Assert-HostReconcilesGuestDynamicPorts {
  param(
    [Parameter(Mandatory)] [int[]]$GuestDynamicPorts,
    [Parameter(Mandatory)] [object[]]$ListenerBaseline,
    [Parameter(Mandatory)] [object[]]$ListenerAfter,
    [Parameter(Mandatory)] [object[]]$PortProxies,
    [Parameter(Mandatory)] [object[]]$NatMappings
  )
  $ports = @($GuestDynamicPorts | Sort-Object -Unique)
  if ($ports.Count -eq 0 -or $ports.Count -ne $GuestDynamicPorts.Count -or @($ports | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -ne 0) {
    throw 'Guest dynamic-port union is missing, duplicated, or invalid.'
  }
  if ($PortProxies.Count -ne 0 -or $NatMappings.Count -ne 0) {
    throw 'Host cannot reconcile guest ports while any port proxy or NAT static mapping exists.'
  }
  $baselineForPorts = @($ListenerBaseline | Where-Object { $_.LocalPort -in $ports } | Select-Object LocalAddress, LocalPort, State, OwningProcess)
  $afterForPorts = @($ListenerAfter | Where-Object { $_.LocalPort -in $ports } | Select-Object LocalAddress, LocalPort, State, OwningProcess)
  # A host listener, including loopback, would make a guest-reported dynamic
  # port ambiguous. Require a clean before/after union rather than asserting it
  # is probably a guest-only publication.
  if ($baselineForPorts.Count -ne 0 -or $afterForPorts.Count -ne 0) {
    throw 'Host dynamic-port reconciliation is ambiguous: a guest-reported port exists in the host listener baseline or post-state.'
  }
  return [ordered]@{
    Outcome = 'PASS'
    GuestDynamicPorts = $ports
    ListenerBaseline = $baselineForPorts
    ListenerAfter = $afterForPorts
    NatMappings = @()
    PortProxies = @()
  }
}

function Assert-LedgerHostPortReconciliation {
  param(
    [Parameter(Mandatory)] [object]$Reconciliation,
    [Parameter(Mandatory)] [int[]]$DynamicPorts
  )
  if ($Reconciliation.Outcome -ne 'PASS' -or @($Reconciliation.NatMappings).Count -ne 0 -or @($Reconciliation.PortProxies).Count -ne 0 -or @($Reconciliation.ListenerBaseline).Count -ne 0 -or @($Reconciliation.ListenerAfter).Count -ne 0) {
    throw 'Ledger host dynamic-port reconciliation has nonzero host exposure evidence.'
  }
  $recordedPorts = @($Reconciliation.GuestDynamicPorts | ForEach-Object { [int]$_ } | Sort-Object)
  if ($recordedPorts.Count -ne $DynamicPorts.Count -or (Compare-Object -ReferenceObject @($DynamicPorts | Sort-Object) -DifferenceObject $recordedPorts)) {
    throw 'Ledger host dynamic-port reconciliation does not cover the exact guest dynamic union.'
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
  Assert-Property -Value $ledger.Image -Name 'Image'
  Assert-Property -Value $ledger.Resources.Vm -Name 'Resources.Vm'
  Assert-Property -Value $ledger.Resources.Switch -Name 'Resources.Switch'
  Assert-Property -Value $ledger.Resources.NetworkAdapter -Name 'Resources.NetworkAdapter'
  Assert-Property -Value $ledger.Resources.Nat -Name 'Resources.Nat'
  Assert-Property -Value $ledger.Resources.GatewayIp -Name 'Resources.GatewayIp'
  Assert-Property -Value $ledger.Resources.RunDirectory -Name 'Resources.RunDirectory'
  Assert-Property -Value $ledger.Resources.PortProxies -Name 'Resources.PortProxies'
  Assert-Property -Value $ledger.Resources.DynamicPorts -Name 'Resources.DynamicPorts'
  Assert-Property -Value $ledger.Resources.Disks -Name 'Resources.Disks'
  Assert-Property -Value $ledger.Resources.VmDisks -Name 'Resources.VmDisks'
  Assert-Property -Value $ledger.Resources.NetworkAcls -Name 'Resources.NetworkAcls'
  Assert-Property -Value $ledger.Resources.GuestEvidencePath -Name 'Resources.GuestEvidencePath'
  Assert-Property -Value $ledger.Resources.GuestEvidence -Name 'Resources.GuestEvidence'
  if (@($ledger.Resources.PortProxies).Count -ne 0) {
    throw 'Provisioned ledger must attest that no netsh port proxy exists.'
  }
  $expectedArchivePath = Get-ExpectedImageArchivePath
  if ($ledger.Image.CacheRoot -ne $targets.ImageCacheRoot -or $ledger.Image.CacheOwnershipScope -ne 'immutable-cache-not-run-root' -or $ledger.Image.ArchivePath -ne $expectedArchivePath -or $ledger.Image.ArchiveName -ne $ubuntuImage.ArchiveName -or $ledger.Image.Sha256 -ne $ubuntuImage.ExpectedSha256 -or $ledger.Image.Release -ne $ubuntuImage.Release -or $ledger.Image.CacheInventory.Root -ne $targets.ImageCacheRoot -or $ledger.Image.CacheInventory.OwnershipScope -ne 'immutable-cache-not-run-root' -or $ledger.Image.CacheInventory.Archive.Path -ne $expectedArchivePath -or $ledger.Image.CacheInventory.Archive.Name -ne $ubuntuImage.ArchiveName) {
    throw 'Rollback ledger immutable Ubuntu cache provenance is invalid.'
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
  Assert-LedgerRunDiskRecords -Disks @($ledger.Resources.Disks)
  Assert-LedgerVmHardDriveAttachments -Vm $ledger.Resources.Vm -Attachments @($ledger.Resources.VmDisks)
  $guestEvidence = $ledger.Resources.GuestEvidence
  if ($ledger.Resources.GuestEvidencePath -ne $targets.GuestEvidencePath -or $guestEvidence.Path -ne $targets.EvidenceVhdxPath -or [string]$guestEvidence.Sha256 -notmatch '^[a-fA-F0-9]{64}$' -or @($guestEvidence.DynamicPorts | ForEach-Object { [int]$_ }).Count -eq 0 -or @($guestEvidence.DynamicPorts | ForEach-Object { [int]$_ } | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -ne 0) {
    throw 'Rollback ledger guest-evidence identity is invalid.'
  }
  $guestAttestation = $guestEvidence.Evidence
  if ($guestAttestation.schema_version -ne 1 -or $guestAttestation.outcome -ne 'PASS' -or $guestAttestation.credential_stage -ne 'not-entered' -or $guestAttestation.runner_user -ne 'erpci' -or $guestAttestation.smoke_execution_user -ne 'erpci' -or $guestAttestation.smoke_execution_uid_nonroot -ne 'PASS' -or $guestAttestation.erpci_account -ne 'locked-nologin-no-sudo' -or $guestAttestation.root_account -ne 'locked' -or $guestAttestation.home_accounts -ne 'erpci-only' -or $guestAttestation.ssh -ne 'disabled-no-listener' -or $guestAttestation.authorized_keys -ne 'absent' -or $guestAttestation.docker_context -ne 'default' -or $guestAttestation.docker_socket -ne 'unix:///var/run/docker.sock' -or $guestAttestation.docker_data_filesystem -ne 'ext4' -or $guestAttestation.host_mounts -ne 'absent' -or $guestAttestation.gh_config -ne 'absent' -or $guestAttestation.ipv6 -ne 'disabled' -or $guestAttestation.guest_loopback -ne 'PASS' -or $guestAttestation.host_probe -ne 'DENY' -or $guestAttestation.private_probe -ne 'DENY' -or $guestAttestation.public_dns -ne 'PASS' -or $guestAttestation.public_ntp -ne 'PASS' -or $guestAttestation.github_https -ne 'PASS') {
    throw 'Rollback ledger guest-evidence attestation is invalid.'
  }
  $attestedBindings = @($guestAttestation.docker_published_bindings | ForEach-Object { [string]$_ })
  if ($attestedBindings.Count -ne @($guestEvidence.DynamicPorts).Count -or @($attestedBindings | Where-Object { $_ -notmatch '^(127\.0\.0\.1|::1):[1-9][0-9]{0,4}$' }).Count -ne 0) {
    throw 'Rollback ledger guest Docker binding attestation is invalid.'
  }
  Assert-LedgerVmNetworkAdapterShape -Vm $ledger.Resources.Vm -Switch $ledger.Resources.Switch -Adapter $ledger.Resources.NetworkAdapter
  Assert-LedgerVmNicAclShape -Vm $ledger.Resources.Vm -Switch $ledger.Resources.Switch -Adapter $ledger.Resources.NetworkAdapter -Acls @($ledger.Resources.NetworkAcls)
  Assert-Property -Value $ledger.Resources.FirewallEvidenceState -Name 'Resources.FirewallEvidenceState'
  if ($ledger.Resources.FirewallEvidenceState -ne 'not-created' -or @($ledger.Resources.FirewallRules).Count -ne 0) {
    throw 'This design forbids global host firewall rules; the ledger must attest none were created.'
  }
  $dynamicPorts = @($ledger.Resources.DynamicPorts | ForEach-Object { [int]$_ })
  Assert-Property -Value $ledger.Resources.DynamicPortEvidenceState -Name 'Resources.DynamicPortEvidenceState'
  if ($ledger.Resources.DynamicPortEvidenceState -ne 'host-reconciled') {
    throw 'Rollback ledger dynamic-port evidence state is invalid.'
  }
  if ($dynamicPorts.Count -eq 0 -or @($dynamicPorts | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -ne 0 -or @($dynamicPorts | Sort-Object -Unique).Count -ne $dynamicPorts.Count) {
    throw 'Rollback ledger dynamic port set is invalid.'
  }
  Assert-Property -Value $ledger.Resources.HostPortReconciliation -Name 'Resources.HostPortReconciliation'
  Assert-LedgerHostPortReconciliation -Reconciliation $ledger.Resources.HostPortReconciliation -DynamicPorts $dynamicPorts
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

function Assert-LedgerRunDiskRecords {
  param([Parameter(Mandatory)] [object[]]$Disks)
  $expected = [ordered]@{
    'mutable-guest-os-vhdx' = $targets.OsVhdxPath
    'immutable-cidata-seed' = $targets.CidataVhdxPath
    'mutable-guest-evidence-vhdx' = $targets.EvidenceVhdxPath
  }
  if ($Disks.Count -ne $expected.Count) { throw 'Run-disk ledger must record exactly the OS, CIDATA, and evidence disks.' }
  foreach ($role in $expected.Keys) {
    $record = @($Disks | Where-Object { $_.Role -eq $role })
    if ($record.Count -ne 1 -or [IO.Path]::GetFullPath([string]$record[0].Path) -ne $expected[$role]) {
      throw "Run-disk ledger has no exact canonical path for $role."
    }
    if ($role -eq 'mutable-guest-os-vhdx' -and [string]$record[0].InitialSha256 -notmatch '^[a-fA-F0-9]{64}$') {
      throw 'Mutable OS VHD provenance must record only its initial SHA-256.'
    }
    if ($role -eq 'mutable-guest-os-vhdx' -and ($record[0].PSObject.Properties.Name -contains 'Sha256')) {
      throw 'Mutable OS VHD must not be cleanup-authorized by content hash.'
    }
    if ($role -eq 'immutable-cidata-seed' -and [string]$record[0].Sha256 -notmatch '^[a-fA-F0-9]{64}$') {
      throw 'Immutable CIDATA seed must record its exact SHA-256.'
    }
    if ($role -eq 'mutable-guest-evidence-vhdx' -and ($record[0].PSObject.Properties.Name -contains 'Sha256')) {
      throw 'Mutable evidence VHD must not be cleanup-authorized by content hash.'
    }
  }
}

function Assert-StagedRunDiskRecords {
  param([Parameter(Mandatory)] [object[]]$Disks)
  $allowed = [ordered]@{
    'mutable-guest-os-vhdx' = $targets.OsVhdxPath
    'immutable-cidata-seed' = $targets.CidataVhdxPath
    'mutable-guest-evidence-vhdx' = $targets.EvidenceVhdxPath
  }
  foreach ($disk in $Disks) {
    if (-not $allowed.Contains($disk.Role) -or [IO.Path]::GetFullPath([string]$disk.Path) -ne $allowed[$disk.Role]) {
      throw 'Staged rollback refuses a virtual disk outside the exact canonical run-root paths.'
    }
  }
  if (@($Disks | ForEach-Object { $_.Role } | Sort-Object -Unique).Count -ne $Disks.Count) {
    throw 'Staged rollback refuses duplicate virtual-disk ownership identities.'
  }
}

function Get-RecordedVmHardDriveAttachments {
  param([Parameter(Mandatory)] [object]$Vm)
  return @(
    Get-VMHardDiskDrive -VMName $Vm.Name -ErrorAction Stop |
      ForEach-Object {
        [pscustomobject]@{
          VmId = [string]$Vm.Id
          VmName = [string]$Vm.Name
          Path = [IO.Path]::GetFullPath([string]$_.Path)
          ControllerType = [string]$_.ControllerType
          ControllerNumber = [int]$_.ControllerNumber
          ControllerLocation = [int]$_.ControllerLocation
        }
      }
  )
}

function Assert-LedgerVmHardDriveAttachments {
  param(
    [Parameter(Mandatory)] [object]$Vm,
    [Parameter(Mandatory)] [object[]]$Attachments,
    [switch]$RequireEvidenceAttachment
  )
  $requiredPaths = @($targets.OsVhdxPath, $targets.CidataVhdxPath) | ForEach-Object { [IO.Path]::GetFullPath($_) } | Sort-Object
  $evidencePath = [IO.Path]::GetFullPath($targets.EvidenceVhdxPath)
  $allowedPaths = @($requiredPaths + $evidencePath | Sort-Object -Unique)
  $actualPaths = @($Attachments | ForEach-Object { [IO.Path]::GetFullPath([string]$_.Path) } | Sort-Object)
  if ($Attachments.Count -notin @(2, 3) -or @($requiredPaths | Where-Object { $_ -notin $actualPaths }).Count -ne 0 -or @($actualPaths | Where-Object { $_ -notin $allowedPaths }).Count -ne 0 -or ($RequireEvidenceAttachment -and $evidencePath -notin $actualPaths) -or @($Attachments | Where-Object { $_.VmId -ne $Vm.Id -or $_.VmName -ne $Vm.Name -or $_.ControllerType -notin @('IDE', 'SCSI') -or $_.ControllerNumber -lt 0 -or $_.ControllerLocation -lt 0 }).Count -ne 0) {
    throw 'VM hard-drive attachment ledger is not the exact required D: guest OS/CIDATA set with only the evidence VHD optionally detached for read-only validation.'
  }
  $signatures = @($Attachments | ForEach-Object { "$($_.VmId)|$($_.VmName)|$($_.Path)|$($_.ControllerType)|$($_.ControllerNumber)|$($_.ControllerLocation)" } | Sort-Object -Unique)
  if ($signatures.Count -ne $Attachments.Count) { throw 'VM hard-drive attachment ledger contains duplicate identities.' }
}

function Assert-ExactVmHardDriveAttachments {
  param(
    [Parameter(Mandatory)] [object]$Vm,
    [Parameter(Mandatory)] [object[]]$Expected,
    [switch]$RequireEvidenceAttachment
  )
  Assert-LedgerVmHardDriveAttachments -Vm $Vm -Attachments $Expected -RequireEvidenceAttachment:$RequireEvidenceAttachment
  $actual = @(Get-RecordedVmHardDriveAttachments -Vm $Vm)
  $expectedSignatures = @($Expected | ForEach-Object { "$($_.VmId)|$($_.VmName)|$($_.Path)|$($_.ControllerType)|$($_.ControllerNumber)|$($_.ControllerLocation)" } | Sort-Object)
  $actualSignatures = @($actual | ForEach-Object { "$($_.VmId)|$($_.VmName)|$($_.Path)|$($_.ControllerType)|$($_.ControllerNumber)|$($_.ControllerLocation)" } | Sort-Object)
  if ($actualSignatures.Count -ne $expectedSignatures.Count -or (Compare-Object -ReferenceObject $expectedSignatures -DifferenceObject $actualSignatures)) {
    throw 'VM hard-drive attachment readback differs from the exact ledgered attachments.'
  }
  return $actual
}

function Invoke-Rollback {
  param([Parameter(Mandatory)] [object]$Ledger)

  Assert-RunDirectoryOwned -RunDirectory $Ledger.Resources.RunDirectory
  Assert-LedgerRunDiskRecords -Disks @($Ledger.Resources.Disks)
  $inventory = Get-ExactHostInventory
  $vm = @($inventory.Vms | Where-Object { $_.Name -eq $Ledger.Resources.Vm.Name -and $_.Id -eq $Ledger.Resources.Vm.Id })
  if ($vm.Count -gt 1) { throw 'Rollback found duplicate exact VM identities.' }
  if ($vm.Count -eq 1) {
    $switchForAcl = @($inventory.Switches | Where-Object { $_.Name -eq $Ledger.Resources.Switch.Name -and $_.Id -eq $Ledger.Resources.Switch.Id -and $_.SwitchType -eq $Ledger.Resources.Switch.Type })
    if ($switchForAcl.Count -ne 1) { throw 'Rollback refuses to remove a VM without its exact ledgered virtual switch.' }
    $adapterForAcl = Assert-ExactVmNetworkAdapter -Vm $vm[0] -Switch $switchForAcl[0] -Expected $Ledger.Resources.NetworkAdapter
    Assert-ExactVmNetworkAcls -Vm $vm[0] -Switch $switchForAcl[0] -Adapter $adapterForAcl -Expected @($Ledger.Resources.NetworkAcls) | Out-Null
    Assert-ExactVmHardDriveAttachments -Vm $vm[0] -Expected @($Ledger.Resources.VmDisks) | Out-Null
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
  Assert-HostReconcilesGuestDynamicPorts -GuestDynamicPorts @($Ledger.Resources.DynamicPorts | ForEach-Object { [int]$_ }) -ListenerBaseline @() -ListenerAfter @($remaining.Listeners) -PortProxies @($remaining.PortProxy) -NatMappings @($remaining.NatMappings) | Out-Null
  return $remaining
}

function Assert-ProvisionAuthorization {
  if ($ProvisionAuthorization -cne 'I_ACKNOWLEDGE_ISOLATED_RUNNER_PROVISION') {
    throw 'Provision is review-gated. Supply only the exact non-secret acknowledgement after Agent 12 accepts this provision code.'
  }
}

function Get-ExpectedImageArchivePath {
  $expected = [IO.Path]::GetFullPath((Join-Path $targets.ImageCacheRoot $ubuntuImage.ArchiveName))
  $candidate = if (-not [string]::IsNullOrWhiteSpace($ImageArchivePath)) { [IO.Path]::GetFullPath($ImageArchivePath) } else { $expected }
  if ($candidate -ne $expected) {
    throw 'Provision accepts only the exact immutable archive path beneath the dedicated D: image cache root.'
  }
  return $expected
}

function Get-ImageCacheInventory {
  $archivePath = Get-ExpectedImageArchivePath
  return [ordered]@{
    Root = $targets.ImageCacheRoot
    RootExists = Test-Path -LiteralPath $targets.ImageCacheRoot -PathType Container
    OwnershipScope = 'immutable-cache-not-run-root'
    Archive = [ordered]@{
      Path = $archivePath
      Exists = Test-Path -LiteralPath $archivePath -PathType Leaf
      Name = [IO.Path]::GetFileName($archivePath)
    }
  }
}

function Assert-VerifiedUbuntuArchive {
  $archivePath = Get-ExpectedImageArchivePath
  if (-not (Test-Path -LiteralPath $targets.ImageCacheRoot -PathType Container)) {
    throw "Dedicated immutable image cache root is absent: $($targets.ImageCacheRoot)"
  }
  if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
    throw "Verified Ubuntu archive is absent: $archivePath"
  }
  $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actualHash -ne $ubuntuImage.ExpectedSha256) {
    throw 'Ubuntu archive SHA-256 does not match the dated official publisher checksum.'
  }
  return [pscustomobject]@{
    CacheRoot = $targets.ImageCacheRoot
    CacheOwnershipScope = 'immutable-cache-not-run-root'
    CacheInventory = Get-ImageCacheInventory
    ArchivePath = $archivePath
    ArchiveName = $ubuntuImage.ArchiveName
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
  - path: /usr/local/sbin/third-code-erp-guest-smoke
    permissions: '0755'
    content: |
      #!/usr/bin/env bash
      set -euo pipefail
      test "$(id -un)" = erpci
      test "$(id -u)" -ne 0
      test -z "${DOCKER_HOST:-}"
      test -z "${DOCKER_CONTEXT:-}"
      id -nG | tr ' ' '\n' | grep -qx docker
      if command -v sudo >/dev/null; then ! sudo -n true; fi
      test ! -e /mnt/wsl
      test ! -d /mnt/c
      ! findmnt --noheadings --types 9p,cifs,smb3,fuse.drvfs >/dev/null
      systemctl is-active --quiet docker
      test "$(docker context show)" = default
      test "$(docker context inspect default --format '{{.Endpoints.docker.Host}}')" = unix:///var/run/docker.sock
      test -S /var/run/docker.sock
      test "$(findmnt --noheadings --output FSTYPE --target "$(docker info --format '{{.DockerRootDir}}')" | xargs)" = ext4
      test "$(sysctl --values net.ipv6.conf.all.disable_ipv6)" = 1
      probe_name=third-code-erp-precredential-probe
      trap 'docker rm --force "$probe_name" >/dev/null 2>&1 || true' EXIT
      docker run --detach --name "$probe_name" --publish 127.0.0.1::80 nginx@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46 >/dev/null
      bindings="$(docker inspect --format '{{range $port, $bindings := .NetworkSettings.Ports}}{{range $bindings}}{{printf "%s %s\\n" .HostIp .HostPort}}{{end}}{{end}}' "$probe_name")"
      test -n "$bindings"
      while read -r host_ip host_port; do
        case "$host_ip" in 127.0.0.1|::1) ;; *) exit 1 ;; esac
        ss --listening --tcp --numeric --no-header "( sport = :${host_port} )" | grep -F ":${host_port}"
        curl --fail --silent "http://${host_ip}:${host_port}/" >/dev/null
      done <<< "$bindings"
      dynamic_ports="$(printf '%s\n' "$bindings" | awk '{print $2}' | sort --numeric-sort --unique | paste --serial --delimiters ',')"
      binding_json="$(printf '%s\n' "$bindings" | awk '{printf "%s%s:%s", (NR==1 ? "" : ","), $1, $2}')"
      test -n "$dynamic_ports"
      case "$dynamic_ports" in *[!0-9,]*) exit 1 ;; esac
      case "$binding_json" in *[!0-9a-fA-F:.,]*) exit 1 ;; esac
      install --directory --owner erpci --group erpci --mode 0700 /run/third-code-erp-precredential
      printf '%s\n' "$dynamic_ports" > /run/third-code-erp-precredential/dynamic-ports
      printf '%s\n' "$binding_json" > /run/third-code-erp-precredential/docker-bindings
      docker rm --force "$probe_name" >/dev/null
      trap - EXIT
      ! nc -z -w 2 172.31.202.1 29876
      ! nc -z -w 2 10.0.0.1 443
      getent ahostsv4 time.cloudflare.com >/dev/null
      nc -z -u -w 2 time.cloudflare.com 123
      curl --fail --silent --head https://api.github.com/ >/dev/null
  - path: /usr/local/sbin/third-code-erp-precredential-evidence
    permissions: '0700'
    content: |
      #!/usr/bin/env bash
      set -euo pipefail
      test "$(getent passwd erpci | cut -d: -f7)" = /usr/sbin/nologin
      test "$(passwd -S erpci | awk '{print $2}')" = L
      test "$(passwd -S root | awk '{print $2}')" = L
      id -nG erpci | tr ' ' '\n' | grep -qx docker
      ! id -nG erpci | tr ' ' '\n' | grep -qx sudo
      test "$(find /home -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)" = erpci
      ! systemctl is-active --quiet ssh.service
      ! systemctl is-enabled ssh.service >/dev/null 2>&1
      ! ss --listening --tcp --numeric --no-header | grep -E '[:.]22[[:space:]]'
      test ! -e /root/.ssh/authorized_keys
      test ! -e /home/erpci/.ssh/authorized_keys
      ! find /home -type f -path '*/.ssh/authorized_keys' -print -quit | grep -q .
      test ! -e /root/.config/gh/hosts.yml
      test ! -e /home/erpci/.config/gh/hosts.yml
      ! command -v gh >/dev/null
      runuser -u erpci -- /usr/local/sbin/third-code-erp-guest-smoke
      dynamic_ports="$(cat /run/third-code-erp-precredential/dynamic-ports)"
      docker_bindings="$(cat /run/third-code-erp-precredential/docker-bindings)"
      case "$dynamic_ports" in *[!0-9,]*) exit 1 ;; esac
      case "$docker_bindings" in *[!0-9a-fA-F:.,]*) exit 1 ;; esac
      install --directory --mode 0700 /mnt/erp-evidence
      mount -L ERPEVIDENCE /mnt/erp-evidence
      printf '{"schema_version":1,"outcome":"PASS","credential_stage":"not-entered","runner_user":"erpci","smoke_execution_user":"erpci","smoke_execution_uid_nonroot":"PASS","erpci_account":"locked-nologin-no-sudo","root_account":"locked","home_accounts":"erpci-only","ssh":"disabled-no-listener","authorized_keys":"absent","docker_socket_residual":"guest-root","docker_context":"default","docker_socket":"unix:///var/run/docker.sock","docker_data_filesystem":"ext4","host_mounts":"absent","gh_config":"absent","ipv6":"disabled","guest_firewall":"deny-inbound-and-restricted-outbound","dynamic_ports":[%s],"docker_published_bindings":["%s"],"guest_loopback":"PASS","host_probe":"DENY","private_probe":"DENY","public_dns":"PASS","public_ntp":"PASS","github_https":"PASS"}\n' "$dynamic_ports" "$docker_bindings" > /mnt/erp-evidence/precredential-containment.json
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
  # IPv6 is disabled in the guest before the smoke. These are outbound IPv4
  # denials only; the separately ledgered inbound VM-NIC deny-all blocks every
  # origin before any guest service can be reached.
  return @(
    '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
    '169.254.0.0/16', '172.16.0.0/12', '172.31.202.0/24',
    '192.0.0.0/24', '192.0.2.0/24', '192.168.0.0/16',
    '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24',
    '224.0.0.0/4', '240.0.0.0/4'
  )
}

function Get-ExactVmNetworkAdapter {
  param(
    [Parameter(Mandatory)] [object]$Vm,
    [Parameter(Mandatory)] [object]$Switch
  )
  if ($Switch.Name -ne $targets.SwitchName -or $Switch.SwitchType -ne 'Internal' -or $Switch.Name -in @('Default Switch', 'WSL')) {
    throw 'VM NIC verification refuses a Default, WSL, external, or non-target virtual switch.'
  }
  $adapters = @(Get-VMNetworkAdapter -VMName $Vm.Name -ErrorAction Stop)
  if ($adapters.Count -ne 1) { throw 'VM NIC verification requires exactly one target VM network adapter.' }
  $adapter = $adapters[0]
  if ([string]$adapter.SwitchName -ne $Switch.Name -or [string]::IsNullOrWhiteSpace([string]$adapter.Name) -or [string]::IsNullOrWhiteSpace([string]$adapter.Id) -or [string]::IsNullOrWhiteSpace([string]$adapter.MacAddress) -or $adapter.IsLegacy -eq $true) {
    throw 'VM NIC verification found a spoofed, unattached, legacy, or mismatched adapter.'
  }
  return [pscustomobject]@{
    VmId = [string]$Vm.Id
    VmName = [string]$Vm.Name
    AdapterId = [string]$adapter.Id
    AdapterName = [string]$adapter.Name
    MacAddress = [string]$adapter.MacAddress
    SwitchId = [string]$Switch.Id
    SwitchName = [string]$Switch.Name
    SwitchType = [string]$Switch.SwitchType
    IsLegacy = [bool]$adapter.IsLegacy
  }
}

function Assert-ExactVmNetworkAdapter {
  param(
    [Parameter(Mandatory)] [object]$Vm,
    [Parameter(Mandatory)] [object]$Switch,
    [Parameter(Mandatory)] [object]$Expected
  )
  $actual = Get-ExactVmNetworkAdapter -Vm $Vm -Switch $Switch
  foreach ($property in @('VmId', 'VmName', 'AdapterId', 'AdapterName', 'MacAddress', 'SwitchId', 'SwitchName', 'SwitchType', 'IsLegacy')) {
    if ([string]$actual.$property -ne [string]$Expected.$property) { throw "VM NIC readback differs from ledgered $property." }
  }
  return $actual
}

function Assert-LedgerVmNetworkAdapterShape {
  param(
    [Parameter(Mandatory)] [object]$Vm,
    [Parameter(Mandatory)] [object]$Switch,
    [Parameter(Mandatory)] [object]$Adapter
  )
  if ($Adapter.VmId -ne $Vm.Id -or $Adapter.VmName -ne $Vm.Name -or $Adapter.SwitchId -ne $Switch.Id -or $Adapter.SwitchName -ne $Switch.Name -or $Adapter.SwitchType -ne 'Internal' -or $Adapter.SwitchName -in @('Default Switch', 'WSL') -or $Adapter.IsLegacy -eq $true -or [string]::IsNullOrWhiteSpace([string]$Adapter.AdapterId) -or [string]::IsNullOrWhiteSpace([string]$Adapter.AdapterName) -or [string]::IsNullOrWhiteSpace([string]$Adapter.MacAddress)) {
    throw 'Ledger VM NIC identity is not an exact non-default internal-switch attachment.'
  }
}

function Get-RecordedVmNetworkAcls {
  param(
    [Parameter(Mandatory)] [object]$Vm,
    [Parameter(Mandatory)] [object]$Switch,
    [Parameter(Mandatory)] [object]$Adapter
  )
  return @(
    Get-VMNetworkAdapterExtendedAcl -VMName $Vm.Name -VMNetworkAdapterName $Adapter.AdapterName |
      ForEach-Object {
        [pscustomobject]@{
          VmId = [string]$Vm.Id
          VmName = [string]$Vm.Name
          SwitchId = [string]$Switch.Id
          AdapterId = [string]$Adapter.AdapterId
          AdapterName = [string]$Adapter.AdapterName
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
    [string]$Acl.AdapterId, [string]$Acl.AdapterName, [string]$Acl.Direction, [string]$Acl.Action,
    [string]$Acl.LocalIPAddress, [string]$Acl.RemoteIPAddress,
    [string]$Acl.Protocol, [string]$Acl.LocalPort, [string]$Acl.RemotePort,
    [string]$Acl.Weight, [string]$Acl.Stateful
  ) -join '|'
}

function Assert-LedgerVmNicAclShape {
  param(
    [Parameter(Mandatory)] [object]$Vm,
    [Parameter(Mandatory)] [object]$Switch,
    [Parameter(Mandatory)] [object]$Adapter,
    [Parameter(Mandatory)] [object[]]$Acls
  )
  $requiredDestinations = @(Get-RequiredVmNicAclDestinations | Sort-Object)
  if ($Acls.Count -ne ($requiredDestinations.Count + 1)) {
    throw 'VM-NIC ACL ledger count is incomplete.'
  }
  $inbound = @($Acls | Where-Object { $_.Direction -eq 'Inbound' })
  if ($inbound.Count -ne 1 -or $inbound[0].RemoteIPAddress -notin @('Any', '*', '0.0.0.0/0', '::/0')) {
    throw 'VM-NIC ACL ledger must contain one exact adapter-bound inbound deny-all rule.'
  }
  $outbound = @($Acls | Where-Object { $_.Direction -eq 'Outbound' })
  $outboundDestinations = @($outbound | ForEach-Object { [string]$_.RemoteIPAddress } | Sort-Object -Unique)
  if ($outbound.Count -ne $requiredDestinations.Count -or $outboundDestinations.Count -ne $requiredDestinations.Count -or (Compare-Object -ReferenceObject $requiredDestinations -DifferenceObject $outboundDestinations)) {
    throw 'VM-NIC outbound ACLs do not cover every required host/private/LAN/reserved destination.'
  }
  if (@($Acls | Where-Object {
      $_.VmId -ne $Vm.Id -or $_.VmName -ne $Vm.Name -or $_.SwitchId -ne $Switch.Id -or $_.AdapterId -ne $Adapter.AdapterId -or $_.AdapterName -ne $Adapter.AdapterName -or
      $_.Action -ne 'Deny' -or $_.Protocol -ne 'Any' -or $_.RemoteIPAddress -eq '' -or
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
    [Parameter(Mandatory)] [object]$Adapter,
    [Parameter(Mandatory)] [object[]]$Expected
  )
  Assert-LedgerVmNicAclShape -Vm $Vm -Switch $Switch -Adapter $Adapter -Acls $Expected
  $requiredDestinations = @(Get-RequiredVmNicAclDestinations | Sort-Object)
  $actual = @(Get-RecordedVmNetworkAcls -Vm $Vm -Switch $Switch -Adapter $Adapter)
  $expectedSignatures = @($Expected | ForEach-Object { Get-VmNicAclSignature -Acl $_ } | Sort-Object)
  $actualSignatures = @($actual | ForEach-Object { Get-VmNicAclSignature -Acl $_ } | Sort-Object)
  if ($expectedSignatures.Count -ne ($requiredDestinations.Count + 1) -or $actualSignatures.Count -ne $expectedSignatures.Count -or (Compare-Object -ReferenceObject $expectedSignatures -DifferenceObject $actualSignatures)) {
    throw 'VM-NIC extended ACL readback differs from the exact ledgered ACL set.'
  }
  return $actual
}

function New-GuestEgressIsolationAcls {
  $vm = Get-VM -Name $targets.VmName
  $switch = Get-VMSwitch -Name $targets.SwitchName
  $adapter = Get-ExactVmNetworkAdapter -Vm $vm -Switch $switch
  $weight = 100
  Add-VMNetworkAdapterExtendedAcl -VMName $targets.VmName -VMNetworkAdapterName $adapter.AdapterName -Direction Inbound -Action Deny -LocalIPAddress Any -RemoteIPAddress Any -Protocol Any -LocalPort Any -RemotePort Any -Weight $weight
  $weight += 10
  foreach ($destination in @(Get-RequiredVmNicAclDestinations)) {
    Add-VMNetworkAdapterExtendedAcl -VMName $targets.VmName -VMNetworkAdapterName $adapter.AdapterName -Direction Outbound -Action Deny -LocalIPAddress Any -RemoteIPAddress $destination -Protocol Any -LocalPort Any -RemotePort Any -Weight $weight
    $weight += 10
  }
  # Read back every ACL tuple before a guest receives egress. The inbound ACLs
  # cover host/private/LAN origins; no portproxy or NAT mapping is permitted.
  $live = @(Get-RecordedVmNetworkAcls -Vm $vm -Switch $switch -Adapter $adapter)
  Assert-LedgerVmNicAclShape -Vm $vm -Switch $switch -Adapter $adapter -Acls $live
  return [pscustomobject]@{ Adapter = $adapter; Acls = $live }
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
  $detachedEvidenceDrive = $null
  $result = $null
  try {
    if ((Get-VM -Name $targets.VmName).State -ne 'Off') { throw 'Guest evidence may be detached only after the exact VM is Off.' }
    $evidenceDrive = @(Get-VMHardDiskDrive -VMName $targets.VmName | Where-Object { $_.Path -eq $targets.EvidenceVhdxPath })
    if ($evidenceDrive.Count -ne 1) { throw 'Guest evidence disk is not attached exactly once to the target VM.' }
    $detachedEvidenceDrive = $evidenceDrive[0]
    $detachedEvidenceDrive | Remove-VMHardDiskDrive
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
      smoke_execution_user = 'erpci'; smoke_execution_uid_nonroot = 'PASS'; erpci_account = 'locked-nologin-no-sudo'; root_account = 'locked'
      home_accounts = 'erpci-only'; ssh = 'disabled-no-listener'; authorized_keys = 'absent'
    }
    foreach ($entry in $required.GetEnumerator()) {
      if ($evidence.$($entry.Key) -ne $entry.Value) { throw "Guest evidence has an invalid $($entry.Key) value." }
    }
    $guestDynamicPorts = @($evidence.dynamic_ports | ForEach-Object { [int]$_ })
    if ($guestDynamicPorts.Count -eq 0 -or @($guestDynamicPorts | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -ne 0 -or @($guestDynamicPorts | Sort-Object -Unique).Count -ne $guestDynamicPorts.Count) {
      throw 'Guest evidence is missing or does not prove the required non-secret containment controls.'
    }
    $bindings = @($evidence.docker_published_bindings | ForEach-Object { [string]$_ })
    if ($bindings.Count -ne $guestDynamicPorts.Count -or @($bindings | Where-Object { $_ -notmatch '^(127\.0\.0\.1|::1):[1-9][0-9]{0,4}$' }).Count -ne 0) {
      throw 'Guest evidence does not record the exact loopback-only Docker published binding union.'
    }
    $bindingPorts = @($bindings | ForEach-Object { [int](($_ -split ':')[-1]) } | Sort-Object)
    if ($bindingPorts.Count -ne $guestDynamicPorts.Count -or (Compare-Object -ReferenceObject @($guestDynamicPorts | Sort-Object) -DifferenceObject $bindingPorts)) {
      throw 'Guest evidence Docker binding ports do not match the observed dynamic listener union.'
    }
    $result = [pscustomobject]@{ Path = $targets.EvidenceVhdxPath; Sha256 = $evidenceHash; DynamicPorts = $guestDynamicPorts; Evidence = $evidence }
  } finally {
    if ($mounted) { Dismount-VHD -Path $targets.EvidenceVhdxPath }
    if ($null -ne $detachedEvidenceDrive) {
      $existing = @(Get-VMHardDiskDrive -VMName $targets.VmName | Where-Object { $_.Path -eq $targets.EvidenceVhdxPath })
      if ($existing.Count -ne 0) { throw 'Evidence VHD reattachment found an ambiguous pre-existing attachment.' }
      Add-VMHardDiskDrive -VMName $targets.VmName -Path $targets.EvidenceVhdxPath -ControllerType $detachedEvidenceDrive.ControllerType -ControllerNumber $detachedEvidenceDrive.ControllerNumber -ControllerLocation $detachedEvidenceDrive.ControllerLocation
    }
  }
  if ($null -eq $result) { throw 'Guest evidence did not produce a validated result.' }
  return $result
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
  if (@($Ownership.Disks).Count -gt 0) { Assert-StagedRunDiskRecords -Disks @($Ownership.Disks) }
  if ($Ownership.Vm -and $Ownership.Vm.Id) {
    $vm = @(Get-VM | Where-Object { $_.Id -eq $Ownership.Vm.Id -and $_.Name -eq $targets.VmName })
    if ($vm.Count -gt 1) { throw 'Staged rollback found duplicate owned VM identities.' }
    if ($vm.Count -eq 1) {
      if (@($Ownership.NetworkAcls).Count -gt 0) {
        if (-not $Ownership.Switch -or -not $Ownership.Switch.Id) { throw 'Staged rollback refuses VM-NIC ACL removal without an exact recorded switch.' }
        $switchForAcl = @(Get-VMSwitch | Where-Object { $_.Id -eq $Ownership.Switch.Id -and $_.Name -eq $targets.SwitchName })
        if ($switchForAcl.Count -ne 1) { throw 'Staged rollback found no exact virtual switch for VM-NIC ACL validation.' }
        $adapterForAcl = Assert-ExactVmNetworkAdapter -Vm $vm[0] -Switch $switchForAcl[0] -Expected $Ownership.NetworkAdapter
        Assert-ExactVmNetworkAcls -Vm $vm[0] -Switch $switchForAcl[0] -Adapter $adapterForAcl -Expected @($Ownership.NetworkAcls) | Out-Null
      }
      if (@($Ownership.VmDisks).Count -gt 0) {
        Assert-ExactVmHardDriveAttachments -Vm $vm[0] -Expected @($Ownership.VmDisks) | Out-Null
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
    GatewayIp = $null; HostProbe = $null; HostListenerBaseline = @(); HostPortReconciliation = $null; NetworkAdapter = $null; NetworkAcls = @(); Disks = @(); VmDisks = @()
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
    # cloud-init mutates the guest OS VHD during first boot. Its initial hash is
    # provenance only; cleanup authority is the marker-owned path plus the exact
    # live Hyper-V attachment recorded below, never a post-boot content hash.
    $ownership.Disks += [pscustomobject]@{ Role = 'mutable-guest-os-vhdx'; Path = $targets.OsVhdxPath; InitialSha256 = (Get-FileHash -LiteralPath $targets.OsVhdxPath -Algorithm SHA256).Hash.ToLowerInvariant() }
    Write-ProvisionStage -Ownership $ownership -Stage 'os-vhdx-owned'
    New-CidataSeed -SeedPath $targets.CidataVhdxPath
    $ownership.Disks += [pscustomobject]@{ Role = 'immutable-cidata-seed'; Path = $targets.CidataVhdxPath; Sha256 = (Get-FileHash -LiteralPath $targets.CidataVhdxPath -Algorithm SHA256).Hash.ToLowerInvariant() }
    Write-ProvisionStage -Ownership $ownership -Stage 'cidata-owned'
    New-EvidenceDisk -EvidencePath $targets.EvidenceVhdxPath
    $ownership.Disks += [pscustomobject]@{ Role = 'mutable-guest-evidence-vhdx'; Path = $targets.EvidenceVhdxPath }
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
    $ownership.VmDisks = Get-RecordedVmHardDriveAttachments -Vm $ownership.Vm
    Assert-LedgerVmHardDriveAttachments -Vm $ownership.Vm -Attachments @($ownership.VmDisks) -RequireEvidenceAttachment
    Write-ProvisionStage -Ownership $ownership -Stage 'vm-owned'
    $networkBoundary = New-GuestEgressIsolationAcls
    $ownership.NetworkAdapter = $networkBoundary.Adapter
    $ownership.NetworkAcls = @($networkBoundary.Acls)
    Write-ProvisionStage -Ownership $ownership -Stage 'vm-nic-acls-owned'
    $ownership.HostListenerBaseline = @(Get-HostListeners)
    Write-ProvisionStage -Ownership $ownership -Stage 'host-listener-baseline'
    Start-VM -Name $targets.VmName
    Write-ProvisionStage -Ownership $ownership -Stage 'guest-booted'
    Wait-ForGuestPowerOff
    Stop-HostContainmentProbe -Probe $hostProbe
    $hostProbe = $null
    Write-ProvisionStage -Ownership $ownership -Stage 'guest-evidence-disk-returned'
    $guestEvidence = Read-GuestEvidenceDisk
    $ownership.VmDisks = Get-RecordedVmHardDriveAttachments -Vm (Get-VM -Name $targets.VmName)
    Write-ProvisionStage -Ownership $ownership -Stage 'guest-evidence-read'
    $inventory = Get-ExactHostInventory
    Assert-NoMappingsOrPortProxies -Inventory $inventory
    Assert-NoHostExposureForPorts -Ports $targets.KnownSupabasePorts -PortProxies @($inventory.PortProxy) -Listeners @($inventory.Listeners)
    $ownership.HostPortReconciliation = Assert-HostReconcilesGuestDynamicPorts -GuestDynamicPorts @($guestEvidence.DynamicPorts) -ListenerBaseline @($ownership.HostListenerBaseline) -ListenerAfter @($inventory.Listeners) -PortProxies @($inventory.PortProxy) -NatMappings @($inventory.NatMappings)
    $liveVm = Get-VM -Name $targets.VmName
    $liveSwitch = Get-VMSwitch -Name $targets.SwitchName
    $liveAdapter = Assert-ExactVmNetworkAdapter -Vm $liveVm -Switch $liveSwitch -Expected $ownership.NetworkAdapter
    Assert-ExactVmNetworkAcls -Vm $liveVm -Switch $liveSwitch -Adapter $liveAdapter -Expected @($ownership.NetworkAcls) | Out-Null
    Assert-ExactVmHardDriveAttachments -Vm $liveVm -Expected @($ownership.VmDisks) | Out-Null
    $hostToGuestProbe = Test-NetConnection -ComputerName $targets.GuestAddress -Port 54321 -WarningAction SilentlyContinue
    if ($hostToGuestProbe.TcpTestSucceeded) { throw 'Host-to-guest NAT-IP probe unexpectedly succeeded.' }
    Write-Ledger -Ledger ([ordered]@{
        SchemaVersion = 2; Lifecycle = 'Provisioned'; Mode = 'Provision'; Outcome = 'PASS'; RunIdentity = $RunIdentity
        Image = $image; SecureBoot = @{ Enabled = $true; Template = $ubuntuImage.SecureBootTemplate }
        Resources = [ordered]@{
          Vm = Get-VM -Name $targets.VmName | Select-Object Name, Id, Generation, State, Path, SnapshotFileLocation, SmartPagingFilePath
          Switch = Get-VMSwitch -Name $targets.SwitchName | ForEach-Object { [ordered]@{ Name = $_.Name; Id = $_.Id; Type = $_.SwitchType } }
          NetworkAdapter = $ownership.NetworkAdapter; Nat = @{ Name = $targets.NatName; Prefix = $targets.NatPrefix }; GatewayIp = $ownership.GatewayIp; NetworkAcls = @($ownership.NetworkAcls)
          RunDirectory = $runDirectory; VmDisks = @($ownership.VmDisks); FirewallRules = @(); FirewallEvidenceState = 'not-created'; PortProxies = @(); DynamicPorts = @($guestEvidence.DynamicPorts); DynamicPortEvidenceState = 'host-reconciled'
          HostPortReconciliation = $ownership.HostPortReconciliation
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
    ProvisionStages = @('run-root-owned', 'os-vhdx-owned', 'cidata-owned', 'evidence-disk-owned', 'switch-owned', 'gateway-ip-owned', 'nat-owned', 'host-probe-owned', 'vm-owned', 'vm-nic-acls-owned', 'host-listener-baseline', 'guest-booted', 'guest-evidence-disk-returned', 'guest-evidence-read')
    FailureAssertions = @('all-static-mappings-and-portproxies-empty-after-provision', 'guest-dynamic-port-union-reconciled-against-host-baseline-and-post-state', 'missing-or-invalid-evidence-fails', 'guest-timeout-fails', 'partial-stage-exact-rollback', 'mutable-vhd-cleanup-is-marker-path-and-live-attachment-not-content-hash', 'no-global-host-firewall')
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
