[CmdletBinding()]
param(
  [ValidateSet('Preflight', 'Rollback', 'LedgerRegression')]
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

$targets = [ordered]@{
  RunIdentity = $RunIdentity
  VmName = $RunIdentity
  SwitchName = "$RunIdentity-switch"
  NatName = "$RunIdentity-nat"
  NatPrefix = '172.31.202.0/24'
  Gateway = '172.31.202.1'
  GuestAddress = '172.31.202.10'
  RunRoot = $runRootPath
  FirewallPrefix = "Third Code ERP $RunIdentity"
}

function Assert-Administrator {
  $principal = [Security.Principal.WindowsPrincipal]::new(
    [Security.Principal.WindowsIdentity]::GetCurrent()
  )
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'This exact host script must run elevated; no host action was taken.'
  }
}

function Get-ExactHostInventory {
  $dockerContainers = @()
  $dockerNetworks = @()
  if (Get-Command docker -ErrorAction SilentlyContinue) {
    $dockerContainers = @(
      & docker ps --all --format '{{json .}}' 2>$null |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_ | ConvertFrom-Json }
    )
    $dockerNetworks = @(
      & docker network ls --format '{{json .}}' 2>$null |
        Where-Object { -not [string]::IsNullOrWhiteSpace($_) } |
        ForEach-Object { $_ | ConvertFrom-Json }
    )
  }

  $portProxy = @(& netsh interface portproxy show all)
  [ordered]@{
    TimestampUtc = [DateTime]::UtcNow.ToString('o')
    Windows = Get-ComputerInfo |
      Select-Object WindowsProductName, WindowsVersion, OsBuildNumber, HyperVisorPresent
    Vms = @(Get-VM | Select-Object Name, Id, State, Generation, Path)
    Switches = @(Get-VMSwitch | Select-Object Name, Id, SwitchType, NetAdapterInterfaceDescription)
    Nats = @(Get-NetNat | Select-Object Name, InternalIPInterfaceAddressPrefix)
    NatMappings = @(Get-NetNatStaticMapping | Select-Object NatName, Protocol, ExternalIPAddress, ExternalPort, InternalIPAddress, InternalPort)
    PortProxy = $portProxy
    FirewallRules = @(
      Get-NetFirewallRule -DisplayName "$($targets.FirewallPrefix)*" -ErrorAction SilentlyContinue |
        Select-Object DisplayName, Direction, Action, Enabled
    )
    Docker = [ordered]@{
      Containers = $dockerContainers | Select-Object ID, Names, Image, Ports, Status
      Networks = $dockerNetworks | Select-Object ID, Name, Driver, Scope
    }
    VolumeD = Get-Volume -DriveLetter D | Select-Object DriveLetter, Size, SizeRemaining
  }
}

function Write-Ledger {
  param(
    [Parameter(Mandatory)]
    [hashtable]$Ledger
  )

  $ledgerDirectory = Split-Path -Parent $LedgerPath
  New-Item -ItemType Directory -Path $ledgerDirectory -Force | Out-Null
  $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText(
    $LedgerPath,
    ($Ledger | ConvertTo-Json -Depth 8),
    $utf8WithoutBom
  )
}

function Assert-TargetVacant {
  param(
    [Parameter(Mandatory)]
    [hashtable]$Inventory
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
    throw "Target firewall rules already exist: $($targets.FirewallPrefix)"
  }
  if (Test-Path -LiteralPath $targets.RunRoot) {
    throw "Target run root already exists: $($targets.RunRoot)"
  }
}

function Invoke-Rollback {
  param(
    [Parameter(Mandatory)]
    [hashtable]$Inventory
  )

  $existingVm = @($Inventory.Vms | Where-Object { $_.Name -eq $targets.VmName })
  if ($existingVm.Count -gt 1) {
    throw "Refusing ambiguous VM rollback for $($targets.VmName)"
  }
  if ($existingVm.Count -eq 1) {
    if ($existingVm[0].State -ne 'Off') {
      Stop-VM -Name $targets.VmName -TurnOff -Force
    }
    Remove-VM -Name $targets.VmName -Force
  }

  $existingNat = @($Inventory.Nats | Where-Object { $_.Name -eq $targets.NatName })
  if ($existingNat.Count -gt 1 -or ($existingNat.Count -eq 1 -and $existingNat[0].InternalIPInterfaceAddressPrefix -ne $targets.NatPrefix)) {
    throw "Refusing ambiguous NAT rollback for $($targets.NatName)"
  }
  if ($existingNat.Count -eq 1) {
    Remove-NetNat -Name $targets.NatName -Confirm:$false
  }

  Get-NetFirewallRule -DisplayName "$($targets.FirewallPrefix)*" -ErrorAction SilentlyContinue |
    Remove-NetFirewallRule

  $existingSwitch = @($Inventory.Switches | Where-Object { $_.Name -eq $targets.SwitchName })
  if ($existingSwitch.Count -gt 1 -or ($existingSwitch.Count -eq 1 -and $existingSwitch[0].SwitchType -ne 'Internal')) {
    throw "Refusing ambiguous virtual-switch rollback for $($targets.SwitchName)"
  }
  if ($existingSwitch.Count -eq 1) {
    Remove-VMSwitch -Name $targets.SwitchName -Force
  }

  if (Test-Path -LiteralPath $targets.RunRoot) {
    Remove-Item -LiteralPath $targets.RunRoot -Recurse -Force
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
  if (
    $bytes.Length -ge 3 -and
    $bytes[0] -eq 0xEF -and
    $bytes[1] -eq 0xBB -and
    $bytes[2] -eq 0xBF
  ) {
    throw 'Ledger regression wrote a UTF-8 BOM.'
  }
  $result = Get-Content -LiteralPath $LedgerPath -Raw | ConvertFrom-Json
  if ($result.Encoding -ne 'utf-8-no-bom' -or $result.RunIdentity -ne $RunIdentity) {
    throw 'Ledger regression JSON did not round-trip.'
  }
  Write-Host "PASS ledger encoding regression: $LedgerPath"
  exit 0
}

try {
  Assert-Administrator
  $inventory = Get-ExactHostInventory

  if ($Mode -eq 'Preflight') {
    Assert-TargetVacant -Inventory $inventory
    if (@($inventory.Nats).Count -ne 0) {
      throw 'WinNAT already has a configured NAT; this stage refuses to alter or share it.'
    }
    Write-Ledger -Ledger ([ordered]@{
        Mode = $Mode
        Outcome = 'PASS'
        Targets = $targets
        Inventory = $inventory
        Notes = @(
          'No host resource was created or changed.',
          'A separately reviewed Provision mode is required before image, VM, network, or runner creation.',
          'Rollback is exact-target-only and never operates on Docker Desktop, WSL, Default Switch, or D:\actions-runner.'
        )
      })
    Write-Host "PASS elevated Hyper-V preflight; non-secret ledger: $LedgerPath"
    exit 0
  }

  Invoke-Rollback -Inventory $inventory
  $remaining = Get-ExactHostInventory
  $residue = @(
    @($remaining.Vms | Where-Object { $_.Name -eq $targets.VmName }).Count,
    @($remaining.Switches | Where-Object { $_.Name -eq $targets.SwitchName }).Count,
    @($remaining.Nats | Where-Object { $_.Name -eq $targets.NatName }).Count,
    @($remaining.FirewallRules).Count,
    [int](Test-Path -LiteralPath $targets.RunRoot)
  ) | Measure-Object -Sum | Select-Object -ExpandProperty Sum
  if ($residue -ne 0) {
    throw 'Exact rollback left current-run residue.'
  }
  Write-Ledger -Ledger ([ordered]@{
      Mode = $Mode
      Outcome = 'PASS'
      Targets = $targets
      InventoryBefore = $inventory
      InventoryAfter = $remaining
      Notes = @('Exact rollback verified zero current-run host residue.')
    })
  Write-Host "PASS exact Hyper-V rollback; non-secret ledger: $LedgerPath"
} catch {
  $safeFailure = $_.Exception.Message
  try {
    Write-Ledger -Ledger ([ordered]@{
        Mode = $Mode
        Outcome = 'FAIL'
        Targets = $targets
        Failure = $safeFailure
        Notes = @('The helper stops before provision on any failed preflight condition.')
      })
  } catch {
    Write-Error "Unable to record the non-secret host preflight failure: $safeFailure"
  }
  throw
}
