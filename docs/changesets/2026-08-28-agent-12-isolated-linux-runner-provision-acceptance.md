# Agent 12 — isolated Linux runner Provision acceptance

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Candidate reviewed:** `b1398956d3cc43dc5085dd351087616224db9669` (`fix(ci): harden isolated runner provision evidence`)
**Decision:** **ACCEPT — authorize exactly one elevated, non-secret Provision run of this reviewed helper.** This is a containment-validation stage, not runner registration, Auth, security-gate, or release approval. Production remains **NO-GO**.

This review is static only. It made no UAC, host, runner, GitHub group, workflow, secret, provider, database, or production change. The unrelated untracked `.tools/` directory was preserved.

## Accepted controls

| Contract area | Verified implementation | Result |
| --- | --- | --- |
| Cache and target lifecycle | The sole permitted input is the fixed `D:\third-code-erp-isolated-runner-cache\noble-server-cloudimg-amd64-azure.vhd.tar.gz`, outside the vacant per-run `D:\third-code-erp-isolated-runner\<run-id>` root. The dated official Ubuntu archive has the embedded SHA-256 `843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22`; any alternate path, absent cache, or hash mismatch fails before mutation. | **PASS** |
| Ownership and rollback | The helper writes a schema-v2 `Provisioning` ownership ledger before mutation and after each owned resource. Mutable OS/evidence VHDX cleanup relies on canonical run-root paths, ownership-marker hash, and exact live VM attachment identities—not an invalid post-cloud-init content hash. A failure invokes exact staged rollback and requires target vacancy plus zero mappings/proxies before the failure ledger is final. | **PASS** |
| D:-only resources | VM configuration, checkpoints, smart paging, VHDX, CIDATA, evidence, extraction, and run marker are explicit paths below the dedicated D: run root. The image cache is a separate immutable input and is never cleanup-owned. | **PASS** |
| Network boundary | The helper creates no Windows Firewall rule or port proxy. It rejects every port proxy and static NAT mapping. It requires exactly one adapter on the named internal switch, records its VM/switch/adapter/MAC identity, applies and reads back one adapter-bound inbound deny-all ACL plus exact outbound private/LAN/reserved deny ACLs, and rejects a mismatch before guest boot, before PASS, and before rollback. IPv6 is disabled in the guest. | **PASS** |
| Guest evidence | Guest cloud-init requires a locked non-login/no-sudo `erpci` account, locked root, no SSH listener/keys, no `gh` executable/configuration, no host mounts, guest-local default Docker Unix socket on ext4, and IPv6 disablement. The Docker loopback smoke is executed through `runuser -u erpci`, pins its Nginx image by digest, records its observed `127.0.0.1`/`::1` dynamic binding union, and writes non-secret evidence to a guest evidence VHD. The host reads that VHD read-only after shutdown and rejects malformed or secret-bearing evidence. | **PASS** |
| Exposure reconciliation and PASS ordering | The guest must pass loopback, host-probe denial, private-path denial, public DNS/NTP, and GitHub HTTPS controls. Before `Provisioned/PASS`, the host requires zero mappings/proxies, zero baseline and post-run host listeners for every dynamically observed guest port, exact VM NIC/ACL/VHD readback, evidence validation, and a failed host-to-guest NAT-IP probe. Missing/invalid evidence or any failed control enters rollback; no Provision PASS is written first. | **PASS** |

The observed GitHub runner group state remains a separate, previously reviewed control: group `3` (`erp-ci-isolated`) is non-default, selected only for `Third-Code-Solutions/ERP`, workflow-restricted, points only to `Third-Code-Solutions/ERP/.github/workflows/ci-linux-runner-smoke.yml@827719975eb44808da85cbd64cc28074f6ee4ae1`, and has zero runners. This review made no group update.

## Static verification

- **PASS:** process-local Node `v22.23.2`, `node --test scripts/ci/verify-isolated-linux-runner-contract.test.mjs` — 7/7 tests passed.
- **PASS:** Windows PowerShell 5.1 and PowerShell 7 parser checks for `scripts/ci/invoke-isolated-linux-runner-host.ps1`.
- **PASS:** Actionlint on `.github/workflows/ci-linux-runner-smoke.yml`.
- **PASS:** workflow action-reference verification.
- **PASS:** Gitleaks 8.30.1 — 1,609 commits / about 38.72 MB scanned; no leaks found.
- **PASS:** `git diff --check b1398956^ b1398956`.

These are static and fixture checks only. They do not claim host, Hyper-V, guest, Docker, network, cleanup, or GitHub Actions execution evidence.

## Exact authorization and stop conditions

Agent 13 may perform **one** named elevated Provision run from the reviewed helper at `b1398956d3cc43dc5085dd351087616224db9669`, using only the fixed cache archive and embedded SHA-256 above, then return the generated non-secret ledger and evidence for a new Agent 12 review. The stage must retain the helper's exact acknowledgement gate, target-vacancy checks, bounded 900-second guest shutdown, and automatic staged rollback on every failure. The cache input may be staged only at its fixed path from the embedded official Ubuntu source; do not substitute an image, URL, checksum, cache path, or run identity without a new review.

The run must stop and report failure on any unsuccessful image verification, elevation/preflight, evidence validation, NIC/ACL/VHD readback, listener/mapping/proxy reconciliation, guest probe, or cleanup result. It must not retry against a dirty target and must not remove, reuse, or alter WSL, Docker Desktop, the legacy `D:\actions-runner`, Default Switch, existing host resources, or other runners.

This acceptance authorizes **none** of the following: JIT configuration, runner registration, workflow/group mutation, GitHub Actions dispatch, Auth/RLS or 13-role testing, Supabase credentials, Snyk, Semgrep, Trivy, billing/provider changes, database access, deployment, merge, or production work. A successful Provision is only a prerequisite for a later, separately reviewed disposable-runner lifecycle.

Independent release blockers remain: successful hosted **gitleaks + Snyk + Semgrep + Trivy** gates; secret provenance; Auth/RLS and 13-role proof; protected environment and immutable release identity; production migration/schema parity; and ABI/fractional-quantity/DUPA business decisions.

→ **Handoff to Agent 13.** Run one exact non-secret Provision stage only, collect the ledger/evidence and exact cleanup result, then return them to Agent 12. Do not create or register a runner or perform any credential stage.
