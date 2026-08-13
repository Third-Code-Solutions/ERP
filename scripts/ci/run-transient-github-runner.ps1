[CmdletBinding()]
param(
  [string]$Ref = '',
  [string]$Repository = $env:GITHUB_REPOSITORY,
  [string]$RunnerBase = 'D:\thirdcode\.github-runners\Third-Code-ERP',
  [switch]$CleanupOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$runnerVersion = '2.336.0'
$runnerSha256 =
  'd59123a43003e357b0805b5d0f611d0bd2f65ab67d51bd070dd4e7a0f685c162'
$workflow = 'ci-self-hosted.yml'
$repositoryUrl = "https://github.com/$Repository"

if ([string]::IsNullOrWhiteSpace($Repository)) {
  throw 'Repository is required. Pass -Repository <github-owner>/<repo> or set GITHUB_REPOSITORY.'
}
$runnerBasePath = [IO.Path]::GetFullPath($RunnerBase)
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))

if ($runnerBasePath.StartsWith(
    $repositoryRoot,
    [StringComparison]::OrdinalIgnoreCase
  )) {
  throw "Runner directory must be outside the repository: $runnerBasePath"
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory)]
    [string]$Command,
    [Parameter(Mandatory)]
    [string[]]$ArgumentList
  )

  & $Command @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "$Command failed with exit code $LASTEXITCODE"
  }
}

function Get-GhJson {
  param(
    [Parameter(Mandatory)]
    [string]$Endpoint,
    [ValidateSet('GET', 'POST')]
    [string]$Method = 'GET'
  )

  $json = & gh api --method $Method $Endpoint
  if ($LASTEXITCODE -ne 0) {
    throw "gh api failed for $Endpoint"
  }
  return $json | ConvertFrom-Json
}

function Write-RunnerLogs {
  foreach ($logName in @('runner.stdout.log', 'runner.stderr.log')) {
    $logPath = Join-Path $runDirectory $logName
    if (Test-Path -LiteralPath $logPath) {
      Write-Host "=== $logName"
      Get-Content -LiteralPath $logPath -ErrorAction SilentlyContinue
    }
  }
}

function Remove-TransientRunnerDirectory {
  param(
    [Parameter(Mandatory)]
    [string]$Directory
  )

  $resolvedDirectory = [IO.Path]::GetFullPath($Directory)
  if (
    -not $resolvedDirectory.StartsWith(
      "$runnerBasePath\",
      [StringComparison]::OrdinalIgnoreCase
    ) -or
    [IO.Path]::GetFileName($resolvedDirectory) -notmatch
      '^third-code-erp-\d{14}$'
  ) {
    throw "Refusing unsafe runner cleanup: $resolvedDirectory"
  }

  Get-Process Runner.Listener, Runner.Worker -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Path -and $_.Path.StartsWith(
        "$resolvedDirectory\",
        [StringComparison]::OrdinalIgnoreCase
      )
    } |
    Stop-Process -Force -ErrorAction SilentlyContinue

  foreach ($credential in @('.credentials', '.credentials_rsaparams')) {
    $credentialPath = Join-Path $resolvedDirectory $credential
    if (Test-Path -LiteralPath $credentialPath) {
      Remove-Item -LiteralPath $credentialPath -Force -ErrorAction SilentlyContinue
    }
  }

  for ($attempt = 1; $attempt -le 30; $attempt += 1) {
    try {
      Remove-Item -LiteralPath $resolvedDirectory -Recurse -Force
      return $true
    } catch {
      Start-Sleep -Seconds 1
    }
  }
  return $false
}

Invoke-Checked -Command 'gh' -ArgumentList @('auth', 'status')
$viewer = (& gh api user --jq '.login').Trim()
if ($LASTEXITCODE -ne 0 -or $viewer -ne 'kurtgav') {
  throw "GitHub CLI must use kurtgav; active identity: $viewer"
}

$repositoryMetadata = Get-GhJson -Endpoint "repos/$Repository"
if (-not $repositoryMetadata.private) {
  throw 'Refusing to attach a local runner to a public repository.'
}

$registeredRunners = Get-GhJson -Endpoint "repos/$Repository/actions/runners"
$registeredNames = @($registeredRunners.runners | ForEach-Object { $_.name })
if (Test-Path -LiteralPath $runnerBasePath) {
  foreach (
    $staleDirectory in Get-ChildItem `
      -LiteralPath $runnerBasePath `
      -Directory `
      -Filter 'third-code-erp-*'
  ) {
    if (
      $staleDirectory.Name -notin $registeredNames -and
      (Test-Path -LiteralPath (Join-Path $staleDirectory.FullName '.runner'))
    ) {
      if (Remove-TransientRunnerDirectory -Directory $staleDirectory.FullName) {
        Write-Host "Removed stale runner directory: $($staleDirectory.Name)"
      } else {
        Write-Warning "Stale runner requires manual cleanup: $($staleDirectory.FullName)"
      }
    }
  }
}

if ($CleanupOnly) {
  Write-Host 'Transient runner cleanup complete.'
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Ref)) {
  Push-Location $repositoryRoot
  try {
    $Ref = (& git branch --show-current).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($Ref)) {
      throw 'Unable to resolve the current branch.'
    }
  } finally {
    Pop-Location
  }
}

$escapedRef = [Uri]::EscapeDataString($Ref)
$refMetadata = Get-GhJson -Endpoint "repos/$Repository/branches/$escapedRef"
$expectedHeadSha = $refMetadata.commit.sha
$runnerName = "third-code-erp-$([DateTime]::UtcNow.ToString('yyyyMMddHHmmss'))"
$runDirectory = [IO.Path]::GetFullPath(
  (Join-Path $runnerBasePath $runnerName)
)

if (-not $runDirectory.StartsWith(
    "$runnerBasePath\",
    [StringComparison]::OrdinalIgnoreCase
  )) {
  throw "Runner directory escaped its base: $runDirectory"
}

New-Item -ItemType Directory -Path $runDirectory -Force | Out-Null
$archivePath = Join-Path $runDirectory 'actions-runner.zip'
$downloadUrl = (
  'https://github.com/actions/runner/releases/download/' +
  "v$runnerVersion/actions-runner-win-x64-$runnerVersion.zip"
)

$runnerProcess = $null
$runId = $null
try {
  Write-Host "Downloading pinned GitHub runner $runnerVersion..."
  Invoke-WebRequest -Uri $downloadUrl -OutFile $archivePath
  $actualSha256 = (
    Get-FileHash -Algorithm SHA256 -LiteralPath $archivePath
  ).Hash.ToLowerInvariant()
  if ($actualSha256 -ne $runnerSha256) {
    throw (
      "Runner checksum mismatch: expected=$runnerSha256 " +
      "actual=$actualSha256"
    )
  }

  Expand-Archive -LiteralPath $archivePath -DestinationPath $runDirectory
  Remove-Item -LiteralPath $archivePath -Force

  $registration = Get-GhJson `
    -Endpoint "repos/$Repository/actions/runners/registration-token" `
    -Method POST
  $registrationToken = $registration.token
  try {
    Push-Location $runDirectory
    try {
      Invoke-Checked -Command '.\config.cmd' -ArgumentList @(
        '--unattended',
        '--url', $repositoryUrl,
        '--token', $registrationToken,
        '--name', $runnerName,
        '--labels', 'third-code-erp-ci',
        '--work', '_work'
      )
    } finally {
      Pop-Location
    }
  } finally {
    $registrationToken = $null
    $registration = $null
  }

  # Migration SQL must reach PostgreSQL byte-for-byte. A Windows runner
  # normally inherits core.autocrlf=true, which changes function bodies.
  $env:GIT_CONFIG_COUNT = '1'
  $env:GIT_CONFIG_KEY_0 = 'core.autocrlf'
  $env:GIT_CONFIG_VALUE_0 = 'false'

  $runnerProcess = Start-Process `
    -FilePath (Join-Path $runDirectory 'run.cmd') `
    -WorkingDirectory $runDirectory `
    -RedirectStandardOutput (Join-Path $runDirectory 'runner.stdout.log') `
    -RedirectStandardError (Join-Path $runDirectory 'runner.stderr.log') `
    -WindowStyle Hidden `
    -PassThru

  $runnerOnline = $false
  for ($attempt = 1; $attempt -le 30; $attempt += 1) {
    if ($runnerProcess.HasExited) {
      Write-RunnerLogs
      throw 'GitHub runner exited before it became available.'
    }
    $runners = Get-GhJson -Endpoint "repos/$Repository/actions/runners"
    $registeredRunner = $runners.runners |
      Where-Object { $_.name -eq $runnerName -and $_.status -eq 'online' } |
      Select-Object -First 1
    if ($registeredRunner) {
      $runnerOnline = $true
      break
    }
    Start-Sleep -Seconds 2
  }

  if (-not $runnerOnline) {
    throw 'Timed out while waiting for the transient runner to become online.'
  }

  $dispatchStart = [DateTime]::UtcNow.AddSeconds(-5)
  $dispatchOutput = & gh workflow run $workflow `
    --repo $Repository `
    --ref $Ref
  if ($LASTEXITCODE -ne 0) {
    throw 'Unable to dispatch the self-hosted workflow.'
  }
  $dispatchOutput | Write-Host

  $runUrlLine = $dispatchOutput |
    Where-Object { $_ -match '/actions/runs/(\d+)$' } |
    Select-Object -First 1
  if ($runUrlLine -and $runUrlLine -match '/actions/runs/(\d+)$') {
    $runId = $Matches[1]
  }

  if (-not $runId) {
    for ($attempt = 1; $attempt -le 30; $attempt += 1) {
      $runsJson = & gh run list `
        --repo $Repository `
        --workflow $workflow `
        --branch $Ref `
        --event workflow_dispatch `
        --limit 10 `
        --json databaseId,createdAt,headSha
      if ($LASTEXITCODE -ne 0) {
        throw 'Unable to query the dispatched workflow.'
      }

      $matchingRun = $runsJson |
        ConvertFrom-Json |
        Where-Object {
          $_.headSha -eq $expectedHeadSha -and
          [DateTime]$_.createdAt -ge $dispatchStart
        } |
        Select-Object -First 1
      if ($matchingRun) {
        $runId = $matchingRun.databaseId
        break
      }
      Start-Sleep -Seconds 2
    }
  }

  if (-not $runId) {
    throw 'Timed out while locating the dispatched workflow run.'
  }

  Write-Host "Watching workflow run $runId..."
  Invoke-Checked -Command 'gh' -ArgumentList @(
    'run', 'watch', "$runId",
    '--repo', $Repository,
    '--exit-status',
    '--interval', '10'
  )
  Write-Host "PASS self-hosted workflow: $repositoryUrl/actions/runs/$runId"
} finally {
  if ($runnerProcess -and -not $runnerProcess.HasExited) {
    & taskkill.exe /PID $runnerProcess.Id /T /F 2>$null | Out-Null
    Start-Sleep -Seconds 1
  }

  try {
    $runners = Get-GhJson -Endpoint "repos/$Repository/actions/runners"
    $registeredRunner = $runners.runners |
      Where-Object { $_.name -eq $runnerName } |
      Select-Object -First 1
    if ($registeredRunner) {
      Invoke-Checked -Command 'gh' -ArgumentList @(
        'api',
        '--method', 'DELETE',
        "repos/$Repository/actions/runners/$($registeredRunner.id)"
      )
    }
  } catch {
    Write-Warning "Runner deregistration check failed: $($_.Exception.Message)"
  }

  if (Test-Path -LiteralPath $runDirectory) {
    if (-not (Remove-TransientRunnerDirectory -Directory $runDirectory)) {
      Write-Warning "Runner work directory requires manual cleanup: $runDirectory"
    }
  }
}
