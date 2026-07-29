[CmdletBinding()]
param(
  [string]$Distribution = 'ThirdCodeERP-Test'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$artifactRoot = [IO.Path]::GetFullPath(
  (Join-Path $repositoryRoot 'tmp\self-hosted-ci')
)

if (-not $artifactRoot.StartsWith($repositoryRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Artifact path escaped repository: $artifactRoot"
}

if (Test-Path -LiteralPath $artifactRoot) {
  Remove-Item -LiteralPath $artifactRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $artifactRoot | Out-Null

function Invoke-Wsl {
  param(
    [Parameter(Mandatory)]
    [string[]]$ArgumentList,
    [switch]$Capture
  )

  if ($Capture) {
    $output = & wsl.exe -d $Distribution -- @ArgumentList
    if ($LASTEXITCODE -ne 0) {
      throw "WSL command failed ($LASTEXITCODE): $($ArgumentList -join ' ')"
    }
    return $output
  }

  & wsl.exe -d $Distribution -- @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "WSL command failed ($LASTEXITCODE): $($ArgumentList -join ' ')"
  }
}

function Invoke-WslScript {
  param(
    [Parameter(Mandatory)]
    [string]$Script
  )

  $normalized = $Script -replace "`r`n", "`n"
  $encoded = [Convert]::ToBase64String(
    [Text.Encoding]::UTF8.GetBytes($normalized)
  )
  & wsl.exe -d $Distribution -- sh -lc `
    "printf '%s' '$encoded' | base64 -d | sh"
  if ($LASTEXITCODE -ne 0) {
    throw "WSL script failed with exit code $LASTEXITCODE"
  }
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

function Convert-ToWslPath {
  param(
    [Parameter(Mandatory)]
    [string]$WindowsPath
  )

  $fullPath = [IO.Path]::GetFullPath($WindowsPath)
  if ($fullPath -notmatch '^([A-Za-z]):\\(.*)$') {
    throw "Unsupported Windows path for WSL mapping: $fullPath"
  }

  $drive = $Matches[1].ToLowerInvariant()
  $relative = $Matches[2] -replace '\\', '/'
  return "/mnt/$drive/$relative"
}

Invoke-Wsl -ArgumentList @('true')

$redisBootstrap = @'
set -eu
apk add --no-cache build-base git >/dev/null
install_root=/opt/third-code-erp-ci/redis-7.4.9
source_root=/opt/third-code-erp-ci/redis-7.4.9-src
expected_commit=009837ec26475d53982241fe2c0ba3b8d68ee40d
if [ ! -x "$install_root/bin/redis-server" ] || \
   ! "$install_root/bin/redis-server" --version | grep -q 'v=7.4.9 '; then
  rm -rf "$source_root" "$install_root"
  mkdir -p /opt/third-code-erp-ci
  git clone --quiet --filter=blob:none --no-checkout \
    https://github.com/redis/redis.git "$source_root"
  git -C "$source_root" checkout --quiet "$expected_commit"
  test "$(git -C "$source_root" rev-parse HEAD)" = "$expected_commit"
  make -C "$source_root" -j2 BUILD_TLS=no MALLOC=libc >/dev/null
  mkdir -p "$install_root/bin"
  install -m 0755 "$source_root/src/redis-server" "$install_root/bin/redis-server"
  install -m 0755 "$source_root/src/redis-cli" "$install_root/bin/redis-cli"
fi
"$install_root/bin/redis-server" --version | grep 'v=7.4.9 '
'@
Invoke-WslScript -Script $redisBootstrap

$serviceBootstrap = @'
set -eu
mkdir -p /run/postgresql
chown postgres:postgres /run/postgresql
if ! pg_isready -h 127.0.0.1 -p 54322 >/dev/null 2>&1; then
  su postgres -s /bin/sh -c \
    "pg_ctl -D /var/lib/postgresql/data -l /var/lib/postgresql/postgres.log start"
fi
for attempt in 1 2 3 4 5 6 7 8 9 10; do
  pg_isready -h 127.0.0.1 -p 54322 >/dev/null 2>&1 && break
  test "$attempt" -lt 10
  sleep 1
done
if /opt/third-code-erp-ci/redis-7.4.9/bin/redis-cli \
  -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
  /opt/third-code-erp-ci/redis-7.4.9/bin/redis-cli \
    -h 127.0.0.1 -p 6379 shutdown nosave
fi
/opt/third-code-erp-ci/redis-7.4.9/bin/redis-server \
  --bind 127.0.0.1 \
  --port 6379 \
  --protected-mode yes \
  --daemonize yes \
  --save "" \
  --appendonly no
test "$(/opt/third-code-erp-ci/redis-7.4.9/bin/redis-cli \
  -h 127.0.0.1 -p 6379 ping)" = "PONG"
test "$(psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -Atc \
  "show server_version_num")" -ge 170000
test "$(psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -Atc \
  "show server_version_num")" -lt 180000
'@
Invoke-WslScript -Script $serviceBootstrap

$databaseName = 'erp_self_hosted_ci'
Invoke-Wsl -ArgumentList @(
  'psql',
  '-q',
  '-v', 'ON_ERROR_STOP=1',
  '-h', '127.0.0.1',
  '-p', '54322',
  '-U', 'postgres',
  '-d', 'postgres',
  '-c',
  "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$databaseName' and pid <> pg_backend_pid();"
)
Invoke-Wsl -ArgumentList @(
  'dropdb',
  '--if-exists',
  '-h', '127.0.0.1',
  '-p', '54322',
  '-U', 'postgres',
  $databaseName
)
Invoke-Wsl -ArgumentList @(
  'createdb',
  '-h', '127.0.0.1',
  '-p', '54322',
  '-U', 'postgres',
  $databaseName
)

$bootstrapPath = Convert-ToWslPath (
  Join-Path $repositoryRoot 'scripts\ci\supabase-system-bootstrap.sql'
)
Invoke-Wsl -ArgumentList @(
  'psql',
  '-q',
  '-v', 'ON_ERROR_STOP=1',
  '-h', '127.0.0.1',
  '-p', '54322',
  '-U', 'postgres',
  '-d', $databaseName,
  '-f', $bootstrapPath
)

$migrationFiles = Get-ChildItem -LiteralPath (
  Join-Path $repositoryRoot 'supabase\migrations'
) -Filter '*.sql' | Sort-Object Name

foreach ($migration in $migrationFiles) {
  if ($migration.Name -notmatch '^(\d{14})_([a-z0-9_]+)\.sql$') {
    throw "Invalid migration filename: $($migration.Name)"
  }

  $version = $Matches[1]
  $name = $Matches[2]
  $migrationPath = Convert-ToWslPath $migration.FullName
  Write-Host "Applying $($migration.Name)"
  Invoke-Wsl -ArgumentList @(
    'psql',
    '-q',
    '-v', 'ON_ERROR_STOP=1',
    '-h', '127.0.0.1',
    '-p', '54322',
    '-U', 'postgres',
    '-d', $databaseName,
    '-f', $migrationPath
  )
  Invoke-Wsl -ArgumentList @(
    'psql',
    '-q',
    '-v', 'ON_ERROR_STOP=1',
    '-h', '127.0.0.1',
    '-p', '54322',
    '-U', 'postgres',
    '-d', $databaseName,
    '-c',
    "insert into supabase_migrations.schema_migrations(version, name) values ('$version', '$name');"
  )
}

$seedPath = Convert-ToWslPath (
  Join-Path $repositoryRoot 'supabase\seed.sql'
)
Invoke-Wsl -ArgumentList @(
  'psql',
  '-q',
  '-v', 'ON_ERROR_STOP=1',
  '-h', '127.0.0.1',
  '-p', '54322',
  '-U', 'postgres',
  '-d', $databaseName,
  '-f', $seedPath
)

$schemaBefore = Join-Path $artifactRoot 'schema-before.sql'
$schemaAfter = Join-Path $artifactRoot 'schema-after.sql'
$schemaBeforeWsl = Convert-ToWslPath $schemaBefore
$schemaAfterWsl = Convert-ToWslPath $schemaAfter

Invoke-Wsl -ArgumentList @(
  'pg_dump',
  '--schema-only',
  '--no-owner',
  '--no-privileges',
  '--restrict-key=0123456789abcdef0123456789abcdef',
  '-h', '127.0.0.1',
  '-p', '54322',
  '-U', 'postgres',
  '-d', $databaseName,
  '-f', $schemaBeforeWsl
)

$env:DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/$databaseName"
$env:REDIS_URL = 'redis://127.0.0.1:6379'
$env:ERP_REDIS_RESTART_EXPECTED = '1'
$env:ERP_REDIS_TEST_DISTRIBUTION = $Distribution
$env:DATABASE_HARDENING_EXPECTED = '1'
$env:DATABASE_ACCOUNTING_EXPECTED = '1'
$env:DATABASE_RECEIVABLES_EXPECTED = '1'
$env:DATABASE_PAYABLES_EXPECTED = '1'
$env:DATABASE_CASH_EXPECTED = '1'
$env:DATABASE_RECONCILIATION_EXPECTED = '1'
$env:DATABASE_INVENTORY_EXPECTED = '1'
$env:DATABASE_BUDGET_EXPECTED = '1'
$env:DATABASE_STOCK_MOVEMENT_EXPECTED = '1'
$env:ERP_API_INTEGRATION_EXPECTED = '1'

Push-Location $repositoryRoot
try {
  Invoke-Checked -Command 'node' -ArgumentList @(
    'scripts/verify-database-repro.mjs'
  )
  Invoke-Checked -Command 'node' -ArgumentList @(
    'scripts/plan-database-release.mjs',
    '--require-current'
  )

  $testReport = Join-Path $artifactRoot 'vitest.json'
  Invoke-Checked -Command 'pnpm' -ArgumentList @(
    '--filter',
    '@third-code-erp/database',
    'exec',
    'vitest',
    'run',
    '--reporter=json',
    "--outputFile=$testReport"
  )
  Invoke-Checked -Command 'node' -ArgumentList @(
    'scripts/assert-vitest-no-skips.mjs',
    $testReport
  )
  # Database verification is intentionally long. Recreate the disposable
  # Redis process immediately before queue integration so WSL lifecycle or a
  # prior reconnect drill cannot leave stale runtime state.
  Invoke-WslScript -Script $serviceBootstrap
  Invoke-Checked -Command 'pnpm' -ArgumentList @(
    '--filter',
    '@third-code-erp/api',
    'test:integration'
  )
} finally {
  Pop-Location
}

Invoke-Wsl -ArgumentList @(
  'pg_dump',
  '--schema-only',
  '--no-owner',
  '--no-privileges',
  '--restrict-key=0123456789abcdef0123456789abcdef',
  '-h', '127.0.0.1',
  '-p', '54322',
  '-U', 'postgres',
  '-d', $databaseName,
  '-f', $schemaAfterWsl
)

$beforeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $schemaBefore).Hash
$afterHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $schemaAfter).Hash
if ($beforeHash -ne $afterHash) {
  throw "Database tests changed schema: before=$beforeHash after=$afterHash"
}

$ledger = Invoke-Wsl -ArgumentList @(
  'psql',
  '-q',
  '-h', '127.0.0.1',
  '-p', '54322',
  '-U', 'postgres',
  '-d', $databaseName,
  '-Atc',
  'select version from supabase_migrations.schema_migrations order by version'
) -Capture
$ledger | Set-Content -LiteralPath (
  Join-Path $artifactRoot 'migration-list.txt'
) -Encoding utf8

Write-Host (
  "PASS self-hosted database lane: PostgreSQL 17, Redis 7.4.9, " +
  "$($migrationFiles.Count) migrations, schema sha256:$beforeHash"
)
