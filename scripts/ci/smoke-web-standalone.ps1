[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 3090
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$tempBase = [IO.Path]::GetFullPath(
  (Join-Path (Split-Path -Parent $repositoryRoot) '.thirdcode-erp-ci')
)
$workRoot = [IO.Path]::GetFullPath(
  (Join-Path $tempBase "web-standalone-$([Guid]::NewGuid().ToString('N'))")
)
$sourceCopy = Join-Path $workRoot 'repo'
$archivePath = Join-Path $workRoot 'source.tar'
$serverLog = Join-Path $workRoot 'server.log'
$serverErrorLog = Join-Path $workRoot 'server-error.log'
$serverProcess = $null

function Assert-LastExitCode {
  param(
    [Parameter(Mandatory)]
    [string]$Operation
  )

  if ($LASTEXITCODE -ne 0) {
    throw "$Operation failed with exit code $LASTEXITCODE"
  }
}

function Assert-SafeWorkRoot {
  $expectedPrefix = $tempBase.TrimEnd('\') + '\'

  if (
    -not $workRoot.StartsWith(
      $expectedPrefix,
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw "Unsafe standalone work root: $workRoot"
  }
}

function Wait-ForHealth {
  $healthUri = "http://127.0.0.1:$Port/api/health"

  foreach ($attempt in 1..60) {
    if ($serverProcess.HasExited) {
      throw "Next standalone server exited with code $($serverProcess.ExitCode)"
    }

    try {
      $health = Invoke-RestMethod -Uri $healthUri -TimeoutSec 2
      if ($health.ok) {
        return $health
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }

  throw "Next standalone health check timed out: $healthUri"
}

function Assert-ResponseContains {
  param(
    [Parameter(Mandatory)]
    [string]$Name,

    [Parameter(Mandatory)]
    [object]$Content,

    [Parameter(Mandatory)]
    [string]$Pattern
  )

  $contentText = if ($Content -is [byte[]]) {
    [Text.Encoding]::UTF8.GetString($Content)
  } else {
    [string]$Content
  }

  if ($contentText -notmatch $Pattern) {
    throw "$Name did not contain expected pattern: $Pattern"
  }
}

try {
  Assert-SafeWorkRoot
  New-Item -ItemType Directory -Path $sourceCopy -Force | Out-Null

  & tar.exe `
    -C $repositoryRoot `
    --exclude=.git `
    --exclude=node_modules `
    --exclude=apps/web/.next `
    --exclude=.env `
    --exclude=.env.* `
    --exclude=apps/*/.env `
    --exclude=apps/*/.env.* `
    --exclude=.turbo `
    --exclude=.playwright-cli `
    --exclude=.playwright-mcp `
    --exclude=.thirdcode-erp-ci `
    --exclude=output `
    --exclude=tmp `
    --exclude=playwright-report `
    --exclude=test-results `
    -cf $archivePath .
  Assert-LastExitCode -Operation 'Create isolated source archive'

  & tar.exe -C $sourceCopy -xf $archivePath
  Assert-LastExitCode -Operation 'Extract isolated source archive'

  Push-Location $sourceCopy
  try {
    & pnpm install --frozen-lockfile --config.node-linker=hoisted
    Assert-LastExitCode -Operation 'Install isolated hoisted dependencies'

    $env:NEXT_OUTPUT_MODE = 'standalone'
    $env:NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co'
    $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder-anon-key'
    $env:NEXT_PUBLIC_SITE_URL = 'https://abi-ops.example'
    $expectedSiteUrlRegex = [regex]::Escape($env:NEXT_PUBLIC_SITE_URL.TrimEnd('/'))
    $env:SUPABASE_SERVICE_ROLE_KEY = 'placeholder-service-role-key'
    $env:DATABASE_URL =
      'postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
    $env:SKIP_ENV_VALIDATION = 'true'

    & pnpm --filter @third-code-erp/web build
    Assert-LastExitCode -Operation 'Build Next standalone output'
  } finally {
    Pop-Location
  }

  $webRoot = Join-Path $sourceCopy 'apps\web'
  $standaloneRoot = Join-Path $webRoot '.next\standalone'
  $standaloneApp = Join-Path $standaloneRoot 'apps\web'
  $serverPath = Join-Path $standaloneApp 'server.js'

  if (-not (Test-Path -LiteralPath $serverPath -PathType Leaf)) {
    throw "Missing Next standalone server: $serverPath"
  }

  New-Item `
    -ItemType Directory `
    -Path (Join-Path $standaloneApp 'public') `
    -Force | Out-Null
  New-Item `
    -ItemType Directory `
    -Path (Join-Path $standaloneApp '.next\static') `
    -Force | Out-Null
  Copy-Item `
    -Path (Join-Path $webRoot 'public\*') `
    -Destination (Join-Path $standaloneApp 'public') `
    -Recurse `
    -Force
  Copy-Item `
    -Path (Join-Path $webRoot '.next\static\*') `
    -Destination (Join-Path $standaloneApp '.next\static') `
    -Recurse `
    -Force

  $env:NODE_ENV = 'production'
  $env:HOSTNAME = '127.0.0.1'
  $env:PORT = "$Port"
  $env:APP_REVISION = 'self-hosted-smoke'

  $serverProcess = Start-Process `
    -FilePath 'node.exe' `
    -ArgumentList 'apps/web/server.js' `
    -WorkingDirectory $standaloneRoot `
    -RedirectStandardOutput $serverLog `
    -RedirectStandardError $serverErrorLog `
    -WindowStyle Hidden `
    -PassThru

  $health = Wait-ForHealth
  if ($health.service -ne 'abi-ops-web') {
    throw "Unexpected Web health service: $($health.service)"
  }
  if ($health.revision -ne 'self-hosted-') {
    throw "Unexpected Web health revision: $($health.revision)"
  }

  $origin = "http://127.0.0.1:$Port"
  $landing = Invoke-WebRequest -Uri "$origin/" -UseBasicParsing -TimeoutSec 10
  Assert-ResponseContains `
    -Name 'Landing page' `
    -Content $landing.Content `
    -Pattern 'ABI OPS'

  if ($landing.Headers['Content-Security-Policy'] -notmatch 'nonce-') {
    throw 'Landing page did not return a nonce-based Content-Security-Policy'
  }

  $robots = (Invoke-WebRequest `
      -Uri "$origin/robots.txt" `
      -UseBasicParsing `
      -TimeoutSec 10).Content
  Assert-ResponseContains `
    -Name 'robots.txt' `
    -Content $robots `
    -Pattern "Sitemap: $expectedSiteUrlRegex/sitemap\.xml"

  $sitemap = (Invoke-WebRequest `
      -Uri "$origin/sitemap.xml" `
      -UseBasicParsing `
      -TimeoutSec 10).Content
  Assert-ResponseContains `
    -Name 'sitemap.xml' `
    -Content $sitemap `
    -Pattern "<loc>$expectedSiteUrlRegex/</loc>"
  if ($sitemap -match '<lastmod>') {
    throw 'sitemap.xml contains an unverified lastmod'
  }

  $manifestResponse = Invoke-WebRequest `
      -Uri "$origin/manifest.webmanifest" `
      -UseBasicParsing `
      -TimeoutSec 10
  $manifest = if ($manifestResponse.Content -is [byte[]]) {
    [Text.Encoding]::UTF8.GetString($manifestResponse.Content)
  } else {
    [string]$manifestResponse.Content
  }
  try {
    $manifestDocument = ConvertFrom-Json -InputObject $manifest
  } catch {
    throw "manifest.webmanifest was not valid JSON: $($_.Exception.Message)"
  }
  $manifestNameProperty = $manifestDocument.PSObject.Properties['name']
  $manifestShortNameProperty = $manifestDocument.PSObject.Properties['short_name']
  if (
    $null -eq $manifestNameProperty -or
    [string]$manifestNameProperty.Value -ne 'ABI OPS' -or
    $null -eq $manifestShortNameProperty -or
    [string]$manifestShortNameProperty.Value -ne 'ABI OPS'
  ) {
    throw 'manifest.webmanifest brand mismatch: expected name and short_name ABI OPS'
  }

  Write-Output 'PASS Next standalone: health, landing, CSP, robots, sitemap, manifest.'
} finally {
  if ($null -ne $serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force
    $serverProcess.WaitForExit(5000) | Out-Null
  }

  if (Test-Path -LiteralPath $serverLog) {
    Get-Content -LiteralPath $serverLog
  }
  if (Test-Path -LiteralPath $serverErrorLog) {
    Get-Content -LiteralPath $serverErrorLog
  }

  Assert-SafeWorkRoot
  if (Test-Path -LiteralPath $workRoot) {
    try {
      [IO.Directory]::Delete($workRoot, $true)
    } catch {
      try {
        Remove-Item -LiteralPath $workRoot -Recurse -Force -ErrorAction Stop
      } catch {
        Write-Warning "Standalone cleanup incomplete: $workRoot ($($_.Exception.Message))"
      }
    }
  }
  if (
    (Test-Path -LiteralPath $tempBase) -and
    -not (Get-ChildItem -LiteralPath $tempBase -Force)
  ) {
    try {
      [IO.Directory]::Delete($tempBase, $false)
    } catch {
      Write-Warning "Standalone temp-root cleanup incomplete: $tempBase ($($_.Exception.Message))"
    }
  }
}
