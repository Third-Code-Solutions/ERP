# Dependency advisory remediation handoff

## Finding and impact

PR #18's hosted `Security Scan` now fails at `pnpm audit --prod
--audit-level low`. A local replay against the committed lockfile reports three
new moderate production vulnerabilities published or updated on 2026-09-02:

- `qs@6.15.3` through `apps/api > express`: GHSA-x5fp-wj9c-mxmx and
  GHSA-4mjr-xmp4-gh2g. Both are availability defects reachable from untrusted
  HTTP query parsing/stringification patterns; `6.16.0` is patched.
- `@xmldom/xmldom@0.8.13` through `apps/web > mammoth`:
  GHSA-6gmq-8vp8-gcm6. The package is in the user-document extraction runtime;
  `0.8.15` is patched on the currently selected minor line.

Primary advisory evidence:

- https://github.com/advisories/GHSA-x5fp-wj9c-mxmx
- https://github.com/advisories/GHSA-4mjr-xmp4-gh2g
- https://github.com/advisories/GHSA-6gmq-8vp8-gcm6

### Expanded advisory discovery

After the production dependency audit was corrected locally, the complete
audit exposed four high-severity advisories in the existing development-only
path `apps/api > @nestjs/cli > @angular-devkit/core > ajv > fast-uri`:

- GHSA-5jgf-p345-68v8
- GHSA-f65p-4m7j-42xc
- GHSA-fph4-wmhf-6fwf
- GHSA-jqff-g426-hqxp

The repository already overrides `fast-uri` to `3.1.5`; all four advisories are
patched in `3.1.6`. This handoff therefore also authorizes updating that
existing exact override to `fast-uri@3.1.6` and regenerating only the associated
lockfile entries. This is a build-tool supply-chain correction: it does not
change application behavior, API contracts, lifecycle-script policy, or add a
new dependency.

Primary advisory evidence:

- https://github.com/advisories/GHSA-5jgf-p345-68v8
- https://github.com/advisories/GHSA-f65p-4m7j-42xc
- https://github.com/advisories/GHSA-fph4-wmhf-6fwf
- https://github.com/advisories/GHSA-jqff-g426-hqxp

No dependency or lockfile was changed by the Finance clock correction. This is
a newly surfaced supply-chain release blocker and must not be bypassed by
lowering the audit threshold or disabling the security job.

## Threat model

- Trust boundaries: unauthenticated/requester-controlled API query strings and
  uploaded DOCX/document buffers.
- Assets: API and worker availability; integrity of extracted document text and
  downstream project/AI context.
- Primary risks: denial of service through hostile query structures and markup
  injection through malformed XML entity-reference serialization.
- Safe correction: select the upstream patched transitive releases already
  within the dependency graph; do not add a package or weaken input limits.

## Acceptance criteria

1. Add exact pnpm workspace overrides for `qs@6.16.0` and
   `@xmldom/xmldom@0.8.15`, and update the existing `fast-uri` override from
   `3.1.5` to `3.1.6`, following the existing security-remediation override
   convention. Regenerate the single authoritative lockfile with Node 22 and
   pnpm 10.33.0.
2. The lockfile resolves the API Express path only to patched `qs`, the Web
   Mammoth path only to patched `@xmldom/xmldom`, and the Nest CLI/Ajv path only
   to patched `fast-uri`; no unrelated dependency or lifecycle-script policy
   change is allowed.
3. `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm audit --prod
   --audit-level low`, and the complete `pnpm audit --audit-level low` pass.
4. API request/integration coverage and the two Mammoth-backed extraction
   suites pass. Complete repository TypeScript, lint, unit, build, and protected
   CI remain required before merge.
5. Inspect the override and lockfile diff for unexpected packages, install
   scripts, integrity changes, or duplicate vulnerable versions. Run the
   repository gitleaks wrapper.

## Sequential ownership

1. Principal Agent 3 is the sole editor for `pnpm-workspace.yaml` and
   `pnpm-lock.yaml`, acting within Agent 12 supply-chain scope. No application
   source or workflow edit is authorized by this handoff.
2. Principal Agent 4 independently verifies advisory versions, resolved paths,
   lockfile scope, native audit, frozen install, extraction tests, API tests,
   and secret scan.
3. Principal Agent 5 browser verification is unnecessary unless runtime tests
   reveal an observable document/API behavior change.

This sequential handoff continues on PR #18 because that PR cannot reach a
green protected database gate while the newly published audit gate fails. No
production deployment is authorized.

## Closeout

- Principal Agent 3 selected only the reviewed patched transitive releases:
  `qs@6.16.0`, `@xmldom/xmldom@0.8.15`, and `fast-uri@3.1.6`.
- The generated lockfile contains one version of each target and changes only
  the root overrides, package integrity records, snapshot keys, and existing
  consumer edges. No importer, lifecycle policy, manifest, workflow, or
  application source changed.
- Frozen installation with scripts disabled, production and complete low-level
  audits, dependency-path proof, document extraction, real-Postgres Finance
  HTTP integration, repository TypeScript, lint, production build, complete
  unit suite, gitleaks, and diff hygiene all pass locally.
- Principal Agent 4 independently returned `GO` with zero P1/P2 findings after
  repeating the install, audits, path proof, direct DOCX smoke, extraction and
  database-backed API tests, TypeScript, lint, uncached production build,
  gitleaks, and diff inspection.
- Principal Agent 5 browser verification was not run because this patch changes
  dependency resolution only and the focused runtime tests found no observable
  behavior change.

Hosted run `33659709980` passed Security Scan, Actionlint, type checking, lint,
BUILD OPS invariants, unit tests, PostgreSQL 17 database reproducibility,
production build, and trusted E2E on the dependency-remediation commit.
Production was not changed or deployed.
