# Blocker — Hyper-V virtual-switch support maintenance

**Date:** 2026-08-28
**Severity:** P1 operational / release blocker
**Status:** OPEN — no repair authorized

## Evidence

The fourth reviewed isolated-runner Provision attempt failed at `New-VMSwitch`
with an internal-miniport create/bind collision (`0x800700B7`). The target
switch was deleted during staged rollback; the later one-time elevated
read-only diagnostic found no surviving target switch, miniport, hidden/present
adapter, PnP Net device, or network-class registry identity. Existing Default
Switch, WSL, Docker Desktop, and network resources are out of scope and remain
preserved. See Agent 12 reviews `d50aff1f` and `f0cb6396`.

Microsoft's current client article for KB3101106 documents a similar
"Failed while adding virtual Ethernet switch connections" symptom after a
deleted switch leaves objects behind, but it applies to Windows 10. Its legacy
Easy Fix warns of network loss, a manual restart, manual Wi-Fi reconnection,
and manual vSwitch recreation. It does **not** establish applicability to this
Windows 11 build. Microsoft documents separate driver/binding failures on
supported Windows Server versions, but the observed Realtek NIC and `vms_pp`
snapshot do not prove either is causal here.

## Impact

No accepted Hyper-V isolation boundary can be created on the present host.
Therefore no local runner, Auth/RLS role matrix, full security gate, migration
proof, release, or production deployment can rely on this path. Retrying
`New-VMSwitch`, reusing Default Switch/WSL/Docker Desktop, or changing an
unidentified network component would weaken the accepted boundary.

## Required resolution path

Use the approval-gated support-maintenance contract in
[`2026-08-28-agent-12-hyper-v-support-maintenance-contract.md`](../changesets/2026-08-28-agent-12-hyper-v-support-maintenance-contract.md).
The next action is read-only system/image/driver/feature diagnosis only. Stop
if it cannot identify a Microsoft-supported, build-applicable repair target.
No Windows repair, driver/binding change, service restart, reset, reboot, or
runner retry may begin from this blocker.

## Zero-cost alternative

An existing separately booted/dedicated physical Linux machine may be proposed
as a no-subscription-cost alternative, but it needs a new containment contract
before setup. WSL, Docker Desktop, the Windows runner, retained switches, and
paid hosted capacity are not substitutes.
