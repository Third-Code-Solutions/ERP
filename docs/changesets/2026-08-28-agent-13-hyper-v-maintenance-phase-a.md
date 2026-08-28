# Agent 13 — Phase A Windows/Hyper-V support-maintenance diagnostics

**Date:** 2026-08-28
**Authorization:** Agent 12 maintenance contract `8ae6f791`
**Result:** **NO-GO — no current Microsoft-supported, component-specific Hyper-V repair target was identified.**

## Boundary and evidence

One visible elevated Windows PowerShell 5.1 process ran a sanitized,
read-only Phase A collector only. It did not invoke Provision or run
`RestoreHealth`, `sfc /scannow`, Windows Update, a driver installer, an
adapter/binding change, a service restart, a reboot, a network reset, Docker or
WSL mutation, or any runner/GitHub/provider action. The ignored local evidence
bundle is
`tmp\isolated-linux-runner-maintenance-phase-a-20260828.json` (schema `1`,
302,392 bytes, SHA-256
`e766a3beaceaf4cbb0747842658ee5a211b1a3257fa793511dac55f044d19395`).

| Read-only check | Result |
| --- | --- |
| `DISM /Online /Cleanup-Image /CheckHealth` | Exit `0`: no component-store corruption detected. |
| `DISM /Online /Cleanup-Image /ScanHealth` | Exit `0`: no component-store corruption detected. |
| `sfc /verifyonly` | Exit `0`, but reports integrity violations. The contemporary CBS entry identifies a hash mismatch for `C:\Windows\Web\Screen\img100.jpg`, a Windows visual asset; it does not identify a Hyper-V, HNS, NDIS, NIC-driver, or vSwitch component. `/verifyonly` was the command executed; no repair command was run. |

The host reports `ProductName=Windows 10 Pro`, `DisplayVersion=24H2`, client
build `26100.3194` (DISM image version `10.0.26100.3194`). Those edition fields
do not provide a clean current-build applicability match for the Windows 10-only
KB3101106 workaround. A supplemental non-elevated `DISM /Online
/Get-CurrentEdition` was denied with exit `740`; no second elevation was used.
The installed servicing ledger lists only the observed February 2025 hotfixes;
no update was installed or selected as a repair target.

## Hyper-V, network, and driver correlation

- Hyper-V feature family is enabled; `vmms`, `vmcompute`, and `hns` are
  running with their existing service configurations.
- The physical NIC is `PCI\VEN_10EC&DEV_8168`, `Realtek PCIe GbE Family
  Controller`, signed by Realtek, version `1168.28.50.1224`, dated
  2025-12-24. The installed Hyper-V switch and infrastructure drivers are
  Microsoft-signed. This is an inventory, not a claim that any driver is
  current or faulty.
- `vms_pp` is already disabled on the physical Realtek adapter and on the
  retained host vEthernet adapters. Microsoft’s published binding workaround
  applies to a specifically identified adapter with that binding still enabled,
  and its cited article is scoped to Windows Server; neither condition is met.
- The current VM inventory is empty. The only retained switches/HNS networks
  are `Default Switch` and `WSL (Hyper-V firewall)`; no HNS endpoint/policy,
  WinNAT network/static mapping, target-labelled resource, or nonblank
  port-proxy mapping exists. Docker and WSL inventories were read only and left
  unchanged.

The new VMMS Networking evidence is more specific but does not make the
colliding object persistent: event `26062` records the same failed miniport
`24DEA9FE-354E-4CB1-BBC2-153E57C33AB1`, and event `26144` records the failed
virtual-Ethernet switch connection. System VMSwitch event `76` records both
`Object Name already exists` and `{Conflicting Address Range}` while creating
that ephemeral non-lightweight miniport. The target switch and miniport were
then removed by the reviewed rollback. The post-collection inventory does not
identify a corresponding address range, HNS network, NAT mapping,
hidden/present adapter, PnP Net device, or network-class identity to repair
narrowly.

## Applicability conclusion

Microsoft documents `RestoreHealth` for a repairable component store; this
host's two DISM checks report that store healthy. Microsoft also documents
Hyper-V virtual-switch management for Windows 11, but the separate `vms_pp`
troubleshooting article is Windows Server-only and requires an enabled binding
on the identified affected adapter. The evidence therefore does **not** support
`RestoreHealth`, SFC repair, a driver update, a binding change, the legacy Easy
Fix, or a generic vSwitch retry as a current-build-applicable response to this
miniport failure.

Sources checked: [Repair a Windows Image](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/repair-a-windows-image?view=windows-11),
[Hyper-V Virtual Switch](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/virtual-switch),
[vSwitch binding troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/windows-server/virtualization/creating-v-switches-hyper-v-environment-fails),
and [Windows 11 24H2 update history](https://support.microsoft.com/en-gb/topic/windows-11-version-24h2-update-history-0929c747-1815-4543-8461-0160d16f15e5).

Fresh release controls are unchanged: the exact run root is absent; the pinned
archive remains SHA-256
`843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22`; and
Group `3` remains non-default `erp-ci-isolated`, selected only for
`Third-Code-Solutions/ERP`, `restricted_to_workflows=true`, with only
`Third-Code-Solutions/ERP/.github/workflows/ci-linux-runner-smoke.yml@827719975eb44808da85cbd64cc28074f6ee4ae1`
and zero runners.

→ **Handoff to Agent 12.** Phase A stops at this evidence. No Phase B repair
proposal, system change, Provision retry, runner/JIT, credential/Auth/Snyk,
provider/database, deployment, or production action is authorized from this
record.
