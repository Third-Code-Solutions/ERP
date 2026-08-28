# Agent 13 — disposable Supabase containment repair

**Date:** 2026-08-28
**Owner:** Agent 13 — CI/CD & Ops
**Source candidate inspected:** `761abf7eb0589579c79e83cc0fe8f17b8cde3b36`
**Decision:** **HARNESS REPAIRED; LOCAL CONTAINMENT BLOCKED; RELEASE NO-GO.**

## Scope and sources

This is Stage 2 of
`docs/handoffs/2026-08-28-disposable-supabase-containment-repair.md`, following
the accepted Agent 12 pre-credential contract. It changes only the local
disposable CI harness, its regression tests, and this record. It does not
change RLS, Auth behavior, migrations, Docker Desktop or daemon settings,
Windows firewall/ACL/UAC state, runner state, billing, providers, production,
or deployment.

Primary-source refresh retrieved 2026-08-28:

- [Supabase local development](https://supabase.com/docs/guides/local-development)
  recommends a custom bridge network with
  `com.docker.network.bridge.host_binding_ipv4=127.0.0.1`, but also says a
  local stack must never be publicly exposed.
- [Supabase CLI reference](https://supabase.com/docs/reference/cli/supabase-start)
  documents `--network-id` and `--workdir` as global CLI flags. Local installed
  help, not the mutable web reference, was used as the command contract.
- [Docker port publishing](https://docs.docker.com/engine/network/port-publishing/)
  states that omitted host addresses publish on host addresses, while explicit
  `127.0.0.1` or `::1` restricts access to the Docker host.
- [Supabase changelog](https://supabase.com/changelog) was refreshed only as
  version-change context; it does not authorize changing the pinned CLI.

Installed execution versions: Node `22.23.2`, pnpm `10.33.0`,
`supabase@2.109.1`, Docker client/server `29.7.2`. The installed `start`,
`stop`, `status`, and `db reset` help confirms that `--network-id` and
`--workdir` apply to these commands; `stop --all` was neither used nor added.

## Repository repair

The former workflow treated a custom network as proof, passed its name rather
than its inspected immutable ID, reset before any binding check, checked Docker
metadata only, and used a historical five-port cleanup allowlist. The repaired
harness now:

1. creates a run-unique project identity (`erp-ci-<run>-<attempt>`) in an
   isolated workdir under `tmp/self-hosted-ci`; it copies local configuration
   and migrations but explicitly excludes the existing source
   `supabase/.temp` linked-project state without reading or removing it;
2. creates the requested bridge network, reads back its exact Docker ID, and
   passes that ID—not its name—to Supabase;
3. enumerates only containers attached to the exact generated network and
   records safe identity fields, Docker `.NetworkSettings.Ports`, and mounted
   volume names; no full container inspect, status output, URL, or credential
   is written to a log or artifact;
4. dynamically validates every non-null Docker publication and the exact
   Windows `Get-NetTCPConnection` listener for every discovered TCP host port;
   only literal `127.0.0.1`/`::1` are accepted, and configured API/DB ports
   must be published and reconciled before `db reset`, `status`, or Auth;
5. preserves the existing process-scoped/masked runtime-value path and
   dedicated no-skip Auth test, but can reach them only after containment; and
6. performs unconditional targeted teardown using the unique project ID,
   inspected network ID, recorded containers/volumes, dynamic port union, and
   the exact current-run workdir/state paths. It never uses a prune,
   `supabase stop --all`, a project-name glob as a removal target, or the
   previous five-port allowlist.

New Node regression coverage exercises positive loopback evidence and rejects
wildcard Docker metadata, wildcard Windows listeners, missing listeners, and
unbound API/database ports. A second regression test locks in ordering
(containment before reset/status), network-ID use, dynamic ownership, source
`.temp` exclusion, targeted cleanup, and the absence of broad cleanup.

## One bounded runtime attempt and cleanup

The one permitted generated run was:

| Field | Non-secret value |
| --- | --- |
| Run project | `erp-ci-8282026-1` |
| Generated network | `third-code-erp-ci-8282026-1` |
| Generated network ID | `ea571fa2623bb2c510e383c606a9eeacd625b14ae3404df509d034d0caaf380f` |
| Partial run container | `supabase_db_erp-ci-8282026-1` |
| Explicit reset/status/Auth execution | **None** |

The start command received the inspected network ID. The process was
interrupted while Supabase was starting, before the verifier could inventory
all containers; two PowerShell lifecycle defects surfaced only on that failed
path (the automatic `$Matches` variable collision and a blank Docker template
line). Both are fixed and covered by static lifecycle assertions.

Before any explicit reset, status value, runtime credential, or Auth test,
Windows listener evidence for the run-owned database port `54322` showed both
`::1` and wildcard `::`. The prior reproducible run with the same pinned CLI
and Docker server already captured the matching Docker metadata as
`0.0.0.0:54322` and `[::]:54322` (and the same wildcard pattern for each other
published service). The new exact-network-ID attempt therefore corroborates,
rather than clears, the host-containment blocker. It is not containment PASS
evidence and did not advance the Auth lane.

The targeted teardown was then executed with the state above. It verified the
network attachment before stopping; after the CLI stop left the uniquely owned
stopped container attached, it removed that exact container only, then its
exact network/volumes. Final checks passed: no run-owned container, volume,
network, run workdir, state/evidence file, or listener on the union of the
configured baseline and discovered ports remained. No other Docker resource
was touched.

## Verification

| Check | Result |
| --- | --- |
| PowerShell parse: start/stop harness | **PASS** |
| `pnpm test:supabase-containment` under Node 22 | **PASS** — 7/7 tests |
| `pnpm ci:actionlint` | **PASS** — Actionlint 1.7.12 |
| `pnpm verify:workflow-action-refs` | **PASS** — all four workflow actions resolved |
| `git diff --check` | **PASS** |
| Real local containment | **BLOCKED** — wildcard Windows listener observed before the credential boundary |
| Auth Admin API zero-skip proof | **NOT RUN** — correctly ineligible |

## Release effect and handoff

The repository now fails closed with an auditable, dynamically scoped
containment gate and targeted teardown. It cannot make this Docker Desktop host
produce a local loopback-contained Supabase publication. No Auth result exists,
so this cannot hand off to Agent 04.

→ Return to **Agent 01 / the earliest production-release gate** with
**NO-GO** intact. Inputs: this record, Agent 12's containment contract, the
earlier complete wildcard Docker-binding table, and the targeted teardown
result. A future safe path needs a separately authorized containment-capable
host or a reviewed host-security decision; it must not bypass the new
two-source gate.
