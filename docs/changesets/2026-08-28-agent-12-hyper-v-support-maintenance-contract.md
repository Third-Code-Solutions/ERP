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
- Microsoft's current [Fix Wi-Fi connection issues in Windows](https://support.microsoft.com/en-US/Windows/Experience/Connectivity-Networking/fix-wi-fi-connection-issues-in-windows)
  applies to Windows 10 and Windows 11. It documents **Network reset** as the
  last troubleshooting step: it removes installed network adapters and their
  settings, restarts the PC, reinstalls adapters with default settings, and may
  require reinstallation/reconfiguration of VPN software and Hyper-V virtual
  switches. It does not claim to repair this exact miniport collision.

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
   and the designated operator. The only currently supportable broad option is
   the separately described Windows 11 Network Reset; it is a last-resort
   network reinitialization, not a root-cause diagnosis or guaranteed fix.
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
| Exact action | One Microsoft-supported command/tool and arguments, or one signed vendor driver package explicitly matching the documented NIC. No registry edits, Easy Fix, or guessed workaround. Network Reset is permitted only under the dedicated contract below. |
| Repair source | For `RestoreHealth`, the explicit approved repair source or the approved Windows Update path, network requirement, and any `/LimitAccess` decision. `RestoreHealth` is allowed only when Phase A reports a repairable image; it is not a generic Hyper-V fix. |
| Recovery | Pre-change backup/recovery evidence, local-console access plan, network re-entry plan, named operator, maintenance window, and explicit revert or escalation path. |
| Blast radius | Expected effect on physical networking, Wi-Fi, Default Switch, WSL, Docker Desktop, Firewall/WinNAT, running workloads, and reboot. Unknown impact fails the proposal. |
| Evidence | Baseline ledger plus exact post-action/post-reboot checks, sanitized logs, and a condition that failure stops rather than falls back to a shared runner/network. |

No system repair, driver change, binding change, service restart, network reset,
or vSwitch recreation is approved by this document **except** a user-approved
Network Reset that satisfies every requirement below.

### Conditional Network Reset contract — current Windows 11 last resort

**Classification:** Agent 12 accepts Windows 11 Network Reset as a
vendor-supported, broad, last-resort option for the host networking layer. It
may clear a stale virtual-adapter/switch condition by removing and reinstalling
network adapters and their settings. That causal link is an **inference**, not
a Microsoft guarantee for the observed `0x800700B7` collision. Because it can
remove networking configuration and require Hyper-V virtual-switch/VPN
reconfiguration, it is not a routine runner retry and remains **NO-GO** until
the owner explicitly approves it.

#### Required explicit owner approvals and preconditions

All of the following must be true and recorded before the reset confirmation:

1. The owner approves the exact Windows 11 Settings action—**Settings > Network
   & internet > Advanced network settings > Network reset > Reset now > Yes**—
   to be started at the local console. An agent must not press the confirmation,
   invoke an alternate reset command, or run it over a remote-only session.
2. The owner confirms a maintenance window, AC power, working local-console
   sign-in, and a separate device/connection for recovery instructions. The
   owner must have the applicable BitLocker recovery key and account-recovery
   path available **outside the repository and this chat** before restart.
3. The owner confirms an acceptable backup/recovery point for application and
   data disks, and that all Docker, WSL, virtual-machine, VPN, and network work
   that could be interrupted has been stopped or otherwise protected. No
   secrets, Wi-Fi passwords, VPN credentials, recovery keys, certificates, or
   data backup is exported to the repository or an evidence bundle.
4. A new, ignored, sanitized pre-reset ledger is collected locally. It records
   Wi-Fi profile *identifiers/counts only* (never profile XML or key material),
   VPN product/profile identifiers and reinstall status (never config files,
   tokens, certificates, or passwords), adapter and driver inventory, IP/DNS/
   route configuration with user/credential fields redacted, firewall profile
   and rule metadata, and Hyper-V/WSL/Docker/HNS/WinNAT/port-proxy inventory.
   It must also capture the existing target-zero, cache, and Group 3 boundary.
5. The owner accepts the expected outage: connectivity loss, automatic reboot,
   possible Wi-Fi/VPN/manual network reconnection, and possible Docker Desktop,
   WSL, Default Switch, HNS, or Hyper-V virtual-switch recreation. Network
   Reset has no automatic rollback to the old adapter/settings state.

The person at the local console must manually supply any post-reset Wi-Fi,
VPN, account, MFA, BitLocker, or vendor-software input. Root/Agent 12 may not
retrieve, copy, display, script, serialize, or validate these credentials.

#### Phase B execution boundary

The owner starts the Microsoft Settings workflow above and accepts its reboot.
No parallel runner Provision, workflow/group update, credential/Snyk/Auth
action, database/provider action, deployment, firewall editing, Docker/WSL
reconfiguration, driver installation, or custom networking command is allowed.
If the reset cannot be initiated locally, the device cannot reboot cleanly, or
local/network access cannot be recovered, stop and use the owner’s support/
recovery path; do not repeat Network Reset or substitute a broad command.

## Phase C — post-reboot containment verification

After the owner has manually restored access as necessary, Agent 13 may collect
one fresh, sanitized, read-only post-maintenance ledger. It must reconcile the
pre-reset inventory and demonstrate all of the following:

1. the owner can sign in locally and has consciously restored only required
   Wi-Fi/VPN/network configuration; unexpected adapters, bridges, proxy
   mappings, or firewall broadening fail the phase;
2. physical network connectivity, adapter/driver health, IP/DNS/routes, and
   Windows network profiles are understood. Network Reset may change a profile
   to Public; it must not be silently changed to Private by an agent;
3. Docker Desktop, WSL, Default Switch, HNS, and Hyper-V are either restored to
   the owner-accepted baseline or explicitly unavailable. No secrets or
   production credentials may be supplied to make them start;
4. target runner resources remain absent: no target VM/switch/NAT/static
   mapping/port-proxy/ACL/run root, unchanged pinned cache, and Group 3 still
   selected only for ERP's exact restricted workflow with zero runners; and
5. no new LAN/wildcard listener or unexpected Docker publication has appeared.

Network Reset is not reversible by an exact system rollback; Phase C is a
reconciliation and stop gate, not a declaration that the prior configuration
was restored byte-for-byte. Any failed comparison, lost connectivity, missing
driver, broken Docker/WSL/Hyper-V function, or unaccepted firewall/profile
change is a **NO-GO** and must be escalated to the owner/vendor—without a
second reset or runner retry.

Only after Agent 12 accepts the Phase C ledger and the owner separately grants
new mutation authority may Agent 13 propose **one** fresh, exact, non-secret
isolated-runner Provision attempt against a re-reviewed static candidate and
new RunIdentity. It must repeat the existing loopback-only Docker,
no-host-mount, guest-local daemon, outbound-only, untrusted-workflow exclusion,
JIT-input protection, and exact destroy/recreate evidence gates. A successful
Network Reset or restored connectivity does not itself approve that attempt.

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
