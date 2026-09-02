# Finance aging canary determinism

Date: 2026-09-03

## Outcome

Reproduced and fixed the Finance database-reproducibility failure that blocked
dependent CI build and E2E jobs. The defect was confined to two integration
fixtures whose expected aging snapshot drifted with wall-clock time. Production
receivable/payable calculations, schemas, migrations, authorization, tenancy,
and accounting controls are unchanged.

## Change

- Freeze only JavaScript `Date` in the payables and receivables protected HTTP
  canaries at the fixture's intended 2026-08-06 UTC snapshot.
- Restore real timers unconditionally after every test.
- Assert the response `asOfDate` explicitly so the snapshot contract cannot
  drift silently again.

## Reproduction evidence

On the unmodified tests at the September 2 snapshot:

- payables moved 55,000 cents from Current to 1–30, moved 110,000 cents from
  31–60 to 61–90, and increased overdue open balance/count from 110,000/1 to
  165,000/2;
- receivables increased overdue balance/count from 99,000/1 to 148,500/2.

Every other displayed aggregate matched, confirming date-bucket drift rather
than an accounting, migration, tenant-isolation, or allocation defect.

## Verification

| Gate | Result | Evidence |
| --- | --- | --- |
| Full local migration reset | PASSED | Supabase CLI 2.109.1; PostgreSQL 17.6 |
| Focused DB-backed integration | PASSED | 2 files, 2 tests |
| Neighboring Finance tests | PASSED | 33 files, 75 tests |
| API TypeScript | PASSED | Complete API typecheck |
| API source lint | PASSED | Repository production-source lint |
| Migration catalog verifier | PASSED | 150 migrations |
| Schema diff after CI ordering | PASSED | Clean diff |
| Independent QA | PASSED | `GO`; zero P1/P2 findings |
| Integration-spec direct ESLint | NOT CONFIGURED | Repository ESLint has no matching integration-file configuration; TypeScript and Vitest cover the files |
| Hosted protected workflow | PASSED | Run 33659709980: Actionlint, type check, lint, Security Scan, BUILD OPS invariants, unit tests, PostgreSQL 17 database reproducibility, build, and trusted E2E all passed |
| Production deployment | NOT RUN | No runtime behavior changed; ADR-020 still applies |
