# ADR-037: Core-owned claim transition command receipts

## Status

Accepted — 2026-09-20.

## Context

Progress-claim draft creation and document attachment already use ERP Core
authority, but the remaining claim lifecycle actions still updated
`progress_claims` directly from Next server actions. That left authorization,
project-document scope and retry semantics split between the browser adapter
and the database writer.

## Decision

Add one Core endpoint, `POST /v1/claims/:claimId/transition`, with a strict
command union for submit, certificate-pending, certify, handover, invoice link,
payment, rejection and cancellation. Core will:

- admit the current active tenant user and action-specific capability/role;
- lock the claim and non-retired project within the transaction;
- enforce the exact current status transition and linked project scope;
- persist the change and an append-only semantic command receipt atomically;
- replay an exact request identity without a second mutation;
- reject reused request identities with a different payload.

The Next action layer remains a compatibility adapter for existing route
callers and notifications. It sends the same stable request identity on retry,
validates the returned tenant/actor/claim scope and never writes the claim row
directly.

No migration or dependency is required; receipts use the existing append-only
`audit_log` chain.

## Consequences

Claim transitions have one auditable authority and deterministic recovery after
timeouts. Existing statuses, role behavior and UI routes remain unchanged.
The release still requires the normal Core/Web coordinated deployment evidence
and the production encrypted backup/restore gate.
