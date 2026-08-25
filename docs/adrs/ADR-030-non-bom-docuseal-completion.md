# ADR-030: Non-BOM DocuSeal completion authority

- Status: Accepted
- Date: 2026-08-25
- Owners: Third Code Solutions Inc.
- Finding: AUD-021

## Context

Variation orders and certificates of completion can be sent to DocuSeal, but
the trusted `submission.completed` path previously completed only BOM records.
That leaves commercial documents unsigned in the ERP despite a provider
completion, and prevents a certificate from starting its warranty period.

The existing in-app signing authority already defines the desired semantics:
a signed VO becomes `signed`; a signed COC becomes `signed` and begins a
365-day warranty period. PRD §O-10 requires at least one year, so the existing
365-day rule is retained rather than inventing a different duration.

## Decision

Core is the sole completion authority for BOM, VO, and COC DocuSeal callbacks.
For a valid provider `submission.completed` event it resolves exactly one
tenant-scoped signing source, retrieves the completed PDF, stores the
deterministic immutable artifact, locks the source and its project quota, and
commits the durable document, source transition, semantic audit entry, and
in-app notifications atomically.

VO completion sets `variation_orders.status = signed`, `signed_at`, and
`signed_document_id`. COC completion sets the equivalent signed evidence and
sets `warranty_period_starts_at` to the trusted completion time and
`warranty_period_ends_at` to exactly 365 days later. This is the same rule as
the existing canvas signing path. Commercial/CX notifications go to the
existing Sales, Commercial, Admin, and Owner roles; warranty ticket work
continues to use its existing CX workflow.

Each source table has a non-null unique provider submission ID. Replayed
completion events are idempotent: they return handled/duplicate without
retrieving, storing, notifying, or mutating again. Unknown IDs remain an
unhandled success so a provider retry cannot disclose tenant existence.

## Rollout and rollback

Deploy the additive uniqueness migration before enabling any new template.
Exercise BOM, VO, and COC callbacks in an isolated provider account with
duplicate, wrong-ID, missing-artifact, storage-failure, quota, and tenant
isolation evidence. Rollback disables template initiation or webhook routing;
it does not delete durable signed artifacts, signed records, audit entries, or
warranty evidence. A follow-up forward migration fixes any defect.

## Consequences

- Provider completion and in-app signing have one consistent VO/COC state
  model.
- COC warranty starts from trusted signing completion, not browser clock or a
  user-editable field.
- The provider callback remains an external side effect before the database
  transaction; deterministic object keys and idempotent source locking make
  failure/retry behavior explicit.
