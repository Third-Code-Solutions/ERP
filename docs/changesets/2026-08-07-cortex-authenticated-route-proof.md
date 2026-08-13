# M3.158 Cortex authenticated route proof

## Outcome

- Added a rejecting loopback Supabase Auth/profile contract and dedicated
  Playwright configuration for the real protected `/cortex` route.
- Proved middleware, session cookie, server profile, PostgreSQL graph,
  conversations, notifications, local Realtime, and responsive rendering.
- Kept semantic indexing paused and observed zero indexing/provider requests.
- Fixed initial document auto-scroll by limiting chat follow-through to the
  agent's internal log.
- Allowed configured loopback Supabase HTTP/WS only in development CSP.
- Bounded root Turbo tests to two packages after measured contention failures.

## Validation

- Local PostgreSQL 17: 104/104 migrations; deterministic seed; release current.
- Playwright installed Chrome: 1/1 desktop/mobile, no console/page errors,
  overflow, initial scroll, foreign egress, or spend requests.
- Web 639/639; shared 243/243; API 546/546; forced bounded root suite green.
- Lint, typecheck, provider-spend 4/4, and production build with 82 static
  pages passed.

## Release boundary

No hosted SQL/Auth/Storage/data mutation, provider call, cloud build, or
deployment. This is exact route-contract evidence, not full GoTrue/PostgREST
or managed Auth parity. All flags remain closed.
