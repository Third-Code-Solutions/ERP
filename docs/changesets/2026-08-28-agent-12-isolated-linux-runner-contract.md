# Agent 12 isolated Linux runner containment contract

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Current source reviewed:** 43f19a39c7425797920f89f03c82bac344dcea2a
**Decision:** **WSL2 REJECTED as the isolated runner boundary. A fresh Hyper-V guest contract is conditionally ACCEPTED; no runner is approved or executable yet.** Production remains **NO-GO**.

This is Stage 1 of [the no-cost release-control recovery handoff](../handoffs/2026-08-28-no-cost-release-control-recovery.md). It authorizes neither an implementation nor a host, provider, workflow, secret, database, billing, or deployment change. Agent 13 may use the accepted Hyper-V contract only for its exact-target preflight and must stop at any failed condition below.

## Official evidence refresh — retrieved 2026-08-28

- GitHub's [secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use) says self-hosted runners do not guarantee a clean, ephemeral VM and can be persistently compromised; ephemeral/JIT registration does not sanitize reused hardware. It also warns that Docker-socket access can affect other jobs and containers, and requires least-privilege secrets and full-SHA action pins.
- The [self-hosted runner reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners) recommends ephemeral runners for one job but requires the operator to wipe the environment afterwards. It lists Linux plus Docker as required for Docker actions/service containers, and documents required outbound HTTPS connectivity.
- GitHub's [runner-group access guidance](https://docs.github.com/en/actions/how-tos/manage-runners/self-hosted-runners/manage-access) permits selected-workflow access only with a fully qualified owner/repository/path pinned to a branch, tag, or full SHA; only jobs directly defined in that workflow can use the group.
- Docker [port publishing](https://docs.docker.com/engine/network/port-publishing/) treats published ports as externally available by default and accepts only 127.0.0.1/::1 as host-only publication. Docker [security](https://docs.docker.com/engine/security/) states that only trusted users may control a daemon because they can mount and alter the daemon host filesystem.
- Microsoft documents that WSL automount=false disables automatic fixed-drive mounting but still permits manual or fstab mounting, and that WSL2 normally forwards Linux wildcard/localhost listeners to Windows localhost. See [WSL configuration](https://learn.microsoft.com/en-us/windows/wsl/wsl-config) and [WSL networking interop](https://learn.microsoft.com/en-us/windows/dev-environment/wsl-interop).

## Read-only current evidence

| Area | Non-secret evidence | Result |
| --- | --- | --- |
| GitHub group | Group 3, erp-ci-isolated, is non-default and selected for exactly private Third-Code-Solutions/ERP (ID 1234811736), has restricted_to_workflows=true, and has zero runners. | **PASS, narrowly scoped.** |
| Workflow restriction | Selected workflow: Third-Code-Solutions/ERP/.github/workflows/ci-self-hosted.yml@82615eb72d64b4d32bacfb9a218525d8834fdaa7. Current HEAD is 43f19a39…, its workflow blob is 451d2ec4…, and the job still requests Windows plus third-code-erp-ci. | **BLOCKED.** This selected immutable workflow is not the Linux workflow revision/labels. |
| Desktop capacity | Windows reports build 26100, Pro edition, hypervisor present, 12 logical CPUs, 31.9 GiB RAM, and 501.1 GiB free on D:. | Sufficient capacity is not isolation evidence. |
| Hyper-V access | Hyper-V cmdlets exist; direct Get-VM and Get-VMSwitch reads return authorization failures. | **BLOCKED:** current desktop identity has no management authority. |
| WSL state | WSL 2.7.12.0 lists Ubuntu and docker-desktop as WSL2 plus a stopped unrelated ThirdCodeERP-Test WSL1 distribution. Existing guests were not started or inspected. | No fresh dedicated guest exists; global/per-user WSL configuration would affect other guests. |
| Docker Desktop | Docker client/server 29.7.2. Existing unrelated Desktop containers include Redis workloads and nginx-test with wildcard 0.0.0.0:8080. No listener exists on 54321, 54322, 54323, 54324, or 54327. | Shared Desktop Docker is ineligible and these objects must remain untouched. |
| Old Windows runner | D:\actions-runner has old binaries and _work but no Windows service under that path. | It is not an approved runner identity or clean boundary. |
| Firewall/Snyk | All Firewall profiles are enabled, but no per-guest proof exists. The Snyk CLI is absent. | Separate security-gate blockers remain. |

## WSL2 rejection

A freshly imported WSL2 distribution with automount and interop disabled, a Linux-owned VHD, internal dockerd, a non-interactive runner account, and no copied host credentials is **not accepted** for this boundary.

1. Docker access makes the job effectively root in the guest. Microsoft explicitly states that disabled automount does not prevent manual fixed-drive mounting. The claimed no-mount state is therefore only an initial observation, not a durable authorization boundary against a compromised job.
2. WSL2 localhost forwarding and NAT are host/user integration features; localhost forwarding is enabled by default and WSL configuration has impact beyond one disposable job. Changing it would affect the existing Ubuntu and Docker Desktop WSL guests.
3. A WSL guest can reach Windows-hosted services through the host-side NAT path. Current Firewall profile status does not prove a per-distribution lateral block. The observed Desktop wildcard listener makes this present, not theoretical, risk.
4. Disabling Windows interop and declining the Docker Desktop socket reduce exposure but do not turn a Docker-root-capable WSL guest into a separate security principal. Recreate-on-cleanup cannot undo host access that occurred during a job.

No WSL import, .wslconfig change, guest creation, Docker installation, runner registration, or test may proceed under this contract. A WSL run may not be used for Auth, Snyk, or release evidence.

## Conditionally accepted Hyper-V contract

The only accepted local route is a fresh Generation 2 Hyper-V VM, with a unique run identity such as third-code-erp-ci-<run-id>-<attempt>, destroyed after one job. Its VHDX and all guest work/data live under a dedicated run directory on D: and are Linux filesystems. No Windows drive, Desktop profile, mapped share, clipboard, enhanced-session drive, USB/device pass-through, RDP share, or Docker Desktop resource may be exposed.

The runner account's access to its guest-local Docker daemon is an explicit guest-root residual risk, not a low-privilege label. It is accepted only for the trusted restricted workflow with no production credential and a whole-guest destroy/recreate lifecycle.

### 1. Exact host and group preflight

Before creating anything, Agent 13 must record only candidate SHA; workflow path/ref; group/API read-back; runner list; Windows/Hyper-V version; exact existing VM/switch/NAT/port-proxy/firewall inventory; Docker Desktop resource/listener inventory; and D: capacity. Any unexpected target stops the stage without broad removal.

All conditions below must pass:

1. An authorized identity can manage Hyper-V. Current access denied is a blocking capability gap until separately authorized elevation/role assignment. Existing VM, switch, NAT, WSL, Docker Desktop object, or old D:\actions-runner file must never be re-used or removed.
2. The base is a current supported Ubuntu LTS image from its official publisher. Record source URL, release identifier, published checksum/signature reference, downloaded SHA-256, VM generation, Secure Boot state, and guest-disk hash before first boot. Mutable/latest sources, unverifiable archives, and existing VHDs fail.
3. Before registration, group 3 still has exactly the ERP repository, zero runners, and one selected workflow string using the full SHA of the newly reviewed Linux workflow. The workflow must select only group erp-ci-isolated and Linux/x64 with a distinct third-code-erp-ci-linux label, retain exact repository/owner/manual-dispatch/actor/triggering-actor/candidate-ref guards, and exclude Default, PR/fork/workflow_run/pull_request_target paths.
4. The planned VM, VHD directory, internal-vSwitch, NAT subnet/name, Hyper-V/Windows Firewall rule names, runner name, and work root carry the unique run identity and do not collide. Default Switch, external/bridged switch, and Desktop Docker/WSL networks are forbidden.
5. Before any secret stage the guest has no production/host credential, interactive gh configuration, personal GitHub token, browser profile, Git helper, SSH key, mapped drive/share, or existing runner state. Snyk absence never permits account creation or a weakened gate.

### 2. Guest, Docker, and JIT identity

The VM uses a named internal vSwitch plus named NAT only for outbound operation. It has no inbound NAT/static port mapping, netsh port proxy, host-to-guest share, enhanced-session device channel, or Desktop Docker integration. The guest uses a dedicated non-login runner service account without sudo or SSH/console access. Runner root, _work, Docker/containerd data, and checkout resolve inside the VM ext4 VHDX.

Before connecting a runner, evidence must show:

- no drvfs, 9p, cifs, smb, host path, or removable share in guest mounts;
- no DOCKER_HOST, Docker Desktop context/socket, /mnt/wsl, or mounted host Docker data; dockerd and all daemon data are guest-local;
- no inherited host profile, gh configuration, or production value for runner; and
- Docker socket membership is recorded as guest-root power and only the selected trusted workflow may reach it.

A pre-existing authorized host context may produce one GitHub JIT configuration for group 3 and the exact Linux label. The host credential remains in its secure store. The JIT configuration or registration material may enter the guest only through one protected process input, never a command argument, file, shell history, report, cache, or artifact. Record only runner ID/name, group ID, label, candidate SHA, timestamps, and post-run de-registration.

### 3. Network and containment proof

Host Firewall profiles and Hyper-V filtering must deny all unsolicited inbound VM traffic and guest access to Windows-host/private/LAN services, except narrowly documented NAT/DNS functions needed for outbound operation. Rules must be scoped to the named VM/interface, never be a global reset. A disposable named host probe must prove that the guest cannot connect to a host service; an outbound GitHub HTTPS control must pass. Both exact rules/probe resources are then removed.

The existing local Supabase containment harness must be ported to Linux before a real Auth lane. Before db reset, status, any connection, or any credential, it must:

1. enumerate every current-run guest Docker container attached to the exact generated network, recording only ID/name/image, network ID/name, port metadata, mounted-volume names, and the dynamic port union;
2. accept only 127.0.0.1 and/or ::1 for every Docker mapping and reconcile it with guest ss/equivalent TCP listener evidence on the same address/port; wildcard, LAN, missing, malformed, duplicate, or unreconciled evidence fails;
3. prove no host wildcard/LAN listener, NAT mapping, or port-proxy exposure for the dynamic union. The known 54321, 54322, 54323, 54324, and 54327 ports are examples only. A host-to-guest-NAT-IP attempt must fail while a guest-local loopback control succeeds. A host listener is acceptable only when it is exactly loopback and reconciles; no host listener is acceptable only with no forwarding/mapping and a successful guest-local control; and
4. only then derive process-scoped masked runtime values, execute the real ADR-030 Auth proof and 13-role matrix, clear values in finally, and reject direct SQL, stale report, placeholder, or skipped-suite substitutes.

The current harness has source-level dynamic binding/listener tests (7/7) but no Linux execution result. Its prior Desktop wildcard failure is not cleared.

### 4. Cleanup, rollback, and stop conditions

Every outcome needs a finally/watchdog cleanup. Before any removal, each object is verified against the current-run ledger. In order:

1. stop the runner and verify GitHub deregistered it from group 3;
2. remove only current-run guest Docker containers, volumes, networks, reports, and dynamic-port listeners using the prior Agent 12 pre-credential zero-residue contract;
3. remove only the named current-run VM, VHD directory, internal switch/NAT, and Firewall/probe rules after identity read-back; and
4. prove zero current-run runner, VM, VHDX, switch, NAT, firewall rule, port proxy, Docker resource, report/work directory, or listener residue.

No prune, default-switch operation, WSL reset, Docker Desktop cleanup, group deletion, Firewall reset, wildcard resource selection, production/provider access, or deployment is permitted. Failed cleanup is a runner **NO-GO**, even if the job passed. The same ledgered removal path is the rollback and must pass a non-secret smoke job before Auth, Snyk, or a release matrix is allowed.

## Residual risks and release effect

Docker remains guest-root capability; malicious dependency or trusted-code compromise can control the guest for the job. A VM/kernel escape, incorrect Firewall configuration, or later unauthorized workflow/group update cannot be eliminated here. The contract reduces exposure by removing host mounts, host credentials, production values, shared Docker, inbound/lateral paths, Default-group access, and guest reuse. It does not authorize Snyk token use until the later Agent 12 provenance review.

No real Auth proof, 13-role matrix, Snyk, Semgrep, Trivy, hosted CI, protected environment, production parity/recovery evidence, or ABI commercial decision is complete. Each remains independently **NO-GO**.

→ **Handoff to Agent 13.** WSL2 and shared Docker Desktop are rejected. Begin only the exact Hyper-V capability/target preflight; then either produce ledgered Hyper-V smoke evidence with tested rollback or report a blocker. Do not register a runner, change group/workflow, create VM/switch/NAT/Firewall rule, read/set a secret, run Auth/Snyk, or touch production until the preflight conditions are met.
