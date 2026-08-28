# Agent 12 — isolated Linux runner portproxy acceptance

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Candidate reviewed:** `08b639511d7f1de220f39b5ec6c5dd2ec6b0c91f`
**Decision:** **ACCEPT — authorize exactly one second elevated, non-secret Provision attempt.**

This acceptance addresses the P1 in [the prior portproxy re-review](2026-08-28-agent-12-isolated-linux-runner-portproxy-rereview.md). It is a static review only and made no UAC, Provision retry, host, group, runner, workflow, secret, Auth, Snyk, provider, database, or production change.

## Accepted narrow repair

`Invoke-PortProxyShow` now captures `$LASTEXITCODE` immediately after each exact `netsh interface portproxy show <protocol>` invocation and throws on any nonzero status before output normalization. `Get-PortProxyEntries` independently requires one complete `{ ExitCode, Stdout, Stderr }` result per protocol and rejects incomplete, nonzero, or stderr-bearing results before accepting an empty successful result as zero proxies.

The existing parser and global zero-proxy control remain intact:

- exit-code-0 null, empty collection, and Windows blank output are the valid zero-proxy state;
- a valid nonempty mapping is parsed and rejected by `Assert-NoMappingsOrPortProxies`;
- malformed and out-of-range nonempty lines fail closed; and
- exit-code-1 blank or nonblank output, and an exit-code-0 result carrying stderr, fail closed.

The real read-only zero-proxy query was exercised through the repaired path under Windows PowerShell 5.1 and PowerShell 7. Both returned zero entries; the previously observed host output remains exit `0` with one blank line for each of the four supported protocols.

No VM/VHD/ACL/evidence/cache/rollback boundary changed. The patch contains only the portproxy command-result guard, its regression coverage, and the Agent 13 runtime record.

## Static verification

- **PASS:** Node `v22.23.2` containment contract suite — 8/8.
- **PASS:** Windows PowerShell 5.1 and PowerShell 7 parser checks.
- **PASS:** direct `PortProxyRegression` under both engines: all success and failure cases above.
- **PASS:** repaired live read-only `Get-PortProxyEntries` zero-proxy result under both engines.
- **PASS:** Actionlint, workflow action-reference verification, Gitleaks 8.30.1 (1,614 commits / about 38.75 MB; no leaks), and `git diff --check 08b6395^ 08b6395`.

## Exact second-attempt authorization

Agent 13 may perform **one** second elevated non-secret Provision attempt from `08b639511d7f1de220f39b5ec6c5dd2ec6b0c91f`, with a **new** exact `RunIdentity`, the unchanged verified archive at `D:\third-code-erp-isolated-runner-cache\noble-server-cloudimg-amd64-azure.vhd.tar.gz`, and its previously confirmed SHA-256 `843d243792abb05b50e1a7f5e614e1184d8fc7195c119747cbb3038520258a22`.

The attempt must preserve the exact acknowledgement gate, clean-target preflight, 900-second bound, evidence validation, host reconciliation, and automatic staged exact rollback on any failure. It must stop instead of retrying if any cache/hash, inventory, command result, Hyper-V, guest, ACL, evidence, listener/mapping/proxy, or cleanup check fails. Return the non-secret ledger, guest-evidence readback, and cleanup state to Agent 12 for the next review.

This does **not** authorize JIT, runner registration, group/workflow mutation, workflow dispatch, any credential or secret, Auth/RLS/13-role testing, Snyk/Semgrep/Trivy, provider or database access, deployment, merge, or production action. It does not clear the independent release NO-GOs: hosted gitleaks/Snyk/Semgrep/Trivy, secret provenance, Auth/RLS evidence, protected environment and immutable release identity, production parity/migration evidence, or ABI/fractional-quantity/DUPA business decisions.

→ **Handoff to Agent 13.** Run one exact second non-secret Provision attempt only; do not create/register a runner or enter a credential stage. Return runtime ledger and cleanup evidence for Agent 12 review.
