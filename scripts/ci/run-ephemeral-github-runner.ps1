[CmdletBinding()]
param(
  [string]$Ref = '',
  [string]$Repository = 'Third-Code-Solutions/ERP',
  [string]$RunnerBase = 'D:\thirdcode\.github-runners\Third-Code-ERP'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$runnerVersion = '2.336.0'
$runnerSha256 =
  'd59123a43003e357b0805b5d0f611d0bd2f65ab67d51bd070dd4e7a0f685c162'
$workflow = 'ci-self-hosted.yml'
$repositoryUrl = "https://github.com/$Repository"
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

Invoke-Checked -Command 'gh' -ArgumentList @('auth', 'status')
$viewer = (& gh api user --jq '.login').Trim()
if ($LASTEXITCODE -ne 0 -or $viewer -ne 'kurtgav') {
  throw "GitHub CLI must use kurtgav; active identity: $viewer"
}

$repositoryMetadata = Get-GhJson -Endpoint "repos/$Repository"
if (-not $repositoryMetadata.private) {
  throw 'Refusing to attach a local runner to a public repository.'
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
        '--ephemeral',
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

  $dispatchStart = [DateTime]::UtcNow.AddSeconds(-5)
  Invoke-Checked -Command 'gh' -ArgumentList @(
    'workflow', 'run', $workflow,
    '--repo', $Repository,
    '--ref', $Ref
  )

  $runnerProcess = Start-Process `
    -FilePath (Join-Path $runDirectory 'run.cmd') `
    -WorkingDirectory $runDirectory `
    -RedirectStandardOutput (Join-Path $runDirectory 'runner.stdout.log') `
    -RedirectStandardError (Join-Path $runDirectory 'runner.stderr.log') `
    -WindowStyle Hidden `
    -PassThru

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
    Stop-Process -Id $runnerProcess.Id -Force
    $runnerProcess.WaitForExit()
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
    $resolvedRunDirectory = [IO.Path]::GetFullPath($runDirectory)
    if (-not $resolvedRunDirectory.StartsWith(
        "$runnerBasePath\",
        [StringComparison]::OrdinalIgnoreCase
      )) {
      throw "Refusing unsafe runner cleanup: $resolvedRunDirectory"
    }
    Remove-Item -LiteralPath $resolvedRunDirectory -Recurse -Force
  }
}
