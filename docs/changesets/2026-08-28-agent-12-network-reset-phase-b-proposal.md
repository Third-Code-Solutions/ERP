# Agent 12 — Windows Network Reset Phase B proposal

**Date:** 2026-08-28
**Prior review:** `2b33c239`
**Scope:** Documentation-only security review; no reset, host, runner, workflow,
credential, Auth, Snyk, provider, database, deployment, or production action.
**Decision:** **ACCEPT as a conditional, owner-approved, last-resort maintenance option; NOT a guaranteed fix or runner authorization.**

## Current primary-source basis

Microsoft's current [Fix Wi-Fi connection issues in Windows](https://support.microsoft.com/en-US/Windows/Experience/Connectivity-Networking/fix-wi-fi-connection-issues-in-windows)
applies to Windows 10 and Windows 11. It calls Network Reset the last step to
try, says it removes installed adapters/settings, restarts the PC, reinstalls
default adapters/settings, and may require reinstallation/reconfiguration of
VPN software and Hyper-V virtual switches.

This is a supportable host-network remediation target for the unexplained,
rolled-back `New-VMSwitch` miniport collision. It does **not** establish that a
stale adapter caused `0x800700B7`, or promise that any reset will allow the
isolated runner to be created. A current-version Windows reinstall remains a
broader fallback and is not proposed here.

## Phase B contract

Network Reset may happen once only after the owner separately approves the
complete contract recorded in
[`2026-08-28-agent-12-hyper-v-support-maintenance-contract.md`](2026-08-28-agent-12-hyper-v-support-maintenance-contract.md):

1. use the documented Windows 11 Settings action locally—not an alternate
   command or remote-only action;
2. confirm power, local sign-in, a separate recovery device/network, BitLocker
   recovery-key readiness outside this repository/chat, backup/recovery state,
   and absence/protection of interrupted Docker/WSL/VM/VPN work;
3. collect only a sanitized ignored pre-reset inventory: Wi-Fi and VPN
   identifiers/counts, adapters/drivers, IP/DNS/routes, firewall, Hyper-V,
   WSL, Docker, HNS, WinNAT, port-proxy, target-zero/cache, and Group 3 state;
   never Wi-Fi XML, passwords, VPN configuration, tokens, certificates, keys,
   or production credentials; and
4. accept connectivity loss, automatic reboot, manual Wi-Fi/VPN/virtual-switch
   recovery, and that the pre-reset configuration has no automatic rollback.

The project owner—not an agent—must perform the interactive reset confirmation
and any credential/MFA/Wi-Fi/VPN/BitLocker recovery after restart.

## Phase C acceptance before any runner retry

A new sanitized, read-only post-reboot ledger must demonstrate local access,
understood network profile/firewall state, no unexpected proxy/LAN/wildcard
exposure, owner-accepted physical networking and WSL/Docker/Hyper-V state, and
the original zero target resources/unchanged cache/ERP-only restricted Group 3
with zero runners. Any failed comparison is a **NO-GO** and escalates to the
owner/vendor; it does not permit another reset or another runner attempt.

Only Agent 12 acceptance of that ledger plus fresh owner mutation approval may
propose one re-reviewed, non-secret runner Provision attempt with a new
RunIdentity. All release gates remain independently **NO-GO**.

## Verification

- Microsoft Support source retrieved and reviewed 2026-08-28 — **PASS**
- Existing Phase A evidence and blocker/hand-off boundaries re-read — **PASS**
- Repository and host configuration mutation — **NOT RUN / prohibited by scope**

→ **Handoff to project owner.** Choose whether to grant the exact Phase B/C
approval. Without it, preserve the current blocked host route or nominate the
separate physical Linux alternative.
