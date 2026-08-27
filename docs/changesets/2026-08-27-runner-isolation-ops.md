# Agent 13 changeset — ERP-only self-hosted runner selection

**Date:** 2026-08-27
**Owner:** Agent 13 — CI/CD & Ops
**Status:** group/workflow containment applied; host-service design is **pending
Agent 12 acceptance and one explicit UAC approval**. No runner has been
registered and no host ACL, Docker, firewall, billing, provider-data, or
production change was made.

## Provider selection evidence

GitHub's organization runner-group API supports an organization group with
`visibility: selected` and a `selected_repository_ids` allowlist. This was
verified against the current GitHub documentation before any group was created.

The resulting group is:

| Property | Verified value |
| --- | --- |
| Group | `erp-ci-isolated` (ID `3`) |
| Default group | `false` |
| Visibility | `selected` |
| Public repositories allowed | `false` |
| Selected repositories | exactly `Third-Code-Solutions/ERP` (repository ID `1234811736`) |
| Group runners | `0` |

The organization runner query was empty before creation. The Default runner
group was not changed or used.

`ci-self-hosted.yml` now targets this group plus the existing
`third-code-erp-ci` label. Its only job is additionally fail-closed for a
manual dispatch from the expected organization, repository, actor, triggering
actor, and release-candidate branch. It cannot run for pull requests, forks,
another repository, a different branch, or a different dispatcher.

## Read-only host evidence

- `docker-users` exists and currently contains only the interactive desktop
  account; `NT AUTHORITY\\NETWORK SERVICE` has not been granted Docker access.
- Docker Desktop's `com.docker.service` is stopped (manual start type).
- No listener currently exists on `54321`, `54322`, `54323`, `54324`, or
  `54327`.
- Domain, Private, and Public Windows Firewall profiles are enabled.

The local Supabase attempt previously showed wildcard Docker publication for
these ports. A requested loopback network option is therefore insufficient
evidence of containment on this host.

## Conditional, bounded UAC plan — do not execute before Agent 12 acceptance

This is the sole candidate host change. It deliberately uses the built-in,
non-interactive `NT AUTHORITY\\NETWORK SERVICE` identity, not
`DESKTOP-D7PA3K2\\MSI` or its GitHub CLI profile. Network Service is isolated
from that desktop profile, but it is a shared Windows service identity rather
than a separately created user. Agent 12 must explicitly accept that residual
risk before this plan may run.

Docker's Windows named-pipe access through `docker-users` is a high-risk
capability: code executed by a runner able to control Docker can create or
control privileged containers and may reach host-mounted resources. It is not
equivalent to a sandbox. If Agent 12 does not accept this host-level residual
risk, the plan is rejected and the only acceptable alternative is a separate
disposable CI host.

After that acceptance and the repository owner's exact UAC approval, run one
elevated PowerShell session with these preconditions:

1. Resolve and verify only these targets: `D:\actions-runner\erp-ci-isolated`,
   the local `docker-users` group, the five named firewall rules below, and the
   one GitHub Actions Runner service created from that directory.
2. Verify that `erp-ci-isolated` still selects only
   `Third-Code-Solutions/ERP` and contains zero runners. Verify that the
   runner root does not already exist and no Actions Runner service points at
   it. Abort on any mismatch.
3. Re-verify the runner archive SHA-256 before extraction. Use a fresh,
   one-hour GitHub registration token supplied into the elevated session via
   `Read-Host -AsSecureString`; do not echo it, put it in a file, store it in
   a shell profile, or copy the interactive GitHub CLI credential to the
   service. The runner's normal ephemeral registration state is removed after
   its one job.

The approved elevated sequence is intentionally limited to the following
objects (shown for review, not executed):

```powershell
$ErrorActionPreference = 'Stop'
$runnerRoot = 'D:\actions-runner\erp-ci-isolated'
$runnerArchive = 'D:\actions-runner\actions-runner-win-x64-2.337.0.zip'
$expectedArchiveSha256 = '1150692afa94e71f872017e254ea55b6eece1eece3fe7e3a6d4c93d0a1b85cfc'
$networkService = 'NT AUTHORITY\NETWORK SERVICE'
$firewallGroup = 'ThirdCodeERP-CI-Containment'
$ciPorts = 54321, 54322, 54323, 54324, 54327

if (Test-Path -LiteralPath $runnerRoot) { throw 'Isolated runner root already exists' }
if ((Get-FileHash -LiteralPath $runnerArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedArchiveSha256) {
  throw 'Runner archive checksum mismatch'
}
if (@(Get-CimInstance Win32_Service | Where-Object { $_.PathName -like "*$runnerRoot*" }).Count -ne 0) {
  throw 'A runner service already targets the isolated root'
}
if (-not (Get-LocalGroup -Name 'docker-users' -ErrorAction SilentlyContinue)) {
  throw 'Docker Desktop group is unavailable'
}

New-Item -ItemType Directory -Path $runnerRoot | Out-Null
Expand-Archive -LiteralPath $runnerArchive -DestinationPath $runnerRoot
Add-LocalGroupMember -Group 'docker-users' -Member $networkService

foreach ($port in $ciPorts) {
  $displayName = "ThirdCodeERP-CI-Block-Remote-Supabase-TCP-$port"
  if (Get-NetFirewallRule -DisplayName $displayName -ErrorAction SilentlyContinue) {
    throw "Unexpected existing containment rule: $displayName"
  }
  New-NetFirewallRule -DisplayName $displayName -Group $firewallGroup `
    -Direction Inbound -Action Block -Protocol TCP -LocalPort $port `
    -Profile Domain,Private,Public -RemoteAddress Any -EdgeTraversalPolicy Block | Out-Null
}

# The one-time token must be freshly generated at execution time and never printed.
$registrationTokenSecure = Read-Host 'Fresh GitHub runner registration token' -AsSecureString
$registrationToken = [System.Net.NetworkCredential]::new('', $registrationTokenSecure).Password
try {
  Set-Location $runnerRoot
  & .\config.cmd --unattended --url 'https://github.com/Third-Code-Solutions' `
    --token $registrationToken --name 'third-code-erp-ci-win11' `
    --runnergroup 'erp-ci-isolated' --labels 'third-code-erp-ci' --work '_work' `
    --ephemeral --runasservice --windowslogonaccount $networkService
  if ($LASTEXITCODE -ne 0) { throw 'Runner service configuration failed' }
} finally {
  Remove-Variable registrationToken -ErrorAction SilentlyContinue
  Remove-Variable registrationTokenSecure -ErrorAction SilentlyContinue
}

icacls $runnerRoot /inheritance:r | Out-Null
icacls $runnerRoot /grant:r '*S-1-5-20:(OI)(CI)M' `
  'BUILTIN\Administrators:(OI)(CI)F' 'NT AUTHORITY\SYSTEM:(OI)(CI)F' | Out-Null

$service = @(Get-CimInstance Win32_Service | Where-Object { $_.PathName -like "*$runnerRoot*" })
if ($service.Count -ne 1 -or $service[0].StartName -ne 'NT AUTHORITY\NetworkService') {
  throw 'Runner service identity is not the approved Network Service account'
}
Start-Service -Name $service[0].Name
```

The firewall rules are deny-only and are separately named per observed port.
They cover every profile and block edge traversal. Windows loopback behavior
must be proven rather than assumed: after a disposable Supabase start, local
`127.0.0.1` traffic must work while an independent same-LAN test host cannot
connect to each listener on the runner's non-loopback IP. If either assertion
fails, stop the runner, remove only the rules in `$firewallGroup`, and retain
NO-GO. A host-originated self-connection is not evidence that external inbound
traffic is blocked.

Before dispatching CI, also prove that the runner service sees only the
approved ACL, belongs to `docker-users` solely for the accepted Docker
boundary, has no desktop-profile or production-credential access, and that the
group still has only the ERP repository. The service's Docker capability and
its ability to execute trusted repository code remain the explicit residual
risk for Agent 12 to accept or reject.

## Exact rollback (only after resolving the matching targets)

1. Stop and delete the one Actions Runner service whose executable path is
   under `D:\actions-runner\erp-ci-isolated`.
2. Remove `NT AUTHORITY\\NETWORK SERVICE` from `docker-users`.
3. Remove only firewall rules with group
   `ThirdCodeERP-CI-Containment` after listing them and confirming their five
   expected display names/ports.
4. Confirm the GitHub runner group has zero runners, then remove the local
   ephemeral runner state and the exact `D:\actions-runner\erp-ci-isolated`
   directory. Do not touch `D:\actions-runner` or unrelated runner state.
5. Delete GitHub group ID `3` only if its selected-repository query is still
   exactly `Third-Code-Solutions/ERP` and its runner query is empty.

This changeset is the required handoff input for Agent 12's independent
accept/reject review. A local CI pass is CI evidence only; it does not close
hosted-security, production-parity, ABI-commercial, or deployment gates.
