# Invitation revocation: fresh locked admission before Auth

## Outcome and scope

The platform invitation revocation service no longer authorizes a login ban from a stale invitation read. It now locks the candidate user before the invitation, matching the activation function's ordering, and rechecks the current owner/support authority, tenant, identity, email and invitation/user lifecycle before calling Auth. An accepted invitation or active user must use the separately authorized lifecycle workflow, not invitation revocation.

Bound targets require a sent invitation and an invited user; an unbound pending invitation can still be revoked without an Auth call. User and invitation contention uses NOWAIT and maps PostgreSQL lock errors outside the aborted transaction to a typed conflict. Rejected admission does not trigger a compensating provider call. Successful admission keeps both locks through the existing provider call, database updates and atomic semantic audit.

No endpoint, schema, provider configuration, support permission or response contract changed. No production identity was touched.

## Verification

- PASSED: focused service unit tests 19/19; author observed RED before implementation (17 failed, 2 passed).
- PASSED: independently executed combined platform regression run 46/46, no skips: 33 platform unit tests, 12 new real PostgreSQL admission cases and the existing platform database/HTTP scenario.
- PostgreSQL cases cover missing/ended support context, accepted/active targets, tenant/email mismatch, pending-unbound success, activation committed after preliminary read, separate-connection user/invitation contention, activation excluded while the provider effect runs, transactional revocation/audit, and provider failure without database mutation or false success.
- PASSED: API typecheck, strict standalone compilation of the new integration spec, focused service/unit ESLint, whitespace checks and history secret scan (2011 commits, no findings).
- The required CI database job already runs the API integration directory; the new spec uses the same explicit integration opt-in and additionally requires a loopback database.

## Evidence boundaries and recovery

PostgreSQL verification uses synthetic committed target/invitation fixtures and a fake Auth provider. Global platform-owner assignment and service effects use an outer rollback transaction, preserving assignment immutability without cleanup exceptions. Concurrency uses independent connections and the real activation function. This proves lock exclusion and transactional effects before rollback, not a real provider ban or production durable commit. Synthetic committed fixtures and append-only evidence remain in the disposable database.

This does not complete retained-history suspension or last-active-admin protection across all writers. Provider calls now occur while the existing transaction holds locks and retain the existing eight-second provider timeout. A remote timeout may still have taken effect; a successful ban followed by failed database commit and failed compensation still needs durable reconciliation. These are known separate lifecycle defects, not successful outcomes.

No full build or hosted mutation ran locally. Local Node is 24.16.0; required CI uses Node 22. Push as a draft stacked on PR #74 and the inherited recovery-held stack. Production promotion remains held for database backup/PITR, separate Storage recovery and authorized isolated restore rehearsal before pending migrations.
