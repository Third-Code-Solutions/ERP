# Agent 12 disposable Supabase pre-credential containment contract

**Date:** 2026-08-28
**Owner:** Agent 12 — Security / DevSecOps
**Current source reviewed:** `47d0e41c0aef83c3e2c2947a0d8cf6d8588b22ce`
**Decision:** **CONTRACT ACCEPTED; CURRENT HARNESS NOT ACCEPTED FOR EXECUTION.**
This accepts the precise repository-local boundary Agent 13 must prove before
any disposable runtime value is read. It neither approves the present Docker
network option nor authorizes host, runner, provider, production, or release
changes. Production remains **NO-GO**.

## Primary source refresh — retrieved 2026-08-28

- [Supabase local development](https://supabase.com/docs/guides/local-development)
  recommends a custom Docker network with
  `com.docker.network.bridge.host_binding_ipv4=127.0.0.1` on untrusted
  networks and states that a local stack must never be publicly exposed. That
  option expresses intent; it is not sufficient evidence when effective
  mappings disagree.
- [Supabase CLI start reference](https://supabase.com/docs/reference/cli/supabase-start)
  states that `supabase start` starts all service containers by default. The
  current reference must not be used to infer flags for the repository-pinned
  `supabase@2.109.1`; Agent 13 must record the installed `start`, `status`, and
  `stop` help before implementation.
- [Supabase CLI changelog](https://supabase.com/changelog?tags=cli) and the
  current [CLI release record](https://github.com/supabase/cli/releases) show
  later CLI/local-stack changes, including a recent `supabase start` fix for
  confined Docker installs. This is an evidence refresh, not authorization to
  change the pinned CLI or image topology. Actual containers/images must be
  inventoried on every run.
- [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/)
  states that a mapping without an explicit host address is published on host
  addresses and that explicit `127.0.0.1` and/or `::1` limits access to the
  Docker host. It also shows that `docker inspect` exposes the effective
  `HostIp`/`HostPort` mapping. Therefore `0.0.0.0`, `::`, any LAN address, or
  an unverifiable mapping is an immediate containment failure.

## Current read-only assessment

The current `ci-self-hosted.yml` correctly preserves several security
properties: the Auth suite is explicit, `status --output env` is captured rather
than printed, values are masked before a child process runs, they are cleared in
`finally`, both reports require the no-skip helper, and cleanup is unconditional.
The runtime resolver independently rejects absent, placeholder, hosted, and
non-loopback values.

It is nevertheless **not acceptable to execute** against the contract:

1. It performs `supabase db reset` before inspecting any effective publication.
2. It checks only Docker port metadata, not host listeners for the same actual
   host ports.
3. Its known listener set is the historical five ports (54321, 54322, 54323,
   54324, 54327), while the local configuration and current CLI may expose a
   different topology. A hard-coded list cannot prove every actual publication.
4. The last actual run on Docker Desktop server `29.7.2` and pinned CLI
   `2.109.1` produced wildcard IPv4 and IPv6 publication on all five observed
   ports. It correctly stopped before reading credentials or invoking the Auth
   suite, but that result proves the requested network option alone is unsafe.
5. Its cleanup has the right fail-closed intent, but the project identity is
   currently the fixed local `erp` project name. The repair must prove each
   cleanup target is attached to the exact generated run network before issuing
   a stop or removal command.

## Accepted pre-credential contract

### 1. Preflight identity and zero-state

Before starting a stack, Agent 13 must record only non-secret facts: candidate
SHA, run/attempt identity, repository-pinned CLI version, Docker client/server
version, installed `supabase start/status/stop --help` output or a stable digest
of it, `supabase/config.toml` project/config identity, and the exact generated
network name and Docker network ID.

The preflight must fail if any prior resource bearing the same local Supabase
project identity, exact generated network, run-temporary path, or any listener
on the configured baseline ports exists. The baseline includes 54321, 54322,
54323, 54324, and 54327; configuration-enabled or runtime-discovered additions
extend it. The preflight must enumerate before acting and must not remove a
resource merely because its name resembles a test resource.

### 2. Effective-publication proof before reset, status, or credentials

After `supabase start` and **before** `db reset`, `status`, any connection, or
the Auth test, the harness must enumerate every started container connected to
the exact generated network. Its non-secret evidence must contain only safe
identity fields (container ID/name, image, network ID/name) and effective port
metadata from `.NetworkSettings.Ports`; it must not emit full container inspect
output, environment, labels that could carry values, endpoint credentials, or
URLs containing credentials.

For every non-null published `containerPort -> HostIp:HostPort` mapping on every
run-owned container, the harness must:

1. reject an empty, malformed, duplicate/ambiguous, wildcard (`0.0.0.0` or
   `::`), or non-loopback `HostIp`;
2. accept only literal `127.0.0.1` and/or `::1` with a valid numeric HostPort;
3. query host listener evidence for that exact TCP HostPort; and
4. reject a missing listener, a listener on wildcard/LAN/non-loopback address,
   or listener metadata that cannot be reconciled with the Docker mapping.

The auth gateway/API and PostgreSQL database mappings required by
`SUPABASE_AUTH_API_URL` and `DATABASE_URL` must be present and pass this proof.
Any additional publication discovered at runtime is in scope immediately; an
unbound required service, an uninspected publication, or a local connection
that happens to succeed is not a substitute for this two-source proof.

The prior Kong, PostgreSQL, Studio, Inbucket, and Analytics ports are examples,
not an allowlist. `supabase start` currently starts all service containers by
default, and the contract follows actual started topology rather than a service
name assumption.

### 3. Credential and Auth-proof boundary

Only after every mapping and listener passes may the harness run `db reset` and
capture `supabase status --output env` into process memory. It must validate the
required values without logging them, issue GitHub masks before starting a child
process, set only the three runtime variables for the dedicated test process,
and remove them in `finally`.

Credentials, endpoint values, opaque invitation tokens, token hashes, full
container inspections, and status output are prohibited from logs, JSON
reports, artifacts, commits, browser variables, caches, and direct-SQL
substitutes. The existing dedicated `test:auth-api` and no-skip assertion remain
mandatory; a generic test pass, placeholder, stale report, or direct database
insert cannot satisfy ADR-030.

### 4. Mandatory negative paths

Any preflight, CLI-help/version, stack-start, ownership, metadata, listener,
reset, status, runtime-validation, Auth-test, report-validation, or cleanup
failure fails the entire Auth lane. No `continue-on-error`, conditional green
path, skipped suite, cached report, or later job may convert that outcome to
passing evidence. Binding failure occurs before credentials are read and before
the database reset.

### 5. Targeted unconditional teardown and zero residue

Cleanup must run after every outcome, including a failed start or binding check.
Before stopping/removing anything, it must read-only enumerate and prove that
each target belongs to the generated network and current project/run identity.
It may stop only that local stack, remove only the exact generated network, and
remove only current-run temporary state/reports. Broad `prune`, `stop --all`,
unvalidated glob, or removal of another project is prohibited.

The final non-secret record must show zero run-owned containers, volumes,
network, temporary report/state paths, and listeners on the union of configured
baseline and runtime-discovered published HostPorts. A cleanup ambiguity or any
residue fails the lane even if tests passed.

## Release effect and handoff

This source-level contract is accepted because it is explicit, testable,
fail-closed, and does not require an unapproved host change. It does **not**
accept the existing harness, the current runner-isolation plan, or the prior
wildcard run as containment evidence.

→ Handoff to Agent 13. Reason: the exact pre-credential boundary and
non-secret evidence are now defined. Inputs: this changeset, the prior
wildcard-binding table, current official sources, and the current harness. The
only permitted next step is a repository-scoped containment repair that proves
this contract—or a documented blocker with the same targeted zero-residue
cleanup. If the host cannot meet it without Docker/Desktop, firewall, ACL, UAC,
runner, provider, or billing changes, stop and escalate that separate decision;
do not run the Auth proof under wildcard publication.

All hosted security/billing/Snyk, runner-isolation, production-environment,
production-parity/recovery, and ABI commercial blockers remain independently
**NO-GO**.
