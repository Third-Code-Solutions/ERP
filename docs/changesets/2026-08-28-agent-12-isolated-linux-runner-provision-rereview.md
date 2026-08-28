# Agent 12 — isolated Linux runner hardened Provision re-review

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Candidate reviewed:** `d75d48913764025fda1f0df238356e5a89dc7ce1` (`fix(ci): harden isolated provision containment`)
**Decision:** **REJECT — the one elevated non-secret Provision run is not authorized.** No UAC, archive download, VM/VHD/switch/NAT/ACL, runner, JIT, Auth, secret, provider, database, or production action may follow this review.

## Verified static improvements

The candidate materially improves the rejected design: it introduces an atomic `Provisioning` ownership ledger, explicit D: VM/checkpoint/smart-paging directories, an evidence VHD read only by the host after guest shutdown, no host Firewall mutation, zero-mapping/proxy inventory checks, bounded guest power-off, and VM-NIC ACL readback. Group 3 remains in the approved exact state: ERP-only, `restricted_to_workflows=true`, one selected workflow at `ci-linux-runner-smoke.yml@827719975eb44808da85cbd64cc28074f6ee4ae1`, and zero runners.

With process-local Node `v22.23.2`, the containment contract suite passed **7/7**; Actionlint, workflow-reference verification, and Gitleaks passed. Windows PowerShell 5.1 and pwsh parser checks and `git diff --check d75d4891^ d75d4891` passed. These static results do not make a contradictory lifecycle executable.

## Blocking P1 findings

### P1 — the required image location is incompatible with the vacant-target precondition

`Invoke-Provision` first calls `Assert-TargetVacant`, which fails if the exact run root exists (`scripts/ci/invoke-isolated-linux-runner-host.ps1:280-281`). It then calls `Assert-VerifiedUbuntuArchive` before creating the run root (`:883-899`), while `Get-ExpectedImageArchivePath` rejects an archive outside that same exact run root (`:441-450`). A verified archive cannot be present under the run root without causing the earlier vacancy check to fail, so Provision has no valid start state.

**Required change:** Define one coherent, exact pre-provision image handoff. Either create/own the run root before a verified download and atomically record it, or permit only a separately named/hash-verified immutable input outside the run root while retaining explicit input identity and cleanup ownership. Do not weaken target vacancy for any VM/NAT/switch/ACL/ledger object. Add a regression that exercises the intended valid start state.

### P1 — expected guest writes make both staged and normal rollback refuse cleanup

The OS VHDX hash is recorded before boot (`:908-910`), but cloud-init installs packages and changes guest state. If guest evidence validation fails after boot, `Invoke-StagedProvisionRollback` compares the current disk hash to that stale pre-boot hash and refuses deletion (`:833-837`). The successful Provisioned ledger carries the same stale OS hash, so the later normal rollback also refuses cleanup (`:391-397`). This recreates the prior failure-cleanup defect after guest boot.

**Required change:** Separate immutable source-image integrity from mutable owned-VHD deletion identity. Capture the original archive/source hash before conversion; after every expected mutable guest phase, atomically refresh recorded VHD hash evidence before any operation that can fail. For failure cleanup, validate exact path, marker, VM attachment/VHD identity, and run-owned directory rather than requiring an unchanged guest filesystem hash. Add tests for guest-mutated OS/evidence VHD cleanup on both failure and later normal rollback.

### P1 — NIC-to-switch binding is self-asserted, not read back

`Get-RecordedVmNetworkAcls` writes `SwitchId` and `AdapterName='Network Adapter'` from arguments/literals (`:637-660`) without reading the VM network adapter. The static ACL tuple can therefore claim the internal switch even if the VM NIC is attached to Default or an external switch. This fails the contract's no-Default/no-bridge boundary.

**Required change:** Read the target VM NIC(s) directly, require exactly one adapter, validate its immutable adapter identity/name and exact `SwitchName`/internal-switch ID, record that evidence, and reject any extra/default/external adapter before start, before PASS, and before rollback. Bind ACL comparison to that live adapter identity; add a negative regression for an external/default switch attachment.

### P1 — guest evidence does not prove the required runner identity or host reconciliation

Cloud-init executes the smoke as root and emits string claims about `erpci`, Docker, `gh`, and firewall state (`:529-578`); it does not run the checks as `erpci`, verify no sudo/no SSH service, or check root/personal SSH and GitHub credential locations. It also returns its dynamic Docker ports only inside the guest evidence while the Provisioned ledger retains `DynamicPorts=[]` and `DynamicPortEvidenceState=not-started` (`:965-968`). The host checks only the historical Supabase ports, not the dynamically observed union. A guest-root self-attestation alone is insufficient for the pre-credential boundary.

**Required change:** Run and record the relevant Docker/context/socket/no-sudo checks as the non-login `erpci` service identity; assert SSH is inactive/disabled and both runner/root credential locations are absent. Promote the validated guest dynamic-port union into a distinct host-reconciled evidence field, then prove no host listener, NAT mapping, or port proxy exists for every such port. Keep the later Supabase lane separate, but do not label the initial evidence state `not-started` after running a Docker publication smoke. Pin the smoke image by immutable digest.

## Next step

Agent 13 must correct these P1s, add behavioral/negative regression coverage, and return a new static commit. Group 3 must remain unchanged. This review does not authorize retrying the legacy runner, widening the runner group, a paid service, a new account, or any production work.

All release controls remain independently **NO-GO**: gitleaks, Snyk, Semgrep, Trivy, Auth/RLS/13-role proof, protected environment, migration/production parity, and ABI/fractional-quantity decisions.

→ **Handoff to Agent 13.** Repair the static Provision design only; no UAC or host mutation until a subsequent Agent 12 acceptance.
