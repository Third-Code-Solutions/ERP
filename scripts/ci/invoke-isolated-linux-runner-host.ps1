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

$firewallRuleNames = [ordered]@{
  HostInboundDeny = "Third Code ERP $RunIdentity - host-inbound-deny"
  HostPrivateDeny = "Third Code ERP $RunIdentity - host-private-deny"
  GuestProbeDeny = "Third Code ERP $RunIdentity - guest-probe-deny"
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
  FirewallRuleNames = @($firewallRuleNames.Values)
  KnownSupabasePorts = @(54321, 54322, 54323, 54324, 54327)
  DockerOwnershipLabel = "com.thirdcode.erp.run=$RunIdentity"
  VhdDirectory = Join-Path $runRootPath 'vhd'
  EvidenceDirectory = Join-Path $runRootPath 'evidence'
  OsVhdxPath = Join-Path $runRootPath 'vhd\ubuntu-os.vhdx'
  CidataVhdxPath = Join-Path $runRootPath 'vhd\cidata.vhdx'
  GuestEvidencePath = '/var/lib/third-code-erp/evidence/precredential-containment.json'
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
  [IO.File]::WriteAllText(
    $LedgerPath,
    ($Ledger | ConvertTo-Json -Depth 12),
    $utf8WithoutBom
  )
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

function Get-TargetFirewallRules {
  $rules = @()
  foreach ($ruleName in $targets.FirewallRuleNames) {
    $rules += @(
      Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue |
        ForEach-Object { Get-FirewallRuleEvidence -Rule $_ }
    )
  }
  return @($rules)
}

function Get-FirewallRuleEvidence {
  param([Parameter(Mandatory)] [object]$Rule)
  [pscustomobject]@{
    Name = $Rule.Name
    InstanceID = $Rule.InstanceID
    DisplayName = $Rule.DisplayName
    Direction = $Rule.Direction.ToString()
    Action = $Rule.Action.ToString()
    Enabled = $Rule.Enabled.ToString()
    Profile = @($Rule.Profile | ForEach-Object { $_.ToString() })
    PolicyStoreSource = $Rule.PolicyStoreSource
    PortFilters = @(
      Get-NetFirewallPortFilter -AssociatedNetFirewallRule $Rule -ErrorAction Stop |
        Select-Object Protocol, LocalPort, RemotePort
    )
    AddressFilters = @(
      Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $Rule -ErrorAction Stop |
        Select-Object LocalAddress, RemoteAddress
    )
    InterfaceFilters = @(
      Get-NetFirewallInterfaceFilter -AssociatedNetFirewallRule $Rule -ErrorAction Stop |
        Select-Object InterfaceAlias, InterfaceType
    )
  }
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
    FirewallRules = @(Get-TargetFirewallRules)
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
  if (@($Inventory.FirewallRules).Count -ne 0) {
    throw 'Target firewall rules already exist by exact display-name identity.'
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

function Get-NormalizedValues {
  param([object]$Value)
  return @(
    @($Value) |
      ForEach-Object { ([string]$_).Trim() } |
      Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
      Sort-Object -Unique
  )
}

function Assert-ExactValueSet {
  param(
    [Parameter(Mandatory)] [object]$Expected,
    [Parameter(Mandatory)] [object]$Actual,
    [Parameter(Mandatory)] [string]$Name
  )
  $expectedValues = @(Get-NormalizedValues -Value $Expected)
  $actualValues = @(Get-NormalizedValues -Value $Actual)
  if ($expectedValues.Count -eq 0 -or $expectedValues.Count -ne $actualValues.Count -or (Compare-Object -ReferenceObject $expectedValues -DifferenceObject $actualValues)) {
    throw "Firewall filter mismatch for $Name."
  }
}

function Assert-ExactFirewallFilter {
  param(
    [Parameter(Mandatory)] [object]$Expected,
    [Parameter(Mandatory)] [object[]]$Actual,
    [Parameter(Mandatory)] [string[]]$Properties,
    [Parameter(Mandatory)] [string]$Name
  )
  if (@($Actual).Count -ne 1) {
    throw "Firewall filter count mismatch for $Name."
  }
  foreach ($property in $Properties) {
    Assert-ExactValueSet -Expected $Expected.$property -Actual $Actual[0].$property -Name "$Name.$property"
  }
}

function Assert-NarrowFirewallScope {
  param(
    [Parameter(Mandatory)] [object]$FirewallRule,
    [Parameter(Mandatory)] [object]$Vm,
    [Parameter(Mandatory)] [object]$Switch
  )
  Assert-Property -Value $FirewallRule.Enabled -Name 'FirewallRule.Enabled'
  Assert-Property -Value $FirewallRule.Profile -Name 'FirewallRule.Profile'
  Assert-Property -Value $FirewallRule.Scope -Name 'FirewallRule.Scope'
  Assert-Property -Value $FirewallRule.Scope.PortFilter -Name 'FirewallRule.Scope.PortFilter'
  Assert-Property -Value $FirewallRule.Scope.AddressFilter -Name 'FirewallRule.Scope.AddressFilter'
  Assert-Property -Value $FirewallRule.Scope.InterfaceFilter -Name 'FirewallRule.Scope.InterfaceFilter'
  Assert-Property -Value $FirewallRule.Scope.Binding -Name 'FirewallRule.Scope.Binding'

  if ([string]$FirewallRule.Enabled -notmatch '^(?i:true|enabled)$') {
    throw 'Rollback ledger firewall rule is not explicitly enabled.'
  }
  $profiles = @(Get-NormalizedValues -Value $FirewallRule.Profile)
  if ($profiles.Count -eq 0 -or $profiles -contains 'Any') {
    throw 'Rollback ledger firewall profile scope is global or empty.'
  }
  $portFilter = $FirewallRule.Scope.PortFilter
  $addressFilter = $FirewallRule.Scope.AddressFilter
  $interfaceFilter = $FirewallRule.Scope.InterfaceFilter
  if ([string]$portFilter.Protocol -notin @('TCP', 'UDP', 'Any') -or [string]$portFilter.LocalPort -in @('', '*') -or [string]$portFilter.RemotePort -in @('', '*')) {
    throw 'Rollback ledger firewall port/protocol scope is global or invalid.'
  }
  foreach ($address in @($addressFilter.LocalAddress, $addressFilter.RemoteAddress)) {
    if ([string]$address -in @('', 'Any', '*', '0.0.0.0/0', '::/0')) {
      throw 'Rollback ledger firewall address scope is global or invalid.'
    }
  }
  $expectedInterfaceAlias = "vEthernet ($($Switch.Name))"
  if ([string]$interfaceFilter.InterfaceAlias -ne $expectedInterfaceAlias -or [string]$interfaceFilter.InterfaceType -in @('', 'Any', '*')) {
    throw 'Rollback ledger firewall interface scope is not the dedicated virtual switch.'
  }
  $binding = $FirewallRule.Scope.Binding
  if ($binding.Kind -ne 'HostFirewallInterfaceFilter' -or $binding.SupportedFilter -ne 'Get-NetFirewallInterfaceFilter' -or $binding.VmId -ne $Vm.Id -or $binding.SwitchId -ne $Switch.Id -or $binding.InterfaceAlias -ne $expectedInterfaceAlias) {
    throw 'Rollback ledger firewall Hyper-V binding evidence is invalid.'
  }
}

function Assert-FirewallRuleMatchesLedger {
  param([Parameter(Mandatory)] [object]$FirewallRule)
  $liveRules = @(Get-NetFirewallRule -Name $FirewallRule.Name -ErrorAction SilentlyContinue)
  if ($liveRules.Count -gt 1) {
    throw 'Rollback found duplicate exact firewall rule identities.'
  }
  if ($liveRules.Count -eq 0) {
    return $null
  }
  $live = Get-FirewallRuleEvidence -Rule $liveRules[0]
  foreach ($property in @('InstanceID', 'DisplayName', 'Direction', 'Action', 'Enabled')) {
    Assert-ExactValueSet -Expected $FirewallRule.$property -Actual $live.$property -Name "FirewallRule.$property"
  }
  Assert-ExactValueSet -Expected $FirewallRule.Profile -Actual $live.Profile -Name 'FirewallRule.Profile'
  Assert-ExactFirewallFilter -Expected $FirewallRule.Scope.PortFilter -Actual @($live.PortFilters) -Properties @('Protocol', 'LocalPort', 'RemotePort') -Name 'PortFilter'
  Assert-ExactFirewallFilter -Expected $FirewallRule.Scope.AddressFilter -Actual @($live.AddressFilters) -Properties @('LocalAddress', 'RemoteAddress') -Name 'AddressFilter'
  Assert-ExactFirewallFilter -Expected $FirewallRule.Scope.InterfaceFilter -Actual @($live.InterfaceFilters) -Properties @('InterfaceAlias', 'InterfaceType') -Name 'InterfaceFilter'
  return $liveRules[0]
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
  Assert-Property -Value $ledger.Resources.RunDirectory -Name 'Resources.RunDirectory'
  Assert-Property -Value $ledger.Resources.FirewallRules -Name 'Resources.FirewallRules'
  Assert-Property -Value $ledger.Resources.PortProxies -Name 'Resources.PortProxies'
  Assert-Property -Value $ledger.Resources.DynamicPorts -Name 'Resources.DynamicPorts'
  Assert-Property -Value $ledger.Resources.Disks -Name 'Resources.Disks'
  if (@($ledger.Resources.PortProxies).Count -ne 0) {
    throw 'Provisioned ledger must attest that no netsh port proxy exists.'
  }

  if ($ledger.Resources.Vm.Name -ne $targets.VmName -or -not [guid]::TryParse([string]$ledger.Resources.Vm.Id, [ref]([guid]::Empty)) -or [int]$ledger.Resources.Vm.Generation -ne 2) {
    throw 'Rollback ledger VM identity is invalid.'
  }
  if ($ledger.Resources.Switch.Name -ne $targets.SwitchName -or -not [guid]::TryParse([string]$ledger.Resources.Switch.Id, [ref]([guid]::Empty)) -or $ledger.Resources.Switch.Type -ne 'Internal') {
    throw 'Rollback ledger virtual-switch identity is invalid.'
  }
  if ($ledger.Resources.Nat.Name -ne $targets.NatName -or $ledger.Resources.Nat.Prefix -ne $targets.NatPrefix) {
    throw 'Rollback ledger NAT identity is invalid.'
  }
  if ($ledger.Resources.RunDirectory.Path -ne $targets.RunRoot -or $ledger.Resources.RunDirectory.MarkerName -ne $targets.MarkerName -or [string]$ledger.Resources.RunDirectory.MarkerSha256 -notmatch '^[a-fA-F0-9]{64}$') {
    throw 'Rollback ledger run-directory ownership identity is invalid.'
  }
  $expectedDiskPaths = @($targets.OsVhdxPath, $targets.CidataVhdxPath)
  $expectedDiskPaths = @($expectedDiskPaths | Sort-Object)
  $ledgerDiskPaths = @($ledger.Resources.Disks | ForEach-Object { [IO.Path]::GetFullPath([string]$_.Path) } | Sort-Object)
  if ($ledgerDiskPaths.Count -ne 2 -or (Compare-Object -ReferenceObject $expectedDiskPaths -DifferenceObject $ledgerDiskPaths)) {
    throw 'Rollback ledger virtual-disk identities are invalid.'
  }
  foreach ($disk in @($ledger.Resources.Disks)) {
    if ([string]$disk.Sha256 -notmatch '^[a-fA-F0-9]{64}$') { throw 'Rollback ledger virtual-disk hash evidence is invalid.' }
  }
  if (@($ledger.Resources.FirewallRules).Count -ne $targets.FirewallRuleNames.Count) {
    throw 'Rollback ledger must name every exact firewall rule.'
  }
  foreach ($firewallRule in @($ledger.Resources.FirewallRules)) {
    if ($firewallRule.DisplayName -notin $targets.FirewallRuleNames -or -not [guid]::TryParse([string]$firewallRule.InstanceID, [ref]([guid]::Empty)) -or [string]::IsNullOrWhiteSpace([string]$firewallRule.Name) -or $firewallRule.Direction -notin @('Inbound', 'Outbound') -or $firewallRule.Action -notin @('Allow', 'Block')) {
      throw 'Rollback ledger firewall identity is invalid.'
    }
    Assert-NarrowFirewallScope -FirewallRule $firewallRule -Vm $ledger.Resources.Vm -Switch $ledger.Resources.Switch
  }
  if (@($ledger.Resources.FirewallRules | Select-Object -ExpandProperty DisplayName | Sort-Object -Unique).Count -ne $targets.FirewallRuleNames.Count) {
    throw 'Rollback ledger firewall identities are not a complete exact set.'
  }
  $dynamicPorts = @($ledger.Resources.DynamicPorts | ForEach-Object { [int]$_ })
  if ($dynamicPorts.Count -eq 0 -or @($dynamicPorts | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -ne 0 -or @($dynamicPorts | Sort-Object -Unique).Count -ne $dynamicPorts.Count) {
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

function Remove-ExactFirewallRule {
  param([Parameter(Mandatory)] [object]$FirewallRule)
  $live = Assert-FirewallRuleMatchesLedger -FirewallRule $FirewallRule
  if ($null -ne $live) {
    Remove-NetFirewallRule -Name $FirewallRule.Name -ErrorAction Stop
  }
}

function Invoke-Rollback {
  param([Parameter(Mandatory)] [object]$Ledger)

  Assert-RunDirectoryOwned -RunDirectory $Ledger.Resources.RunDirectory
  foreach ($disk in @($Ledger.Resources.Disks)) {
    if (-not (Test-Path -LiteralPath $disk.Path -PathType Leaf)) {
      throw 'Rollback refuses a ledger whose exact recorded virtual disk is absent.'
    }
  }
  $inventory = Get-ExactHostInventory
  $vm = @($inventory.Vms | Where-Object { $_.Name -eq $Ledger.Resources.Vm.Name -and $_.Id -eq $Ledger.Resources.Vm.Id })
  if ($vm.Count -gt 1) { throw 'Rollback found duplicate exact VM identities.' }
  if ($vm.Count -eq 1) {
    if ($vm[0].State -ne 'Off') { Stop-VM -Id $Ledger.Resources.Vm.Id -TurnOff -Force }
    Remove-VM -Id $Ledger.Resources.Vm.Id -Force
  }

  $nat = @($inventory.Nats | Where-Object { $_.Name -eq $Ledger.Resources.Nat.Name -and $_.InternalIPInterfaceAddressPrefix -eq $Ledger.Resources.Nat.Prefix })
  if ($nat.Count -gt 1) { throw 'Rollback found duplicate exact NAT identities.' }
  if ($nat.Count -eq 1) { Remove-NetNat -Name $Ledger.Resources.Nat.Name -Confirm:$false }

  $switch = @($inventory.Switches | Where-Object { $_.Name -eq $Ledger.Resources.Switch.Name -and $_.Id -eq $Ledger.Resources.Switch.Id -and $_.SwitchType -eq $Ledger.Resources.Switch.Type })
  if ($switch.Count -gt 1) { throw 'Rollback found duplicate exact virtual-switch identities.' }
  if ($switch.Count -eq 1) { Remove-VMSwitch -Id $Ledger.Resources.Switch.Id -Force }

  foreach ($firewallRule in @($Ledger.Resources.FirewallRules)) { Remove-ExactFirewallRule -FirewallRule $firewallRule }
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
    return [IO.Path]::GetFullPath($ImageArchivePath)
  }
  return (Join-Path $RunRoot $ubuntuImage.ArchiveName)
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
packages: [docker.io, curl, iproute2, ufw]
write_files:
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
      install --directory --mode 0700 /var/lib/third-code-erp/evidence
      printf '{"outcome":"PASS","credential_stage":"not-entered","docker_socket_residual":"guest-root"}\n' > /var/lib/third-code-erp/evidence/precredential-containment.json
runcmd:
  - [systemctl, disable, --now, ssh.service]
  - [systemctl, enable, --now, docker]
  - [ufw, default, deny, incoming]
  - [ufw, default, allow, outgoing]
  - [ufw, --force, enable]
  - [/usr/local/sbin/third-code-erp-precredential-evidence]
'@
    $networkConfig = @"
version: 2
ethernets:
  erpnic:
    match:
      name: "en*"
    set-name: eth0
    addresses: [$($targets.GuestAddress)/24]
    routes:
      - to: default
        via: $($targets.Gateway)
    nameservers:
      addresses: [$($targets.Gateway), 1.1.1.1]
"@
    Write-Utf8NoBomFile -Path (Join-Path $seedRoot 'meta-data') -Content "instance-id: $RunIdentity`nlocal-hostname: $RunIdentity`n"
    Write-Utf8NoBomFile -Path (Join-Path $seedRoot 'user-data') -Content $userData
    Write-Utf8NoBomFile -Path (Join-Path $seedRoot 'network-config') -Content $networkConfig
  } finally {
    if ($mounted) { Dismount-VHD -Path $SeedPath }
  }
}

function New-ScopedFirewallRules {
  $interfaceAlias = "vEthernet ($($targets.SwitchName))"
  $specifications = @(
    @{ Name = $firewallRuleNames.HostInboundDeny; Protocol = 'Any'; LocalPort = 'Any'; RemotePort = 'Any' },
    @{ Name = $firewallRuleNames.HostPrivateDeny; Protocol = 'TCP'; LocalPort = 'Any'; RemotePort = 'Any' },
    @{ Name = $firewallRuleNames.GuestProbeDeny; Protocol = 'TCP'; LocalPort = '29876'; RemotePort = 'Any' }
  )
  $evidence = @()
  foreach ($specification in $specifications) {
    $firewallParameters = @{
      DisplayName = $specification.Name; Direction = 'Inbound'; Action = 'Block'; Enabled = 'True'; Profile = 'Private'
      Protocol = $specification.Protocol; LocalAddress = $targets.Gateway; RemoteAddress = $targets.GuestAddress; InterfaceAlias = $interfaceAlias
    }
    if ($specification.Protocol -ne 'Any') {
      $firewallParameters.LocalPort = $specification.LocalPort
      $firewallParameters.RemotePort = $specification.RemotePort
    }
    New-NetFirewallRule @firewallParameters | Out-Null
    $rule = @(Get-NetFirewallRule -DisplayName $specification.Name -ErrorAction Stop)
    if ($rule.Count -ne 1) { throw 'Provision could not read back one exact firewall rule.' }
    $record = Get-FirewallRuleEvidence -Rule $rule[0]
    $record | Add-Member -NotePropertyName Scope -NotePropertyValue ([pscustomobject]@{
        PortFilter = $record.PortFilters[0]
        AddressFilter = $record.AddressFilters[0]
        InterfaceFilter = $record.InterfaceFilters[0]
        Binding = [pscustomobject]@{
          Kind = 'HostFirewallInterfaceFilter'
          SupportedFilter = 'Get-NetFirewallInterfaceFilter'
          VmId = $null
          SwitchId = $null
          InterfaceAlias = $interfaceAlias
        }
      })
    $evidence += $record
  }
  return @($evidence)
}

function Invoke-Provision {
  Assert-ProvisionAuthorization
  Assert-TargetVacant -Inventory (Get-ExactHostInventory)
  $image = Assert-VerifiedUbuntuArchive
  if (@(Get-NetNat).Count -ne 0) { throw 'Provision refuses to share or replace an existing WinNAT.' }
  $runDirectory = New-RunOwnershipMarker
  try {
    New-Item -ItemType Directory -Path $targets.VhdDirectory -Force | Out-Null
    $stagingDirectory = Join-Path $targets.RunRoot 'image-staging'
    New-Item -ItemType Directory -Path $stagingDirectory -Force | Out-Null
    & tar.exe -xzf $image.ArchivePath -C $stagingDirectory
    $sourceVhds = @(Get-ChildItem -LiteralPath $stagingDirectory -Recurse -File -Filter '*.vhd')
    if ($sourceVhds.Count -ne 1) { throw 'Verified archive must contain exactly one source VHD.' }
    Convert-VHD -Path $sourceVhds[0].FullName -DestinationPath $targets.OsVhdxPath -VHDType Dynamic
    New-CidataSeed -SeedPath $targets.CidataVhdxPath
    New-VMSwitch -Name $targets.SwitchName -SwitchType Internal | Out-Null
    New-NetIPAddress -InterfaceAlias "vEthernet ($($targets.SwitchName))" -IPAddress $targets.Gateway -PrefixLength 24 | Out-Null
    New-NetNat -Name $targets.NatName -InternalIPInterfaceAddressPrefix $targets.NatPrefix | Out-Null
    New-VM -Name $targets.VmName -Generation 2 -MemoryStartupBytes 4GB -VHDPath $targets.OsVhdxPath -SwitchName $targets.SwitchName | Out-Null
    Set-VMProcessor -VMName $targets.VmName -Count 2
    Set-VMFirmware -VMName $targets.VmName -EnableSecureBoot On -SecureBootTemplate $ubuntuImage.SecureBootTemplate
    Add-VMHardDiskDrive -VMName $targets.VmName -Path $targets.CidataVhdxPath
    $firewallRules = New-ScopedFirewallRules
    $vm = Get-VM -Name $targets.VmName
    $switch = Get-VMSwitch -Name $targets.SwitchName
    foreach ($firewallRule in $firewallRules) {
      $firewallRule.Scope.Binding.VmId = $vm.Id
      $firewallRule.Scope.Binding.SwitchId = $switch.Id
      Assert-NarrowFirewallScope -FirewallRule $firewallRule -Vm $vm -Switch $switch
    }
    Start-VM -Name $targets.VmName
    $inventory = Get-ExactHostInventory
    Assert-NoHostExposureForPorts -Ports $targets.KnownSupabasePorts -PortProxies @($inventory.PortProxy) -Listeners @($inventory.Listeners)
    Write-Ledger -Ledger ([ordered]@{
        SchemaVersion = 2; Lifecycle = 'Provisioned'; Mode = 'Provision'; Outcome = 'PASS'; RunIdentity = $RunIdentity
        Image = $image; SecureBoot = @{ Enabled = $true; Template = $ubuntuImage.SecureBootTemplate }
        Resources = [ordered]@{
          Vm = Get-VM -Name $targets.VmName | Select-Object Name, Id, Generation, State
          Switch = Get-VMSwitch -Name $targets.SwitchName | ForEach-Object { [ordered]@{ Name = $_.Name; Id = $_.Id; Type = $_.SwitchType } }
          Nat = @{ Name = $targets.NatName; Prefix = $targets.NatPrefix }
          RunDirectory = $runDirectory; FirewallRules = $firewallRules; PortProxies = @(); DynamicPorts = @()
          Disks = @(@{ Path = $targets.OsVhdxPath; Sha256 = (Get-FileHash -LiteralPath $targets.OsVhdxPath -Algorithm SHA256).Hash.ToLowerInvariant() }, @{ Path = $targets.CidataVhdxPath; Sha256 = (Get-FileHash -LiteralPath $targets.CidataVhdxPath -Algorithm SHA256).Hash.ToLowerInvariant() })
          GuestEvidencePath = $targets.GuestEvidencePath
        }
        Notes = @('No JIT configuration, runner registration, Auth, secret, or production action is present in Provision mode.', 'Guest cloud-init executes only non-secret containment checks; its evidence must be independently read and reviewed before any credential stage.')
      })
  } catch {
    throw
  }
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
          'Rollback accepts only a future Provisioned ledger with exact resource identities; it never uses wildcard firewall deletion.',
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
    Write-Ledger -Ledger ([ordered]@{
        SchemaVersion = 2
        Mode = $Mode
        Outcome = 'FAIL'
        RunIdentity = $RunIdentity
        Targets = $targets
        Failure = $safeFailure
        Notes = @('The helper stops before provision on any failed preflight condition.')
      })
  } catch {
    Write-Error "Unable to record the non-secret host preflight failure: $safeFailure"
  }
  throw
}
