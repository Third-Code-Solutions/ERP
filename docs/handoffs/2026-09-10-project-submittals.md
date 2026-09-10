# Project submittals / CDE register

## Objective

Add a tenant-scoped project submittal register for document-control workflows:
draft → submitted → under review → approved/rejected, with spec/discipline,
due-date, reviewer notes, plan/document reference, idempotent creates, optimistic
concurrency, and audit evidence. Existing Documents and upload routes remain
unchanged; binary attachment linking is a later storage-contract slice.

## Invariants

- Every row is scoped by `tenant_id` and composite tenant/project/user foreign keys.
- Core API is the mutation authority; direct client table access is revoked and RLS forced.
- Stable client request tokens prevent duplicate creates; changed replay payloads return 409.
- Every mutation checks `version`; stale writes return 409.
- Approved records are immutable; rejected records can be edited and resubmitted.
- Only review-capable roles may approve or reject a submitted submittal.
- Every mutation writes semantic audit data plus the append-only database audit trigger.
- No binary upload, attachment, or transmittal bundle is created in this bounded slice.

## Expected output

Schema/migration, shared contracts, protected Core routes, project Web route,
focused tests, opt-in all-role E2E, changeset, and live-verification notes.

## Verification status

Implemented and locally verified. Live PostgreSQL ACL/RLS replay, a running Core
API, browser execution, and real seeded-account E2E remain release-gate checks.
