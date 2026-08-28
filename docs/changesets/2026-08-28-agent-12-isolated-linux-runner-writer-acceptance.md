# Agent 12 — isolated Linux runner ledger-writer acceptance

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Candidate reviewed:** `4550d94031194c178da77a3c8f6a6fd34b442526` (`fix(ci): preserve ledgers on ps5 replacement failure`)
**Decision:** **ACCEPT — authorize exactly one third elevated, non-secret Provision attempt.**

This is a static review of the writer-only repair after the second attempt failed before VHD, switch, NAT, VM, ACL, guest, runner, or credential work. It made no UAC, Provision retry, host, group, runner, workflow, secret, Auth, Snyk, provider, database, or production change. The prior attempt's `Provisioning/IN_PROGRESS` ledger remains an honest failure record, not a cleanup attestation; the new attempt must use a new identity and ledger path.

## Accepted writer controls

- An absent destination uses an exact same-directory temporary file then `File.Move`.
- An existing destination uses unique same-directory temporary and backup paths, and Windows PowerShell 5.1-compatible `File.Replace(temp, destination, backup)`—never a null backup path.
- If replacement fails while the exact prior destination is absent and the exact backup remains, only that backup is restored to the destination before the error is propagated. If restoration itself fails, the backup is preserved and the helper fails closed.
- `finally` removes only the unique known temporary file and, once a destination exists, the exact known backup. There is no wildcard or directory cleanup.
- Replacement output is BOM-less UTF-8 JSON. A failed injected replacement preserves the prior valid ledger byte-for-byte; normal repeated replacements end in a parseable `RolledBack` record with no temporary/backup artifacts.

No Provision, rollback, VM/VHD, cache, network, guest, evidence, group, workflow, or credential contract changed outside the writer and its regression coverage.

## Static verification

- **PASS:** direct repeated replacement and injected destination-absent/backup restoration under Windows PowerShell 5.1 and PowerShell 7; prior ledger restored byte-for-byte with zero temporary/backup residue.
- **PASS:** direct `LedgerReplacementRegression` under both engines: initial move, three replacements, final `RolledBack` ledger, BOM-less parseable JSON, injected failure rejection and prior-ledger preservation.
- **PASS:** Node `v22.23.2` containment contract suite — 9/9.
- **PASS:** Windows PowerShell 5.1 and PowerShell 7 parser checks.
- **PASS:** Actionlint, workflow action-reference verification, Gitleaks 8.30.1 (1,618 commits / about 38.76 MB; no leaks), and `git diff --check 4550d94^ 4550d94`.

## Exact third-attempt authorization

Agent 13 may run **one** third elevated non-secret Provision attempt from `4550d94031194c178da77a3c8f6a6fd34b442526`, using a **new** exact `RunIdentity`, separate ledger path, the unchanged approved cache archive at `D:\third-code-erp-isolated-runner-cache\noble-server-cloudimg-amd64-azure.vhd.tar.gz`, and SHA-256 `843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22`.

It must retain the exact acknowledgement gate, fresh-target preflight, portproxy exit/status gate, staged ownership ledger, 900-second guest bound, host/guest evidence checks, and automatic exact rollback on every failure. It must return the new ledger and post-run inventory; a final `RolledBack/PASS` record is required to claim cleanup. If any step fails, stop rather than retry, preserve the failure record, and do not reuse a prior run root or ledger.

This authorization excludes JIT/runner registration, group/workflow mutation, Actions dispatch, all credentials and secrets, Auth/RLS/13-role work, Snyk/Semgrep/Trivy, provider/database access, deployment, merge, and production. Independent release gates—hosted gitleaks/Snyk/Semgrep/Trivy, secret provenance, Auth/RLS evidence, protected release identity/environment, production parity/migration, and ABI/fractional-quantity/DUPA decisions—remain **NO-GO**.

→ **Handoff to Agent 13.** Execute one exact third non-secret Provision attempt only, then return ledger/evidence/post-cleanup state to Agent 12. Do not create or register a runner or start a credential stage.
