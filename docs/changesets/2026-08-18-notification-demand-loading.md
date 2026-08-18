# Notification demand loading — 2026-08-18

## Status

**PRE-CI.** This changeset removes an avoidable Core API call from every
authenticated route transition. It does not establish hosted performance p75
metrics or production readiness.

## Changes

- The notification dropdown now fetches and polls only while the user has it
  open. Supabase Realtime remains subscribed so an actual notification event
  can refresh the badge.
- Read-state mutations retain optimistic feedback, prevent concurrent writes,
  roll back on failure, and expose a retryable error instead of silently
  swallowing a failed Core request.
- The notifications browser harness now refuses a non-loopback database unless
  an explicit disposable-hosted-database opt-in and exact expected host/user
  are provided, and it accepts only loopback Redis.
- The harness no longer attempts to delete immutable audit records. Its
  isolation contract is a resettable local database or a disposable Supabase
  branch that is reclaimed as a whole after the test lane.

## Verification before push

- PASS — Node 22.23.2 Web lint, Web TypeScript including E2E configurations,
  and `git diff --check`.
- PASS — authenticated notification browser E2E against the disposable branch:
  no Core notification request before opening the bell, Core-authoritative
  reads and writes afterward, tenant isolation, and desktop/mobile overflow
  checks.
- NOT RUN — a fresh Vercel preview build and the trusted GitHub hosted E2E
  gate for this exact commit.

## Reclamation requirement

The disposable Supabase branch contains only test fixtures and immutable audit
rows produced by the browser test. Do not delete individual audit records;
drop the verified disposable branch only after its preview and CI gates are no
longer needed.
