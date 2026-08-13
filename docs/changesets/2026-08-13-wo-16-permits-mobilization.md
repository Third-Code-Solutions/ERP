# WO-16 — Permits, external returns, and mobilization readiness

## Scope

- Extended the permit tracker for occupancy permits, CARI, performance/surety/construction bonds, release, refund, and cancellation states.
- Added tenant-scoped LGU / issuing-authority duration profiles with min/expected/max snapshots and application-side learning from completed LGU permits.
- Added responsible-person ownership, canonical expected return timestamps, countdown/risk fields, and audited escalation actions.
- Added a database-enforced `mobilization_readiness` ledger with four required returns: commented FCD, PO copies, CARI, and NTP from Building Admin.
- Added complete-input start behavior and authorized-reason override behavior. The SQL check remains the final gate; the server action adds capability and audit checks.
- Added responsive project and global permit views, return-risk display, owner display, status controls, and escalation UI.

## Verification

- PASS — database typecheck.
- PASS — web typecheck.
- PASS — full disposable PostgreSQL 17 / Redis 7.4.9 lane: 67 migrations, 262/262 database tests, API integration 3/3, migration ledger exact, schema unchanged during tests.
- PASS — targeted WO-16 database probes: 3/3, including incomplete-start rejection, complete-start acceptance, override acceptance, tenant composite-FK rejection, and authenticated tenant visibility.
- PASS — web unit suite: 359 passed, 2 pre-existing external-worker integration skips.
- PASS — Next.js production build: 80 routes.
- PASS — local production browser smoke: 4/4 existing public/authentication tests, Chromium, `http://localhost:3000`.
- NOT RUN — authenticated permit mutation browser flow; local Supabase Auth credentials/server are not provisioned in the disposable web smoke lane.

## Release boundary

This migration was applied only to the disposable local PostgreSQL lane. The hosted Supabase project was not written. Hosted promotion remains behind the existing release plan, duplicate-data preflight, and provider-linked migration parity gates.
