# Ten-company production release gate

Date: 2026-09-28

## Current decision

**NO-GO** for a whole-ERP client demo or ten-company rollout. Main revision
`fe96ded831baa4badbf2082dc37f990a270c2eaa` was promoted to production,
but the protected production verification run failed. The follow-up fixes in
PR #119 are not deployed.

## Direct evidence

- Main CI run 36352174413 passed for the exact deployed revision. Production
  run 36353106697 deployed Web, Core, and CAD after its release preflight,
  migration dry run, and health checks passed. Live Web readiness reported the
  deployed revision and database readiness. No migration was applied.
- The production authenticated role matrix had one flaky test: the owner role
  emitted minified React hydration error #418 on the first attempt, and the
  retry passed. The strict no-skips/no-flakes gate rejected that run. The
  password recovery step did not run because the workflow stopped there.
- The protected demo boundary and cross-tenant project isolation checks passed
  in that run. The latter used one viewer identity, an active synthetic project
  in `buildops-e2e`, and one separately approved synthetic tenant/project. It
  does not establish isolation for all companies, roles, records, or actions.
- An authorized synthetic BOM in `buildops-e2e` was signed through the live
  canvas page. Read-only database verification found the locked BOM, signed
  session, signature document, active award handoff, project code, one budget
  line, a draft invoice, five tasks, and a linked audit entry. The draft invoice
  had zero net amount and needs Finance confirmation. The BOM was seeded as
  approved, so this did not verify the approval workflow. The demo tenant audit
  verifier passed 3596/3596 current hashes with zero link mismatches after the
  signing test.
- PR #119 adds an atomic database user-row/audit transaction with Auth
  compensation, fixes an inspection draft autosave revision race, and adds
  route context to browser error reporting. These changes remain candidate
  code until merged, deployed, and verified at their exact revision.

## Required before GO

1. Diagnose and fix the intermittent hydration error. Rerun the protected
   production role matrix with zero failed or flaky tests; keep the strict gate.
2. Complete exact-revision CI and deployment verification for any follow-up
   fix, including the password recovery check that did not execute in run
   36353106697.
3. Resolve the password reset audit gap: the Supabase Auth password update can
   succeed while its database audit write fails. Define and verify a durable
   identity/audit reconciliation contract without masking partial success.
4. Verify each implemented module's representative actions and departmental
   handoffs with read-only checks or synthetic records confined to the approved
   test tenants. Confirm source data, totals, audit, and authorized role views
   after refresh. External provider delivery must be checked against real
   receipts where applicable.
5. Extend cross-tenant and permission checks to the relevant record types,
   mutations, and role combinations. Demonstrate ten-company workload,
   monitoring, and recovery at the intended rollout scale.
6. Keep draft or preview-only features out of an unqualified demo promise. In
   particular, BIR 2307 output still awaits official-template verification,
   and approval delegation is a preview rather than an enforced policy.

Only clearly labeled synthetic records were created for the live signing and
isolation checks. No customer business record was edited, and no provider
message was sent by those checks.
