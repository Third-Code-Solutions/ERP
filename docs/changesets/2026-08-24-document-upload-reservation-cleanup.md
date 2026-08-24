# Document upload reservation cleanup lane

## Scope

- Added a separately gated BullMQ scheduler and strict versioned cleanup job.
- Added global oldest-first expiry across the exact tenant allowlist, with a
  maximum of 25 rows per run and deterministic tenant/project row locking
  before quota-affecting terminal transitions.
- Added just-in-time terminal reservation claims with `FOR UPDATE SKIP LOCKED`,
  exact ledger-owned Storage deletion, attempt-scoped finalization, bounded
  exponential retry, and durable exhausted evidence after six recorded provider
  failures.
- Preserved recovery beyond the provider-failure cap when a stale claim has no
  durable provider outcome, including the Storage-success/finalization-crash
  window.
- Added a 30-second abort deadline to every reservation Storage request and
  best-effort, five-second-bounded scheduler removal when the cleanup gate is
  closed.
- Added trace-correlated, redacted audit evidence and structured worker metrics
  for expiry age, claims, removals, failures, retries, exhaustion, and duration.

## Safety decisions

- Cleanup remains disabled by default and requires an exact tenant UUID
  allowlist; both the scheduler and service independently fail closed.
- Job data contains no tenant, reservation, project, path, or provider value.
  Every deletion path comes only from the locked server ledger row.
- Only incomplete `released` or `expired` reservations are eligible. Completed,
  active, legacy, unmapped, and prefix-inferred objects are never deleted.
- Provider calls run outside database transactions. Finalization uses tenant,
  project, reservation, terminal state, completion state, and attempt ownership
  as its compare-and-set boundary.
- Raw provider errors, object paths, tokens, URLs, and document content are
  excluded from logs and audit diffs.

## Verification

- PASSED: focused cleanup/Storage tests, 4 files / 33 tests.
- PASSED: complete API document-domain suite, 20 files / 125 tests.
- PASSED: API TypeScript check.
- PASSED: scoped source ESLint check.
- PASSED: `git diff --check`.
- PASSED: independent implementation, verification, and operations reviews
  after repairing fairness, finalization classification, scheduler rollback,
  observability, provider deadline, and max-attempt recovery findings.

## Deployment

Not deployed. Cleanup remains default-off, no tenant is allowlisted, no hosted
Storage object was touched, and no provider/GitHub state was mutated.
