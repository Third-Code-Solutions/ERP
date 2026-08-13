# Asset register domain boundary

Status: source design for M3.90. No hosted schema has been applied.

## Purpose

Give construction and adjacent-business teams one tenant-scoped operational
register for equipment and other durable items. The register supplies stable
identity and current assignment context to later Cortex, project turnover, and
maintenance workflows.

## In scope for the first slice

- `Operational Asset` identity: tenant, asset tag, name, kind, serial number,
  manufacturer, and model.
- Current `Asset Status`: `active`, `maintenance`, or `retired`.
- Optional current assignment to one tenant Project and a free-text location.
- Commissioned and retired dates, notes, timestamps, and tenant-safe creator
  reference.
- Database uniqueness, composite tenant foreign keys, RLS, service-role-only
  privileges, and the existing audit trigger.

## Explicitly deferred

- Acquisition or capitalization entries, depreciation, book value, tax basis,
  disposal proceeds, or any posting to the General Ledger.
- Maintenance work orders, service history, warranties, meter readings,
  inspection evidence, parts consumption, or technician scheduling.
- Assignment history and event sourcing. The current assignment is a snapshot;
  a later event model must preserve history before any write authority is added.
- Browser writes or a public API command. NestJS must own future commands behind
  a tenant canary, idempotency, permission checks, and transaction tests.

## Integrity rules

1. Every row carries one `tenant_id`; the tag is unique within that tenant.
2. A non-null serial number is unique within that tenant.
3. A Project link and creator are composite tenant-safe foreign keys.
4. A retired asset requires `retired_on`; dates cannot run backward.
5. Retired records are retained as evidence; no hard-delete workflow is defined.
6. The table is RLS-enabled and forced, with no `anon`/`authenticated` table
   privileges. Only the server `service_role` may access it until an explicit
   API read/write contract exists.
7. Mutations must use the existing audit trigger when authority is eventually
   enabled.

## Acceptance evidence

- Drizzle schema exports `assets`, `assetKindEnum`, and `assetStatusEnum`.
- Migration contract test checks table, constraints, composite foreign keys,
  audit trigger, RLS, and privilege boundaries without contacting Supabase.
- Root typecheck/test/build remain green.
- Migration planner remains `review_required`; no hosted SQL executes in this
  milestone.
