# Agent 12 — isolated Linux runner Stage 3 acceptance review

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Candidate reviewed:** `af19c79485fbe502c777a1f33ba160690f476315` on `codex/release-candidate-trial-port`
**Decision:** **REJECT — runner and release remain NO-GO.** The elevated ledger is accepted solely as a non-mutating host preflight record; it is not containment, runner, Auth, Snyk, or release evidence.

This is the independent Stage 3 review required by [the no-cost recovery handoff](../handoffs/2026-08-28-no-cost-release-control-recovery.md), against the conditional Hyper-V contract in [Agent 12's Stage 1 record](2026-08-28-agent-12-isolated-linux-runner-contract.md). No host, runner, GitHub group, workflow, secret, provider, database, billing, or production change was made during this review.

## Evidence reviewed

| Area | Evidence | Review result |
| --- | --- | --- |
| Elevated target preflight | `tmp/isolated-linux-runner-third-code-erp-ci-20260828-stage2-host-ledger.json` is parseable JSON, starts with bytes `123,13,10` (no UTF-8 BOM), and hashes to `e274bfa5bd4e5a9500ef51c5b5409fe17d6791e5bb2c3b8346b970bf05564f7d`. It records `Mode=Preflight`, `Outcome=PASS`, zero VM/NAT/static-mapping/run-owned Firewall objects, and `538014273536` free D: bytes. | **PASS, preflight only.** It establishes that the named target was vacant without a host mutation. It does not prove the guest boundary or cleanup. |
| GitHub runner group, read 2026-08-28 | Group `3` is non-default `erp-ci-isolated`, selected only for private `Third-Code-Solutions/ERP` (`1234811736`), `restricted_to_workflows=true`, and the repository has zero registered runners. Its sole selected workflow is still `Third-Code-Solutions/ERP/.github/workflows/ci-self-hosted.yml@82615eb72d64b4d32bacfb9a218525d8834fdaa7`. | **FAIL.** Group 3 does not select the reviewed Linux workflow at its immutable full SHA. The new smoke workflow is not executable through this group. |
| Static Linux smoke and helper | `pnpm test:isolated-linux-runner-contract` passed 4/4, `pnpm ci:actionlint .github/workflows/ci-linux-runner-smoke.yml` passed, and `pnpm verify:workflow-action-refs` passed with a process-local Node `v22.23.2`. | **Static-only.** The default local Node 24 did not satisfy the repository Node 22 requirement; no guest, image, VM, JIT registration, network, listener, cleanup, or host probe was run. |
| Agent 13 Stage 2 record | [Stage 2 record](2026-08-28-agent-13-isolated-linux-runner-stage2.md) explicitly records that image download/verification, VM boot, guest Docker/listener/host-NAT proof, JIT registration, and runner-group update were not run. | **Incomplete by design; cannot pass Stage 3.** |

## Rejection findings and required corrections

### P1 — the selected workflow boundary is not the reviewed Linux workflow

The Stage 1 contract requires one selected Group 3 workflow string that pins the newly reviewed Linux workflow to its full SHA before registration. The current restriction instead pins the legacy Windows workflow. Do not provision, register, or dispatch a runner until an independently reviewed commit contains the Linux smoke workflow and Group 3 is updated to that exact full-SHA workflow string, then read back along with repository membership and zero runners. The group must remain selected for only the ERP repository and must not admit Default, pull request, fork, `workflow_run`, or `pull_request_target` execution.

The smoke workflow needs `permissions: {}` rather than `contents: read`: it does no checkout or GitHub API operation, so an automatic repository token is unnecessary. It must keep its repository/owner/manual-dispatch/ref/actor/triggering-actor/group/label guards.

### P1 — containment proof, guest identity, and JIT lifecycle are absent

The elevated preflight did not create a VM, therefore it cannot establish the required fresh Gen2 image hash, Secure Boot, guest-only ext4 workspace, non-login/no-sudo runner account, guest-local dockerd, lack of host/profile/credential mounts, protected JIT input, one-job ephemeral registration, post-job de-registration, or whole-guest destruction/recreation. The smoke currently checks only `DOCKER_HOST`; it must fail unless `DOCKER_CONTEXT` is unset, `docker context show` is `default`, and that context resolves to the guest-local Unix socket. `DockerRootDir=/var/lib/docker` alone does not prove the backing VHDX is guest-local ext4.

No JIT configuration or GitHub credential may be placed in a command argument, file, report, artifact, cache, shell history, or environment longer than the protected registration process. No production, personal, browser, `gh`, Git helper, SSH, or desktop-profile credential may enter the guest.

### P1 — rollback and cleanup are not exact-target, ledger-validated, or fail-closed

The helper's `Rollback` mode removes VM/NAT/switch/path by names/basic attributes without first validating a current-run ownership ledger. Its firewall operation selects `DisplayName "$($targets.FirewallPrefix)*"` and deletes it by wildcard. This can remove same-prefixed but non-run resources and violates the no-wildcard and ledger-validated-removal contract. Rollback must persist exact object IDs and immutable properties in the ledger, reject missing/duplicate/mismatched entries, validate VHD/directory ownership markers, and remove only those validated identifiers. It must also deregister the runner and prove removal of current-run containers, volumes, networks, reports, mappings, port proxies, listeners, VM/VHDX, NAT, switch, and Firewall/probe rules.

The smoke's `trap cleanup EXIT` does not fail a previously successful Bash body if cleanup itself returns failure. Replace it with an exit-status-preserving trap that explicitly exits nonzero when cleanup fails, and add a behavioral regression test that forces cleanup residue. Failed cleanup remains a runner **NO-GO**.

### P1 — host/guest network and listener contract is not implemented

The helper merely stores raw `netsh interface portproxy show all` lines; it does not parse or assert target-port-proxy absence. It also lacks host TCP listener inventory, target Docker-volume/label absence, Firewall profile/Hyper-V filtering state, and exact target rule identity. Correct this before provision and cover it with static tests.

For every runtime-discovered local-Supabase mapping, the real guest must record Docker metadata and matching guest `ss`/listener evidence, accepting only literal `127.0.0.1` or `::1`. The host must separately show no wildcard/LAN listener, static NAT mapping, or port proxy for that dynamic union; a guest loopback control must pass; a host-to-guest NAT-IP attempt and a guest-to-host disposable probe must fail; outbound GitHub HTTPS must pass. The existing Windows Desktop `0.0.0.0:8080` resource is unrelated baseline evidence and must remain untouched; it demonstrates why requested flags are not sufficient proof.

### P1 — zero-residue requirements are incomplete

The static smoke cleans one container and network only. Before Auth, Snyk, or any credential, the contract needs cleanup of all current-run Docker containers, volumes, networks, reports, work state, dynamic listeners, runner registration, VM/VHDX, switch, NAT, rules, and port proxies after exact ownership checks. The same ledgered path must be used for success, failure, interruption/watchdog, and a separately observed rollback smoke. No broad prune, Firewall reset, Default Switch/WSL/Docker Desktop action, or removal of `D:\actions-runner` is permitted.

## Required next sequence

1. **Agent 13** must correct the static workflow/helper and add regressions for the exact failures above. Agent 12 must re-review the patch before any host provision or Group 3 update.
2. With the reviewed workflow's full commit SHA, Agent 13 may make the narrowly scoped Group 3 selection change, immediately read it back, and prove exactly zero runners. The revision must be present before runner registration.
3. Only then run a named, ledgered Hyper-V guest provision and non-secret smoke. Provide evidence for image integrity, guest identity/mounts/Docker context, JIT lifecycle, host/guest Firewall and network controls, every dynamic port, and successful exact cleanup/recreate. Any failed or unavailable proof stops before Auth/Snyk/CI.
4. Return the new ledger and non-secret evidence to Agent 12 for another independent Stage 3 review. A later acceptance does not authorize secrets, Auth, production database access, deployment, or a release.

## Independent release blockers

This runner rejection is independent of the required **gitleaks, Snyk, Semgrep, and Trivy** gates. Snyk still has no approved existing-token provenance or successful scan, and the Auth/RLS/13-role matrix, protected environment, read-only production parity, migration lineage, ABI authority, and fractional-quantity/DUPA decisions remain unresolved. Production is **NO-GO**.

→ **Handoff to Agent 13.** Correct the static runner controls and produce non-secret, ledgered guest/host/rollback evidence only. Do not provision or change Group 3 until the reviewed static corrections are accepted; do not run Snyk/Auth/full CI or touch production.
