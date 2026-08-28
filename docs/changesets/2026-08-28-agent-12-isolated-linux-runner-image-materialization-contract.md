# Agent 12 — isolated Linux runner image-materialization contract

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Runtime evidence reviewed:** `a6198f6c3e6e8f17111d888c7734f1b951947154`
**Decision:** **CONDITIONALLY ACCEPT static implementation only. No further UAC Provision attempt is authorized.**

The third Provision attempt failed at `Convert-VHD` before any VHDX, CIDATA/evidence disk, switch, NAT, VM, ACL, guest, runner, credential, or production action. Its durable `RolledBack/PASS` ledger records `FinalZeroResidue=true`; the immutable archive cache remains verified and unchanged. The sparse/compressed/encrypted source-file limitation must be addressed without weakening cache provenance, path containment, or exact cleanup.

## Required bounded materialization design

Agent 13 may implement and test the following repository-local repair only.

1. Keep the immutable input exactly where it is: `D:\third-code-erp-isolated-runner-cache\noble-server-cloudimg-amd64-azure.vhd.tar.gz`. Re-run the existing official archive path/name/SHA-256 check before extraction. The cache must never be written, moved, renamed, deleted, or considered a rollback-owned resource.
2. Extract only under the current marker-owned run root. Require one regular expected Azure source VHD whose canonical path remains inside the exact run-root staging directory. Reject source absence, more than one source VHD, archive/source-name mismatch, a path escape/reparse point, or source attributes other than the known materialization-eligible source state.
3. Before opening a destination, calculate the dense-copy requirement from the source logical length. Require available D: capacity for both the new dense source **and** a worst-case converted OS VHDX plus a documented nonzero reserve; reject insufficient, negative, overflowed, or unmeasurable capacity before creating the output. The source's existing sparse allocation is not a valid capacity calculation.
4. Define one fixed canonical destination under the current run root, such as `vhd\materialized-source.vhd`. Reject any pre-existing destination, a path outside the run root/VHD directory, a reparse point, or non-empty/interrupted partial output. Add its transient ownership record and write a `Provisioning` stage ledger **before** destination creation so failure cleanup can remove a partially copied file exactly.
5. Use a sequential `FileStream`-style byte copy (not `Copy-Item`, hard links, clone/duplicate extents, or archive-cache reuse). Require all reads/writes to complete; reject a short read, short write, cancellation/interruption, length change, or final length mismatch. Compare a post-copy SHA-256 of the extracted source and dense destination for provenance/integrity only. It must not become deletion authority.
6. Before `Convert-VHD`, require the materialized destination's attributes to exclude `SparseFile`, `Compressed`, `Encrypted`, `ReparsePoint`, and other unsupported/offline states. Keep the original extracted source immutable for the run; call `Convert-VHD` only with the checked dense path.
7. Extend staged and normal ledger validation with a fourth canonical `transient-dense-source-vhd` record. It has no cleanup-authorizing content hash and is not a VM attachment. The mutable OS VHDX remains authorized only through the marker, canonical path, and exact live VM attachment; CIDATA keeps its immutable provenance hash. Rollback removes only the marker-owned run root after exact current ledger/VM attachment validation, thereby removing the transient dense source. No broad cleanup or cache deletion is allowed.
8. Write a Provision `PASS` only after all prior guest/evidence/network checks still pass. Any materialization failure must use the existing exact staged rollback and write/retain a durable non-secret failure or `RolledBack/PASS` ledger as appropriate.

## Required regression evidence before re-review

Run every case in Windows PowerShell 5.1 and PowerShell 7 using a synthetic sparse source created within a test-owned temporary run root:

- successful sequential materialization produces a dense, non-compressed, non-encrypted, non-reparse destination of equal length and matching provenance hash;
- source/archive mismatch, path escape, existing output, insufficient/free-space provider failure, interrupted/short copy, output-length mismatch, and forbidden destination attribute each fail before `Convert-VHD`;
- no test modifies the immutable cache or an external path;
- staged/normal cleanup removes the exact temporary source/output and no test-owned temporary/backup/ledger residue remains; and
- the synthetic input/output never enters the live VM attachment list unless it is the separately recorded converted OS VHDX.

The updated Node 22 contract, both PowerShell parsers and direct regressions, Actionlint, workflow action-reference verification, Gitleaks, and `git diff --check` must pass. Return the exact commit and static evidence to Agent 12. A static success is not runtime containment proof.

## Prohibitions and release effect

Do not run UAC Provision, download or change the approved archive, alter Group 3/workflows, register a runner, dispatch Actions, use JIT/secrets/Auth/Snyk, access providers/databases, or deploy. The Group remains a zero-runner restricted workflow boundary. Hosted gitleaks/Snyk/Semgrep/Trivy, secret provenance, Auth/RLS/13-role proof, protected release identity/environment, production parity/migration evidence, and ABI/fractional-quantity/DUPA decisions remain independent **NO-GO** blockers.

→ **Handoff to Agent 13.** Implement only this bounded materialization path and its regressions, then return a static commit for Agent 12 review. Do not perform a fourth Provision attempt until that review explicitly accepts it.
