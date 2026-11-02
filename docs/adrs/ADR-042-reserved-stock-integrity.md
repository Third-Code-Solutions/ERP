# ADR-042 — Reserved stock and ledger integrity

Status: accepted for local audit remediation, 2026-10-11.

Active, unexpired reservations reduce stock available to every outgoing ledger
operation, including transfers, consumption, adjustments and receipt reversals.
Reservation writers and ledger writers use the same existing
tenant/warehouse/material advisory-lock key. Availability checks run while
holding that lock and validate the material's base unit.

Consuming a reservation requires the existing stock-posting capability. In one
transaction, create a consumption movement for the exact reserved quantity,
link it to the reservation, transition the reservation and post through the
existing stock-movement/accounting function. A deferred database constraint
requires matching posted movement and ledger evidence before commit. Failure
rolls back the reservation, movement, journal and audit together. Replays reuse
the workflow event and cannot post twice. Historical consumed reservations
are preserved; the migration must not invent missing historical movements.

The existing append-only reversal path remains authoritative. Reversing a
consumption returns physical stock but does not silently reactivate a historic
reservation. Release/expiry never creates ledger movement. An expiry action
requires a reached expiry time; callers may explicitly release an unexpired
reservation instead.

Verify competing reservations and ordinary issues, consume idempotency,
insufficient-stock rollback, matching quantity/unit/project/cost code,
cross-tenant denial and balanced journals against disposable PostgreSQL.
Recovery is a forward correction or a verified restore into another target;
never delete stock or accounting history.
