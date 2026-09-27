# Ten-company production release gate

Date: 2026-09-28

## Current decision

NO-GO for a production promotion or ten-company rollout from
`agent-03/account-kyc-audit-fix`. The account/KYC atomic-audit change is a
reviewable local candidate, not a deployed release.

## Direct evidence

- The read-only controlled release planner, run against the configured hosted
  Supabase URL, returned `review_required` because
  `AUDIT_RECOVERY_TENANT_ID` is absent. It reported 177/177 migrations, zero
  duplicate Purchase Order groups, healthy Web/Core readiness, and a clear
  source spend guard. Those passing components do not override the audit gate.
- The live Web readiness endpoint reported revision `2d80e043ac75`; the
  candidate is not live.
- Vercel project `thirdcode-erp` was identified under the PAVI team with
  project ID `prj_5yZX5MTJdXZYWRIeS50jVhmjqzdb`. Its production target was
  observed as ready. No promotion was made.
- Focused account/KYC unit tests and disposable PostgreSQL integration tests
  passed; the authenticated production role/tenant matrix, departmental
  handoffs, and ten-company workload tests have not been run for this candidate.
- A 2026-09-28 read-only hosted inventory found the dedicated `buildops-e2e`
  tenant and eleven active seeded role profiles, but zero locked BOMs and zero
  award handoffs. The approved BOM cannot enter the signed-BOM award action.
- The new demo boundary preflight passed 1/1, and the existing role-access and
  schedule browser matrices passed 2/2 against live revision `2d80e043ac75`
  using demo identities. These checks cover selected routes and visible
  controls; they do not prove cross-company data isolation or a completed
  award transaction, and they did not exercise the unmerged candidate live.

## Required before GO

1. Supply the exact approved audit-recovery tenant and obtain a clear
   controlled release report for the intended production target.
2. Resolve the outstanding identity lifecycle and user provisioning/reset
   findings under an accepted product/security contract.
3. Run protected, non-destructive role and cross-tenant checks with approved
   identities from distinct companies; verify departmental handoffs and
   integration outcomes against source records.
4. Demonstrate a ten-company workload and operational recovery at the intended
   rollout scale, with current logs, monitoring, and rollback evidence.
5. Complete CI and exact-commit deployment verification before any production
   promotion, then verify the live application again.

For a client-facing signed-BOM demo, also prepare an explicitly synthetic,
approved fixture in the dedicated demo tenant and verify the complete award
handoff, Finance draft, tasks and audit after refresh. Do not represent the
existing approved BOM as signed or awarded.

No production business records, provider configuration, or deployment was
changed during this release preflight. The selected browser checks created and
revoked sessions for dedicated demo identities.
