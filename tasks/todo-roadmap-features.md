# Roadmap feature execution checklist

- [x] Read current schema/API/provider patterns and record compatibility notes.
- [x] Add additive schema for procurement, reservations, landed cost, pricing,
      tax/currency, close controls, SAP outbox, and provider delivery.
- [x] Add migration RLS/grants/indexes/check constraints and isolation contracts.
- [x] Add domain services and strict request/response validation.
- [x] Add idempotent audit/event evidence for every mutation.
- [x] Add procurement and inventory API routes and tests.
- [x] Add pricing/tax/currency resolution services and tests.
- [x] Add period-close and SAP outbox services and tests.
- [x] Add real-provider adapters with feature flags and fake-provider tests.
- [x] Add protected web routes, loading/error/empty states, and role-aware UX.
- [ ] Add all-role E2E journeys for enabled demo paths; prove disabled flags stay
      dark.
- [ ] Run focused gates, then full CI-equivalent gates (focused gates pass;
      full API Vitest/E2E/hosted gates remain not run).
- [x] Write `docs/changesets/2026-09-22-roadmap-features.md` with PASS/FAIL/
      BLOCKED/NOT RUN evidence.
- [ ] Push PR only after local gates are green; do not promote production from
      this branch until the exact merged SHA passes the guarded release workflow.
