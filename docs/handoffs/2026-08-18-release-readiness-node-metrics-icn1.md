# Release readiness: Node 22, telemetry, whitespace, and icn1 — 2026-08-18

## Status

Source remediation is awaiting a fresh CI revalidation. The prior clean
database rebuild passed, but its catalog verifier misclassified three explicit
deny-all policies; the follow-up commits add a regression-tested classifier.
Only a green reviewed PR and the canonical production workflow may establish
hosted migration, authenticated E2E, `icn1`, and real-user telemetry evidence.

## Evidence at handoff

- The default workstation executable remains Node `24.16.0`, but an isolated
  official Node `22.23.2` runtime now validates the repository. `.nvmrc`,
  `.node-version`, root `engines`, and strict engine settings declare the
  required Node `22.x` contract.
- `git -c core.safecrlf=false diff --check` is clean after whitespace-only
  repairs to the 19 prior diagnostics.
- Vercel CLI authentication is valid for the linked `thirdcode-erp` project.
  Its current production deployment `dpl_HsLoNYV4evXmiD8Tx9PYyMZ9nvfh` is
  ready, but its Functions are in `iad1`.
- `apps/web/vercel.json` requests `icn1`; placement takes effect only in a new
  immutable deployment.
- ADR-024 approves `@vercel/speed-insights`; the root layout mounts it once
  only when `VERCEL === '1'`, with no custom dimensions or business payloads.
  No production sample stream exists until deployment and traffic occur.
- The branch contains the reviewed release candidate. The canonical promotion
  workflow runs only from a reviewed `main` SHA and is the sole authorized
  provider deployment path.
- The prior GitHub database-reproducibility job reached a clean `supabase db
  reset --local` and BUILD OPS data verification, then failed only because its
  tenant-policy checker expected `authenticated` plus `auth_tenant_id()` for
  `financial_sequences`, `notification_outbox`, and
  `notification_deliveries`. Those tables correctly use
  `deny_direct_client_access` for `anon` and `authenticated`; the replacement
  contract requires that exact denial and rejects an allow policy.
- The follow-up database job proved that corrected catalog assertion on a clean
  replay, then exposed a separate stale ADR-022 test expectation of zero
  policies. ADR-022 explicitly requires two deny-all policies; its runtime
  proof now asserts their exact role and expression shape before CI is rerun.

## Sequential ownership

1. **Agent 01 — Product/PRD Guardian**
   - Record the telemetry dependency decision in ADR-024.
   - Receive the final changeset and release evidence.
2. **Agent 03 — Next.js App Router Engineer**
   - Add the approved `@vercel/speed-insights` dependency and mount it once in
     the production-only root layout.
   - Add Node-version discovery files for the Web workspace if they are needed
     by the selected Node 22 runner.
   - Verify layout/unit/type/build behavior under Node 22.
3. **Agent 04 — Supabase/Drizzle Schema Lead**
   - Remove only the trailing whitespace in the three named database test
     files. No schema, migration, RLS, or test expectation changes.
4. **Agent 13 — CI/CD & Ops Agent**
   - Install and use an isolated official Node 22 toolchain; do not replace
     the workstation-wide Node 24 runtime.
   - Verify full diff hygiene, reproducible Node 22 checks, Speed Insights
     installation, release identity, production readiness, and deployed
     `icn1` placement.
   - Build a reviewed release SHA, push through the normal branch/PR path, and
     dispatch the protected production workflow only after its required gates
     pass. Do not use a manual Vercel deployment to bypass the workflow.

## Acceptance criteria

- `git diff --check` has no diagnostics.
- The repository declares and uses Node 22 for Web validation.
- Production Vercel instrumentation has a privacy-safe p75 Core Web Vitals
  path; its sample state is reported honestly.
- A traceable production deployment is verified through provider metadata to
  use `icn1`, with health/readiness and post-deploy checks recorded.
- No hosted data mutation, plan upgrade, secret disclosure, or security-gate
  bypass occurs outside the canonical reviewed promotion workflow.
