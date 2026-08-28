# Agent 12 — Windows/Hyper-V support-maintenance contract

**Date:** 2026-08-28
**Status:** PROPOSED, approval-gated, and documentation-only
**Scope:** The host-level maintenance path required by the isolated-runner
blocker. This is not authority to run diagnostics, repair Windows, reboot,
change networking, provision a runner, or access a release target.

## Decision

The dedicated Hyper-V runner remains **BLOCKED / NO-GO**. A support-maintenance
path may be considered only in the phases below. It must stop when a phase
fails or the user declines its separate approval. A generic retry is not a
diagnostic, and no runner work may be combined with system maintenance.

## Current official sources — retrieved 2026-08-28

- Microsoft's [KB3101106 client article](https://learn.microsoft.com/en-us/troubleshoot/windows-client/virtualization/cannot-create-hyper-v-virtual-switch)
  describes the same high-level error for a stale switch after a Windows 10
  upgrade. Its remedy warns that connectivity will be lost, manual restart is
  required, known Wi-Fi networks must be reconnected manually, and the switch
  must be re-created. Its stated applicability is Windows 10, not the current
  Windows 11 build; the legacy Easy Fix is therefore **prohibited** unless
  Microsoft first confirms that exact applicability.
- Microsoft's [Repair a Windows Image](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/repair-a-windows-image?view=windows-11)
  documents `DISM /Online /Cleanup-Image /CheckHealth` and `/ScanHealth` as
  health checks, and `/RestoreHealth` only when the image is repairable. It
  also documents explicit repair sources and `/LimitAccess`.
- Microsoft's [vSwitch driver/binding troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/windows-server/virtualization/error-applying-virtual-switch-properties-changes)
  shows that switch creation can complete then fail in the binding stage due to
  a specific NIC driver. Its [binding article](https://learn.microsoft.com/en-us/troubleshoot/windows-server/virtualization/creating-v-switches-hyper-v-environment-fails)
  describes `vms_pp` remediation only when an affected adapter is actually
  identified. These are Windows Server troubleshooting articles, not proof of
  this client host's root cause.

## Required approvals

The existing broad virtualization/network authorization is **insufficient**.
The KB3101106-reported consequences (loss of connectivity, manual reboot, and
manual Wi-Fi reconnection) and any OS image/driver/binding repair materially
exceed a runner Provision attempt. Before the relevant phase, the project owner
must separately approve in writing:

1. A bounded read-only diagnostic window, including collection of Windows,
   Hyper-V, networking, driver, and servicing logs. No mutation approval is
   implied.
2. The exact Microsoft-supported repair **after** evidence names a target and
   confirms its applicability to the current Windows edition/build. The
   approval must name the command/tool, component, source media or update path,
   and the designated operator.
3. The expected connectivity interruption, application outage, reboot, and
   possible manual Wi-Fi reconnection. The owner must confirm a maintenance
   window and that no critical Docker/WSL/network workload is running.
4. A recoverable pre-change state: an owner-verified backup/recovery approach,
   a tested or otherwise accepted restore contact/path, and a way to regain
   local access if network connectivity does not return.
5. The exact post-reboot observation and containment re-verification plan. No
   approval may bundle runner registration, GitHub credentials/JIT material,
   secrets, Auth/Snyk, provider/database, deployment, or production access.

## Phase A — read-only health and applicability ledger

An authorized operator may collect a dated, sanitized ledger only. It must
record the current Windows edition/build, installed updates, Hyper-V feature
state, `vmms`/`vmcompute`/`hns` service state, exact Hyper-V/NDIS event records,
physical-NIC hardware ID and signed driver provider/version/date, hidden and
present network adapters, `vms_pp` bindings, existing switch/NAT/HNS/Docker/WSL
inventory, and current Group 3/cache/zero-runner state.

It may run only read-only health commands such as `DISM /Online /Cleanup-Image
/CheckHealth`, `DISM /Online /Cleanup-Image /ScanHealth`, and `sfc /verifyonly`
alongside read-only event/inventory queries. These commands do not establish a
vSwitch cause by themselves. The ledger must record command exit status,
timestamps, and sanitized errors, and make no `New-*`, `Remove-*`,
`Enable-*`, `Disable-*`, `Restart-*`, driver, firewall, NAT, Docker, WSL, or
runner change.

**Stop condition:** If the ledger cannot identify a Microsoft-supported,
current-build-applicable target, the support path stops. Do not run a repair
"just in case," use KB3101106 Easy Fix, retry a switch, or alter `vms_pp` based
only on the previous inconclusive snapshot.

## Phase B — separate repair proposal, not a default action

Only after Phase A names a target may the owner request a second Agent 12
review. That proposal must include all of the following before execution:

| Required element | Acceptance condition |
| --- | --- |
| Applicability | The current Windows edition/build and exact component are within the cited Microsoft guidance. A Windows Server-only driver/binding remedy is not ported to Windows 11 by inference. |
| Exact action | One Microsoft-supported command/tool and arguments, or one signed vendor driver package explicitly matching the documented NIC. No registry edits, broad reset, Easy Fix, or guessed workaround. |
| Repair source | For `RestoreHealth`, the explicit approved repair source or the approved Windows Update path, network requirement, and any `/LimitAccess` decision. `RestoreHealth` is allowed only when Phase A reports a repairable image; it is not a generic Hyper-V fix. |
| Recovery | Pre-change backup/recovery evidence, local-console access plan, network re-entry plan, named operator, maintenance window, and explicit revert or escalation path. |
| Blast radius | Expected effect on physical networking, Wi-Fi, Default Switch, WSL, Docker Desktop, Firewall/WinNAT, running workloads, and reboot. Unknown impact fails the proposal. |
| Evidence | Baseline ledger plus exact post-action/post-reboot checks, sanitized logs, and a condition that failure stops rather than falls back to a shared runner/network. |

No system repair, driver change, binding change, service restart, network reset,
or vSwitch recreation is approved by this document.

## Phase C — post-reboot containment verification

After a separately approved repair and any required reboot/reconnection, Agent
13 may collect a fresh read-only post-maintenance ledger. It must show whether
Windows connectivity, physical NIC, Default Switch, WSL, Docker Desktop, and
existing workloads returned to the pre-maintenance baseline without a target
runner resource. It must also reconfirm no target VM/switch/NAT/mapping/proxy/
ACL/run-root residue, unchanged cache, and Group 3's ERP-only restricted exact
workflow with zero runners.

A successful OS repair or restored connectivity is **not** approval to create a
switch. A new isolated-runner static contract and a separate exact Provision
approval remain required. That later contract must repeat the existing
loopback-only Docker, no-host-mount, guest-local daemon, outbound-only,
untrusted-workflow exclusion, JIT-input protection, and exact destroy/recreate
evidence gates.

## Zero-cost alternative and release effect

Instead of host maintenance, the owner may nominate an existing separately
booted/dedicated physical Linux device for a new no-subscription-cost isolation
contract. It must have Windows/data disks physically unavailable if it reuses
this desktop, no shared Docker/WSL/profile/credential, outbound-only proof,
loopback-only Docker proof, exact Group 3 workflow restriction, and whole-host
wipe/power-off after one ephemeral job. It is not authorized by this document.

Hosted paid capacity, WSL, Docker Desktop, the old Windows runner, Default
Switch, and WSL switch remain ineligible. All independent release gates remain
**NO-GO**: Gitleaks, Snyk, Semgrep, Trivy, protected immutable release identity,
production-environment protection, production schema/migration parity,
disposable Auth/RLS 13-role proof, and ABI/fractional-quantity/DUPA decisions.

→ **Handoff to project owner.** Select either the explicit Phase A diagnostic
approval, a fully specified Phase B repair approval after Phase A, or the
separate physical-Linux path. Without one of these, no further runner work is
authorized.
