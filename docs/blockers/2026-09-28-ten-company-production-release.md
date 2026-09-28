# Ten-company production release gate

Date: 2026-09-28

## Current decision

**NO-GO** for a whole-ERP client demo or ten-company rollout. Live Web health
and readiness reported revision `efa32923c0f0` on 2026-09-28, matching the
merge commit of PR #120. PR #119 and PR #120 are merged; draft PR #121 at
`2658008868e7b93de1b94363c4799a6a4b76d41f` remains undeployed. The
production migration ledger is 177/179, so the code-only promotion workflow
rejects this candidate before deployment.

## Current PR #121 release evidence

- GitHub checks passed on code commit `2658008868e7b93de1b94363c4799a6a4b76d41f`:
  Actionlint, invariants, build, browser
  interaction, PostgreSQL 17 reproducibility, trusted E2E, lint, security
  scan, types, and unit tests. Supabase Preview skipped; CodeRabbit skipped
  review because PR #121 is a draft. No formal independent review is recorded.
- Disposable PostgreSQL 17 replay matched 179/179 source migration hashes.
  Award integration passed 15/15; ten-tenant, two-role project RLS passed 6/6;
  final-source integrated local browser journey passed 6/6. These are not
  production behavior or whole-module coverage.
- Read-only live audit recovery check on the owner-confirmed `buildops-e2e`
  tenant found 3,745 rows with zero link and hash mismatches at 2026-09-28
  12:17 UTC. The controlled release planner still returned `review_required`
  because of the missing migrations.
- The Supabase ERP project showed a completed physical database backup dated
  2026-09-27 17:23:41 UTC and a restore-to-new-project option. PITR is an
  inactive add-on. A listed backup is not an isolated restore drill, and
  Supabase states that database backups exclude Storage objects.
- The local `plan:database-export` preflight returned `review_required`:
  no approved export URL and no supported dump client were configured in the
  checkout. No encrypted roles, schema, or data export or separate Storage
  recovery evidence is recorded. No production SQL or #121 deployment ran.
- GitHub's production environments have no protection rules. The GitHub
  session is `kurtgav`, also the PR author, so this account cannot provide
  the required independent review. A different reviewer is pending.

Before #121 can release, the database owner and independent reviewer must
verify the exact target and migration hashes; the runbook requires a restorable
point, supplemental encrypted exports, separate Storage recovery, and an
isolated restore rehearsal. Then apply the two reviewed migrations through
the approved runner, recheck the ledger and RLS, and deploy and verify the
exact code revision. Whole-ERP and ten-company GO additionally require the
module, handoff, role, isolation, integration, and workload evidence below.

## Historical earlier release evidence

### Direct evidence

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
- PR #119 extends the same synthetic project isolation check to all eleven
  seeded demo roles. A local read-only run against the deployed site passed
  1/1 with zero retries, as did a separate 11-role route matrix run. The
  extension has not passed the protected production workflow.
- An authorized synthetic BOM in `buildops-e2e` was signed through the live
  canvas page. Read-only database verification found the locked BOM, signed
  session, signature document, active award handoff, project code, one budget
  line, a draft invoice, five tasks, and a linked audit entry. The draft invoice
  had zero net amount and needs Finance confirmation. The BOM was seeded as
  approved, so this did not verify the approval workflow. The demo tenant audit
  verifier passed 3596/3596 current hashes with zero link mismatches after the
  signing test.
- PR #119 adds an atomic database user-row/audit transaction with Auth
  compensation, records password-reset authorization before the Auth request
  and reports uncertain confirmation, fixes an inspection draft autosave
  revision race, and adds route context to browser error reporting. These
  changes remain candidate code until merged, deployed, and verified at their
  exact revision.

### Required before GO at that earlier snapshot

1. Diagnose and fix the intermittent hydration error. Rerun the protected
   production role matrix with zero failed or flaky tests; keep the strict gate.
2. Complete exact-revision CI and deployment verification for any follow-up
   fix, including the password recovery check that did not execute in run
   36353106697.
3. Deploy and verify the password reset audit guard in PR #119. A pre-request
   audit prevents an unaudited Auth submission, but provider success followed
   by a failed confirmation audit remains an explicit reconciliation case.
   Define and verify the durable identity/audit reconciliation contract.
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
