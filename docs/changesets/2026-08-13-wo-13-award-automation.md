# WO-13 — signed BOM award automation

## Scope

Promote a locked, client-signed BOM into one tenant-scoped execution handoff.

The current repository contract requires `boms.project_id`. WO-13 therefore
promotes the existing project shell in place, assigns `projects.project_code`,
and records `project_was_created=false`. A future nullable-BOM migration is
required before the system can literally create a project after BOM signing.

## Implemented

- Added the tenant-safe `award_handoffs` ledger with idempotency, reversal
  state, composite foreign keys, RLS, and an audit trigger.
- Added project-code allocation under a tenant transaction advisory lock.
- Added BOM-line-derived draft Project Budget and Cost Code baseline.
- Added a clearly labelled draft down-payment invoice. The rate is explicit;
  portal signing defaults to zero until Finance confirms commercial terms.
- Added Project Tracker metadata and award process steps for AR/project code,
  DP invoice, CARI, Project Tracker, and CX onboarding.
- Added immediate internal business-day clocks for AR, DP, and CARI. Tracker
  and CX tasks are created blocked until an NTP date exists.
- Made portal token use, BOM lock, award graph, and semantic audit write one
  transaction. Notifications are post-commit and report delivery failures
  without reversing the committed award.
- Added operator UI for creation and explicit reversal, with responsive
  layout, accessible status feedback, and no duplicate award path.

## Verification

- Database and web typechecks: PASS.
- Disposable PostgreSQL 17 migration lane: PASS, 65 migrations.
- Live service probe: PASS for project promotion, budget recomputation,
  invoice amount, five tasks, three active clocks, idempotent rerun, and
  rollback on missing priced lines.
- WO-13 database integration tests: PASS, 3/3.
- Tenant audit coverage: PASS, 114/114 tables.
- Build-ops static invariants: PASS.

## Release boundary

No hosted Supabase migration was applied. Hosted promotion remains blocked by
the previously observed provider-only migration/data gates; this changeset is
local/disposable evidence only.
