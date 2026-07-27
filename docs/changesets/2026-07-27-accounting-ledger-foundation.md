# Accounting ledger foundation

## User outcome

Finance users can maintain a chart of accounts, open fiscal periods, prepare a
balanced journal, post it once, inspect the general ledger, and correct it with
a traceable reversal. Other roles can see approved financial summaries only
when their route and row policy allow it.

## Invariants

- Every posted journal has at least two lines.
- Total debits equal total credits and are greater than zero.
- Each line is either a positive debit or a positive credit, never both.
- Posting dates belong to an open fiscal period.
- Posted entries and lines cannot be updated or deleted.
- Reversals are new entries with swapped debit and credit values.
- One original entry can have at most one reversal.
- Entry numbers are unique and allocated transactionally per tenant and year.
- Ledger accounts, projects, journals, and lines cannot cross tenants.
- Only finance, admin, and owner roles can maintain or post finance records.

## Acceptance criteria

- Given a balanced draft in an open period, posting assigns a unique number and
  makes the entry immutable.
- Given an unbalanced, empty, single-line, inactive-account, or closed-period
  draft, posting fails without a partial write.
- Given a posted entry, reversal creates one linked posted opposite entry.
- Given a second reversal request, the database rejects it.
- Given two tenants, authenticated reads and writes never cross tenant scope.
- Given a non-finance user, posting and finance mutation are denied.
- A clean reset recreates all finance tables, constraints, policies, triggers,
  functions, and grants with an empty schema diff.

## Delivered slice

- Fiscal periods and chart-of-accounts maintenance.
- Balanced draft journals with database-authoritative posting.
- Immutable posted journals and linked opposite-entry reversals.
- Tenant-scoped general ledger with account, date, journal, and project trace.
- Finance-aware search and Cortex graph records.
- Role, tenant, function ACL, row-policy, immutability, and reversal coverage.

## Verification

- Production web build passed; 65 static pages generated.
- Shared types: 76/76 tests passed.
- Web: 31/31 tests passed.
- Database: 55 passed; 26 forward-migration tests gated locally because the
  connected database does not contain the unreleased hardening and accounting
  migrations.
- Playwright inventory: 59 tests across 28 files, including three read-only
  finance journeys.
- Migration manifest, seed, CI workflow, action references, source traces,
  built traces, and whitespace checks passed.
- All 20 deployed migration files remain byte-identical to the fetched
  production ledger.

## Release boundary

This slice is not deployed. Docker Desktop cannot start on this workstation
because hardware virtualization is unavailable, so a local clean reset could
not execute the new SQL. CI is configured to fail if the 26 database runtime
tests skip. A disposable clean database reset, complete catalog verifier,
schema-diff check, authenticated finance browser run, and security review must
pass before production migration or deployment.

Receivables, payables, payment allocation, bank reconciliation, budgeting,
tax, multi-currency, and full period-close operations remain separate slices.
