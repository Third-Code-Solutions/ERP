# No-cost release-control recovery handoff

**Date:** 2026-08-28
**Owner:** Agent 01 — Product/PRD Guardian
**Status:** **AUTHORIZED RECOVERY WORK; PRODUCTION NO-GO.**

## Purpose and authorization boundary

The repository owner has authorized four bounded, no-cost recovery tracks:

1. required host virtualization/network changes for a dedicated isolated,
   ephemeral Linux self-hosted CI runner;
2. use of an existing Snyk authentication/token path, without creating a Snyk
   account or exposing a credential;
3. a controlled local, non-production, schema/metadata-only restore/replay and
   migration-lineage investigation; and
4. documentation of ABI O-01/O-14 and fractional-quantity/DUPA authority.

This authorization permits the reviewed host and local-disposable changes only
after the sequential security gates below. It does **not** authorize a
production database write, production migration, hosted reset/repair, production
deployment, paid service purchase, account creation, force-push, direct push to
`main`, or secret disclosure. It does not convert any local result into a
production-ready result.

The governing release gate remains
[`docs/handoffs/2026-08-28-production-release.md`](2026-08-28-production-release.md).
This document unblocks its prerequisites; it never replaces its production
target, rollback, protected-environment, parity, or post-deploy requirements.

## Current evidence to reconcile

| Area | Verified starting point | Required correction |
| --- | --- | --- |
| Runner | GitHub group `erp-ci-isolated` is selected for only `Third-Code-Solutions/ERP`, but has zero runners. Existing Windows runner design is pending host containment review. | Establish a dedicated Linux execution boundary rather than using the interactive desktop identity, Default group, or a shared runner. |
| Local Auth containment | The new harness dynamically checks Docker metadata and Windows listeners and has local regression evidence (`7/7`). A bounded run still observed wildcard IPv6 `::` on run-owned port 54322 before reset/status/credentials/Auth; targeted teardown left zero residue. | Preserve that fail-closed check. Do not run the Auth suite or hand off to Agent 04 until the Linux runner proves actual loopback-only publication. |
| Snyk | `.github/workflows/security-scan.yml` requires `SNYK_TOKEN`; present records show no accessible Actions secret and no current successful Snyk gate. | Authenticate only with an existing owner-controlled local OAuth/token path, prove a non-secret scan path, and set the exact existing-repository CI secret only if a compatible pre-existing token is available. |
| Migration lineage | Historical recovery evidence identifies six May migration versions that were local-only, while later source/provider evidence reports a 144/147 ledger with three ordered source migrations pending. These are time-stamped observations, not a current reconciled target ledger. | Agent 04 must create a fresh read-only ledger classification that proves the exact six unexpected/local-only and three pending versions—or reports differing counts—before any migration plan is considered. |
| Commercial authority | PRD already defines configurable `vat_base` and says `direct_only` reproduces ABI's existing books. O-14 has no verified accountable ABI identity, and the PRD's `0.10` DUPA example conflicts with integer `bom_line_items.quantity`. | Record O-01 with the authorized default; do not invent an O-14 owner; choose fractional representation only after evidence and as an additive migration path. |

## Evidence and safety rules

All stages are strictly sequential. The receiving owner must re-read
`AGENTS.md`, this handoff, the immediately preceding changeset, and their own
scope. No two owners may edit the same files in parallel. Every stage records
the candidate SHA, exact target identities, non-secret command results,
resources created, rollback target, cleanup result, and remaining blockers.

- Start every mutable local/host stage with a read-only target and state check.
  Abort on an unexpected runner, account, service, VM/guest, Docker resource,
  listener, target, migration version, or credential scope.
- Use exact resource IDs/names, not broad names or globs. No `prune`,
  `supabase stop --all`, `db reset --linked`, migration repair, production
  reset, or unbounded firewall/account cleanup is allowed.
- Credentials stay in an owner-controlled secure store or process scope. Never
  print, commit, upload, serialize, or pass them as a visible command argument.
  Reports contain names, IDs, hashes, and status only.
- The no-cost boundary prohibits a new paid runner, Snyk account/plan, Supabase
  project/branch/clone/PITR add-on, or third-party hosted staging service. If a
  proposed route has a price or needs account creation, stop and record it.
- A local metadata replay may contain no production customer rows, Auth users,
  Storage objects, credentials, or logical data dump. It is not a backup
  restoration drill and cannot establish production data parity.
- An expected failure is a gate result, never an invitation to weaken a control.
  Each stage has an unconditional, exact-target rollback/teardown path.

Current vendor guidance must be refreshed immediately before implementation:
[GitHub secure use for self-hosted runners](https://docs.github.com/en/actions/reference/security/secure-use),
[Snyk CLI authentication](https://docs.snyk.io/snyk-cli/authenticate-to-use-the-cli),
[Snyk CLI configuration](https://docs.snyk.io/developer-tools/snyk-cli/configure-the-snyk-cli/configure-snyk-cli-to-connect-to-snyk-api),
[Supabase backups](https://supabase.com/docs/guides/platform/backups), and
[Docker port publishing](https://docs.docker.com/engine/network/port-publishing/).
The current official sources inform implementation but do not override observed
effective listener, target, or privilege evidence.

## Strict recovery sequence

### 1. Agent 12 — define the isolated Linux runner security contract

**Reason:** the new runner will execute repository code and Docker workloads.
GitHub warns that self-hosted runners are not clean isolated VMs by default;
ephemeral registration alone is not a security boundary.

**Inputs:** the current runner-isolation and disposable-Supabase containment
handoffs; group `erp-ci-isolated` identity; Agent 13 harness evidence; current
GitHub/Docker guidance; and the owner authorization in this document.

**Required output:**

1. Define the accepted local Linux guest boundary before any host mutation:
   guest identity/placement, trust scope, lifecycle/reset method, outbound-only
   network policy, loopback-only Docker publication, and host/guest listener
   proof. A WSL distribution or shared Docker engine is not presumed isolated;
   Agent 12 must accept it from actual evidence or reject it.
2. Require a dedicated non-interactive Linux service account, no desktop-profile
   mount, no interactive `gh` credential, no production credential, no
   default runner group, and no untrusted PR/fork/event execution. Docker/root
   capability is an explicit residual risk, not a low-privilege label.
3. Define preflight/rollback evidence for host virtualization features, guest
   creation, virtual switches/NAT/firewall rules, runner registration, guest
   storage, and the five known local Supabase ports plus runtime-discovered
   ports. All changes must be named, minimally scoped, reversible, and
   non-broad.
4. Require the two-source Docker binding check before `db reset`, `status`,
   any credential, or the Auth test: every mapping and matching listener must
   be literal `127.0.0.1` and/or `::1`; wildcard, LAN, missing, or
   unreconciled evidence fails the lane.
5. Write an Agent 12 changeset that accepts the contract or records a precise
   rejection. A contract pass is not runner approval or production approval.

**Must not:** change a runner, VM/guest, virtualization feature, virtual
network, firewall, Docker setting, account, Actions secret, workflow, provider,
database, or deployment.

**Exit criteria:** Agent 12 accepts a least-privilege Linux runner/containment
contract with exact non-secret preflight and rollback acceptance conditions.

> → Handoff to Agent 13. Reason: implementation may begin only against the
> accepted isolated-guest contract. Inputs: Agent 12 contract, existing selected
> runner group/workflow evidence, current official source references. Expected
> output: an isolated ephemeral Linux runner or a documented host-capability
> blocker, with no production/provider mutation.

### 2. Agent 13 — preflight and implement the dedicated ephemeral Linux runner

**Reason:** host virtualization/network, runner lifecycle, workflow targeting,
and CI harnesses are CI/Ops responsibilities.

**Required output:**

1. Read-only preflight the exact Windows host, virtualization capability,
   existing guest/VM state, Docker engine, port/listener state, selected runner
   group, workflow revision, runner root, and required disk/network resources.
   Prove `erp-ci-isolated` remains selected only for the ERP repository and
   restricted workflow; verify zero pre-existing matching runner/guest/resource
   before creating anything.
2. Implement only the Agent 12-approved, no-cost dedicated Linux guest/runner.
   Use a distinct non-interactive Linux identity and fresh ephemeral runner
   registration. Do not mount the desktop user profile, copy the interactive
   GitHub credential, or place production credentials in the guest.
3. Apply only named host virtualization, guest-network, and firewall rules
   accepted in Stage 1. Prove outbound GitHub access and loopback-only local
   Supabase/Docker publication from effective Docker metadata and guest/host
   listener evidence; include runtime-discovered ports. Do not accept a
   requested Docker flag as proof.
4. Retain a per-run clean work directory and unconditional cleanup. On every
   pass/fail/interruption, deregister the ephemeral runner and remove only
   current-run containers, volumes, networks, reports, guest work state, and
   listeners after validating ownership. The recovery plan must restore the
   preflight state by removing only the named guest, service, rules, and runner
   registration.
5. Run only non-secret runner/containment smoke checks at this stage. The real
   Auth/Snyk/full release matrix belongs to later stages. Write an Agent 13
   changeset with exact resource identities, before/after checks, rollback,
   listener proof, and cleanup result.

**Must not:** use the Default runner group, run PR/fork/untrusted workflows,
give the guest host administrator/desktop credentials, use broad cleanup, buy
capacity, create an account, set a production secret, access a production
database, or deploy.

**Exit criteria:** a uniquely identified Linux guest can execute only the
accepted trusted workflow under the selected group, proves containment, and can
be fully removed/recreated without residue—or the stage records a blocker and
stops.

> → Handoff to Agent 12. Reason: the applied runner is an untrusted-code,
> Docker, network, and credential boundary. Inputs: Agent 13 resource/rollback
> ledger, workflow revision, listener evidence, and cleanup result. Expected
> output: independent runner acceptance or a NO-GO finding.

### 3. Agent 12 — independent runner and containment acceptance

**Required output:**

1. Verify repository/workflow restriction, event/ref eligibility, ephemeral
   lifecycle, no personal-profile or production credential access, and the
   accepted residual Docker privilege.
2. Verify the guest and host network evidence rejects wildcard/LAN publication,
   includes runtime-discovered ports, and preserves the pre-credential binding
   boundary and targeted zero-residue teardown.
3. Confirm every virtualization/network/firewall/account/runner change matches
   the Stage 1 approved inventory and has a tested exact rollback.
4. Record PASS only with non-secret evidence. Any incomplete isolation,
   rollback ambiguity, or exposure is a runner **NO-GO**.

**Exit criteria:** Agent 12 accepts this exact Linux runner execution boundary;
otherwise the recovery stops before Snyk, Auth, or release work runs there.

> → Handoff to Agent 12 (Snyk preflight). Reason: the runner is accepted, but
> security-scan authentication requires separate credential provenance and
> secret-handling review. Inputs: accepted runner evidence and current
> `security-scan.yml`. Expected output: an existing-account Snyk path or a
> precise authentication blocker.

### 4. Agent 12 then Agent 13 — establish the existing Snyk authentication path

**Agent 12 security preflight:**

1. Confirm the installed Snyk CLI version/help and use only the owner's existing
   Snyk account. Local browser OAuth (`snyk auth`) is permitted; creating a
   Snyk account, subscription, service account, PAT, API token, or paid plan is
   not.
2. Prove authentication only with non-secret status such as account identity
   metadata permitted by Snyk and a local scan result. Do not inspect, echo, or
   copy OAuth refresh tokens from a config file.
3. Determine whether an **existing CI-compatible** `SNYK_TOKEN` is available
   from an approved local secure store. OAuth state is not silently converted
   into an Actions secret. If no compatible pre-existing token exists, record a
   blocker; do not manufacture one.
4. Approve the exact repository target and input channel for a secret update
   only when the token provenance/scope is acceptable. The only permitted
   target is the existing `Third-Code-Solutions/ERP` Actions secret named
   `SNYK_TOKEN`; values must stream from secure process input and never appear
   in a shell command, log, report, cache, or source file.

**Agent 13 integration, after Agent 12 acceptance:**

1. Verify `.github/workflows/security-scan.yml` consumes only the masked
   `SNYK_TOKEN` contract and does not print/export/upload it. Make no
   workflow weakening or token-containing file change.
2. Apply the exact approved existing-repository secret only through its secure
   input channel, then prove presence/scope without retrieving its value.
3. Execute the required Snyk dependency gate on the accepted isolated runner
   and capture only command, candidate SHA, timing, exit status, and finding
   summary. Cleanup process environment and runner work state afterward.
4. Hand results to Agent 12 for review. Failure/auth absence remains a required
   security-gate failure, not a no-pay exception.

**Exit criteria:** Snyk runs non-interactively from the accepted existing secret
path without token exposure, or an explicit no-account/no-token blocker is
recorded. Semgrep, Trivy, Gitleaks, and Actionlint remain independently required.

> → Handoff to Agent 04. Reason: CI authentication does not reconcile database
> lineage. Inputs: accepted runner/Snyk evidence, exact candidate SHA, and
> migration manifests. Expected output: controlled local metadata replay and a
> source/target lineage report with no production write.

### 5. Agent 04 — controlled local schema/metadata-only lineage forensics

**Reason:** migration ledgers, schema metadata, and replay semantics are
database responsibilities.

**Required output:**

1. Confirm the exact managed production target through a separately authenticated
   read-only metadata session. Verify effective read-only privilege before any
   query. Capture only server/project identity, migration version/hash ledger,
   catalog/RLS/function/extension metadata needed for replay, and backup
   availability metadata. Do not select/export application, Auth, audit, or
   customer rows.
2. Produce a signed lineage manifest that classifies every version as common
   identical, target-only/unexpected, source-only pending, hash mismatch, or
   out-of-order. Specifically revalidate the historical six May local-only
   versions and the later three ordered pending source versions. If the live
   ledger's counts differ, report the discrepancy; never alter history to make
   the counts match.
3. Build a fresh, disconnected local PostgreSQL 17 disposable staging target
   from schema/metadata-only material stored outside the repository. Record
   artifact hashes, source identity, destination identity, access controls, and
   an exact local rollback/removal plan. Do not use a paid Supabase clone,
   branch, PITR add-on, or new project.
4. Reconstruct and replay only the identified migration lineage locally. Run
   the repository planner, catalog/RLS/audit checks, source migration manifest,
   and schema diff. Do not use `supabase db push`, `migration repair`,
   `db reset --linked`, historical-file edits, production data, or a synthetic
   "all clear" ledger.
5. Stop at any data-dependent migration, duplicate, destructive-risk,
   schema/hash mismatch, or metadata insufficiency. Use synthetic fixtures only
   after the stage has explicitly proved they cannot be mistaken for production
   data. A local replay result must state every behavior it cannot validate
   without data.
6. Teardown only the exact local staging resources and attest zero residue.
   Write a dated Agent 04 forensic report and changeset; it must distinguish
   repository expectation, read-only provider observation, and local replay
   result.

**Exit criteria:** a current read-only lineage report explains the six
unexpected/local-only and three pending entries (or exact changed counts), a
metadata-only local replay is reproducible and cleaned up, and no production
schema/data/ledger/provider write occurred. This is not a production parity
PASS or a production migration plan.

> → Handoff to Agent 01. Reason: product decisions now have current migration
> and data-contract evidence. Inputs: Agent 04 lineage report, fractional
> blocker, PRD §4.2/WO-06 evidence, and named ABI authority material. Expected
> output: an ADR decision record or an explicit remaining commercial blocker.

### 6. Agent 01 — record O-01/O-14/fractional product authority

**Reason:** PRD, ADRs, and commercial truth are Product Guardian responsibilities.

**Required output:**

1. Create the next ADR only after Agent 04's evidence. It must record the
   owner-authorized O-01 default: `vat_base` remains configurable with
   `direct_only` as the default to reproduce existing ABI books. It must not
   retroactively reprice or mutate historical books.
2. Resolve O-14 only when a real ABI accountable person and their existing ERP
   account identity are independently supplied and verified. Do **not** invent
   a name, email, role, or account. If unavailable, record O-14 as an explicit
   commercial **NO-GO** with the required source/identity evidence.
3. Select fractional representation only from actual ABI workbook/UOM,
   calculation, rounding, and downstream-contract evidence. The ADR must compare
   the current integer BOM contract and existing micro-unit patterns, preserve
   integer-centavo money/basis points, define precision and rounding at every
   boundary, and require an additive migration with a rollback/recovery plan.
   Do not choose `numeric`, scaled integer, or rounding policy merely to
   remove the blocker.
4. List the required follow-on owners (Agent 04 schema, Agent 05/API, Agent 06
   CAD, Agent 10 BOM, Agent 14 compliance, Agent 12 security, Agent 13 release)
   and their end-to-end regression requirements. No application or schema code
   is changed by Agent 01.

**Exit criteria:** O-01 is documented as above; O-14 has real verified
accountability or remains explicitly blocked; fractional quantity has an
accepted evidence-based ADR and additive implementation contract or remains
explicitly blocked. Commercial workflow readiness remains **NO-GO** until all
three are actually satisfied.

> → Handoff to Agent 13. Reason: only accepted product authority and explicit
> remaining blockers may enter a complete CI/release matrix. Inputs: Agent 01
> ADR/changeset, Agent 04 report, accepted runner/Snyk evidence, and candidate
> SHA. Expected output: full current gate results; no deployment.

### 7. Agent 13 then Agent 12 — full no-pay release-gate matrix

**Agent 13 must** run the exact Node 22 candidate on the accepted isolated
Linux runner: dependency install, source branding, lint, typecheck, build,
raw PostgreSQL migration/RLS lane, contained real Supabase Auth Admin API
zero-skip proof, 13-role authenticated matrix, Actionlint, action-reference,
Gitleaks, Snyk, Semgrep, Trivy, no-skip checks, and teardown verification.
Every missing, skipped, or failed gate is a failure. The Auth lane may run only
after the Stage 3 containment boundary remains proven. Record candidate SHA,
runner identity, run IDs, and non-secret reports.

**Agent 12 must** independently verify runner trust, credential boundaries,
Snyk provenance, all required security-gate results, Auth/tenant/audit
evidence, teardown, and no provider/production boundary violation. Record
PASS only for one exact candidate; otherwise retain **NO-GO**.

> → Handoff to Agent 04. Reason: green local/CI evidence still does not prove
> the live target. Inputs: exact candidate SHA, Agent 12 PASS, Agent 13 reports,
> and Stage 5 lineage manifest. Expected output: current explicitly read-only
> production schema/migration parity report, or a blocker.

### 8. Agent 04 — final read-only production parity; Agent 13 release handoff only

Agent 04 must use a proven read-only target credential to rerun target-identity,
migration/hash, schema, RLS/grants, audit, and recovery-point checks for the
exact candidate. No production DDL/DML, migration, data export, repair, reset,
or provider write is allowed. Its report must identify any pending migration and
whether Stage 5's local replay is relevant; it must not claim deployability.

Only after Agent 04 and Agent 12 issue current evidence-backed PASS records may
Agent 13 update the existing production-release handoff with exact target,
rollback, protected-environment, normal-merge, and full-gate evidence. This is
a **deployment handoff only**. It does not dispatch production, apply a
migration, or mark the ERP production-ready. Production writes require a later
separate exact migration plan and authorization.

### 2026-08-28 isolated-runner containment status update

The fourth approved non-secret Provision attempt materialized the pinned image
successfully but failed while creating the required internal Hyper-V switch.
Its exact rollback is durable and the target is clean. Agent 12 review
`d50aff1f` permits no retry. Agent 13's single bounded elevated read-only
diagnostic reconfirmed `New-VMSwitch` miniport error `0x800700B7` and the
`NetEventBindFailed`/deletion sequence, but found no matching current
miniport/adapter/PnP/network-class registry identity. Only the pre-existing
Default Switch and WSL switch remain; the archive, zero-target inventory, and
Group 3 ERP-only restricted-workflow/zero-runner boundary are unchanged.

No component-specific vendor-supported repair can be proposed from that
evidence. The disposable isolated Linux runner, Auth matrix, full security
matrix, and release remain **NO-GO**. A later host repair requires a separate
accepted contract that names the precise component and has explicit human
authorization; it must not be folded into a runner retry.

### 2026-08-28 Windows/Hyper-V maintenance path — proposed only

Agent 12's [support-maintenance contract](../changesets/2026-08-28-agent-12-hyper-v-support-maintenance-contract.md)
and [open blocker](../blockers/2026-08-28-hyper-v-switch-support-maintenance.md)
define a phased recovery route. Broad virtualization/network permission is not
approval for connectivity loss, reboot, manual Wi-Fi reconnection, Windows
image repair, driver/binding change, or a host network reset. Phase A is
read-only evidence only and must stop without a Microsoft-supported,
current-build-applicable repair target. KB3101106's Windows 10 legacy Easy Fix
is not an approved Windows 11 remedy. Any repair needs its own explicit owner
approval, backup/recovery and local-access plan, maintenance window, impact
assessment for WSL/Docker/Default Switch, and post-reboot containment ledger.

The only conditional no-subscription-cost alternative is a separately
booted/dedicated physical Linux boundary under a new Agent 12 contract. It is
not a WSL, shared Docker, Windows-runner, retained-switch, or paid-hosted
substitute.

### 2026-08-28 Phase A host-maintenance diagnostic stop

The separately authorized Phase A read-only Windows/Hyper-V ledger is complete.
DISM reports a healthy component store; SFC identifies only a Windows visual
asset hash mismatch, not a Hyper-V component. The signed Realtek NIC driver is
inventoried and its `vms_pp` binding is already disabled. Expanded VMMS and
VMSwitch evidence confirms the failed ephemeral miniport also emitted a
conflicting-address-range event, but it did not reveal a persistent HNS, NAT,
adapter, PnP, or registry object that a supported repair could target.

No Phase B repair is proposed: the observed Windows edition/build fields do not
establish KB3101106 applicability, the Server-only binding remedy's prerequisite
is absent, and a healthy component store does not justify `RestoreHealth`.
No Windows update, repair, driver/binding change, reboot, or runner retry is
authorized. The complete Agent13 evidence is in
`docs/changesets/2026-08-28-agent-13-hyper-v-maintenance-phase-a.md`; the
isolated runner and entire release remain **NO-GO**.

### 2026-08-28 Agent 12 Phase A acceptance and strict sequencing decision

Agent 12 independently accepted the **read-only failure attestation**, not a
repair path. The local Phase A bundle has SHA-256
`e766a3beaceaf4cbb0747842658ee5a211b1a3257fa793511dac55f044d19395` and
confirms healthy DISM checks, enabled Hyper-V features, running
`vmms`/`vmcompute`/`hns`, the recorded temporary-miniport collision, no
persistent target identity, unchanged cache, and Group 3's exact ERP-only,
restricted-workflow, zero-runner state. Current independent readback also
finds no target run root, NAT/static mapping, or port-proxy mapping.

The Phase A bundle records `sfc /verifyonly`, not an SFC repair. Its
NUL-padded captured output does not safely preserve a complete filename list;
contemporary CBS entries include non-Hyper-V files (`img100.jpg` and
`smartscreen.exe`). This is an evidence-normalization limitation, not a
component-store, Hyper-V, or runner remediation target. Microsoft documents
`/verifyonly` as a verification-only operation; the two successful DISM checks
do not justify `RestoreHealth`. The Realtek inventory does not identify a
faulty driver, and the Server-only `vms_pp` remedy does not apply because that
binding is already disabled.

**Decision: Phase B is rejected.** No current-build Microsoft-supported exact
repair target was identified. The present Windows/Hyper-V runner route is
closed and remains **NO-GO** until the owner either authorizes a separate,
disruptive, vendor-supported/in-place maintenance plan with its own exact
repair target and recovery/reboot/connectivity approval, or nominates a
separately booted/dedicated physical Linux host for a new isolation contract.

Under this handoff's strict sequence, work stops before Snyk authentication,
contained Auth, the 13-role matrix, or any release gate is run on a runner;
no Snyk token/account action is authorized. The later Agent 04 lineage and
Agent 01 commercial stages are likewise not advanced as this recovery chain.
Separately authorized **read-only** work may proceed outside that chain—such
as repository/static analysis, GitHub configuration readback, and explicitly
authorized production metadata observation—but it cannot satisfy a skipped
runner/security gate, expose credentials, mutate a provider, or change the
release **NO-GO**.

## Final stop conditions

Stop and record **NO-GO** immediately if any of these occurs: the local runner
cannot be isolated or rolled back; a token is absent or unsafe; a scan is
skipped; any listener is wildcard/LAN; the six/three migration evidence cannot
be reconciled; a metadata-only replay needs customer data; O-14 lacks a real
accountable account; fractional policy lacks source evidence; a target or backup
is ambiguous; a production write would be needed; or any action would cost money
or create an account.

No release is **YES-GO**, deployed, production-verified, or commercially ready
until the existing production-release handoff's independent CI/security,
protected-environment, target/rollback, production-parity, migration-plan, and
post-deploy criteria have all passed.
