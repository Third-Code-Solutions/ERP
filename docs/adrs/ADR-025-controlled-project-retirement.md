# ADR-025: Controlled project retirement instead of physical deletion

- Status: Accepted
- Date: 2026-08-19
- Owners: Third Code Solutions Inc.

## Context

ABI OPS needs an authorized person to manually remove a project that was
created in error or is no longer operationally relevant. A construction project
can already have drawings, takeoff evidence, BOM lines, RFQs, purchase orders,
claims, invoices, warranties, or immutable audit history. A physical
`DELETE ... CASCADE` would make financial reconciliation, document provenance,
and legal retention unreliable.

## Decision

The user-facing **Delete project** command is a controlled logical retirement.

1. Only `owner` and `admin` receive the new `project.delete` capability.
2. The command runs through the authenticated Core/API only. It requires a
   typed confirmation, a non-empty reason, an idempotency key, and stale-state
   protection.
3. The migration adds nullable retirement metadata to `projects`:
   `deleted_at`, `deleted_by`, and `deletion_reason`; it adds no cascading
   foreign keys and does not remove data.
4. Normal project lists, search, and command-center routing exclude retired
   projects. A restricted owner/admin recovery surface may restore the project
   by writing a compensating audit event.
5. The change and any restore run in one transaction with an immutable audit
   entry containing actor, tenant, target, action, outcome, and correlation
   trace. Child financial, procurement, document, and audit records remain
   intact.
6. All reads and command locking remain tenant-scoped. Browser roles receive
   no direct database mutation privilege.

## Consequences

- Users obtain the requested manual removal workflow without treating the
  project as disposable data.
- Existing project queries must explicitly exclude retired records; tests must
  prove that a different tenant cannot retire or restore a project.
- Retention duration and permanent destruction, if legally approved later,
  are a separate compliance workflow rather than a UI button.

## Rejected alternatives

- Hard delete with foreign-key cascades: destroys required operational and
  financial evidence.
- Client-side soft delete: bypasses capability checks, transactionality, and
  semantic auditing.
- Reusing `cancelled` status: confuses a real cancelled contract with a record
  that was created accidentally or retired from operations.
