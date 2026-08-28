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

## Static remediation after Agent 12 Stage 3 rejection — pending re-review

Agent 12 rejected the first static design. This follow-up changes only the
repository harness and workflow; it does not rerun UAC, alter the host, create
a VM/switch/NAT/mapping/firewall rule, register a runner, or alter GitHub group
`3`.

- The smoke workflow now sets `permissions: {}` and still permits only its
  manually dispatched, exact ERP/recovery-branch/owner/actor guard. It requires
  an unset `DOCKER_CONTEXT`, the default context resolving exactly to
  `unix:///var/run/docker.sock`, a real Unix socket, a non-root user in the
  `docker` group, an active guest `docker` service, and an `ext4` Docker root.
  These are fail-closed checks for guest-local Docker; membership in the Docker
  group remains a documented root-equivalent residual privilege, contained by
  the dedicated disposable guest rather than treated as harmless.
- The workflow tracks a run-labelled volume and work directory in addition to
  its container and network. Its EXIT handler preserves a nonzero main status
  when cleanup succeeds and fails the job when exact cleanup fails. It checks
  all four current-run resources for residue. Cleanup first queries each exact
  name, so an early failure before creation is idempotent while Docker query,
  removal, or residue-check failure still fails closed. The behavioral
  regression uses a fake Docker command and temporary shell directory only; it
  proves both the absent-resource case and a forced volume-cleanup failure.
- The host helper now parses each `netsh interface portproxy` address family
  into structured entries, records host TCP listeners, standard and Hyper-V
  firewall profile state, target-labelled Docker containers/networks/volumes,
  and asserts every configured protected Supabase port has neither a port proxy
  nor a non-loopback listener. It does not use a historical five-port list as
  proof of future mappings: a future Provision ledger must record its actual,
  unique dynamic ports, and rollback rechecks exactly that set.
- Rollback now accepts only a successful schema-v2 `Provisioned` ledger with
  the exact VM/switch/NAT IDs and properties, marker-hash-owned D: directory,
  full exact firewall rule names plus GUID identities, exact port-proxy
  identities, dynamic port set, and a zero-residue attestation. It rejects a
  preflight ledger, altered residue attestation, and a port proxy outside the
  designated guest. Firewall removal uses only the ledgered rule `Name` after
  matching its GUID, display name, direction, and action; wildcard firewall
  enumeration/removal is absent. Rollback re-inventories and fails unless the
  exact target, port proxies, and non-loopback protected listeners are gone.

| Static gate | Result |
| --- | --- |
| Node 22 `pnpm test:isolated-linux-runner-contract` | **PASS** — 6/6, including PS5/pwsh BOM-less ledger, negative ledger, and cleanup behavior checks |
| PowerShell parser — Windows PowerShell 5.1 | **PASS** |
| PowerShell parser — pwsh 7.6.4 | **PASS** |
| `pnpm ci:actionlint` | **PASS** — actionlint 1.7.12 checksum verified |
| `pnpm verify:workflow-action-refs` | **PASS** — four existing action refs resolve |
| `pnpm ci:gitleaks` | **PASS** — 1,598 commits / 38.54 MB, no leak found |
| `git diff --check` | **PASS** |

**Current status: NO-GO.** The exact workflow SHA has not been submitted for
Group `3` selection and group `3` has not changed. This static remediation must
be accepted by Agent 12 before a provision design, any UAC command, JIT token,
runner registration, or selected-workflow update may occur.

→ **Handoff to Agent 12.** Review the exact pending commit and static evidence
against `2026-08-28-agent-12-isolated-linux-runner-stage3-review.md`. If it is
accepted, return the approved full SHA before any Group `3` update; otherwise
the release remains NO-GO with no host mutation.

## Static remediation after Agent 12 re-review — pending re-review

The static re-review rejected the prior rollback schema. This superseding record
changes no host or GitHub state and makes the containment contract stricter:

- `netsh` port proxies are prohibited, not modeled as rollback resources. The
  elevated preflight rejects every existing port proxy, the future Provisioned
  ledger requires `Resources.PortProxies=[]`, and rollback re-inventory fails
  on any port proxy. Parsing remains only as structured negative evidence.
- A `Provisioned` ledger now records the identities needed to remove in-flight
  resources and is rollback-eligible without claiming they are already gone.
  Only the subsequent `RolledBack` ledger writes `FinalZeroResidue=true` after
  exact removal, re-inventory, no-proxy assertion, and dynamic-port listener
  checks. This keeps interrupted provision cleanup executable.
- Each ledgered firewall rule now must include exact `Name` and `InstanceID`,
  direction, action, enabled state, profile, port/protocol, local/remote
  address, interface alias/type, and explicit VM/switch/interface binding
  evidence. The scope rejects global addresses, global profiles/ports, generic
  interfaces, and bindings outside the dedicated virtual switch. Removal first
  compares the live rule and every captured filter to this ledger evidence,
  then removes only that exact `Name`.
- The Node regression fixture is a truthful Provisioned state: it has no port
  proxy and no pre-cleanup zero-residue claim. Negative cases prove rejection
  of a preflight lifecycle, any port proxy, and a globally scoped firewall
  address filter under both Windows PowerShell 5.1 and pwsh.

**Current status: NO-GO.** This is static contract work only. No UAC launch,
VM/switch/NAT/firewall/port-proxy operation, runner registration, JIT input,
Group `3` update, provider, database, production, Auth, Snyk, or full CI action
has occurred.

→ **Handoff to Agent 12.** Review the new exact commit before any Group `3`
selection or Provision activity. The legacy group selection and zero-runner
state remain preserved.

## Agent 12 accepted workflow selection — external readback

After Agent 12 static acceptance, Group `3` was updated with the GitHub
organization runner-group PATCH endpoint to **replace**, not append, its
selected workflow. The initial request was rejected with HTTP 422 before any
change because a CLI string field represented the Boolean as text; the guarded
typed-field retry succeeded.

The immediate readback proves the following non-secret state:

| Field | Verified value |
| --- | --- |
| Group | `3` / `erp-ci-isolated` |
| Default / visibility | `false` / `selected` |
| Selected repository | exactly `Third-Code-Solutions/ERP` (ID `1234811736`) |
| Workflow restriction | `restricted_to_workflows=true` |
| Selected workflow | exactly `Third-Code-Solutions/ERP/.github/workflows/ci-linux-runner-smoke.yml@827719975eb44808da85cbd64cc28074f6ee4ae1` |
| Runner count | `0` |

No group membership was widened and no runner was registered. No UAC, host,
VM, VHD(X), switch, NAT, mapping, port proxy, firewall, guest, provider,
database, credential, Auth, Snyk, CI dispatch, deployment, or production action
followed. This scoped group configuration does not itself prove a guest
boundary; all subsequent Provision/evidence work remains independently
review-gated and release **NO-GO**.

## Static non-secret Provision design — pending Agent 12 review

`invoke-isolated-linux-runner-host.ps1` now contains, but has **not executed**,
a `Provision` path protected by the exact non-secret acknowledgement
`I_ACKNOWLEDGE_ISOLATED_RUNNER_PROVISION`. The path is intentionally inert
until Agent 12 accepts this specific commit and a separately authorized elevated
invocation is made.

- It accepts only the dated official Ubuntu 24.04 LTS Noble `20260826` Azure
  VHD archive at the pinned source/checksum URLs and SHA-256 recorded above.
  It verifies the local archive hash before extracting one VHD, converting it
  to a D:-scoped dynamic VHDX, and recording the initial disk hashes.
- It defines a Gen2 VM with Secure Boot template
  `MicrosoftUEFICertificateAuthority`, an exact run-owned marker, internal
  switch, dedicated named NAT, and no static NAT mapping or netsh port proxy.
  It refuses an existing WinNAT rather than sharing or replacing Docker Desktop
  resources.
- It creates a temporary, exact CIDATA FAT32 VHDX with cloud-init user/network
  configuration. The guest design has only `erpci`, a locked non-login account
  with no sudo or SSH service; its Docker socket membership is explicit
  guest-root residual privilege. Cloud-init checks guest-local Docker context,
  socket, ext4 storage, lack of WSL/host mounts and `gh` configuration, applies
  inbound-deny/outbound-allow guest firewall defaults, and writes only a
  non-secret precredential evidence record on the guest VHDX.
- The intended host rules are named per-run and ledgered with exact firewall
  filter/binding evidence. A successful schema-v2 `Provisioned` ledger will
  record exact VM/switch/NAT/rule/D: marker/VHDX identities, empty port-proxy
  result, disk hashes, and the guest evidence path. It deliberately contains no
  JIT configuration, runner registration, Auth, secret, Snyk, full CI, or
  provider/production code.
- Rollback validation now also requires the two exact owned VHDX paths and
  initial hash evidence before it will remove the marker-owned run root. Its
  resource removal still cannot begin without a valid Provisioned ledger.

Static tests pass under Node 22 (`pnpm test:isolated-linux-runner-contract`,
**7/7**), including a no-host-mutation `ProvisionPlanRegression` under Windows
PowerShell 5.1 and pwsh. This is a design/parser result, not image, VM, CIDATA,
NAT, firewall, guest, listener, egress, or rollback runtime evidence.

→ **Handoff to Agent 12.** Review this exact Provision code before any archive
download, UAC invocation, VM/switch/NAT/firewall/CIDATA action, JIT generation,
runner registration, or credential stage. The release remains **NO-GO**.

## Static Provision containment remediation — pending Agent 12 re-review

This supersedes the rejected `db094bef` Provision design only. It is repository
code and regression evidence; no Provision mode, UAC prompt, image download,
VM, VHD(X), switch, NAT, mapping, port proxy, firewall rule, runner, group
update, secret, Auth, provider, database, or production action occurred.

- A schema-v2 `Provisioned` ledger now truthfully permits
  `DynamicPorts=[]` with `DynamicPortEvidenceState=not-started`. It separately
  stores the non-secret guest smoke’s observed dynamic ports. Every post-create
  inventory requires **all** WinNAT static mappings and **all** netsh port
  proxies to be empty before PASS.
- Ownership is atomically written as `Provisioning` before the first host
  mutation and refreshed after each named resource: run root, OS/CIDATA/evidence
  disks, switch, gateway IP, NAT, bounded host probe, VM, VM-NIC ACLs, guest
  boot, returned evidence disk, and validated evidence. A failed primary path
  preserves its failure while `finally` performs only the ledger-owned rollback;
  a successful rollback writes `RolledBack` with `FinalZeroResidue=true` and is
  not overwritten by the outer error ledger.
- VM configuration, checkpoint, smart-paging, staging, CIDATA, evidence VHD,
  and verified archive are all constrained below the exact `D:` run root. The
  ledger read-back rejects a path escape and validates marker, VHD hashes, VM,
  switch, NAT, gateway, and exact cleanup identities.
- The rejected global Windows Firewall approach was removed. The new design
  records and live-compares the full VM-NIC extended-ACL tuple (VM/switch/adapter,
  direction, action, local/remote address and port, protocol, weight, state) for
  both inbound and outbound denial of host/NAT, RFC1918, link-local,
  carrier-grade, documentation, benchmark, multicast, and reserved IPv4 ranges.
  IPv6 is disabled in the guest before its smoke; guest UFW is inbound-deny with
  restricted loopback/DNS/HTTPS/NTP egress. No global host firewall rule is
  created or removed.
- Cloud-init attaches only a run-owned FAT evidence VHD, creates a locked
  non-login `erpci` account, performs guest-local Docker socket/context/ext4,
  mount, `gh`-absence, IPv6, loopback, public DNS/NTP/GitHub checks, and emits
  sanitized JSON to that VHD before poweroff. The host waits a bounded period,
  stops an exact in-process gateway probe, mounts the evidence disk read-only,
  validates its schema/hash/non-secret fields, unmounts it, and re-inventories
  VM-NIC ACLs, listeners, NAT mappings, and port proxies before PASS.

The Node regression fixture exercises the exact post-Provision ledger shape
under Windows PowerShell 5.1 and pwsh. Its negative cases reject preflight
lifecycle, any port proxy, a host firewall resource, a nonempty port list in
the truthful pre-Docker state, an ACL gap, a `C:` VM path escape, and missing
guest evidence. Static timeout, partial-stage rollback, and no-global-firewall
requirements are asserted in the reviewed Provision plan. Runtime behavior
remains unproven until Agent 12 accepts this code and authorizes a separate
elevated execution.

| Static gate | Result |
| --- | --- |
| Node 22 `pnpm test:isolated-linux-runner-contract` | **PASS** — 7/7; includes Windows PowerShell 5.1 and pwsh ledger/parser paths |
| `pnpm ci:actionlint` | **PASS** — actionlint 1.7.12 |
| `pnpm verify:workflow-action-refs` | **PASS** — four existing action refs resolve |
| `pnpm ci:gitleaks` | **PASS** — 1,606 commits / 38.63 MB, no leaks |
| `git diff --check` | **PASS** |

→ **Handoff to Agent 12.** Review the pending static candidate only. Do not
authorize archive download, UAC, Provision, JIT/runner registration, Group `3`
selection, Auth/Snyk/full CI, provider/database, or production action from this
changeset. The release remains **NO-GO**.
