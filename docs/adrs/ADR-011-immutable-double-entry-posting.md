# ADR-011: Immutable double-entry posting

- Status: Accepted
- Date: 2026-07-27

Third Code ERP records financial effects as balanced journal entries and makes
their lines immutable at posting. Corrections create linked equal-and-opposite
reversal entries instead of editing posted history. Posting, numbering,
closed-period validation, and reversal run in database transactions so
concurrent requests cannot produce partial ledgers or duplicate numbers.

This rejects mutable financial rows and application-only validation. The cost is
more explicit correction workflows; the benefit is a ledger that can reconcile,
be audited, and remain trustworthy under concurrency.
