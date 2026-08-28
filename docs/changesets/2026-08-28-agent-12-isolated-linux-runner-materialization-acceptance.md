# Agent 12 — isolated Linux runner materialization acceptance

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Candidate reviewed:** `307d184c165772546df793b72f6a9b2e40a62333` (`fix(ci): materialize dense runner image source`)
**Decision:** **ACCEPT — authorize exactly one fourth elevated, non-secret Provision attempt.**

This static review follows the durable third-attempt rollback in `a6198f6c3e6e8f17111d888c7734f1b951947154`. It made no UAC, archive/cache, host, group, runner, workflow, credential, Auth, Snyk, provider, database, or production change.

## Accepted materialization boundary

- The immutable Ubuntu archive remains at its reviewed D: cache path and its existing SHA-256 validation runs before extraction. The implementation reads it only.
- Extraction is confined to the marker-owned run-root staging directory. It requires one expected `livecd.ubuntu-cpc.azure.vhd` regular source file, with canonical path/reparse/name/attribute checks.
- Before output creation it measures D: capacity for the dense copy, worst-case converted VHDX, and a nonzero 1 GiB reserve; unmeasurable, invalid, overflowed, or insufficient capacity fails before creation.
- `transient-dense-source-vhd` is staged in the ownership ledger before `CreateNew`. The exact destination is `vhd\materialized-source.vhd` within the current run root; existing output, escaped path, or reparse path fails closed.
- A sequential FileStream copy detects interruption, short read/write, length change, final length mismatch, and post-copy content mismatch. Its destination rejects sparse, compressed, encrypted, reparse, offline, device, and directory attributes before `Convert-VHD` receives it.
- Source and destination SHA-256 values are provenance-only; marker-owned canonical paths and the live VM attachment ledger remain the only deletion authority. The transient source is explicitly prohibited from `VmDisks`.
- Any failed copy remains inside the staged marker-owned run root and is removed by the same exact rollback path; there is no cache, broad, or Docker/WSL cleanup.

## Static verification

- **PASS:** direct `MaterializationRegression` under Windows PowerShell 5.1 and PowerShell 7, using a synthetic sparse source. It proved dense success and rejection of source-name mismatch, path escape, existing output, capacity failure, interruption, short read/write, length/content mismatch, forbidden attributes, and test-root/ledger residue.
- **PASS:** Node `v22.23.2` containment contract suite — 10/10, including dense-source and rollback-plan checks.
- **PASS:** Windows PowerShell 5.1 and PowerShell 7 parsers.
- **PASS:** Actionlint, workflow action-reference verification, Gitleaks 8.30.1 (1,622 commits / about 38.81 MB; no leaks), and `git diff --check 307d184^ 307d184`.
- **Read-only context:** the approved archive has one expected 32,213,303,808-byte VHD member; D: reports 537,408,172,032 bytes free, exceeding the configured conservative materialization budget. This is capacity context, not live Provision evidence.

## Exact fourth-attempt authorization

Agent 13 may perform **one** fourth elevated non-secret Provision attempt from `307d184c165772546df793b72f6a9b2e40a62333`, using a **new** RunIdentity and ledger path, the unchanged archive `D:\third-code-erp-isolated-runner-cache\noble-server-cloudimg-amd64-azure.vhd.tar.gz`, and SHA-256 `843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22`.

The attempt must retain the acknowledgement, empty-target and portproxy preflight, ledger staging, cache validation, materialization checks, 900-second guest bound, evidence/ACL/listener reconciliation, and automatic exact rollback. A durable final `RolledBack/PASS` ledger and post-run zero-residue inventory are mandatory, whether the attempt passes or fails. Stop after any failure; do not retry or substitute an image/path.

This authorization excludes JIT/runner registration, runner-group or workflow changes, Actions dispatch, all credentials/secrets, Auth/RLS/13-role testing, Snyk/Semgrep/Trivy, providers/databases, deployment, merge, or production work. Hosted security gates, secret provenance, protected release identity/environment, production parity/migration evidence, and ABI/fractional-quantity/DUPA decisions remain independently **NO-GO**.

→ **Handoff to Agent 13.** Run one exact fourth non-secret Provision attempt only and return the ledger, evidence, and final rollback inventory for Agent 12 review. Do not create or register a runner.
