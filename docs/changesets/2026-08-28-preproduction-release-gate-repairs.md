# Pre-production release-gate repairs handoff

## Outcome

Added `docs/handoffs/2026-08-28-preproduction-release-gate-repairs.md` for two
reproduced local failures: active-source legacy branding on `/book-demo` and
`/owner`, and a default database Vitest command that selects the runtime-bound
Supabase Auth proof without its required local runtime.

## Required ownership

1. Agent 04 makes generic/default test selection explicit while retaining a
   mandatory fail-closed `test:auth-api` lane.
2. Agent 15 repairs the two public book-demo source strings.
3. Agent 03 repairs the one owner-route source string.
4. Agent 12 revalidates security/workflow/consent/owner boundaries.
5. Agent 13 reruns the exact Node 22 local release matrix, including the real
   zero-skip disposable Auth proof.

## Boundaries

- PASSED: documentation-only scope; no code, PRD, generated build artifact,
  provider, production, database, billing, runner, or deployment state changed.
- NOT RUN: implementation and test commands. This handoff does not close any
  local gate or alter the production **NO-GO** decision.
