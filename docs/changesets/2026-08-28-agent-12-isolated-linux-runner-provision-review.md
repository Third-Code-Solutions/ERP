# Agent 12 — isolated Linux runner Provision design review

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Candidate reviewed:** `db094bef3051f02bd812a805b80d48fa03f59406` (`feat(ci): add reviewed isolated provision plan`)
**Decision:** **REJECT — do not execute the elevated Provision path.** No archive download, UAC invocation, VM/switch/NAT/firewall/CIDATA action, JIT, runner registration, Auth, secret, or production action is authorized by this review.

The previously authorized Group 3 restriction is independently confirmed: it is non-default, selected only for private `Third-Code-Solutions/ERP` (`1234811736`), has `restricted_to_workflows=true`, exactly selects `Third-Code-Solutions/ERP/.github/workflows/ci-linux-runner-smoke.yml@827719975eb44808da85cbd64cc28074f6ee4ae1`, and has zero runners. The initial malformed Group update made no mutation; the typed retry yielded this exact readback. This does not make the Provision implementation safe.

## Static validation

With process-local Node `v22.23.2`, `pnpm test:isolated-linux-runner-contract` passed **7/7**, Actionlint, workflow-reference verification, and Gitleaks passed. Windows PowerShell 5.1 and pwsh parsers, plus `git diff --check db094bef^ db094bef`, passed. These are parser/fixture results, not guest, host-network, firewall-behavior, cleanup, or rollback evidence.

## Blocking findings

### P1 — a successful Provision ledger is ineligible for its own rollback

`Invoke-Provision` records `Resources.DynamicPorts = @()` (`scripts/ci/invoke-isolated-linux-runner-host.ps1:753`), while `Read-RollbackLedger` rejects any ledger with an empty dynamic-port set (`:479-481`). A successful non-secret provision therefore cannot reach the exact rollback path. The fixture still supplies a fabricated dynamic port, so it does not exercise the actual Provision output.

**Required change:** Permit an explicitly empty dynamic-port set during this pre-Docker/containment provision stage, with an explicit `DynamicPortEvidenceState=not-started` (or equivalent) that forces later contained Docker evidence before Auth. Rollback must accept that truthful state and still assert no mappings/proxies/listeners. Add an end-to-end ledger-schema regression constructed from the exact `Invoke-Provision` output shape.

### P1 — failure has no unconditional exact-target cleanup path

After `New-RunOwnershipMarker`, the Provision `catch` only rethrows (`:718-760`). Failures after creating a VHDX, CIDATA disk, internal switch, gateway address, NAT, VM, or firewall rule leave state behind. The outer catch writes a failure report but no valid Provisioned ledger, while rollback refuses any non-Provisioned ledger. This violates the contract's required finally/watchdog cleanup on every success, failure, or interruption.

**Required change:** Create a ledger-safe, append-only ownership record before the first mutation; update it after each exact object read-back; and invoke a validated exact cleanup path in `finally` on every failed/interrupted provision. The cleanup must remove only recorded resources and report any residue as failure. Add failure-injection regressions at each resource boundary.

### P1 — VM configuration and transient files are not constrained to the D: run root

`New-VM` supplies a VHD path but no `-Path`, `-SnapshotFileLocation`, or `-SmartPagingFilePath` (`:731`). Hyper-V can therefore write VM configuration/checkpoints/smart-paging files to its default host location, commonly outside the named D: target. The current ledger cannot attest or clean those files.

**Required change:** Explicitly place VM configuration, checkpoint, and smart-paging paths inside a per-run D: directory; capture/read back each exact path and ownership identity in the ledger; and include them in cleanup/residue checks. Keep temporary extraction/CIDATA files inside the same exact target root.

### P1 — network controls do not satisfy the host/private/LAN containment contract

All three host rules are inbound blocks matching only local gateway `172.31.202.1` and remote guest `172.31.202.10` (`:675-710`), while guest UFW sets `default allow outgoing` (`:648-650`). This does not block guest traffic routed through WinNAT to host-private/LAN addresses, and no actual Hyper-V VM filtering rule is configured. The contract requires host/private/LAN denial except documented NAT/DNS needs, with behavioral host-probe rejection and outbound GitHub HTTPS success. Names and inventory alone are insufficient.

**Required change:** Define and implement a tested egress/forwarding policy that blocks guest-to-host/private/LAN paths at the correct enforcement point without preventing guest-local loopback or necessary GitHub/DNS egress. Use actual Hyper-V/Windows filter mechanisms tied to the guest/switch, not a ledger-only `Binding` field. Record exact live filters and demonstrate: guest loopback succeeds; host and private/LAN probes fail; host-to-guest NAT-IP fails; GitHub HTTPS succeeds. `RemoteAddress=Any` remains forbidden for the block rules unless an approved, behavior-tested exception is documented; it must never silently capture loopback traffic.

### P1 — Provision returns PASS without guest evidence or post-creation exposure checks

The VM starts and the helper immediately writes `Outcome=PASS` (`:743-758`). It neither waits for cloud-init nor retrieves/verifies the advertised guest evidence at `/var/lib/third-code-erp/evidence/precredential-containment.json`. It also does not assert zero NAT static mappings or zero total port proxies after creation; it only checks the historical five Supabase ports. Consequently the PASS ledger is not guest-local Docker/mount/service-account proof and cannot establish the pre-credential boundary.

**Required change:** Add a non-sharing, non-secret, bounded guest-readiness/evidence method and fail closed if cloud-init, guest identity, Docker context/socket/ext4/mount checks, `gh` absence, or guest firewall evidence cannot be verified. Re-inventory all NAT mappings and all port proxies after creation and require empty results. Do not write Provision PASS until those checks and exact rollback readiness complete.

## Status and handoff

Agent 13 must correct all P1 findings and add regressions before another static review. The Group 3 restriction remains in its approved exact state; do not change it further. The existing accepted static smoke workflow remains the only possible non-secret workflow, but no runner exists and no UAC/host change has occurred.

The release remains independently **NO-GO**: gitleaks, Snyk, Semgrep, Trivy, Auth/RLS/13-role evidence, protected environment, read-only production parity, migration lineage, and ABI/fractional-quantity commercial decisions are not cleared.

→ **Handoff to Agent 13.** Correct the static Provision design only. Return an exact commit for Agent 12 review before any download or elevated host action.
