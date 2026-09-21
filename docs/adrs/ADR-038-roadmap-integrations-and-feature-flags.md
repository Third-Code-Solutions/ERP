# ADR-038: Additive roadmap workflows use durable evidence and dark-by-default adapters

- Status: Accepted
- Date: 2026-09-22

## Context

The remaining roadmap spans procurement, perpetual inventory, tax/currency
configuration, period close, SAP, and external message providers. These domains
already have production-facing tables and workflows. Replacing them or making a
provider call from a request handler would risk changing release behavior and
would make retries, audit, and tenant isolation difficult to prove.

## Decision

Implement the roadmap as additive, tenant-scoped evidence tables and
idempotent commands. External SAP, email, and SMS delivery goes through durable
outboxes with typed adapters, bounded retries, and response validation. Each
adapter is disabled unless an explicit tenant/provider feature flag and
server-side credentials are present. Disabled or misconfigured providers remain
pending/dead-letter evidence and never claim delivery.

Price, currency, and statutory tax inputs are effective-dated immutable
snapshots at document use. Existing PHP centavo, quantity micro-unit, RLS,
append-only audit, and fiscal-period invariants remain authoritative. SAP is an
interface to the statutory book of record, not a second ledger.

## Consequences

- Existing purchase-order, receipt, bill, cash, and notification routes remain
  available while new lifecycle views are introduced.
- Replays can be reconciled after timeouts without duplicating procurement,
  inventory, tax, or provider effects.
- The application can be merged and deployed with all new flags off while
  provider credentials, delegation bands, SAP module mapping, and statutory
  template approval are still external boundaries.
- Additional evidence tables and release tests increase migration and query
  surface, but make close, integration, and audit states observable and
  reversible.
