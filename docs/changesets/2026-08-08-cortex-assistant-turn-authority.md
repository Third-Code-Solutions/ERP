# M3.161 Cortex assistant-turn authority

## Outcome

- Added signed, idempotent NestJS generation claim and completion commands.
- Added a service-only PostgreSQL lease/fencing/replay state machine tied to one
  official user turn.
- Rechecked current tenant, membership, capability, ownership, context, and
  citation visibility; hard-coded assistant role and audited mutations.
- Claimed before provider work; replay spends nothing; quota denial completes a
  free grounded fallback.
- Preserved the public stream and legacy path behind closed exact-tenant flags.

## Validation

- Shared 251/251; API 573/573; Web 661/661; ordinary database 203 passed / 143
  expected skips.
- Disposable PostgreSQL/Redis: 106/106 migrations, database 346/346 zero skips,
  API integration 33/33, focused authority 1/1, stable schema hash.
- Bounded forced root tests, lint/typecheck, local Nest/Next builds with 82
  static pages, spend 4/4, release 5/5, Actionlint, and pinned actions passed.

## Release boundary

All flags remain false, allowlists empty, and HMAC secret unset. Managed
Supabase remains last verified at 55/106 and was not accessed. No hosted
mutation, provider call, cloud build, or deployment occurred. Complete-clone
replay, backup/PITR, exact-tenant parity, and protected canary remain required.
