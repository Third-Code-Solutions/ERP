# Agent 12 — isolated-runner collision diagnostic review

**Date:** 2026-08-28
**Scope:** Security review of Agent 13's bounded read-only diagnostic record at
`0873d64905e35fca9a650408f67c2b9aea674c1a`. This review does not change the
host, runner, GitHub group/workflow, credentials, provider, database, or
production.

## Decision

- **Diagnostic attestation: ACCEPT as a read-only rollback/state snapshot.**
  It confirms that the fourth Provision attempt created no surviving target
  resource and that the selected GitHub boundary did not change.
- **Root-cause determination: INCONCLUSIVE.** The evidence identifies a
  Hyper-V miniport bind/create collision, but identifies no current component
  that can safely be repaired.
- **Any local host remediation or Provision retry: REJECT.** No bounded,
  reversible, evidence-backed repair exists from this record. The dedicated
  Hyper-V runner route is **BLOCKED / NO-GO** on this host.
- **No-cost alternative: conditionally feasible only on a truly separate
  physical Linux execution boundary.** It requires a new Agent 12 contract and
  later static review; it is not authorized for setup, runner registration, or
  execution by this decision.

## Independent evidence review

| Control | Evidence | Result |
| --- | --- | --- |
| Diagnostic integrity | Local ignored bundle `tmp/isolated-linux-runner-switch-diagnostic-20260828-provision4.json` parses as schema `1`, is `95,680` bytes, and hashes to `7b1f0a04b4f3608059be2447f24f6adf5dc9dea6701af591d958150c4e220415`. | **PASS.** The reviewed summary matches the exact sanitized bundle. |
| Failure / deletion sequence | The bounded event window records `New-VMSwitch` internal-miniport error `0x800700B7` for `24DEA9FE-354E-4CB1-BBC2-153E57C33AB1`; vSwitch events show `NetEventBindFailed` at `23:06:55.448` and target-switch deletion at `23:06:56.486`. | **PASS as failure-and-rollback evidence.** It is not evidence that a usable internal switch ever existed. |
| Current collision target | The failed miniport GUID has no hidden/present adapter, PnP Net-device, or network-class registry match. Only retained `ROOT\\VMS_VSMP` instances for Default Switch and WSL remain. `vms_pp` is disabled on the physical and retained host vEthernet adapters, but the snapshot does not establish that as causal. | **INCONCLUSIVE.** The ephemeral target disappeared during correct rollback; changing an unrelated binding on that basis would be speculation. |
| Target residue | The elevated snapshot records zero VMs, NATs, static mappings, target HNS resources, ACLs, and run root. Independently, all four `netsh interface portproxy show` variants currently return exit `0` and blank output, while the immutable archive remains `603,960,567` bytes at SHA-256 `843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22`. | **PASS.** No target networking residue is evidenced. |
| GitHub boundary | Direct current API readback shows group `3` is non-default `erp-ci-isolated`, selected only for `Third-Code-Solutions/ERP`, `restricted_to_workflows=true`, restricted only to `Third-Code-Solutions/ERP/.github/workflows/ci-linux-runner-smoke.yml@827719975eb44808da85cbd64cc28074f6ee4ae1`, with zero repository runners. | **PASS.** This remains a restriction control, not runner execution proof. |

The collector did not query the available hyphenated VMMS/Compute channels
after its attempted slash-style names were unavailable, and its
virtual-switch-feature command used an unsupported parameter. Those omissions
do not justify another collection or an intrusive test: the directly captured
PowerShell/vSwitch records establish failure and rollback, while neither omitted
view identifies a safe repair target. They reinforce the root-cause
**INCONCLUSIVE** decision.

## Why no host remediation is safe

The collision is inside the shared Hyper-V/NDIS networking stack. The evidence
does not distinguish a stale internal miniport, a host networking-service
condition, a driver defect, or a conflict involving the retained Default/WSL
switches. An alternate-name test would itself create another miniport and is a
retry, not a diagnostic. Rebinding `vms_pp`, restarting `vmms`, `vmcompute`, or
`hns`, resetting/recreating Default Switch or WSL, changing a physical-adapter
driver, or resetting WinNAT/Firewall/Docker would affect shared host resources.
None names a specific faulty object or has a proven narrow rollback. All are
therefore rejected.

The required user-controlled host action is a separate Windows/Hyper-V support
or maintenance decision outside runner Provision. It must first identify a
vendor-supported repair target and a maintenance window that protects existing
WSL, Docker Desktop, Default Switch, and network use. A later proposal needs
fresh baseline/post evidence, an exact restore plan, explicit human approval,
and a new Agent 12 review. This review does not prescribe or authorize a
network reset, driver repair, service restart, or Hyper-V component repair.

## Conditional zero-cost physical alternative

GitHub documents that self-hosted runners can be physical and are free to use
with Actions, while the operator remains responsible for the machine and its
maintenance. It also warns that self-hosted runners can be persistently
compromised and that runner groups are a security boundary. See GitHub's
[self-hosted runner reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners),
[secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use),
and [runner-group guidance](https://docs.github.com/en/actions/concepts/runners/runner-groups)
(retrieved 2026-08-28).

Accordingly, master recovery may use an already-owned, **physically separate
or separately booted x64 Linux system** without paid GitHub-hosted capacity,
but only if all of these are accepted in a new contract before any action:

1. It boots a checksum/signature-verified supported Linux image from a
   disposable external or dedicated device. If the current desktop is used,
   Windows must be powered down and its internal user/data disks must be
   physically unavailable to the booted Linux system; merely declining to mount
   them is insufficient against a Docker-root-capable job.
2. It exposes no Desktop profile, Windows/WSL/Docker Desktop socket, local
   repository credential, production credential, SSH service, inbound
   management path, shared storage, or mounted host drive. Docker and its data
   must be local to the disposable Linux device; the non-interactive runner
   account's Docker access remains guest-root risk.
3. It enforces and proves outbound-only networking, blocks private/LAN/host
   reachability, proves guest-local loopback-only Docker publication from both
   Docker metadata and listeners, and has no host port forwarding, NAT mapping,
   or proxy. The existing disposable Supabase/Auth lane remains forbidden until
   its Linux containment proof passes.
4. It remains in Group 3 with the exact selected trusted workflow and labels,
   supports only one ephemeral job, accepts no PR/fork/untrusted event, and is
   wiped or powered off with independently recorded zero-residue evidence after
   that job. No JIT material, runner registration, secret, Auth, Snyk, or
   release gate is authorized until the static contract and preflight pass.

This is a conditional no-subscription-cost route, not a claim of zero hardware,
electricity, or operational cost. If an existing dedicated physical boundary or
the required boot media is not available, there is no approved zero-cost
alternative at present. WSL, Docker Desktop, the Windows runner, the retained
Default/WSL switches, and paid hosted capacity remain prohibited substitutes.

Independent release blockers remain **NO-GO**: successful fail-closed hosted
Gitleaks, Snyk, Semgrep, and Trivy gates; immutable protected release identity;
production-environment protection; current read-only migration/schema parity;
the disposable Auth/RLS 13-role matrix; and the ABI/fractional-quantity/DUPA
business decision.

→ **Handoff to Agent 01 / project owner.** Choose either a separate,
user-controlled Hyper-V maintenance/support path or an existing dedicated
physical Linux boundary. Do not implement either from this document. If the
physical route is chosen, Agent 01 must open a handoff and Agent 12 must accept
its exact containment contract before Agent 13 performs any setup.
