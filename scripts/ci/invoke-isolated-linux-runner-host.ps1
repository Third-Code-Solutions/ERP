[CmdletBinding()]
param(
  [ValidateSet('Preflight', 'Rollback', 'LedgerRegression', 'RollbackPlanRegression')]
  [string]$Mode = 'Preflight',

  [ValidatePattern('^third-code-erp-ci-[a-z0-9-]+$')]
  [string]$RunIdentity = 'third-code-erp-ci-20260828-stage2',

  [ValidatePattern('^[A-Za-z]:\\')]
  [string]$RunRoot = 'D:\third-code-erp-isolated-runner',

  [string]$LedgerPath = ''
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
        Select-Object Name, InstanceID, DisplayName, Direction, Action, Enabled, Profile, PolicyStoreSource
    )
  }
  return @($rules)
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
  if (@($Inventory.PortProxy | Where-Object {
        $_.ConnectAddress -eq $targets.GuestAddress -or $_.ListenAddress -eq $targets.Gateway
      }).Count -ne 0) {
    throw 'Target port-proxy mapping already exists by exact guest/gateway identity.'
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
  Assert-Property -Value $ledger.Resources.RunDirectory -Name 'Resources.RunDirectory'
  Assert-Property -Value $ledger.Resources.FirewallRules -Name 'Resources.FirewallRules'
  Assert-Property -Value $ledger.Resources.PortProxies -Name 'Resources.PortProxies'
  Assert-Property -Value $ledger.Resources.DynamicPorts -Name 'Resources.DynamicPorts'
  if ($ledger.Resources.FinalZeroResidue -ne $true) {
    throw 'Rollback ledger must attest to final zero residue from its Provision operation.'
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
  if (@($ledger.Resources.FirewallRules).Count -ne $targets.FirewallRuleNames.Count) {
    throw 'Rollback ledger must name every exact firewall rule.'
  }
  foreach ($firewallRule in @($ledger.Resources.FirewallRules)) {
    if ($firewallRule.DisplayName -notin $targets.FirewallRuleNames -or -not [guid]::TryParse([string]$firewallRule.InstanceID, [ref]([guid]::Empty)) -or [string]::IsNullOrWhiteSpace([string]$firewallRule.Name)) {
      throw 'Rollback ledger firewall identity is invalid.'
    }
  }
  if (@($ledger.Resources.FirewallRules | Select-Object -ExpandProperty DisplayName | Sort-Object -Unique).Count -ne $targets.FirewallRuleNames.Count) {
    throw 'Rollback ledger firewall identities are not a complete exact set.'
  }
  $dynamicPorts = @($ledger.Resources.DynamicPorts | ForEach-Object { [int]$_ })
  if ($dynamicPorts.Count -eq 0 -or @($dynamicPorts | Where-Object { $_ -lt 1 -or $_ -gt 65535 }).Count -ne 0 -or @($dynamicPorts | Sort-Object -Unique).Count -ne $dynamicPorts.Count) {
    throw 'Rollback ledger dynamic port set is invalid.'
  }
  foreach ($portProxy in @($ledger.Resources.PortProxies)) {
    if ($portProxy.Protocol -notin @('v4tov4', 'v4tov6', 'v6tov4', 'v6tov6') -or [int]$portProxy.ListenPort -lt 1 -or [int]$portProxy.ConnectPort -lt 1) {
      throw 'Rollback ledger port-proxy identity is invalid.'
    }
    if ($portProxy.ConnectAddress -ne $targets.GuestAddress -or [int]$portProxy.ListenPort -notin $dynamicPorts) {
      throw 'Rollback ledger port-proxy is outside the exact guest and dynamic-port target.'
    }
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

function Remove-ExactPortProxy {
  param([Parameter(Mandatory)] [object]$PortProxy)
  $live = @(
    Get-PortProxyEntries | Where-Object {
      $_.Protocol -eq $PortProxy.Protocol -and
      $_.ListenAddress -eq $PortProxy.ListenAddress -and
      $_.ListenPort -eq [int]$PortProxy.ListenPort -and
      $_.ConnectAddress -eq $PortProxy.ConnectAddress -and
      $_.ConnectPort -eq [int]$PortProxy.ConnectPort
    }
  )
  if ($live.Count -gt 1) {
    throw 'Rollback found duplicate exact port-proxy identities.'
  }
  if ($live.Count -eq 1) {
    & netsh interface portproxy delete $PortProxy.Protocol "listenaddress=$($PortProxy.ListenAddress)" "listenport=$($PortProxy.ListenPort)" | Out-Null
  }
}

function Remove-ExactFirewallRule {
  param([Parameter(Mandatory)] [object]$FirewallRule)
  $live = @(Get-NetFirewallRule -Name $FirewallRule.Name -ErrorAction SilentlyContinue)
  if ($live.Count -gt 1) {
    throw 'Rollback found duplicate exact firewall rule identities.'
  }
  if ($live.Count -eq 1) {
    $rule = $live[0]
    if ($rule.InstanceID -ne $FirewallRule.InstanceID -or $rule.DisplayName -ne $FirewallRule.DisplayName -or $rule.Direction.ToString() -ne $FirewallRule.Direction -or $rule.Action.ToString() -ne $FirewallRule.Action) {
      throw 'Rollback refuses to remove a firewall rule that differs from the ledger identity.'
    }
    Remove-NetFirewallRule -Name $FirewallRule.Name
  }
}

function Invoke-Rollback {
  param([Parameter(Mandatory)] [object]$Ledger)

  Assert-RunDirectoryOwned -RunDirectory $Ledger.Resources.RunDirectory
  $inventory = Get-ExactHostInventory
  $vm = @($inventory.Vms | Where-Object { $_.Name -eq $Ledger.Resources.Vm.Name -and $_.Id -eq $Ledger.Resources.Vm.Id })
  if ($vm.Count -gt 1) { throw 'Rollback found duplicate exact VM identities.' }
  if ($vm.Count -eq 1) {
    if ($vm[0].State -ne 'Off') { Stop-VM -Id $Ledger.Resources.Vm.Id -TurnOff -Force }
    Remove-VM -Id $Ledger.Resources.Vm.Id -Force
  }

  foreach ($portProxy in @($Ledger.Resources.PortProxies)) { Remove-ExactPortProxy -PortProxy $portProxy }

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
  Assert-NoHostExposureForPorts -Ports @($Ledger.Resources.DynamicPorts | ForEach-Object { [int]$_ }) -PortProxies @($remaining.PortProxy) -Listeners @($remaining.Listeners)
  return $remaining
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

  $ledger = Read-RollbackLedger
  $remaining = Invoke-Rollback -Ledger $ledger
  Write-Ledger -Ledger ([ordered]@{
      SchemaVersion = 2
      Lifecycle = 'RolledBack'
      Mode = $Mode
      Outcome = 'PASS'
      RunIdentity = $RunIdentity
      Targets = $targets
      InventoryAfter = $remaining
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
