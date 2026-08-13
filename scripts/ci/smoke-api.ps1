$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$stdoutPath = Join-Path $repositoryRoot 'tmp\self-hosted-ci\api.stdout.log'
$stderrPath = Join-Path $repositoryRoot 'tmp\self-hosted-ci\api.stderr.log'

$env:NODE_ENV = 'test'
$env:PORT = '3091'
$env:SUPABASE_URL = 'http://127.0.0.1:54321'
$env:SUPABASE_ANON_KEY = 'local-ci-anon-key-not-a-secret'
$env:ERP_API_CORS_ORIGINS = 'http://127.0.0.1:3000'

$process = Start-Process `
  -FilePath 'node' `
  -ArgumentList 'apps/api/dist/main.js' `
  -WorkingDirectory $repositoryRoot `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -WindowStyle Hidden `
  -PassThru

try {
  $healthy = $false
  for ($attempt = 1; $attempt -le 30; $attempt += 1) {
    if ($process.HasExited) {
      throw "Nest API exited early with code $($process.ExitCode)"
    }
    try {
      $response = Invoke-WebRequest `
        -Uri 'http://127.0.0.1:3091/health' `
        -UseBasicParsing `
        -TimeoutSec 2
      $health = $response.Content | ConvertFrom-Json
      if ($response.StatusCode -eq 200 -and $health.service -eq 'abi-ops-api') {
        $healthy = $true
        break
      }
    } catch {
      Start-Sleep -Seconds 1
    }
  }

  if (-not $healthy) {
    throw 'Nest API health check timed out or returned the wrong ABI OPS service identity'
  }

  $ready = Invoke-RestMethod `
    -Uri 'http://127.0.0.1:3091/ready' `
    -TimeoutSec 5
  if (
    $ready.status -ne 'ready' -or
    $ready.database -ne 'ok' -or
    $ready.redis -ne 'ok'
  ) {
    throw "Nest API readiness failed: $($ready | ConvertTo-Json -Compress)"
  }

  try {
    Invoke-WebRequest `
      -Uri (
        'http://127.0.0.1:3091/v1/projects/' +
        '33333333-3333-4333-8333-333333333333'
      ) `
      -Method Patch `
      -ContentType 'application/json' `
      -Body '{}' `
      -UseBasicParsing `
      -TimeoutSec 5 | Out-Null
    throw 'Unauthenticated Project PATCH unexpectedly succeeded'
  } catch {
    if ($_.Exception.Response.StatusCode.value__ -ne 401) {
      throw
    }
  }

  Write-Host 'PASS Nest native production smoke: health, readiness, 401.'
} finally {
  if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit()
  }
  Get-Content -LiteralPath $stdoutPath -ErrorAction SilentlyContinue
  Get-Content -LiteralPath $stderrPath -ErrorAction SilentlyContinue
}
