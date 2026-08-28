# Agent 12 — isolated Linux runner static remediation re-review

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Candidate reviewed:** `2edd8dc1d5d9bed8ec2a100afb10a58dc96eb34a` (`fix(ci): harden isolated runner containment`)
**Decision:** **REJECT — static contract remains insufficient.** Do not update Group 3, provision a guest, run UAC, register a runner, or run Auth/Snyk/full CI. Production remains **NO-GO**.

This read-only review follows [the Stage 1 contract](2026-08-28-agent-12-isolated-linux-runner-contract.md) and the prior Stage 3 rejection at `c36726c7`. It made no host, GitHub, runner, provider, database, billing, secret, or production mutation.

## Verified improvements

| Control | Evidence | Result |
| --- | --- | --- |
| GitHub job authority | `.github/workflows/ci-linux-runner-smoke.yml` remains manual-only with the exact repository/owner/ref/actor guards, Group `erp-ci-isolated`, distinct Linux label, and now declares `permissions: {}`. | **PASS, static.** |
| Guest-local Docker checks | The smoke fails unless `DOCKER_HOST` and `DOCKER_CONTEXT` are unset, the default Docker context is `unix:///var/run/docker.sock`, that socket exists, dockerd is active, the caller is non-root in `docker`, and the Docker root is ext4. | **PASS, static.** Actual guest identity/mount/service-account evidence is still absent. |
| Smoke cleanup | The exit handler now retains a main failure and exits nonzero when cleanup fails. It tracks its current-run network, container, volume, and work directory. The behavioral regression deliberately forces a cleanup error and observes failure. | **PASS, static.** |
| Host inventory and broad deletion | The helper now records structured port-proxy/listener/firewall-profile/Hyper-V/Docker-volume inventory, uses exact firewall names/IDs, and omits prior wildcard firewall selection/removal. | **PASS, partial.** The required Provision design still lacks sufficient containment and rollback schema. |
| Static checks rerun by Agent 12 | Process-local Node `v22.23.2`: runner contract **6/6**, Actionlint, workflow-reference verification, and Gitleaks passed. Windows PowerShell 5.1 and pwsh parser checks passed; `git diff --check 2edd8dc1^ 2edd8dc1` passed. | **PASS.** These do not prove a guest or host boundary. |
| Current external state, read 2026-08-28 | Group `3` is ERP-only, workflow-restricted, and the repository has zero runners; its sole selected workflow is still legacy Windows `ci-self-hosted.yml@82615eb72d64b4d32bacfb9a218525d8834fdaa7`. | **Unchanged.** No Group 3 or host mutation occurred. |

## Blocking findings

### P1 — the schema accepts a forbidden host-to-guest port proxy

The accepted contract expressly forbids any `netsh port proxy` in the VM boundary and requires no port-proxy exposure for each dynamic port. The new `Read-RollbackLedger` instead accepts each ledgered proxy when it points at the guest (`scripts/ci/invoke-isolated-linux-runner-host.ps1:330-336`), and `Invoke-Rollback` deletes those accepted proxies (`:403`). The passing regression fixture itself defines a valid `127.0.0.1:60123 -> 172.31.202.10:54321` proxy (`scripts/ci/verify-isolated-linux-runner-contract.test.mjs:74`). That is a direct contradiction, not an acceptable rollback exception.

**Required change:** A Provisioned ledger must contain an explicit empty port-proxy result, and validation must reject any target or non-target proxy for the guest/dynamic-port union. The test fixture must make a non-empty `PortProxies` array fail. If a proxy appears, record the failure and stop before credentials/Auth; do not model it as a valid resource of a normal run.

### P1 — rollback eligibility requires an impossible pre-cleanup attestation

`Read-RollbackLedger` refuses to execute unless a live `Lifecycle=Provisioned` ledger already asserts `FinalZeroResidue=true` (`scripts/ci/invoke-isolated-linux-runner-host.ps1:299-300`). A truthful provisioned lifecycle contains the VM, runner, work state, and other resources that rollback must remove, so it cannot honestly attest final zero residue before that removal. The existing regression treats this impossible property as the success path (`verify-isolated-linux-runner-contract.test.mjs:76, 225-230`). This can prevent cleanup precisely when cleanup is required.

**Required change:** Separate pre-removal ownership evidence from post-removal attestation. A validated `Provisioned` ledger must describe the currently owned identities; rollback must use that identity data, then write a new `RolledBack` ledger with a zero-residue result after all removal/reinventory checks. Add behavioral tests for a truthful provisioned ledger, rollback refusal on changed identity, and post-rollback zero residue. Include runner de-registration, all guest Docker resources/reports/work state, VM/VHDX, NAT, switch, rules, listeners, and port-proxy absence in the actual lifecycle evidence.

### P1 — firewall evidence remains an unscoped name/state inventory

The helper records generic `Get-NetFirewallRule` fields but neither serializes nor validates address, port/protocol, interface, profile, Hyper-V VM/interface binding, or the host/guest probe rule filters. It therefore cannot prove the required rules are narrowly scoped to the named VM/interface or enforce the required block of host/private/LAN paths while preserving documented DNS/NAT/outbound GitHub. Generic rule name/ID equality is insufficient for this security boundary.

**Required change:** Before any Provision, extend the ledger and tests with exact Firewall/Hyper-V rule filter data (including address, port/protocol, interface/profile, VM/interface association, and rule direction/action) and reject global or mismatched scope. The future non-secret provision evidence must execute the disposable host-probe rejection and GitHub HTTPS control, then remove and re-inventory those exact resources.

## Required next action

Agent 13 must correct all three P1 findings and add failing regressions before another Agent 12 static review. Only after a new static acceptance may Group 3 be replaced with exactly:

`Third-Code-Solutions/ERP/.github/workflows/ci-linux-runner-smoke.yml@<accepted-full-commit-sha>`

That later selection must be immediately read back with repository membership and zero runners. Even then, it is not runner acceptance: immutable-image/Secure-Boot/VHDX evidence, non-login runner account, host/guest mount and credential proof, JIT lifecycle, dynamic Docker/listener proof, firewall/probe controls, and exact post-run destroy/recreate evidence remain required before Auth, Snyk, CI, or release work.

The required gitleaks, Snyk, Semgrep, and Trivy gates, plus Auth/RLS/13-role evidence, protected environment, production parity, migration lineage, and commercial ABI/fractional-quantity decisions remain independent **NO-GO** blockers.

→ **Handoff to Agent 13.** Correct the rejected static contract only; do not update Group 3 or provision until the revised exact workflow/helper/tests receive a new Agent 12 acceptance.
