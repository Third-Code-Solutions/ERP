[CmdletBinding()]
param(
  [string]$Distribution = 'ThirdCodeERP-Test'
)

$ErrorActionPreference = 'Continue'
$databaseName = 'erp_self_hosted_ci'

$stopRedis = @'
if [ -x /opt/third-code-erp-ci/redis-7.4.9/bin/redis-cli ]; then
  /opt/third-code-erp-ci/redis-7.4.9/bin/redis-cli \
    -h 127.0.0.1 -p 6379 shutdown nosave >/dev/null 2>&1 || true
fi
'@
$encodedStopRedis = [Convert]::ToBase64String(
  [Text.Encoding]::UTF8.GetBytes(($stopRedis -replace "`r`n", "`n"))
)
wsl.exe -d $Distribution -- sh -lc `
  "printf '%s' '$encodedStopRedis' | base64 -d | sh"

wsl.exe -d $Distribution -- psql `
  -h 127.0.0.1 `
  -p 54322 `
  -U postgres `
  -d postgres `
  -v ON_ERROR_STOP=1 `
  -c "select pg_terminate_backend(pid) from pg_stat_activity where datname = '$databaseName' and pid <> pg_backend_pid();"

wsl.exe -d $Distribution -- dropdb `
  --if-exists `
  -h 127.0.0.1 `
  -p 54322 `
  -U postgres `
  $databaseName

wsl.exe -d $Distribution -- su postgres -s /bin/sh -c `
  'pg_ctl -D /var/lib/postgresql/data stop -m fast' 2>$null

Write-Host 'Self-hosted database lane cleanup complete.'
