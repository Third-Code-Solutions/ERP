# M3.151 free managed-suffix replay

## Outcome

- Cleared the local export-tool blocker using explicit session/direct URL
  support and portable PostgreSQL 17 tooling.
- Added method-correct dump commands and fail-closed tool/version checks.
- Added a localhost-only read verifier for exact 55-to-103 suffix evidence.
- Replayed the remaining nine migrations on the existing hash-valid public
  snapshot clone, proving all 48 pending versions in order.
- Preserved explicit non-release status for synthetic mapping and missing
  managed Auth, Storage, vector, and provider catalog surfaces.

## Validation

- Export planner: 6/6.
- Replay verifier: 4/4 plus live localhost verification.
- Local ledger: 103/103; source suffix: 48/48.
- Public-snapshot database injection: 218 passed, 11 failed, 108 skipped;
  failure evidence retained as release blockers.
- Standard workspace tests, lint, typecheck, and local Nest/Next production
  build passed.
- Actionlint, Gitleaks, workflow references, controlled-release 5/5,
  provider-spend 4/4, and 103-file migration checks passed.

## Release and rollback

No hosted dump, SQL, provider branch, deployment, flag, variable, or tenant
data changed. A local rollback dump was created outside Git before the nine
migrations; the temporary PostgreSQL service was stopped after verification.
Production remains blocked on owner mapping and complete managed restore
evidence.
