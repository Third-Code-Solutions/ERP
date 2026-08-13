[CmdletBinding()]
param(
  [ValidateRange(1024, 65535)]
  [int]$Port = 3000,
  [string]$DatabaseUrl = 'postgresql://postgres:postgres@127.0.0.1:54322/erp_self_hosted_ci'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$webRoot = Join-Path $repositoryRoot 'apps\web'
$artifactRoot = Join-Path $repositoryRoot 'tmp\self-hosted-ci'
$stdoutPath = Join-Path $artifactRoot "web-production-$Port.stdout.log"
$stderrPath = Join-Path $artifactRoot "web-production-$Port.stderr.log"
$nextCli = Join-Path $webRoot 'node_modules\next\dist\bin\next'
$nodeCommand = (Get-Command node.exe -ErrorAction Stop).Source
$serverProcess = $null

if ($DatabaseUrl -notmatch '@(127\.0\.0\.1|localhost):54322/') {
  throw 'Refusing local browser smoke against a non-local PostgreSQL target.'
}
if (-not (Test-Path -LiteralPath (Join-Path $webRoot '.next\BUILD_ID'))) {
  throw 'Missing apps/web/.next/BUILD_ID. Run the production web build first.'
}

New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null

function Wait-ForHealth {
  $healthUri = "http://127.0.0.1:$Port/api/health"
  foreach ($attempt in 1..60) {
    if ($serverProcess.HasExited) {
      throw "Local Web server exited early with code $($serverProcess.ExitCode)"
    }
    try {
      $health = Invoke-RestMethod -Uri $healthUri -TimeoutSec 2
      if ($health.ok -eq $true -and $health.service -eq 'abi-ops-web') {
        return
      }
    } catch {
      Start-Sleep -Milliseconds 500
    }
  }
  throw "Local Web health check timed out: $healthUri"
}

try {
  $env:NODE_ENV = 'production'
  $env:HOSTNAME = '127.0.0.1'
  $env:PORT = "$Port"
  $env:DATABASE_URL = $DatabaseUrl
  $env:REDIS_URL = 'redis://127.0.0.1:6379'
  $env:NEXT_PUBLIC_APP_URL = "http://localhost:$Port"
  $env:NEXT_PUBLIC_SITE_URL = "http://localhost:$Port"
  $env:NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321'
  $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = 'local-ci-anon-key-not-a-secret'
  $env:SUPABASE_SERVICE_ROLE_KEY = 'local-ci-service-role-placeholder'
  $env:SKIP_ENV_VALIDATION = 'true'
  $env:PLAYWRIGHT_BASE_URL = "http://localhost:$Port"
  if (-not $env:E2E_CHROME_PATH) {
    $env:E2E_CHROME_PATH = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
  }

  $serverProcess = Start-Process `
    -FilePath $nodeCommand `
    -ArgumentList @($nextCli, 'start', '-p', "$Port") `
    -WorkingDirectory $webRoot `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  Wait-ForHealth

  & pnpm --filter @third-code-erp/web exec playwright test `
    e2e/frontend-release-local.spec.ts `
    e2e/auth.spec.ts `
    --reporter=line
  if ($LASTEXITCODE -ne 0) {
    throw "Playwright local production smoke failed with exit code $LASTEXITCODE"
  }

  Write-Output "PASS local production Web E2E on http://localhost:$Port"
} finally {
  if ($null -ne $serverProcess -and -not $serverProcess.HasExited) {
    Stop-Process -Id $serverProcess.Id -Force
    $serverProcess.WaitForExit()
  }
}
