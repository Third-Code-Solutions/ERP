# Agent 12 — isolated Linux runner static containment acceptance

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Candidate reviewed:** `827719975eb44808da85cbd64cc28074f6ee4ae1` (`fix(ci): enforce isolated runner ledger bounds`), including `4b7b668ff984d2711171701aa5b1567f0070b3f8`
**Decision:** **ACCEPT — static pre-provision control package only.** This authorizes the narrow Group 3 workflow-selection update below and Agent 13's next exact Provision implementation/evidence stage. It does **not** accept a runner, guest, Auth/Snyk lane, full CI, release, production target, or deployment.

This review is read-only. No host/UAC, runner, GitHub-group, provider, secret, database, billing, or production action was made by Agent 12.

## Evidence and acceptance

| Control | Review result |
| --- | --- |
| Job authority | **PASS, static.** The Linux smoke remains manual-only, exact repository/owner/ref/actor guarded, uses `erp-ci-isolated` with its distinct Linux label, declares `permissions: {}`, and has no checkout, secret, Snyk, Supabase, or token use. |
| Guest-local Docker checks | **PASS, static.** The smoke requires no Docker host/context override, exact default Unix-socket context, a real local socket, non-root Docker-group caller, active dockerd, ext4 Docker root, and no WSL/Windows-drive mount evidence. |
| Cleanup | **PASS, static.** Idempotent exact-resource query/removal and zero-residue verification now preserve the main exit while failing cleanup/query/residue failure. Behavioral coverage includes absent resources and a forced volume-cleanup failure. |
| Port-proxy boundary | **PASS, static.** Preflight rejects every `netsh` port proxy; a Provisioned ledger requires `Resources.PortProxies=[]`; rollback never creates/removes/accepts a proxy and fails if one appears. The previous host-to-guest proxy fixture is now a negative test. |
| Ledger lifecycle and exact rollback | **PASS, static.** A `Provisioned` ledger records live owned identity without a false zero-residue claim. Only post-removal `RolledBack` output declares `FinalZeroResidue=true`; marker, VM, switch, NAT, firewall, dynamic-port, and post-reinventory checks remain fail-closed. |
| Firewall scope | **PASS, static.** Ledger validation and live comparison now cover exact rule identity, enabled/profile, port/protocol, address, and interface filters. Global address/profile/port/interface scope is rejected; a global-address negative regression runs under both Windows PowerShell 5.1 and pwsh. `RemoteAddress=Any` is rejected, so it cannot silently broaden a host/guest rule or be mistaken for a loopback control. The future probe must still prove the required guest loopback path is unaffected. |
| Re-run validations | **PASS.** With process-local Node `v22.23.2`: runner contract **6/6**, Actionlint, workflow-reference verification, and Gitleaks passed. Windows PowerShell 5.1 and pwsh parser checks and `git diff --check 82771997^ 82771997` passed. |
| Current external state read 2026-08-28 | **UNCHANGED.** Group 3 remains ERP-only, workflow-restricted, and has zero runners; it still selects only legacy `ci-self-hosted.yml@82615eb72d64b4d32bacfb9a218525d8834fdaa7`. |

## Narrow authorization and next required evidence

Agent 13 may now replace—not append—the Group 3 selected workflow with exactly:

`Third-Code-Solutions/ERP/.github/workflows/ci-linux-runner-smoke.yml@827719975eb44808da85cbd64cc28074f6ee4ae1`

Immediately read back Group 3 and prove: only the ERP repository remains selected, `restricted_to_workflows=true`, the one selected-workflow string is exactly the value above, and the runner list is still zero. Any discrepancy stops the stage.

Agent 13 may then implement and execute only the contract's exact, non-secret Provision/evidence stage. Before any Auth, Snyk, or credential, it must provide a ledgered, independently reviewable result for: immutable base/checksum/Secure-Boot/VHDX identity; named internal switch/NAT with no static mapping or port proxy; one non-login/no-sudo runner identity; no host/profile/personal/production credential or mount; protected JIT input and post-job de-registration; guest-local Docker; every dynamic Docker mapping plus matching guest and host listener evidence; host-to-guest/NAT and guest-to-host probe failures; outbound GitHub HTTPS success; and exact cleanup/destroy/recreate with zero residue.

Firewall and Hyper-V controls must be tested for behavior, not inferred from a rule name: document the actual filter values and prove they block host/private/LAN paths without blocking the guest-local loopback control. Any wildcard/LAN listener, port proxy, NAT mapping, probe failure, cleanup ambiguity, credential exposure, or unexpected target is a runner **NO-GO**.

## Independent release blockers

This limited static acceptance does not clear gitleaks, Snyk, Semgrep, Trivy, Auth/RLS/13-role evidence, protected environment, read-only production parity, migration lineage, or ABI/fractional-quantity commercial decisions. All remain **NO-GO** for release and production.

→ **Handoff to Agent 13.** Apply only the exact Group 3 workflow-selection change above, read it back, then produce the constrained non-secret Provision/containment/rollback evidence. Return it to Agent 12 before Auth, Snyk, full CI, or release work.
