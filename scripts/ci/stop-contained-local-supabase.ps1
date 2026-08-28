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
$statePath = Join-Path $artifactRoot 'supabase-containment-state.json'
$evidencePath = Join-Path $artifactRoot 'supabase-containment-evidence.json'

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

  $format = '{{range $name, $network := .NetworkSettings.Networks}}{{$name}}|{{$network.NetworkID}}{{"\n"}}{{end}}'
  $networks = @()
  foreach ($row in @(& docker inspect --format $format $ContainerId | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_)
  })) {
    $parts = $row -split '\|', 2
    if ($parts.Count -ne 2) {
      throw 'Container network metadata was malformed during cleanup'
    }
    $networks += [PSCustomObject]@{ Name = $parts[0]; Id = $parts[1] }
  }
  if ($LASTEXITCODE -ne 0) {
    throw 'Could not inspect container network metadata during cleanup'
  }
  return @($networks)
}

function Get-ContainerPortMappings {
  param(
    [Parameter(Mandatory)]
    [string]$ContainerId
  )

  $row = @(& docker inspect --format '{{json .NetworkSettings.Ports}}' $ContainerId)
  if ($LASTEXITCODE -ne 0 -or $row.Count -ne 1) {
    throw 'Could not inspect effective Docker port metadata during cleanup'
  }
  $portMap = $row[0] | ConvertFrom-Json
  $ports = @()
  foreach ($property in @($portMap.PSObject.Properties)) {
    foreach ($binding in @($property.Value)) {
      if ($null -eq $binding) {
        continue
      }
      $hostPort = 0
      if (-not [int]::TryParse([string]$binding.HostPort, [ref]$hostPort)) {
        throw 'Docker reported a malformed published host port during cleanup'
      }
      $ports += $hostPort
    }
  }
  return @($ports | Sort-Object -Unique)
}

function Get-HostListeners {
  param(
    [Parameter(Mandatory)]
    [int[]]$Ports
  )

  $listeners = @()
  foreach ($port in @($Ports | Sort-Object -Unique)) {
    $listeners += @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
  }
  return @($listeners)
}

if ($NetworkName -notmatch '^third-code-erp-ci-([0-9]+-[0-9]+)$') {
  throw 'Disposable local Supabase network name is invalid during cleanup'
}
$runIdentity = $Matches[1]
$expectedProjectId = "erp-ci-$runIdentity"

if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
  throw 'Disposable local Supabase containment state is missing; cleanup target is not provable'
}
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
if (
  $state.Format -ne 1 -or
  $state.ProjectId -ne $expectedProjectId -or
  $state.Network.Name -ne $NetworkName -or
  [string]::IsNullOrWhiteSpace($state.Network.Id) -or
  $state.WorkdirRelative -ne "tmp/self-hosted-ci/supabase-workdir-$runIdentity"
) {
  throw 'Disposable local Supabase containment state does not identify the current run'
}

$runWorkdir = Assert-RepositoryPath (Join-Path $repositoryRoot $state.WorkdirRelative)
$statePath = Assert-RepositoryPath $statePath
$evidencePath = Assert-RepositoryPath $evidencePath

& docker version *> $null
if ($LASTEXITCODE -ne 0) {
  throw 'Docker was unavailable during disposable local Supabase cleanup'
}

$cleanupErrors = @()
$networkExists = $false
$networkReadback = @(& docker network inspect --format '{{.Id}}|{{.Name}}' $state.Network.Id 2>$null)
if ($LASTEXITCODE -eq 0 -and $networkReadback.Count -eq 1) {
  $networkParts = $networkReadback[0] -split '\|', 2
  if ($networkParts.Count -ne 2 -or $networkParts[0] -ne $state.Network.Id -or $networkParts[1] -ne $NetworkName) {
    throw 'Disposable Docker network identity changed before cleanup'
  }
  $networkExists = $true
} elseif (@(& docker network ls --format '{{.Name}}' | Where-Object { $_ -eq $NetworkName }).Count -ne 0) {
  throw 'Disposable Docker network name exists with an unexpected identity'
}

$containerIds = @(Get-ProjectContainerIds -ProjectId $expectedProjectId)
$runtimePorts = @()
foreach ($containerId in $containerIds) {
  $attached = @(Get-ContainerNetworks -ContainerId $containerId | Where-Object {
    $_.Id -eq $state.Network.Id -and $_.Name -eq $NetworkName
  })
  if (-not $networkExists -or $attached.Count -ne 1) {
    throw 'A local Supabase container is not provably attached to the current run network'
  }
  $runtimePorts += @(Get-ContainerPortMappings -ContainerId $containerId)
}
$runtimePorts = @($runtimePorts | Sort-Object -Unique)
$allPorts = @(
  @($state.BaselineHostPorts) + @($state.RuntimeHostPorts) + $runtimePorts |
    ForEach-Object { [int]$_ } |
    Sort-Object -Unique
)

if ($networkExists) {
  try {
    Invoke-Supabase -ArgumentList @(
      'stop',
      '--no-backup',
      '--project-id', $expectedProjectId,
      '--workdir', $runWorkdir,
      '--network-id', $state.Network.Id
    )
  } catch {
    $cleanupErrors += 'Supabase stop failed'
  }
}

$remainingContainers = @(Get-ProjectContainerIds -ProjectId $expectedProjectId)
foreach ($containerId in $remainingContainers) {
  $attached = @(Get-ContainerNetworks -ContainerId $containerId | Where-Object {
    $_.Id -eq $state.Network.Id -and $_.Name -eq $NetworkName
  })
  if ($attached.Count -ne 1) {
    $cleanupErrors += 'run-owned Supabase container cannot be proven attached before removal'
    continue
  }
  & docker rm $containerId *> $null
  if ($LASTEXITCODE -ne 0) {
    $cleanupErrors += 'run-owned Supabase container removal failed'
  }
}

$remainingContainers = @(Get-ProjectContainerIds -ProjectId $expectedProjectId)
if ($remainingContainers.Count -ne 0) {
  $cleanupErrors += 'run-owned Supabase containers remain after targeted removal'
}

$remainingVolumes = @(Get-ProjectVolumeNames -ProjectId $expectedProjectId)
if ($remainingContainers.Count -eq 0) {
  foreach ($volume in $remainingVolumes) {
    & docker volume rm $volume *> $null
    if ($LASTEXITCODE -ne 0) {
      $cleanupErrors += 'run-owned Supabase volume removal failed'
    }
  }
}

if ($networkExists) {
  $attachedAfterStop = @(& docker network inspect --format '{{range $id, $_ := .Containers}}{{$id}}{{"\n"}}{{end}}' $state.Network.Id | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_)
  })
  if ($LASTEXITCODE -ne 0 -or $attachedAfterStop.Count -ne 0) {
    $cleanupErrors += 'generated Docker network still has attached containers'
  } else {
    & docker network rm $state.Network.Id *> $null
    if ($LASTEXITCODE -ne 0) {
      $cleanupErrors += 'generated Docker network removal failed'
    }
  }
}

$remainingNetwork = @(& docker network ls --format '{{.ID}}|{{.Name}}' | Where-Object {
  $_ -eq "$($state.Network.Id)|$NetworkName"
})
if ($remainingNetwork.Count -ne 0) {
  $cleanupErrors += 'generated Docker network remains after cleanup'
}
if (@(Get-ProjectContainerIds -ProjectId $expectedProjectId).Count -ne 0) {
  $cleanupErrors += 'run-owned containers remain after cleanup verification'
}
if (@(Get-ProjectVolumeNames -ProjectId $expectedProjectId).Count -ne 0) {
  $cleanupErrors += 'run-owned volumes remain after cleanup verification'
}
if (@(Get-HostListeners -Ports $allPorts).Count -ne 0) {
  $cleanupErrors += 'configured or runtime-discovered host listeners remain after cleanup verification'
}

if ($cleanupErrors.Count -ne 0) {
  throw "Disposable local Supabase cleanup failed: $($cleanupErrors -join '; ')"
}

foreach ($path in @($runWorkdir, $evidencePath, $statePath)) {
  if (Test-Path -LiteralPath $path) {
    Remove-Item -LiteralPath $path -Recurse -Force
  }
  if (Test-Path -LiteralPath $path) {
    throw 'Current-run disposable Supabase state remains after cleanup'
  }
}
Write-Host 'PASS disposable local Supabase targeted teardown and zero-residue verification passed.'
