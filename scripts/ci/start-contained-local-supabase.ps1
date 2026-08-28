[CmdletBinding()]
param(
  [Parameter(Mandatory)]
  [string]$NetworkName,
  [switch]$UsePnpmDlx
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$artifactRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot 'tmp\self-hosted-ci'))
$sourceSupabaseDirectory = Join-Path $repositoryRoot 'supabase'
$sourceConfigPath = Join-Path $sourceSupabaseDirectory 'config.toml'

function Assert-RepositoryPath {
  param(
    [Parameter(Mandatory)]
    [string]$Path
  )

  $fullPath = [IO.Path]::GetFullPath($Path)
  $prefix = "$repositoryRoot$([IO.Path]::DirectorySeparatorChar)"
  if (-not $fullPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Path escaped repository scope: $fullPath"
  }
  return $fullPath
}

function Invoke-Supabase {
  param(
    [Parameter(Mandatory)]
    [string[]]$ArgumentList
  )

  if ($UsePnpmDlx) {
    & pnpm dlx supabase@2.109.1 @ArgumentList *> $null
  } else {
    & supabase @ArgumentList *> $null
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Pinned Supabase command failed: $($ArgumentList[0])"
  }
}

function Write-NonSecretJson {
  param(
    [Parameter(Mandatory)]
    [string]$Path,
    [Parameter(Mandatory)]
    [object]$Value
  )

  $Value | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Path -NoNewline
}

function Get-ConfigTopology {
  param(
    [Parameter(Mandatory)]
    [string]$ConfigPath
  )

  $section = ''
  $ports = @{}
  $enabled = @{}
  foreach ($line in Get-Content -LiteralPath $ConfigPath) {
    if ($line -match '^\s*\[([A-Za-z0-9_.-]+)\]\s*$') {
      $section = $Matches[1]
      continue
    }
    if ([string]::IsNullOrEmpty($section)) {
      continue
    }
    if ($line -match '^\s*enabled\s*=\s*(true|false)\s*$') {
      $enabled[$section] = [System.Convert]::ToBoolean($Matches[1])
      continue
    }
    if ($line -match '^\s*port\s*=\s*(\d+)\s*$') {
      $ports[$section] = [int]$Matches[1]
    }
  }

  if (-not $ports.ContainsKey('api') -or -not $ports.ContainsKey('db')) {
    throw 'Local Supabase config must define [api].port and [db].port'
  }
  if ($enabled.ContainsKey('api') -and -not $enabled['api']) {
    throw 'Local Supabase API must be enabled for the Auth proof'
  }

  $baselinePorts = @(
    foreach ($sectionName in $ports.Keys) {
      if ($enabled.ContainsKey($sectionName) -and -not $enabled[$sectionName]) {
        continue
      }
      $ports[$sectionName]
    }
  ) | Sort-Object -Unique

  if ($baselinePorts.Count -eq 0) {
    throw 'Local Supabase config exposed no baseline ports'
  }

  return [PSCustomObject]@{
    ApiPort = [int]$ports['api']
    DbPort = [int]$ports['db']
    BaselinePorts = @($baselinePorts | ForEach-Object { [int]$_ })
  }
}

function Get-ProjectContainerIds {
  param(
    [Parameter(Mandatory)]
    [string]$ProjectId
  )

  $namePattern = "^supabase_.+_$([regex]::Escape($ProjectId))$"
  $matchingIds = @()
  foreach ($row in @(& docker ps -a --format '{{.ID}}|{{.Names}}')) {
    $parts = $row -split '\|', 2
    if ($parts.Count -eq 2 -and $parts[1] -match $namePattern) {
      $matchingIds += $parts[0]
    }
  }
  return @($matchingIds | Sort-Object -Unique)
}

function Get-ProjectVolumeNames {
  param(
    [Parameter(Mandatory)]
    [string]$ProjectId
  )

  $namePattern = "^supabase_.+_$([regex]::Escape($ProjectId))$"
  return @(
    & docker volume ls --format '{{.Name}}' |
      Where-Object { $_ -match $namePattern } |
      Sort-Object -Unique
  )
}

function Get-ContainerNetworks {
  param(
    [Parameter(Mandatory)]
    [string]$ContainerId
  )

  $networks = @()
  $format = '{{range $name, $network := .NetworkSettings.Networks}}{{$name}}|{{$network.NetworkID}}{{"\n"}}{{end}}'
  foreach ($row in @(& docker inspect --format $format $ContainerId | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_)
  })) {
    $parts = $row -split '\|', 2
    if ($parts.Count -ne 2) {
      throw 'Container network metadata was malformed'
    }
    $networks += [PSCustomObject]@{ Name = $parts[0]; Id = $parts[1] }
  }
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not inspect container network metadata'
  }
  return @($networks)
}

function Get-ContainerIdentity {
  param(
    [Parameter(Mandatory)]
    [string]$ContainerId
  )

  $row = @(& docker inspect --format '{{.Id}}|{{.Name}}|{{.Config.Image}}' $ContainerId)
  if ($LASTEXITCODE -ne 0 -or $row.Count -ne 1) {
    throw 'Could not inspect container identity metadata'
  }
  $parts = $row[0] -split '\|', 3
  if ($parts.Count -ne 3 -or [string]::IsNullOrWhiteSpace($parts[2])) {
    throw 'Container identity metadata was malformed'
  }
  return [PSCustomObject]@{
    Id = $parts[0]
    Name = $parts[1].TrimStart('/')
    Image = $parts[2]
    Networks = @(Get-ContainerNetworks -ContainerId $ContainerId)
  }
}

function Get-ContainerPortMappings {
  param(
    [Parameter(Mandatory)]
    [string]$ContainerId
  )

  $row = @(& docker inspect --format '{{json .NetworkSettings.Ports}}' $ContainerId)
  if ($LASTEXITCODE -ne 0 -or $row.Count -ne 1) {
    throw 'Could not inspect effective Docker port metadata'
  }
  $portMap = $row[0] | ConvertFrom-Json
  $mappings = @()
  foreach ($property in @($portMap.PSObject.Properties)) {
    foreach ($binding in @($property.Value)) {
      if ($null -eq $binding) {
        continue
      }
      $hostPort = 0
      if (-not [int]::TryParse([string]$binding.HostPort, [ref]$hostPort)) {
        throw 'Docker reported a malformed published host port'
      }
      $mappings += [PSCustomObject]@{
        ContainerId = $ContainerId
        ContainerPort = $property.Name
        HostIp = [string]$binding.HostIp
        HostPort = $hostPort
      }
    }
  }
  return @($mappings)
}

function Get-ContainerVolumeNames {
  param(
    [Parameter(Mandatory)]
    [string]$ContainerId
  )

  $format = '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}}{{"\n"}}{{end}}{{end}}'
  $volumes = @(& docker inspect --format $format $ContainerId)
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not inspect container volume metadata'
  }
  return @($volumes | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Sort-Object -Unique)
}

function Get-HostListeners {
  param(
    [Parameter(Mandatory)]
    [int[]]$Ports
  )

  $listeners = @()
  foreach ($port in @($Ports | Sort-Object -Unique)) {
    foreach ($connection in @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) {
      $listeners += [PSCustomObject]@{
        Protocol = 'TCP'
        State = 'Listen'
        HostPort = [int]$connection.LocalPort
        LocalAddress = [string]$connection.LocalAddress
      }
    }
  }
  return @($listeners)
}

if ($NetworkName -notmatch '^third-code-erp-ci-([0-9]+-[0-9]+)$') {
  throw 'Disposable local Supabase network name is invalid'
}
$runIdentity = $Matches[1]
$projectId = "erp-ci-$runIdentity"
$runWorkdir = Assert-RepositoryPath (Join-Path $artifactRoot "supabase-workdir-$runIdentity")
$statePath = Assert-RepositoryPath (Join-Path $artifactRoot 'supabase-containment-state.json')
$evidencePath = Assert-RepositoryPath (Join-Path $artifactRoot 'supabase-containment-evidence.json')

if (-not (Test-Path -LiteralPath $sourceConfigPath -PathType Leaf)) {
  throw 'Local Supabase configuration is missing'
}
if (
  (Test-Path -LiteralPath $runWorkdir) -or
  (Test-Path -LiteralPath $statePath) -or
  (Test-Path -LiteralPath $evidencePath)
) {
  throw 'Disposable local Supabase run state already exists; refusing to reuse it'
}

$topology = Get-ConfigTopology -ConfigPath $sourceConfigPath
$existingProjectContainers = @(Get-ProjectContainerIds -ProjectId $projectId)
$existingProjectVolumes = @(Get-ProjectVolumeNames -ProjectId $projectId)
if ($existingProjectContainers.Count -ne 0 -or $existingProjectVolumes.Count -ne 0) {
  throw 'Disposable local Supabase project identity already exists; refusing to reuse it'
}
$existingNetwork = @(& docker network ls --format '{{.Name}}' | Where-Object { $_ -eq $NetworkName })
if ($existingNetwork.Count -ne 0) {
  throw 'Disposable local Supabase network already exists; refusing to reuse it'
}
$baselineListeners = @(Get-HostListeners -Ports $topology.BaselinePorts)
if ($baselineListeners.Count -ne 0) {
  throw 'A configured local Supabase baseline port already has a listener'
}

New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null
New-Item -ItemType Directory -Path $runWorkdir | Out-Null
$runSupabaseDirectory = Join-Path $runWorkdir 'supabase'
New-Item -ItemType Directory -Path $runSupabaseDirectory | Out-Null
foreach ($sourceItem in @(Get-ChildItem -LiteralPath $sourceSupabaseDirectory -Force)) {
  if ($sourceItem.Name -eq '.temp') {
    continue
  }
  Copy-Item -LiteralPath $sourceItem.FullName -Destination $runSupabaseDirectory -Recurse
}
$runConfigPath = Join-Path $runWorkdir 'supabase\config.toml'
$runConfig = Get-Content -LiteralPath $runConfigPath -Raw
$runConfig = $runConfig -replace '(?m)^project_id\s*=\s*"[^"]+"\s*$', "project_id = `"$projectId`""
Set-Content -LiteralPath $runConfigPath -Value $runConfig -NoNewline

& docker network create `
  --driver bridge `
  --opt 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1' `
  $NetworkName *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'Could not create the disposable local Supabase network'
}
$networkId = @(& docker network inspect --format '{{.Id}}' $NetworkName)
if ($LASTEXITCODE -ne 0 -or $networkId.Count -ne 1 -or [string]::IsNullOrWhiteSpace($networkId[0])) {
  throw 'Could not read back the disposable Docker network ID'
}
$networkId = $networkId[0]
$networkNameReadback = @(& docker network inspect --format '{{.Name}}' $networkId)
if ($LASTEXITCODE -ne 0 -or $networkNameReadback.Count -ne 1 -or $networkNameReadback[0] -ne $NetworkName) {
  throw 'Disposable Docker network identity did not round-trip'
}

$candidateSha = @(& git rev-parse --verify HEAD)
if ($LASTEXITCODE -ne 0 -or $candidateSha.Count -ne 1) {
  throw 'Could not resolve the candidate commit SHA'
}
$state = [ordered]@{
  Format = 1
  CandidateSha = $candidateSha[0]
  ProjectId = $projectId
  Network = [ordered]@{ Id = $networkId; Name = $NetworkName }
  WorkdirRelative = "tmp/self-hosted-ci/supabase-workdir-$runIdentity"
  ConfigSha256 = (Get-FileHash -LiteralPath $sourceConfigPath -Algorithm SHA256).Hash
  BaselineHostPorts = @($topology.BaselinePorts)
  RequiredHostPorts = @(@($topology.ApiPort, $topology.DbPort) | Sort-Object -Unique)
  RuntimeHostPorts = @()
  Containers = @()
  Volumes = @()
}
Write-NonSecretJson -Path $statePath -Value $state

Invoke-Supabase -ArgumentList @('start', '--workdir', $runWorkdir, '--network-id', $networkId)

$containerIds = @(Get-ProjectContainerIds -ProjectId $projectId)
if ($containerIds.Count -eq 0) {
  throw 'Disposable local Supabase startup did not produce uniquely owned containers'
}
$containers = @(
  foreach ($containerId in $containerIds) {
    $container = Get-ContainerIdentity -ContainerId $containerId
    $attached = @($container.Networks | Where-Object { $_.Id -eq $networkId -and $_.Name -eq $NetworkName })
    if ($attached.Count -ne 1) {
      throw "Run-owned container $($container.Name) is not attached to the exact generated network"
    }
    $container
  }
)
$mappings = @(
  foreach ($container in $containers) {
    Get-ContainerPortMappings -ContainerId $container.Id
  }
)
$runtimeHostPorts = @($mappings | ForEach-Object { [int]$_.HostPort } | Sort-Object -Unique)
$volumeCandidates = @(
  foreach ($container in $containers) {
    Get-ContainerVolumeNames -ContainerId $container.Id
  }
)
$volumes = @($volumeCandidates | Sort-Object -Unique)
$projectVolumes = @(Get-ProjectVolumeNames -ProjectId $projectId)
if (@($projectVolumes | Where-Object { $_ -notin $volumes }).Count -ne 0) {
  throw 'Run-owned local Supabase volume is not attributable to an exact run container'
}

$state.Containers = @($containers)
$state.Volumes = @($volumes)
$state.RuntimeHostPorts = @($runtimeHostPorts)
Write-NonSecretJson -Path $statePath -Value $state

$evidence = [ordered]@{
  Network = $state.Network
  Containers = @($containers)
  Mappings = @($mappings)
  Listeners = @(Get-HostListeners -Ports $runtimeHostPorts)
  RequiredHostPorts = @($state.RequiredHostPorts)
}
Write-NonSecretJson -Path $evidencePath -Value $evidence

node (Join-Path $repositoryRoot 'scripts\ci\verify-supabase-containment.mjs') $evidencePath
if ($LASTEXITCODE -ne 0) {
  throw 'Disposable local Supabase containment proof failed before reset or credentials'
}

Invoke-Supabase -ArgumentList @('db', 'reset', '--local', '--workdir', $runWorkdir, '--network-id', $networkId)
Write-Host 'PASS disposable local Supabase containment passed before reset and runtime-value access.'
