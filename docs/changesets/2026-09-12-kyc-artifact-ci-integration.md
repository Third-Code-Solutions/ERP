# KYC artifact CI integration

## Changes

- Register `20260912142153_kyc_artifact_core_authority.sql` as a fourth source-only review batch: 172 source migrations, 15 pending relative to the unchanged dated 157-migration hosted snapshot. The new batch explicitly has `hostedApplyApproved=false`; neither the count update nor the historic top-level approval authorizes a hosted apply.
- Preserve the existing required claim browser job identifier/name while adding the KYC workflow browser spec and screenshot collection. Both run with one worker, zero retries and the existing no-skips assertion. These are credential-free interaction tests, not a replacement for authenticated E2E.
- Run the existing dashboard-query and proposal change-request Web database specs in the disposable database job, with explicit no-skips validation. Previously they could skip in the general source lane without a corresponding required Web database step.
- Serialize database test files only when `DATABASE_HARDENING_EXPECTED=1`, because rollback-only privilege/DDL suites share one database and previously reproduced a cross-suite PostgreSQL deadlock. Explicit multi-connection races within tests remain intact.
- Extend the CI-only legacy privilege fixture with known preserved KYC/account/opportunity SELECT and service-role access, plus existing account/opportunity INSERT/UPDATE. Do not restore artifact writes or parent deletion privileges. The actual migration is independently replayed against representative pre-migration grants inside rollback, so post-migration fixtures cannot hide a destructive revoke.

## Main-agent verification

- RED: the source manifest tests/validator rejected the newly added migration until count, head and ordered batch were registered. GREEN: 6/6 tests and source validator passed. This did not query hosted migration state.
- Read-only local catalog reproduced absent reader/server grants for all three legacy tables in the CLI-equivalent database. After applying the candidate SQL and initial narrow fixture there, 24/25 privilege tests passed; the preserved authenticated account-update case failed. Adding the observed legacy account/opportunity INSERT/UPDATE fixture yielded 25/25 (KYC 9, claim 16), zero skips. No assertion was weakened.
- Independently passed 22/22 Core KYC PostgreSQL tests against the migrated CLI-equivalent disposable database. The separate local authority database passed the 172-migration reproducibility verifier. Neither database is a restored production clone.
- Actionlint passed for the modified workflow using pinned, checksum-verified tooling. Gitleaks passed over 1,998 commits through `625423ca`; subsequent uncommitted files are not claimed covered by that history scan.
- Independently passed the combined claim/KYC Chromium run: 16/16 with one worker and zero retries; inspected the KYC screenshots at 320/768/1024/1440 px. This proves the component harness, not the full authenticated account page.
- Full disposable database suite passed 507/507 with zero skips. Full Web suite passed 2,057 tests with one database-gated skip; that test passed separately, then both named CI Web database workflows passed together 2/2 with zero skips. No claim is made that the original Web run had zero skips. Focused KYC client/actions passed 14/14; Web and E2E typechecks passed.
- Full API source/HTTP suite passed 1,270/1,270 with zero skips. Focused changed Web-source ESLint passed. The full Redis/container API integration lane remains a fresh CI gate; the local KYC PostgreSQL suite is not a substitute for it.
- Pushed `e129495a` to draft PR #68, dependent on #67. Gitleaks then passed across 2,000 commits. Initial CI run `34700439998` passed lint, security and the browser job, but its invariant self-test rejected the stale claim-only report label before database verification. Updated that contract to require both browser specs, both screenshot families and the combined no-skips label; added a contract for both Web database workflows and their no-skips report. The 10 invariant tests and actionlint passed locally. No gate was removed or weakened.
- Pending: fresh Node 22/Supabase CLI CI after the contract correction and any release.

No hosted DDL, Auth deletion, Storage mutation, provider configuration change or deployment was performed. Database backup/PITR, separate Storage recovery, isolated restore rehearsal and hosted index/lock preflight remain release gates.
