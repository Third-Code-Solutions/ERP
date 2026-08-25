# Sales Pipeline and Production Remediation Plan

## Objective

Make Sales the first operational role in the proposal flow, allow Sales to create
a manual pipeline entry from project details without bypassing award controls, and
close the authorized production-security and release findings before a guarded
push, publication, and deployment.

## Product decision

The pipeline remains an `opportunities` funnel. A delivery `project` is created
only by the closed-won award transaction because that transaction atomically
creates the project, budget baseline, cost codes, AR/project-code request,
down-payment invoice draft, CARI task, project tracker, and CX onboarding task.
Sales manual entry therefore creates a tenant-scoped opportunity that captures
the prospective project details; it must not create a delivery project or bypass
the award/KYC gates.

## Ordered work

1. Verify the current Sales dashboard default, opportunity routes, contracts,
   Core authorization, and stage/award invariants; add a Sales-first manual
   pipeline-entry slice with audit evidence and regressions.
2. Inventory the exact production E2E contamination candidates, dependencies,
   tenant classification, storage objects, retention/backup state, and safe
   rollback posture. Implement a dry-run manifest and an idempotent, bounded
   cleanup command; run it only against the verified production target.
3. Contain AUD-007: verify the GitHub repository target and workbook exposure,
   restrict visibility, quarantine current sensitive files, and make a separate,
   evidence-backed history-remediation decision with a recovery path.
4. Apply and prove Supabase bucket MIME/size limits and direct-browser Storage
   DML denial. Run the exact-tenant reservation canary and drain evidence after
   the release controls are in place.
5. Resolve the fractional-quantity representation by an ADR and additive schema/
   contract/tests; do not use floating-point money or quantity arithmetic.
6. Complete entity-neutral DocuSeal completion with explicit VO/COC transitions,
   configurable warranty semantics, tenant-safe submission lookup, replay safety,
   durable evidence, and audit logging.
7. Add fail-closed Snyk, Semgrep, Trivy, and monitoring evidence; harden GitHub
   `main`/`production` protection; implement candidate identity and rollback
   verification for Web, Core, CAD, and migrations.
8. Run source, database, browser, security, provider, cleanup, and rollback
   evidence. Push, publish, and deploy only when every applicable gate is green.

## Acceptance criteria

- [ ] A Sales user can create a validated manual pipeline opportunity, sees it in
  the pipeline at `lead`, and an unauthorized role cannot do so.
- [ ] A manually entered prospective project cannot become a delivery project
  except through the existing closed-won conversion contract.
- [ ] Production has no reachable `E2E_` records or dependent objects outside
  explicitly configured demo tenants, proven before and after cleanup.
- [ ] Public workbook exposure, bucket limits, direct-browser DML, exact-tenant
  reservation canary, branch/environment protections, release identity/rollback,
  DocuSeal VO/COC completion, required scanners, and monitoring all have current
  provider-backed evidence.
- [ ] Push/publication/deployment occurs only after the exact release workflow,
  deployment identities, migrations, protected browser checks, and rollback drill
  pass.

## Safety constraints

- Production deletion requires an exact, reviewable candidate manifest, a verified
  target, backup/restore evidence, and idempotent dependency ordering.
- No repository-history rewrite, repository visibility change, branch/environment
  policy change, or production deployment is performed against an inferred target.
- All database and Storage access remains tenant-scoped, RLS-protected, audited,
  and fail-closed.

## Checkpoints

1. Sales pipeline vertical slice: contracts, API, UI, role-negative tests.
2. Production safety: contamination manifest, backup/restore check, cleanup proof,
   repository and Storage readbacks.
3. Release controls: scanners, policies, identity/rollback tests, provider canary.
4. Release: full green CI, guarded push, publish/deploy, live health and browser
   verification.

## 2026-08-25 implementation checkpoint

- The local Sales vertical slice is implemented and verified. New opportunities
  require an existing tenant account and a Sales-entered prospective project
  name, always start at `lead`, carry an audit entry, and have no delivery
  project link until the guarded closed-won conversion.
- The production E2E cleanup workflow, Storage policy migration/readback,
  non-BOM DocuSeal completion, fractional-quantity ADR, independent security
  workflows, synthetic monitor, and release identity checks are implemented in
  this changeset. They intentionally require a committed main revision before
  their provider-side execution can supply evidence.
- Local lint, typecheck, full tests, focused remediation checks, workflow lint,
  and production build are green. Production mutation and deployment have not
  run from an uncommitted workspace.
