# ADR-035: Durable weekly progress commands

- Status: Accepted for the implementation below
- Date: 2026-09-14
- Scope: Weekly capture, WAR locking and their existing Core-enabled Web flows

## Context

The approved progress-to-WAR workflow must survive uncertain network responses.
The mutable period row currently overwrites capture request identity on revision;
Web generates a new identity per submission. Replaying an old capture can replace
newer evidence, and a lock retry conflicts with its own incremented version.
PR #92 establishes transaction-time current actor/tenant authority, but does not
provide durable command receipts or correct these retry semantics.

## Decision

Use the existing append-only semantic audit store, atomically with each keyed
capture or lock, for original command receipts. No new table or dependency.
Receipt identity is tenant plus client request UUID. The receipt binds actor,
project, operation, canonical payload hash, original committed period/evidence
row and original creation/expected-version evidence. Never reconstruct an
original result from subsequently mutable period or progress rows.

Capture keeps its required clientRequestId. Lock accepts an additive optional
clientRequestId; the new Web command path requires it. Legacy no-key lock remains
compatible but carries no durable exact-retry guarantee. Existing result schemas
gain optional receipt evidence; the new Web path rejects missing or inconsistent
receipts as unconfirmed outcomes, not success.

Under current actor, tenant, audit-chain and project admission, check the receipt
before current version/status/cutoff checks. Same identity and payload returns
the original row and receipt with changed=false. A different actor, operation,
project or payload conflicts. In particular, A then B then retry A must leave B
untouched, and retrying a successful lock must not require a new expectedVersion.

Recognize legacy identities in current period keys and existing period row-audit
insert/update before/after fields. If recognized without a trustworthy original
receipt, reject for reconciliation. Do not synthesize actor ownership from
created_by, erase history, or treat an overwritten legacy identity as new.

Read PostgreSQL clock time after admission and relevant row locks. Do not accept
client timestamps or a production test-clock override. Validate canonical shared
cutoff and linked evidence week. Lock additionally respects transaction start
time because the existing trigger uses now(); a transaction crossing cutoff
must retry. Tests use real future captures and directly seeded historical lock
fixtures, not a public injected past clock. No Sunday-only restriction, global
database cutoff migration or new billing rule is introduced.

Web retains the exact command and UUID through unknown responses, validates
receipt scope and payload, prevents duplicate dispatch, and ignores stale scope
results. A later rejection cannot resolve an earlier unknown result. Refresh
failure after a confirmed commit is a warning, not rollback. Original receipts
must not overwrite newer displayed ledger evidence. Existing non-Core canary
flows remain available and must not silently generate replacement Core keys.

## Verification and limits

Prove historical replay, lock retry, identity conflicts, legacy-key recognition,
audit-failure rollback, concurrent commands, current lifecycle admission and
real database cutoff enforcement. Browser proof covers exact retry, changed
scope/permissions, lost responses, dirty input preservation, keyboard access and
four responsive widths. Synthetic tests are not production or demo-account proof.

Existing recovery and coordinated-release gates remain. Legacy direct writers
and global database enforcement of cutoff for unlocked weeks are outside this
Core command boundary; do not claim that stronger database guarantee.
