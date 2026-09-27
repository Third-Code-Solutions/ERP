# ADR-039: One server-side signed-BOM award operation for Web and Core

- Status: Accepted for local implementation — 2026-09-28
- Scope: WO-13 signed-BOM award authority; no schema or provider change

## Context

WO-13 requires a signed BOM to produce the project code, budget baseline, cost
codes, draft down-payment invoice, Project Tracker, and Finance/CARI/CX tasks as
one atomic handoff. The existing `runSignedBomAward(tx, args)` implements these
rules in `apps/web/src/lib/operations/award-automation.ts`. Web manual award and
portal signing already call it inside their transactions. Core owns the
DocuSeal webhook transaction but cannot import the Web `@/` audit and calendar
modules. The current award helper also loads the tenant holiday calendar via
the global Web `db` connection while its other reads and writes use `tx`.
Duplicating award creation in Core would make money, task, audit, and retry
rules diverge.

## Decision

Create the internal workspace package `@third-code-erp/operations` with
server-only exports for signed-BOM award and its transaction-bound audit and
business-calendar helpers. It depends on the existing database and shared
types packages and adds no external dependency. It must not import Next.js,
NestJS, browser code, or a host's `@/` aliases. Its award entry point accepts
the caller's Drizzle `DatabaseTransaction`; it must not open or commit another
transaction, call an external provider, or send notifications. The caller
owns authentication, current actor/tenant admission, lock timeout, and the
transaction boundary.

The shared operation performs the existing tenant-scoped locked-BOM checks,
hierarchy and exact-centavo validation, project-code allocation, budget/cost
code creation, draft invoice, tracker, tasks, idempotent handoff reuse, and
append-only semantic audit in that transaction. The calendar helper reads
tenant holiday rows through the same `tx` and preserves the current explicit
`BUSINESS_CALENDAR_DB_ENABLED` behavior and national seed. The audit helper
uses the existing hash algorithm and tenant-chain lock in that same `tx`.
The actor recorded for a provider event must be the real admitted actor or
`null` for a system event; a fallback `created_by` user required by domain
foreign keys must not be presented as the webhook actor.

Web manual award and canvas/portal signing become adapters to this one
operation. Core DocuSeal signing calls it after changing the approved BOM to
locked, before recording webhook-token consumption or returning handled
success, all inside Core's existing transaction. A failed award rolls back
the lock, signature acknowledgement, token state, business rows, and semantic
audit together. An exact duplicate returns the existing handoff without a
second budget, invoice, task set, or audit event. Keep any temporary Web
compatibility export as a delegating shim only; it cannot retain a second
financial implementation.

## Consequences and verification

- The package boundary makes Core and Web use one commercial rule set while
  preserving existing routes, contracts, and database rows. No migration is
  part of this decision.
- Tests must prove equal Web/Core handoff outputs, exact centavos, tenant and
  permission denial, transaction-bound calendar reads, audit-failure rollback,
  provider duplicate delivery, and no acknowledged signature without its
  handoff. Keep the existing WO-13 contract and Web award tests active.
- Deploy Core and Web together after disposable PostgreSQL and browser
  verification. Live signing remains unverified until that release runs.

This is a technical extraction of the PRD's existing WO-13 transaction, with
no new product policy, external service, data deletion, or security tradeoff.
AGENTS.md requires the ADR and sequential Agent 05 → Agent 03 → Agent 13
handoff; it does not require separate owner sign-off before local
implementation. Production promotion retains its protected release approval
and evidence gates. A later change to product policy or an ownership conflict
would require an explicit decision and, where applicable, owner sign-off.
