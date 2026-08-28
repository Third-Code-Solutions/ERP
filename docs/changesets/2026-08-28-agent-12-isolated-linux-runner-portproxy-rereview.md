# Agent 12 — isolated Linux runner portproxy re-review

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Candidate reviewed:** `0f785d0fa5500ea126e36022892f66e978d751db` (`fix(ci): allow empty portproxy output`)
**Decision:** **REJECT — a second elevated Provision attempt is not authorized.**

This is a static review following the safely stopped first Provision attempt recorded in [the Agent 13 runtime record](2026-08-28-agent-13-isolated-linux-runner-provision-runtime.md). The first attempt exited before an ownership ledger or a run-owned host resource existed; its approved image cache is the sole persistent artifact. This review made no UAC, retry, host, runner, group, workflow, secret, Auth, Snyk, provider, database, or production change.

## What the candidate correctly repairs

- The null collection, empty collection, and one blank output line that Windows `netsh interface portproxy show <protocol>` produces for a successful no-proxy state now parse as zero entries.
- A syntactically valid nonempty mapping remains an entry and reaches the unchanged global `Assert-NoMappingsOrPortProxies` rejection.
- A malformed nonempty line and an out-of-range port throw instead of silently disappearing. This review directly exercised the out-of-range branch in both Windows PowerShell 5.1 and PowerShell 7.
- The helper/runtime record/tests are the only changed paths; the VM, VHD, ACL, evidence, cache, rollback, group, workflow, and credential contracts are otherwise unchanged from the prior reviewed design.

Read-only host evidence confirms why blank output itself is valid: `netsh interface portproxy show` returned exit code `0`, one blank output line, and zero nonblank lines for each of `v4tov4`, `v4tov6`, `v6tov4`, and `v6tov6`.

## Blocking P1 — command failure is indistinguishable from a valid blank result

`Get-PortProxyEntries` (`scripts/ci/invoke-isolated-linux-runner-host.ps1:141-147`) captures each `netsh` command with stderr suppressed, then passes its stdout collection directly to the repaired parser. It never checks `$LASTEXITCODE`. A failed or unavailable `netsh` invocation that emits no stdout is therefore now accepted as the zero-proxy state. That converts a missing host-inventory proof into Provision authority and violates the contract's fail-closed preflight.

**Required minimal change:** immediately after each exact `netsh interface portproxy show <protocol>` call, reject a nonzero native exit code before normalizing empty stdout. Preserve the valid exit-code-0 blank state. Add behavioral regressions that simulate or otherwise assert both: (1) exit `0` plus blank output yields zero entries; and (2) nonzero exit plus blank output throws before `Assert-NoMappingsOrPortProxies`. The parser must continue to reject malformed and out-of-range nonempty lines, and a valid parsed mapping must still be rejected globally.

Do not alter the provisioning boundary to work around this defect. No archive download, run-root reuse, target cleanup, broader inventory exception, or second elevated attempt is permitted until this P1 receives a new Agent 12 static acceptance.

## Static checks run

- **PASS:** Node `v22.23.2` containment contract suite — 8/8.
- **PASS:** Windows PowerShell 5.1 and PowerShell 7 parser checks.
- **PASS:** direct `PortProxyRegression` in both engines: null/empty/blank => zero, valid mapping => global rejection, malformed => rejection.
- **PASS:** direct out-of-range mapping rejection in both engines.
- **PASS:** Actionlint, workflow action-reference verification, Gitleaks 8.30.1 (1,612 commits / about 38.74 MB; no leaks), and `git diff --check 0f785d0^ 0f785d0`.

These passing static checks do not override the missing native-command-success assertion. The release remains independently **NO-GO** for JIT/runner lifecycle, hosted gitleaks/Snyk/Semgrep/Trivy, Auth/RLS/13-role proof, protected release identity/environment, production parity/migration evidence, and ABI/fractional-quantity/DUPA decisions.

→ **Handoff to Agent 13.** Add only the fail-closed `netsh` exit-status guard and behavioral regression; return a new exact commit for another Agent 12 review. Do not retry Provision, register a runner, or introduce a credential stage.
