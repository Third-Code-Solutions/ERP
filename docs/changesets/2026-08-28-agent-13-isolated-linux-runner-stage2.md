# Agent 13 — isolated Linux runner Stage 2

**Date:** 2026-08-28
**Candidate:** `b55f15a72afdb8387065a5d53a6672997b61627c` on
`codex/release-candidate-trial-port`
**Outcome:** **Pre-provision PASS — runner and release remain NO-GO pending Agent 12 review.**

This Stage 2 record follows the accepted Agent 12 containment contract and
the no-cost recovery handoff. It is not production, Auth, Snyk, security-scan,
database, provider, billing, deployment, or release evidence.

## Read-only target evidence

- GitHub organization runner group `3` is the non-default
  `erp-ci-isolated` group. It remains selected for exactly
  `Third-Code-Solutions/ERP` (repository ID `1234811736`), has
  `restricted_to_workflows=true`, and has **zero** runners.
- Its sole selected workflow remains the prior Windows workflow revision:
  `Third-Code-Solutions/ERP/.github/workflows/ci-self-hosted.yml@82615eb72d64b4d32bacfb9a218525d8834fdaa7`.
  It was deliberately not changed after the host preflight failure.
- The host reports Windows 10 Pro build `26100`, a present hypervisor, 12
  logical processors, 31.9 GiB RAM, and about 501 GiB free on `D:`. Direct
  non-elevated `Get-VM` and `Get-VMSwitch` access is denied.
- Existing Docker Desktop containers/networks, including `nginx-test`, the
  existing Redis workloads, and `D:\actions-runner`, were inventoried only and
  were not started, stopped, changed, or reused.

## Immutable base and design prepared

The planned base is the dated official Ubuntu 24.04 LTS Noble archive, not a
mutable `current` or `latest` URL:

- source:
  `https://cloud-images.ubuntu.com/noble/20260826/noble-server-cloudimg-amd64-azure.vhd.tar.gz`
- publisher checksum reference:
  `https://cloud-images.ubuntu.com/noble/20260826/SHA256SUMS`
- expected SHA-256:
  `843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22`

No archive or VHD was downloaded, converted, mounted, or booted. The intended
accepted mechanism is an ephemeral Gen2 VM with a newly converted D:-scoped
VHDX, an internal switch, a dedicated named WinNAT, guest-local Docker, and a
non-login runner identity. Microsoft documents that WinNAT permits one NAT per
host, so the helper explicitly refuses to share, replace, or remove an existing
NAT instead of disturbing Docker Desktop or another host workload.

## Repository changes (not activated)

- Added `.github/workflows/ci-linux-runner-smoke.yml`: manual dispatch only,
  exact owner/repository/ref/actor/triggering-actor guard, group
  `erp-ci-isolated`, and the distinct Linux label `third-code-erp-ci-linux`.
  It uses no checkout, secret, Auth, Snyk, Supabase, or production value. Its
  non-secret smoke creates only a run-labelled guest Docker network/container,
  reads dynamic `.NetworkSettings.Ports`, accepts only literal loopback host
  addresses, reconciles guest `ss` evidence, tests guest loopback, and performs
  targeted unconditional cleanup.
- Added `scripts/ci/invoke-isolated-linux-runner-host.ps1`: the exact
  elevated **Preflight** and **Rollback** helper. Preflight records VM/switch/
  NAT/static-map/port-proxy/Docker/D: inventory and refuses a pre-existing
  target or any WinNAT. Rollback accepts only the run-identity names and has no
  Default Switch, WSL, Desktop Docker, broad-prune, or `D:\actions-runner`
  operation. Provision is intentionally absent: it cannot begin until the
  elevated capability is proven and the JIT-input path has been independently
  reviewed.
- Added static regression coverage and registered it as
  `pnpm test:isolated-linux-runner-contract`. The actionlint self-hosted label
  allowlist now recognizes the new distinct Linux label.

## Verified static gates

| Check | Result |
| --- | --- |
| `pnpm test:isolated-linux-runner-contract` | **PASS** — 3/3 contract tests |
| PowerShell parser for `invoke-isolated-linux-runner-host.ps1` | **PASS** |
| `pnpm ci:actionlint .github/workflows/ci-linux-runner-smoke.yml` | **PASS** — actionlint 1.7.12 checksum verified |
| `pnpm verify:workflow-action-refs` | **PASS** — four existing action refs resolve |
| Image download / VHDX hash / VM boot | **NOT RUN** — preflight-only scope |
| Guest Docker/listener/host-NAT proof | **NOT RUN** — no VM was created |
| JIT registration / runner group workflow update | **NOT RUN** — Agent 12 review required |

## Initial ledger-writer blocker and rollback state (superseded)

The reviewed helper was launched twice with a visible UAC request in
`Preflight` mode only. The elevated child processes (PIDs `22908` and `4372`)
exited before the required non-secret ledger was written. Because neither a
success nor a recorded failure ledger exists, elevation and exact Hyper-V/WinNAT
inventory remained **unverified**. This was treated as a failed capability gate,
not as user approval and not as a pass; the later compatible writer and ledgered
retry supersede that conclusion.

No host change was made: no VM, VHD/VHDX, mounted image, switch, NAT, static
mapping, port proxy, firewall rule, host probe, guest, Docker resource, runner,
group restriction, or provider target was created or modified. Consequently no
host rollback is needed; the only repository rollback is reverting this commit.

**Return to Agent 12 / Agent 01:** resolve the visible UAC execution/ledger
failure and repeat the exact read-only preflight. Do not provision, register a
runner, change group `3`, run Auth/Snyk/full CI, or use this static workflow as
release evidence until that preflight produces a ledger and Agent 12 reviews the
result.

## Follow-up — ledger compatibility repair pending verification

Read-only Windows PowerShell event evidence subsequently confirmed that the
visible UAC process did start, but it used Windows PowerShell 5.1. Its
`Set-Content -Encoding utf8NoBOM` rejected the PowerShell-7-only encoding name
in both the primary and catch ledger paths, so the earlier missing ledger was a
writer compatibility failure rather than a UAC rejection. The harness now uses
the .NET `UTF8Encoding(false)` writer and has a no-host-mutation regression mode
that must pass under Windows PowerShell 5.1 and pwsh before one exact elevated
Preflight retry. This record is updated again only with that ledgered result.

## Current elevated preflight — PASS, no host mutation

After the compatibility repair, exactly one visible UAC launch used Windows
PowerShell 5.1 `Preflight` mode with the same identity and ledger target. The
resulting ledger is valid BOM-less UTF-8 JSON (SHA-256
`e274bfa5bd4e5a9500ef51c5b5409fe17d6791e5bb2c3b8346b970bf05564f7d`) with
`Outcome=PASS`, `Mode=Preflight`, and timestamp
`2026-08-28T12:27:00.8520756Z`.

It records no VM, WinNAT, static mapping, run-owned Firewall rule, target
switch, target port proxy, target Docker resource, or target D: root. The only
existing switches are `Default Switch` and `WSL (Hyper-V firewall)`; the only
recorded Docker containers are `thirdcode-erp-e2e-redis`,
`simula-local-redis-1`, and `nginx-test`; and the only recorded networks are
`bridge`, `host`, `none`, and `simula-local_simula-private`. All were preserved.
D: free capacity was `538014273536` bytes.

The preflight helper has no Provision action and writes only the non-secret
ledger. It downloaded no image and did not create or modify a VM, VHD/VHDX,
switch, NAT, mapping, port proxy, firewall rule, Docker resource, runner,
GitHub runner-group selection, provider, database, credential, or production
target.

→ **Handoff to Agent 12.** Review this ledgered target/capability evidence and
the static Linux smoke workflow before any Provision design or execution. The
runner group remains unchanged and no runner has been registered.
