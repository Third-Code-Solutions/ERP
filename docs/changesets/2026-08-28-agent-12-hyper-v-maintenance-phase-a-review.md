# Agent 12 — Phase A Hyper-V maintenance evidence review

**Date:** 2026-08-28
**Candidate reviewed:** `fc8af6957cba342c67e7ef25362b9264969df4a6`
**Prior contract:** `8ae6f791`
**Result:** **READ-ONLY FAILURE ATTESTATION ACCEPTED; PHASE B REJECTED; WINDOWS/HYPER-V RUNNER PATH BLOCKED / NO-GO**

## Scope and boundary

This review inspected Agent 13's one-time Phase A read-only evidence only. It
did not run a repair, Provision, switch retry, driver/binding/service change,
network reset, reboot, runner/JIT registration, credential/Auth/Snyk action,
provider/database action, deployment, or production action.

## Independent evidence reviewed

The ignored local bundle
`tmp/isolated-linux-runner-maintenance-phase-a-20260828.json` is schema `1`,
302,392 bytes, and hashes to
`e766a3beaceaf4cbb0747842658ee5a211b1a3257fa793511dac55f044d19395`.

| Required Phase A evidence | Review result |
| --- | --- |
| Servicing health | `DISM /CheckHealth` and `/ScanHealth` both exit `0` with no component-store corruption. This does not support `RestoreHealth`. |
| SFC relevance | The bundle records `sfc /verifyonly`, exit `0`, with integrity violations. Its raw output is UTF-16/NUL-padded, so it does not safely retain a full per-file list. Contemporary CBS evidence names `img100.jpg` and `smartscreen.exe`, neither a Hyper-V/HNS/NDIS/NIC/vSwitch component. Microsoft defines `/verifyonly` as non-repairing; no repair command is evidenced. |
| Host applicability | Client build `26100.3194` is recorded, though ProductName fields are internally inconsistent. KB3101106 is Windows-10 scoped and cannot be applied by inference. |
| Driver/binding applicability | The Realtek `PCI\\VEN_10EC&DEV_8168` inventory is signed/versioned but identifies no fault. `vms_pp` is already disabled, so the cited Windows Server enabled-binding procedure is inapplicable. |
| Hyper-V/service/event evidence | Hyper-V features are enabled; `vmms`, `vmcompute`, and `hns` are running. VMMS/VMSwitch events retain the temporary miniport's `Object Name already exists` and `{Conflicting Address Range}` failure, followed by deletion; no durable component identity is present. |
| Target/rollback preservation | Current state has no target VM, switch, NAT/static mapping, port-proxy mapping, or run root. The pinned archive cache remains SHA-256 `843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22`. |
| GitHub boundary | Group `3` remains non-default `erp-ci-isolated`, selected only for `Third-Code-Solutions/ERP`, restricted to `ci-linux-runner-smoke.yml@827719975eb44808da85cbd64cc28074f6ee4ae1`, with zero runners. |

## Decision

The Phase A read-only collection satisfies the contract's stop condition: it
does **not** identify a Microsoft-supported, current-build-applicable,
component-specific repair. It is therefore accepted only as evidence for
closure of this host route. Phase B is **REJECTED**. Do not run DISM repair,
SFC repair, a driver update, binding change, service restart, network reset,
legacy Easy Fix, or another `New-VMSwitch` attempt from this evidence.

The limited SFC filename evidence is a documentation quality issue to correct
in any later maintenance ledger; it neither weakens the no-mutation conclusion
nor creates a Hyper-V repair hypothesis.

## Required owner action to reopen runner work

Choose one, with a new explicit authorization:

1. Obtain a vendor/Microsoft-supported, current-build-specific repair target
   and approve a separate disruptive maintenance plan covering backup/recovery,
   repair source/licensing, expected network/WSL/Docker impact, maintenance
   window, reboot, and local-access recovery; or
2. nominate an existing separately booted/dedicated physical x64 Linux device.
   If this desktop is reused, Windows must be powered off and data disks
   physically unavailable. Agent 12 must first approve a new whole-host
   isolation contract.

WSL, Docker Desktop, the interactive Windows runner, Default/WSL switches, and
paid hosted runners are not acceptable substitutes.

## Release sequencing

The strict recovery handoff stops before Snyk authentication, contained Auth,
the 13-role matrix, and the full release gate. Agent 04's lineage and Agent
01's commercial stages are not advanced as part of that sequential recovery
chain. Independently authorized read-only source/static analysis, GitHub
configuration readback, or production metadata observation may continue
outside the chain, but cannot replace an accepted runner/security gate or
alter the release **NO-GO**.

## Verification

- `git diff --check fc8af695^ fc8af695` — **PASS**
- Parsed Phase A JSON schema/hash/command results — **PASS**
- Current target resource, cache, and Group 3 readback — **PASS**
- Microsoft primary documentation reviewed 2026-08-28:
  [SFC command reference](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/sfc),
  [Repair a Windows Image](https://learn.microsoft.com/en-us/windows-hardware/manufacture/desktop/repair-a-windows-image?view=windows-11),
  [KB3101106](https://learn.microsoft.com/en-us/troubleshoot/windows-client/virtualization/cannot-create-hyper-v-virtual-switch), and
  [vSwitch binding troubleshooting](https://learn.microsoft.com/en-us/troubleshoot/windows-server/virtualization/creating-v-switches-hyper-v-environment-fails).

→ **Handoff to project owner.** Select a separately approved host-maintenance
route or a newly contracted physical Linux boundary. Until then, the runner and
release remain **NO-GO**.
