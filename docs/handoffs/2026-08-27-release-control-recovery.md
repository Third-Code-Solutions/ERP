# Release-control recovery handoff

## Verified state

- The local `HEAD` history and `origin/main` have no common ancestor. Treat
  them as unrelated histories; do not merge, rebase, or force-push one onto the
  other.
- The last observed production Web deployment is Vercel
  `dpl_piz7EeuK`, dated 2026-08-23. This identifies the observed deployment;
  it does not authorize a new deployment or establish source parity.
- The existing PR #13 CI evidence shows that GitHub Actions billing is
  unavailable. The recovery port's PR must run the unchanged required CI and
  security gates after billing is restored. A skipped, disabled, or locally
  substituted security gate is not an acceptable release result.

## Port evidence

- Fresh clone base: `origin/main` at `a444ca91`.
- Recovery branch: `codex/release-candidate-trial-port`.
- Clean cherry-pick mapping, with no conflict resolution:

  | Source commit | Port commit |
  | --- | --- |
  | `6202e11e` | `98883105` |
  | `aa0d4a37` | `71759b92` |
  | `06bc1a19` | `ff6bb26f` |
  | `e2c654d1` | `9f81256b` |
  | `bb0c297a` | `f0695a05` |

- `origin/main` is an ancestor of the port branch; before this documentation
  commit the branch was zero commits behind and five commits ahead.
- Port validation passed: lint, monorepo typecheck, Vitest/Playwright
  no-skip guards, build-operation invariants, 57 focused auth/provisioning
  tests, and the production build.

## Ordered recovery path

Execute the following stages strictly in order. Each stage must leave durable
evidence before the next begins. No force push is permitted at any stage.

### 1. Establish a clean, origin-based port

Create a fresh clone from the current `origin/main`, verify its resolved commit
and a clean working tree, then port only reviewed release-control commits by
clean cherry-pick. Resolve every conflict against the `origin/main` source of
truth and rerun the relevant local checks after each resolved port.

Do not attempt to join the unrelated histories, use `--allow-unrelated-histories`,
reset the remote branch, force-push, or carry local untracked artifacts into the
new clone. Record the fresh-clone commit, each cherry-picked commit, conflicts,
and validation results in the port evidence.

**Exit evidence:** the port branch has a documented `origin/main` base, a clean
working tree, an auditable cherry-pick list, and no history rewrite.

> → Handoff to release control / repository owner. Reason: hosted CI cannot
> supply security evidence until GitHub Actions billing is restored. Inputs: the
> clean port branch and its local validation ledger. Expected output: billing
> restoration without changing or bypassing security workflow definitions.

### 2. Restore GitHub Actions billing before security reruns

The repository owner must restore the GitHub Actions billing state for the
repository/organization. Once the clean port PR exists and billing is
available, rerun its unchanged required CI and security gates and retain the
run URLs/IDs and results. Do not disable, relax, reclassify, or replace
gitleaks, SAST, dependency, container, RLS, or other configured security gates
to work around billing.

**Exit evidence:** the relevant unchanged GitHub Actions jobs execute normally
and report their actual pass/fail state; a billing error is no longer the reason
they did not run.

> → Handoff to Agent 04 and Agent 12. Reason: source-controlled checks are not
> sufficient to establish current hosted database parity. Inputs: successful
> security-gate evidence and the clean port commit. Expected output: a
> least-privilege read-only Supabase examination and a current parity report.

### 3. Obtain read-only Supabase evidence and write the parity report

Use a valid, explicitly read-only Supabase credential for the identified target.
Do not use a service-role credential, alter provider configuration, run a
mutation, create a user, write a tenant, or deploy as part of this stage. Record
only non-secret identifiers and hashes needed to establish:

- target project/environment identity;
- migration ledger and schema state relative to the clean port;
- RLS enabled/forced status, policies, grants, and audit immutability for the
  affected tables; and
- any divergence, uncertainty, missing privilege, or inability to prove parity.

The resulting dated parity report must distinguish provider-observed facts from
repository expectations. Missing or over-privileged credentials are a blocker,
not a reason to infer parity.

**Exit evidence:** a current, read-only, target-identified parity report either
proves the relevant state or records a specific divergence/blocker.

> → Handoff to Agent 01 — Product/PRD Guardian. Reason: fractional quantities
> and DUPA are policy and data-model decisions that cannot be inferred from a
> parity report. Inputs: the parity report and ABI-provided commercial inputs.
> Expected output: an accepted ADR with bounded implementation and regression
> requirements before any fractional-quantity/DUPA code begins.

### 4. Obtain ABI fractional-quantity/DUPA authority and record an ADR

Before implementation, obtain ABI's written authoritative inputs for the
fractional-quantity/DUPA behavior, including the allowed UOMs and precision,
measurement/source-of-truth rules, intermediate and persisted rounding policy,
effective dates/owners, and representative acceptance calculations or source
workbooks. Do not infer a commercial rounding rule from existing UI labels or
sample data.

Agent 01 then writes an ADR that reconciles those inputs with the locked
integer-centavo and basis-point conventions, specifies validation and
regression vectors, identifies affected schema/API/UI owners, and records any
remaining ABI decision as a blocker. Implementation begins only after that ADR
is accepted and the required cross-agent handoff is documented.

**Exit evidence:** ABI inputs are source-identified, the ADR is accepted, and
the implementation work order has explicit acceptance and rollback criteria.

## Release boundary

This is a recovery-control handoff, not deployment authorization. The known
production deployment remains unchanged. No production write, provider setting
change, credential disclosure, force push, migration, or deployment is allowed
by this document.
