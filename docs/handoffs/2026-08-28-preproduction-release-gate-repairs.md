# Pre-production release-gate repairs handoff

> **Status: local remediation required before any production preflight resumes.**
>
> This handoff addresses two newly reproduced, repository-owned local release
> gate failures on the current recovery candidate. It does not authorize a
> PRD change, provider operation, database mutation, production access, merge,
> or deployment. The production status defined by
> `docs/handoffs/2026-08-28-production-release.md` remains **NO-GO**.

## Verified reproduction

All observations below were made under the repository-required Node 22 runtime
on the current candidate. They are source/test-topology failures, not provider
or production evidence.

| Gate | Reproduced failure | Scope of the source defect |
| --- | --- | --- |
| `pnpm verify:abi-ops-brand` | Legacy branding is reported only in the active source files below. Generated `apps/web/.next` output is not a source defect and must not be committed or used to justify changing the branding contract. | `apps/web/src/app/book-demo/demo-request-form.tsx`; `apps/web/src/app/book-demo/page.tsx`; `apps/web/src/app/owner/page.tsx` |
| Root `pnpm test` | The `@third-code-erp/database` default `vitest run` command selects `tenant-invitation-auth-api.database.test.ts` before an explicit disposable local Supabase Auth runtime is supplied. The test then cannot establish its required Auth Admin API proof. | Database package test-command/configuration selection only; not ADR-030 behavior, a migration, RLS, or production schema. |

The current raw PostgreSQL configuration already identifies the invitation Auth
suite as a separate concern, and `test:auth-api` already names a dedicated
config. The repair must make that topology true for the package's *default*
test command as well. ADR-030 remains authoritative: its invitation suite is a
required real local Supabase Auth Admin API proof, not an optional unit test.

## Delivery contract

**Goal:** restore deterministic, honest local release checks: the generic test
matrix executes only its declared no-Auth-runtime tests, while the full
invitation proof remains mandatory and fail-closed in a separate disposable
Supabase Auth runtime. Remove only the three verified legacy public/owner brand
strings from active source.

**In scope:** test command/configuration ownership and regression coverage;
the two public book-demo source files; the owner-route source file; security
and workflow-contract review; and an exact Node 22 local-gate rerun.

**Out of scope:** changing the brand verifier's legacy-pattern policy to hide
source matches; committing, hand-editing, or relying on `.next`; any Auth
authorization/trigger/migration/RLS behavior; production database/provider
access; billing; runner registration; deployment; and ABI commercial decisions.

## Strict ownership sequence

Each owner must re-read `AGENTS.md`, this handoff, the predecessor's changeset,
and their scoped instructions before changing files. Stages execute one at a
time. A failure or unexpected touched path stops the sequence and is recorded;
no owner may absorb another owner's work.

### 1. Agent 04 — database test topology repair

**Reason:** package test configuration and the database-backed Auth proof are
Agent 04 responsibilities.

**Inputs:** ADR-030; `packages/database/package.json`; the default Vitest
configuration; `packages/database/vitest.raw-postgres.config.ts`;
`packages/database/vitest.auth-api.config.ts`;
`packages/database/src/__tests__/tenant-invitation-auth-api.database.test.ts`;
and `docs/handoffs/2026-08-27-self-hosted-ci-auth-lane-repair.md`.

**Required output:**

1. Change the database package's default test selection so generic `pnpm test`
   does not select the one explicit Auth Admin API proof. The exclusion must be
   deterministic and reviewable in test configuration/command selection—not a
   `describe.skip`, a conditional test body, a missing-environment success, or
   a reduced assertion.
2. Keep `test:auth-api` as an explicit, required, one-suite command. It must
   fail closed with a clear error when a real disposable Supabase Auth endpoint
   and service credential have not been supplied, and execute through that
   actual Auth Admin API when they have.
3. Preserve the raw PostgreSQL lane and its existing no-skip/report contract.
   The Auth suite must remain required immediately afterward in the dedicated
   local-Supabase lane. A generic-unit pass must never be able to mask a
   missing, skipped, or failed Auth proof.
4. Add or update configuration-level regression coverage where practical, then
   run the database default, raw PostgreSQL, and dedicated Auth commands in
   their correct environments. Retain machine-readable reports and zero-skip
   assertions for the dedicated Auth proof.
5. Write an Agent 04 changeset including the exact selected/excluded files,
   commands, actual results, and explicit statement that no schema/migration/
   RLS/application authorization behavior changed.

**Must not:** edit historical migrations; alter the invitation-intent contract;
replace the Auth API with direct SQL; mark the Auth suite skipped or optional;
use placeholder credentials; or touch public/owner UI source files.

**Exit criteria:** the generic database/default matrix passes without selecting
the runtime-bound Auth suite; the suite is still selected only by `test:auth-api`
and passes with zero skips in a real disposable Supabase Auth runtime; missing
that runtime yields a failing command, not a green omission.

> → Handoff to Agent 15. Reason: database test topology is complete; the two
> public demo-brand source matches are an independent GTM surface. Inputs:
> Agent 04 test-config diff, commands, and non-secret reports. Expected output:
> only the verified book-demo source branding repair and focused validation.

### 2. Agent 15 — public book-demo brand repair

**Reason:** `/book-demo` is the public acquisition/rollout surface owned by
Agent 15.

**Inputs:** the two source paths in the reproduction table; the brand verifier;
the product's established ABI OPS public naming; and Agent 04's completed
changeset.

**Required output:**

1. Replace only legacy public-facing source strings in
   `apps/web/src/app/book-demo/demo-request-form.tsx` and
   `apps/web/src/app/book-demo/page.tsx` with the established ABI OPS naming.
   Preserve consent meaning, accessibility labels, request form behavior,
   validation, and public routing.
2. Do not edit generated `apps/web/.next` files or broaden/disable the brand
   verifier. Treat a stale generated match as disposable build output; validate
   source through the normal clean/rebuild path rather than committing an
   artifact.
3. Add/update focused public-route or branding coverage if the source change
   needs it, verify the relevant formatting/type/build surface, and write an
   Agent 15 changeset with changed paths and results.

**Must not:** alter demo-request persistence, consent policy, organization
provisioning, provider/marketing configuration, or the owner route.

**Exit criteria:** neither verified book-demo source file matches the legacy
brand contract; the public form still validates and submits through its existing
server action; no generated artifact is part of the change.

> → Handoff to Agent 03. Reason: the remaining source match is an authenticated
> owner route, not public marketing. Inputs: Agent 15 diff and focused result.
> Expected output: one owner-route brand repair with route/auth behavior intact.

### 3. Agent 03 — owner-route brand repair

**Reason:** `apps/web/src/app/owner/page.tsx` is an App Router route owned by
Agent 03.

**Inputs:** the exact verifier violation; owner authentication and console
tests; Agent 15's completed changeset.

**Required output:**

1. Replace the one verified legacy owner-page source string with the established
   ABI OPS/platform-control terminology, preserving owner-only access,
   non-indexing metadata, data fetching, and all existing controls.
2. Add/update a focused route/branding assertion if appropriate and run the
   owner-route neighborhood checks. Do not modify generated output or delegate
   source-brand work to an artifact rebuild.
3. Write an Agent 03 changeset declaring the exact source change and validation
   outcome.

**Must not:** loosen `requireOwnerAdmin`, change platform data authority,
modify database code, or change the public book-demo route.

**Exit criteria:** `apps/web/src/app/owner/page.tsx` has no legacy brand match,
owner authorization behavior is unchanged, and the source change is isolated to
the stated route.

> → Handoff to Agent 12. Reason: both changes affect security/release evidence:
> explicit Auth test selection must not be a bypass, and public/owner branding
> changes must not alter route or consent boundaries. Inputs: Agent 04, 15, and
> 03 changesets/diffs, dedicated Auth report, and workflow references. Expected
> output: security/workflow contract PASS or a named release blocker.

### 4. Agent 12 — security and workflow-contract revalidation

**Reason:** the repair changes how a security-sensitive Auth proof is selected
and runs. Agent 12 owns the resulting CI and security boundary review.

**Required output:**

1. Verify the default package test cannot silently omit unrelated database
   coverage and that only the explicit Auth API suite is excluded from its
   environment-incompatible matrix.
2. Verify `test:auth-api` remains mandatory in the dedicated local-Supabase
   workflow path, derives its endpoint/credential only from the running
   disposable stack, fails closed when absent, has a zero-skip report, and
   neither logs nor artifacts credentials.
3. Recheck that raw PostgreSQL reproducibility/RLS, Auth API, API integration,
   secret scan, and cleanup workflow stages remain required. The existing
   hosted Snyk/Semgrep/Trivy evidence gap remains a separate production blocker
   unless it has independently been resolved with current evidence.
4. Review the book-demo consent and owner-route access boundaries for
   unintended behavioral/security change. Record a dated PASS only with
   evidence; otherwise stop and record the finding.

**Exit criteria:** the test-topology repair is explicit, mandatory, secret-safe,
zero-skip, and cannot make the Auth proof disappear; public consent and owner
authorization are unchanged.

> → Handoff to Agent 13. Reason: all scoped code/configuration and security
> review is complete; the candidate needs a clean, exact local release-gate
> matrix before returning to the production-release handoff. Inputs: all prior
> changesets, final candidate SHA, and non-secret reports. Expected output:
> current local evidence or a failing gate with diagnostics.

### 5. Agent 13 — exact Node 22 local-gate rerun

**Reason:** Agent 13 owns CI execution/evidence and must show that the repaired
matrix is coherent before any production preflight resumes.

**Required output:**

1. Start from a clean working tree and Node 22. Do not count generated `.next`
   output as source evidence; remove/regenerate it only as disposable build
   output under the normal clean build process.
2. Run `pnpm verify:abi-ops-brand`, the root `pnpm test`, relevant type/lint
   gates, and the project build. Record exact commands and results.
3. Run the raw PostgreSQL lane and the dedicated disposable local-Supabase
   `test:auth-api` lane separately, preserving JSON/no-skip evidence. The
   dedicated suite must not be treated as complete merely because root tests
   pass.
4. Run applicable Actionlint, workflow-reference, Gitleaks, and no-skip checks
   without downgrading a failure. Retain the existing hosted-coverage and
   runner/billing blockers separately.
5. Write an Agent 13 changeset that distinguishes passed local gates from
   blocked hosted/production gates and hands back to
   `docs/handoffs/2026-08-28-production-release.md` at its earliest unsatisfied
   stage.

**Exit criteria:** every scoped local gate passes for one exact candidate SHA,
including a real zero-skip Auth Admin API proof; no generated artifact is
tracked; and all remaining hosted/production/commercial blockers are stated.

## Fail-closed rule

At no point may an owner convert an environment requirement into a skip,
placeholder credential, direct-SQL substitute, stale report, or unchecked
generated output. If any of the required local commands, actual Auth runtime,
security/workflow review, or source checks fail, stop and retain **NO-GO** for
production. This handoff repairs prerequisite local evidence only; it cannot
close the hosted CI, security-tool, production-parity, ABI O-01/O-14, or
fractional-quantity/DUPA release gates.
