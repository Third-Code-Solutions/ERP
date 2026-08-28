# Self-hosted runner isolation handoff

> **Status: proposed security containment — no infrastructure change has been made.**
>
> This handoff exists because a no-cost self-hosted runner is an execution
> boundary, not merely a replacement for GitHub-hosted billing. It authorizes
> planning and review only. It does not authorize a runner-group change, local
> account, service, firewall rule, billing action, production access, or
> deployment.

## Trigger and verified facts

The first organization runner used for recovery CI was registered as
ephemeral and removed after its job. There is no currently registered runner
from that attempt to reuse or trust.

The remaining available GitHub **Default** runner group is organization-wide.
Registering a new runner there would make it eligible for workflows outside
`Third-Code-Solutions/ERP`; it is not an acceptable containment boundary for
the ERP's disposable Supabase/Auth test lane.

The interactive Windows identity `DESKTOP-D7PA3K2\MSI` is a non-administrator
desktop user, but currently holds elevated GitHub CLI authorization. That
interactive credential must not be copied into, cached by, or used as the
identity of a background runner service.

Local Supabase CLI networking was also observed to publish through Docker
Desktop on `0.0.0.0`, despite the requested network option. A command-line
network flag is therefore not evidence of loopback-only exposure. Any future
runner design must verify effective host firewall containment; it must not
claim local-only exposure from CLI intent alone.

These facts do not change the failed/required-gate status described in:

- `docs/handoffs/2026-08-27-self-hosted-ci-auth-lane-repair.md`;
- `docs/handoffs/2026-08-27-finance-api-ci-handoff.md`; and
- `docs/blockers/2026-08-25-github-actions-billing.md`.

In particular, self-hosted CI is not a replacement for any missing hosted
security evidence, production schema-parity report, ABI commercial decision,
or production release gate.

## Delivery contract

**Goal:** before another disposable local-Supabase CI run, establish a
repository-selected runner boundary and a host-containment design that Agent 12
can assess independently.

**In scope after this handoff is accepted:** an ERP-only GitHub runner group,
workflow targeting and dispatch guards, a dedicated local runner identity and
service, narrowly scoped host firewall controls, ephemeral runner lifecycle,
and evidence that the local test stack is contained and cleaned up.

**Out of scope:** GitHub billing; GitHub organization membership or role
changes; the Default runner group; production secrets or data; hosted Supabase,
Vercel, Railway, or DNS configuration; production deployment; application
authorization behavior; and relaxing any test/security gate.

## Required ownership sequence

The following work is strictly sequential. Each receiving agent re-reads
`AGENTS.md`, this handoff, and the predecessor's changeset before changing its
owned surface. No owner may use the Default runner group as a temporary
substitute.

### 1. Agent 13 — CI/CD & Ops: isolate selection and define host containment

**Reason:** runner groups, workflow targeting, service lifecycle, and host
operational controls are Agent 13's responsibility.

**Inputs:** the verified facts above; the current self-hosted workflow;
`docs/handoffs/2026-08-27-self-hosted-ci-auth-lane-repair.md`; and the
repository's current GitHub Actions permissions and runner-group capabilities.

**Required output:**

1. Verify whether the organization can create a selected runner group that is
   restricted to `Third-Code-Solutions/ERP`. If the provider cannot enforce
   that repository selection on the current plan, record the limitation and
   stop. Do not register the runner in the organization-wide Default group.
2. Create the selected ERP-only group only after that capability is verified,
   restrict it to the one repository, and target it explicitly from the
   self-hosted CI workflow with a dedicated label. Retain the existing
   repository/actor/ref dispatch protections and add any necessary fail-closed
   workflow guard so untrusted repository or event contexts cannot obtain the
   runner.
3. Define a dedicated, non-interactive local account and runner service for
   the isolated group. It must not be an administrator, must not use the
   `DESKTOP-D7PA3K2\MSI` profile or GitHub CLI credential, and must have access
   only to its runner work directory, the explicitly required Docker endpoint,
   and the local CI dependencies. Record the non-secret identity, service
   configuration, filesystem ACLs, and rollback/removal procedure.
4. Treat Docker access as a high-risk host capability. Before enabling the
   service, document the effective privileges granted by the selected Docker
   access mechanism and the residual risk of executing repository code on this
   workstation. If the account cannot be contained to a level Agent 12 accepts,
   stop and recommend a dedicated disposable CI host rather than weakening the
   boundary.
5. Inventory every Supabase/Docker listener created by the test lane and add
   only narrowly named firewall controls that prevent non-local inbound access
   while allowing the required local test traffic. Validate effective firewall
   behavior against the observed wildcard binding; a supplied CLI network flag
   alone is insufficient. Do not alter unrelated firewall rules.
6. Retain ephemeral runner registration, per-run clean work state, secret-free
   reports, process-scoped disposable Supabase credentials, and unconditional
   container/state cleanup from the existing Auth-lane handoff.
7. Record a dated Agent 13 changeset with non-secret group selection evidence,
   workflow revision, identity/service evidence, listener/firewall evidence,
   rollback steps, and the exact CI run(s) executed. A failed containment
   assertion is a failed release-control gate, not a warning.

**Must not:** create a broad organization runner; use an interactive personal
GitHub credential for the service; grant the service administrator rights;
persist registration or service credentials in source, the runner worktree,
logs, or artifacts; expose Supabase ports beyond the local host; change
billing, provider data, production secrets, deployment definitions, or
production infrastructure.

**Exit criteria:** selected-group enforcement, workflow targeting, host
containment design, listener/firewall evidence, rollback, and a clean
ephemeral-runner lifecycle are all evidenced without production or billing
changes.

> → Handoff to Agent 12. Reason: the resulting runner is an untrusted-code and
> local-service execution boundary. Inputs: Agent 13's proposed/applied group
> scope, workflow diff, service identity/ACL evidence, Docker privilege
> analysis, firewall/listener evidence, cleanup proof, and CI run evidence.
> Expected output: an independent accept/reject security review.

### 2. Agent 12 — Security / DevSecOps: independent containment review

**Reason:** workflow execution scope, Docker capability, local service
identity, network exposure, and credential separation require a security
decision independent of the implementation owner.

**Required output:**

1. Confirm the runner group admits workflows only from
   `Third-Code-Solutions/ERP`, and the workflow cannot select the Default
   group, execute on an untrusted event/ref, or bypass its eligibility guard.
2. Confirm the dedicated service has no administrator membership, no
   interactive GitHub credential, no production credential, and no access to
   the daily user profile beyond what the documented ACLs require.
3. Assess the real privilege implied by Docker control. Accept only if the
   residual risk is explicit, bounded to the designated CI service/host, and
   appropriate for the repository trust model; otherwise reject the local-host
   design and keep CI release status blocked.
4. Confirm that wildcard Docker listener behavior is mitigated by verified
   firewall policy, that all relevant firewall profiles remain enabled, and
   that the rule set is limited to documented CI listener/traffic needs.
5. Confirm ephemeral deregistration, work-state deletion, local Supabase
   cleanup, zero secret leakage in reports/artifacts, and all mandatory
   raw-PostgreSQL/Auth/API/security checks remain required.
6. Record PASS only with reproducible non-secret evidence for every item. Any
   missing control, unclear Docker privilege, default-group exposure, or
   network-containment failure is a **NO-GO for this runner** and must be
   reported as such.

**Exit criteria:** an Agent 12 review explicitly accepts the selected group,
service identity, workflow eligibility, Docker risk, firewall containment, and
cleanup evidence—or records a specific rejection/blocker.

> → Handoff to repository owner. Reason: creating the local service account,
> granting its minimum host rights, and adding firewall rules require one
> explicit UAC-elevated host change. Inputs: the accepted Agent 12 review,
> Agent 13's exact bounded command plan, account/service name, proposed ACLs,
> named firewall rules, listener ports, and rollback commands. Expected output:
> a single scoped UAC approval or a decision not to perform the local change.

### 3. Repository owner — explicit UAC approval boundary

No tool, agent, or background process is authorized by this document to invoke
UAC or create a local account/service/firewall rule. After Agent 12 accepts the
plan, the owner must explicitly approve **one** elevation limited to:

> Create the named dedicated CI runner account and service; grant only the
> documented runner-directory, Docker, and service-logon rights; create only
> the reviewed, named firewall containment rules for the observed local CI
> listeners; and retain the documented rollback/removal commands. Do not alter
> other accounts, existing firewall rules, GitHub billing, production settings,
> credentials, or deployment targets.

Absent this exact, current approval—or if the UAC prompt/actual command differs
materially from the reviewed plan—stop before elevation and retain **NO-GO** for
the self-hosted runner. The owner may decline without affecting the existing
application code or production environment.

## Non-negotiable acceptance conditions

1. A provider query proves the selected runner group is limited to the ERP
   repository; no usable runner is left in the Default group.
2. The workflow explicitly targets that selected group and dedicated label, is
   fail-closed for untrusted repository/event/ref contexts, and keeps all
   existing mandatory CI/security gates.
3. Each run uses a fresh ephemeral registration and its runner is absent from
   the group after completion or failure.
4. The runner service uses a dedicated non-administrator, non-interactive
   identity; it does not inherit the desktop user's GitHub authorization,
   profile, or production credentials.
5. The service directory and work directory use documented least-privilege
   ACLs; local CI state and credentials are deleted on every outcome.
6. Docker access is explicitly risk-assessed rather than mislabeled as
   unprivileged. Agent 12 has accepted it or the local design remains blocked.
7. Effective inbound containment is demonstrated for every local Supabase/
   Docker listener, including the observed `0.0.0.0` behavior. A CLI option is
   not accepted as proof.
8. Firewall changes are narrowly named, scoped, reversible, and do not weaken
   the host's existing inbound policy.
9. Local Supabase service/database URLs and service credentials remain
   process-scoped, redacted, and absent from commits, reports, caches, and
   artifacts.
10. A full self-hosted workflow run passes the required raw PostgreSQL,
    disposable Auth API, API integration, build, smoke, secret scan, and
    cleanup stages with zero skips; a successful local run remains CI evidence
    only.
11. This work makes no billing, production database, hosted provider,
    deployment, or commercial-workflow change. Production release status
    remains **NO-GO** until every independent release-control blocker is
    closed with current evidence.

## Rollback and stop conditions

The rollback target is removal of the dedicated runner service/registration,
its selected group access, its dedicated account, its named firewall rules, and
its local runner/work state—only through the exact reviewed commands and after
validating those targets. It never includes a broad user, firewall, Docker, or
GitHub configuration reset.

Stop immediately and record a blocker if selected-group repository restriction
is unavailable, Docker privilege cannot be accepted, firewall containment cannot
be demonstrated, a production credential becomes necessary, or the owner does
not provide the explicit bounded UAC approval above.
