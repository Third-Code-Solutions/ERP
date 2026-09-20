# Invoice allocation and Auth compensation reconciliation

## Outcome

Closed two post-CI P1 consistency defects without changing the database
schema:

- Core customer-invoice drafts and the retained Web procurement invoice writer
  now query the maximum numeric invoice suffix for the tenant/month. Lexical
  ordering no longer allocates `INV-...-1000` a second time after `...-999`.
  Suffix arithmetic uses shared `BigInt` logic and is exact beyond the
  JavaScript safe-integer range.
- Core platform-user lifecycle and invitation compensation, plus Web retained
  history suspension, now reacquire the shared tenant advisory lock and read
  the committed account status before reconciling Auth. A failed transaction
  cannot unban or re-enable a newer successful suspension.

## Verification

- Shared invoice-number regression: 3/3 passed.
- API lifecycle compensation regression: 1/1 passed.
- API invitation-revocation/lifecycle compensation suite: 20/20 passed,
  including durable-state reconciliation after rollback.
- Web admin user suite: 22/22 passed.
- API invoice draft focused suite: 4/4 passed.
- Targeted source lint passed after removing the obsolete lexical-order import;
  the repository's existing Next pages-directory warning remains.

Hosted CI/build and full suites passed on commit `a38853cfb0aa69f3d559b92e1951b92e34b5b7c9`:
[run 35506660238](https://github.com/Third-Code-Solutions/ERP/actions/runs/35506660238).
Actionlint, BUILD OPS invariants, Security Scan, Type Check, Lint, Unit Tests,
PostgreSQL 17 database reproducibility, Build, Claim Document Browser
Interaction, and trusted authenticated E2E all passed. No migration,
dependency, hosted data, or production deployment was performed.
