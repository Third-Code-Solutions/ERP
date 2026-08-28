# Blocker — Hyper-V virtual-switch support maintenance

**Date:** 2026-08-28
**Severity:** P1 operational / release blocker
**Status:** **BLOCKED / NO-GO — present Windows/Hyper-V runner path closed**

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

### Phase A read-only maintenance ledger — 2026-08-28

Authorized Phase A checks completed without a system or network change. Both
`DISM /Online /Cleanup-Image /CheckHealth` and `/ScanHealth` exit `0` and
report no component-store corruption. `sfc /verifyonly` exit `0` but reports
integrity violations. Its captured output is UTF-16/NUL-padded and therefore
does not provide a durable per-file finding in the sanitized ledger. A
contemporary CBS inspection contains `img100.jpg` and `smartscreen.exe`
entries; neither identifies a Hyper-V, HNS, NDIS, Realtek-driver, or vSwitch
component. Microsoft documents `/verifyonly` as verification without repair,
so this is not evidence that a repair ran. No `RestoreHealth` or `sfc
/scannow` was run.

The exact failing VMSwitch event records a temporary non-lightweight miniport
with both `Object Name already exists` and `{Conflicting Address Range}`. Its
rollback leaves no matching adapter, PnP device, network-class identity, HNS
network, NAT mapping, or recorded corresponding address range. The signed Realtek
`PCI\VEN_10EC&DEV_8168` driver is inventoried, and its `vms_pp` binding is
already disabled; the Microsoft Server-only enabled-binding workaround is not
applicable. The current host edition fields are internally ambiguous
(`ProductName=Windows 10 Pro` alongside 24H2 build `26100.3194`), so the
Windows 10-only KB3101106 workaround cannot be applied by inference.

Phase A did not identify a current Microsoft-supported exact repair target.
The **current Windows/Hyper-V runner path is closed**: a repair "just in case"
or a fifth switch attempt remains prohibited. See
[`2026-08-28-agent-13-hyper-v-maintenance-phase-a.md`](../changesets/2026-08-28-agent-13-hyper-v-maintenance-phase-a.md)
and Agent 12's
[`Phase A review`](../changesets/2026-08-28-agent-12-hyper-v-maintenance-phase-a-review.md)
for sanitized command, event, driver, release-boundary, and decision evidence.

## Impact

No accepted Hyper-V isolation boundary can be created on the present host.
Therefore no local runner, Auth/RLS role matrix, full security gate, migration
proof, release, or production deployment can rely on this path. Retrying
`New-VMSwitch`, reusing Default Switch/WSL/Docker Desktop, or changing an
unidentified network component would weaken the accepted boundary.

## Required user-controlled resolution choices

Phase A of the approval-gated support-maintenance contract in
[`2026-08-28-agent-12-hyper-v-support-maintenance-contract.md`](../changesets/2026-08-28-agent-12-hyper-v-support-maintenance-contract.md)
has completed and stopped because it could not identify a Microsoft-supported,
build-applicable repair target. Existing broad virtualization/network approval
is not approval for either of the following user choices:

1. **Disruptive vendor-supported or in-place Windows repair maintenance.** The
   owner must first obtain a current-build-specific Microsoft/OEM support
   target, then separately approve the exact repair method, Windows repair
   source/licensing, backup and recovery plan, connectivity/Docker/WSL impact,
   maintenance window, reboot, and local-access recovery. An agent must not
   select or improvise that remediation.
2. **A separately booted/dedicated physical Linux host.** The owner may
   nominate an existing x64 Linux machine at no subscription cost. If it reuses
   this desktop, Windows must be powered off and its data disks physically
   unavailable; merely using WSL or unmounting a profile is insufficient. A
   new Agent 12 isolation contract and fresh preflight are required before any
   runner registration.

No Windows repair, driver/binding change, service restart, reset, reboot, or
runner retry may begin from this blocker. WSL, Docker Desktop, the Windows
runner, Default/WSL switches, and paid hosted capacity remain ineligible.

## Zero-cost alternative

An existing separately booted/dedicated physical Linux machine may be proposed
as a no-subscription-cost alternative, but it needs a new containment contract
before setup. WSL, Docker Desktop, the Windows runner, retained switches, and
paid hosted capacity are not substitutes.
