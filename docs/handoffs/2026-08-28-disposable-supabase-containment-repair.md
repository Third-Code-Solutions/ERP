# Disposable Supabase containment repair handoff

**Date:** 2026-08-28
**Owner:** Agent 01 — Product/PRD Guardian
**Decision:** **FAIL CLOSED — production remains NO-GO.**

## Trigger and verified facts

Agent 13's Node 22 local release-matrix record
[`docs/changesets/2026-08-28-agent-13-preproduction-local-gate.md`](../changesets/2026-08-28-agent-13-preproduction-local-gate.md)
proves a disposable local Supabase containment failure, not an Auth-test failure.
On Docker Desktop server `29.7.2`, pinned `supabase@2.109.1` started the
short-lived stack with the following effective host bindings despite the
attempted Docker loopback host-binding option:

| Disposable service | Port | Observed publication |
| --- | ---: | --- |
| Kong | 54321 | `0.0.0.0:54321` and `[::]:54321` |
| PostgreSQL | 54322 | `0.0.0.0:54322` and `[::]:54322` |
| Studio | 54323 | `0.0.0.0:54323` and `[::]:54323` |
| Inbucket | 54324 | `0.0.0.0:54324` and `[::]:54324` |
| Analytics | 54327 | `0.0.0.0:54327` and `[::]:54327` |

The test stack was correctly blocked before credentials were derived or the
real Auth Admin API suite was invoked. The required `test:auth-api` evidence
is therefore **NOT RUN**, not passed and not replaced by the generic test
matrix. Each uniquely named test stack was stopped with its exact local
Supabase/network target. The post-teardown record showed zero matching
Supabase containers, volumes, named test networks, and listeners on those five
ports. No production/provider mutation, deployment, UAC elevation, firewall,
host ACL, or Docker Desktop settings change occurred.

The existing loopback configuration is not accepted as evidence. Effective
container metadata and host listeners override an intended flag or a successful
local connection when deciding whether the Auth lane may run.

## Product and release boundary

The repaired local Auth proof remains a mandatory prerequisite from
[`docs/handoffs/2026-08-28-preproduction-release-gate-repairs.md`](2026-08-28-preproduction-release-gate-repairs.md)
and ADR-030. It must use the real disposable Supabase Auth Admin API and prove
the canonical 13-role contract with zero skips. It cannot use direct SQL,
placeholder values, a generic-test pass, a stale report, or a skipped suite as
a substitute.

This handoff changes no product requirement and creates no ADR: it records a
proven harness containment defect and routes its repair to the existing
security, CI/Ops, and database/Auth owners. It does not authorize a different
host-containment architecture. If a repository-local harness cannot prove the
required boundary without a host or provider change, the correct outcome is a
documented blocker and a separate authorization/decision—not an unsafe test
run.

All independent production blockers remain: current hosted CI/Actions
capacity evidence, current Snyk/Semgrep/Trivy evidence, protected production
environment/recovery evidence, read-only production migration/schema parity,
and ABI O-01/O-14 plus the fractional-quantity/DUPA decision. A contained local
Auth pass is CI evidence only and cannot clear any of them.

## Current official evidence required for the repair

Before proposing or changing the harness, Agent 13 must refresh and cite the
current official material below, capture its retrieval date, and record the
exact Supabase CLI and Docker Engine/Desktop versions used. The next agent must
also record the exact command help for every Supabase command it intends to use;
CLI flags must not be guessed.

1. [Supabase local development](https://supabase.com/docs/guides/local-development)
   documents a custom Docker network with
   `com.docker.network.bridge.host_binding_ipv4=127.0.0.1` and warns that a
   local stack must not be exposed on an untrusted network.
2. [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-db-advisors)
   documents the local-stack lifecycle and notes that `supabase start` starts
   all containers by default. Validate the installed CLI's `start`, `status`,
   and `stop` help rather than deriving flags from this reference.
3. [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/)
   documents that unspecified host addresses publish to all host addresses
   (`0.0.0.0` and `[::]`). It is the reference for inspecting effective
   publication, not merely the requested network option.
4. [Supabase changelog](https://supabase.com/changelog.md) must be scanned for
   relevant local/self-hosted/CLI breaking changes before implementation. The
   current changelog contains gateway changes, so actual image/container
   topology must be captured rather than assumed from a service name.

The first source describes the option that was attempted; the observed wildcard
listener table proves that this host did not obtain the intended effect. Any
proposed repair must resolve that discrepancy with current official evidence and
a fresh actual-binding test.

## Strict sequential ownership

Each receiving agent re-reads `AGENTS.md`, this handoff, the immediately prior
changeset, and its own scope before acting. Stages are strictly sequential. A
failure, unexpected target, missing evidence, or any proposal requiring a
forbidden host/provider change stops the sequence and preserves **NO-GO**.

### 1. Agent 12 — define and approve the containment contract

**Reason:** the failure is a local network/credential boundary. Agent 12 owns
the security definition and final independent review.

**Inputs:** this handoff; ADR-030; the Agent 13 local-gate changeset; current
official sources above; current workflow/test report handling; and the
self-hosted-runner isolation record. Do not treat the runner's separate,
not-yet-approved firewall/UAC plan as authorization for this work.

**Required output:**

1. Define the testable pre-credential contract: every published Supabase port
   must bind only to `127.0.0.1` and/or `::1`, as explicitly required by the
   implemented harness. `0.0.0.0`, `::`, any LAN address, an uninspected
   publication, or an unbound-but-required service is a failure. The
   verification must use effective Docker port metadata *and* host listener
   evidence for all started Supabase containers, including the five observed
   ports above and any newly exposed port.
2. Require a preflight with no existing exact test resources or listeners, and
   a non-secret evidence format that proves the source/target identities,
   bindings, images, and versions without reporting endpoint credentials.
3. Define secret handling: derive the Auth Admin API values only after the
   containment check passes; keep them process-scoped/masked; prohibit logs,
   artifacts, commits, caches, browser variables, and direct-SQL equivalents.
4. Define the mandatory negative path: any failure in containment, stack
   start, status, test, report validation, or targeted teardown fails the lane;
   no `continue-on-error`, skip, stale report, placeholder, or generic pass may
   convert it to green.
5. Write an Agent 12 changeset stating a preliminary accept/reject of this
   contract. It is not a production approval.

**Must not:** change RLS/Auth behavior, a workflow, a Docker/Windows setting,
firewall rule, host ACL, local account/service, runner group, billing, provider
settings, production data, or deployment configuration.

**Exit criteria:** a precise, evidence-based, fail-closed containment contract
is accepted for the repository-local harness; otherwise record the rejection
and stop.

> → Handoff to Agent 13. Reason: Agent 12 has defined the exact boundary and
> non-secret evidence that the disposable harness must satisfy. Inputs: Agent
> 12 contract/changeset, fresh official sources, and the prior failure table.
> Expected output: a repository-scoped containment repair or a reproduced
> documented blocker, with targeted cleanup on every outcome.

### 2. Agent 13 — repair only the disposable CI/Ops harness containment

**Reason:** local stack lifecycle, Docker resource ownership, CI contract, and
cleanup are CI/Ops responsibilities.

**Inputs:** Agent 12's accepted contract; the failed local-gate changeset;
`.github/workflows/ci-self-hosted.yml`; relevant local-stack harness files;
the installed command help; current official sources; and the separate runner
isolation boundaries.

**Required output:**

1. Select and implement only a repository-scoped, disposable mechanism that
   can actually produce the Agent 12 loopback-only contract on this host. Do
   not reuse the previous network option as proof. Preserve a fail-closed
   binding inspection before runtime values are read or Auth tests are started.
2. Capture exact, non-secret start/status/inspect/listener evidence for a
   uniquely identified run. If images or current Supabase behavior differ from
   the prior Kong/Inbucket topology, inventory the actual containers and apply
   the contract to every published port, not a hard-coded five-port subset.
3. Make the containment check, local-stack lifecycle, and cleanup required for
   the dedicated Auth lane. A condition or failure must not let later checks
   appear green. Do not edit database assertions or reduce the zero-skip
   contract.
4. Use only targeted cleanup proven to belong to this run. Before removing a
   resource, enumerate and validate its exact project/network/container/volume
   identity. In an unconditional final path, stop/remove only that stack and
   its exact disposable network, volumes/state, temporary reports, and
   listeners. Verify zero residue afterward.
5. Record exact commands, versions, candidate SHA, created resource IDs/names
   (non-secret), port-binding evidence, test eligibility outcome, teardown
   output, and any blocker in an Agent 13 changeset.

**Must not:** invoke UAC; create or modify a Windows account/service; change
Firewall, host ACLs, Docker Desktop/daemon settings, billing, runner groups,
production/provider configuration, or deployment; use broad cleanup such as
`docker system prune`, volume/network prune, `supabase stop --all`, or an
unvalidated glob; link to or reset a hosted Supabase project; relax the binding
check; or run Auth against wildcard publication.

**Exit criteria:** a fresh isolated stack proves only loopback publication for
every exposed service, or Agent 13 records a reproducible blocker. Either
outcome has a targeted, verified zero-residue teardown. Only the former may
hand off the Auth proof; the latter returns to Agent 01 with **NO-GO** intact.

> → Handoff to Agent 04. Reason: Agent 13 has supplied an actual,
> loopback-contained disposable stack and non-secret evidence. Inputs: Agent
> 13 changeset, process-scoped runtime contract, candidate SHA, exact test
> command, and teardown plan. Expected output: real zero-skip ADR-030 Auth
> Admin API proof, followed by the same targeted teardown verification.

### 3. Agent 04 — run the real Auth proof with zero skips

**Reason:** the required invitation/Auth contract and its test configuration
are database/Auth responsibilities.

**Inputs:** ADR-030; Agent 13's containment PASS evidence; the existing
`test:auth-api` configuration and no-skip helper; the local runtime values only
while process-scoped; and this handoff.

**Required output:**

1. Confirm the supplied endpoint/database values belong to the just-proven
   loopback-contained disposable stack and that the Auth suite remains the
   sole, explicit dedicated suite. Reject missing, placeholder, stale,
   production, non-loopback, or unverified values before test execution.
2. Execute `test:auth-api` through the actual Supabase Auth Admin API—not
   direct SQL—and retain a machine-readable zero-skip report. It must cover the
   real 13 seeded canonical roles and all ADR-030 negative/tenant/audit cases;
   zero tests, skipped/pending/todo tests, or unequal passed/total counts fail.
3. Preserve the separate raw PostgreSQL/RLS lane. Do not modify migrations,
   schema, RLS, Auth authorization behavior, or generic test selection merely
   to make this runtime pass.
4. Ensure runtime credentials are cleared after the process and are absent from
   all outputs. Invoke or verify Agent 13's targeted teardown immediately after
   both a passing and failing run; record the zero-residue result.
5. Write an Agent 04 changeset with the candidate SHA, command/result counts,
   report validation, source of runtime values in non-secret terms, and
   teardown result.

**Must not:** skip/mark optional the Auth proof; substitute direct SQL,
placeholder credentials, an alternate Auth implementation, or stale output;
change hosted Supabase, providers, production, or deployment state.

**Exit criteria:** the real disposable Auth Admin API proof passes with zero
skips and zero post-run resources/listeners, or the failure is documented and
the release remains **NO-GO**.

> → Handoff to Agent 12. Reason: containment and database/Auth proof now have
> current execution evidence. Inputs: Agent 13 and Agent 04 changesets,
> masked report metadata, cleanup evidence, and candidate SHA. Expected output:
> independent security accept/reject of the actual boundary; no production
> release decision.

### 4. Agent 12 — final independent containment review

**Reason:** a source-level policy is insufficient; Agent 12 must review the
actual run evidence before the local Auth lane can be counted as passed.

**Required output:**

1. Verify the start-time effective binding/host-listener evidence, including
   any changed service topology, proves no wildcard or LAN publication.
2. Verify credentials were not emitted and the real Auth Admin API zero-skip
   report cannot be confused with a no-runtime failure or generic pass.
3. Verify targeted teardown identifies only run-owned resources and proves no
   matching containers, volumes, networks, temporary reports, or listeners
   remain. A successful test with failed cleanup is a failed release gate.
4. Record a dated local-containment PASS only when every item is proven for one
   candidate SHA. Otherwise record the exact failure and keep **NO-GO**.

**Exit criteria:** explicit evidence-based local containment decision. It does
not approve a runner, hosted CI, production parity, ABI commercial readiness,
or deployment.

## Non-negotiable teardown and stop rules

- Teardown is targeted and unconditional, even after an interrupted setup,
  failed binding inspection, failed status query, or failed test.
- Resource discovery is read-only first. Never stop/remove another Supabase
  project or user-owned Docker resource. Do not run a broad Docker, volume,
  network, or Supabase cleanup command.
- A final zero-residue record must show no run-owned containers, volumes,
  networks, temporary report files, or listeners. A stack that cannot be
  accurately targeted for cleanup cannot be started.
- No UAC/firewall/host ACL/Docker Desktop setting change is authorized by this
  handoff. Such a proposal is a separate material host-security decision and
  requires explicit owner authorization after Agent 12 review.
- No production database, managed Supabase, GitHub billing, runner group,
  provider, or deployment mutation is in scope.

## Fail-closed release status

This record replaces no prerequisite and permits no promotion. Until the
minimum sequence above has a current Agent 12 acceptance for one exact
candidate SHA—and all unrelated hosted-security, production-parity,
environment/recovery, and ABI commercial gates have independently passed—the
only honest release status is **NO-GO for production**.
