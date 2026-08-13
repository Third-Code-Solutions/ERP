# Cortex semantic index runtime proof handoff

## Scope

M3.156 proves the M3.155 cost-bounded semantic-index job against the free,
disposable PostgreSQL 17 and Redis lane. Hosted Supabase, Vercel, Railway, and
AI providers remain untouched.

## Ordered ownership

1. Agent 04 - Supabase/Drizzle Schema Lead
   - Add runtime proof that `authenticated` cannot read or write
     `cortex_semantic_index_jobs` directly.
   - Run against the disposable database only and always roll fixtures back.
2. Agent 05 - API & Backend Logic
   - Add PostgreSQL transaction and BullMQ recovery integration coverage.
   - Use a deterministic fake embedding worker; never call an external AI
     provider.
   - Prove tenant scope, permission revocation, idempotency, one active job,
     64-node/one-call ceilings, empty backlog, recovery, terminal unknown
     outcome, atomic commit, and audit linkage.
3. Agent 12 - Security/DevSecOps review
   - Re-run the zero-skip disposable lane, spend guard, clean-room scan,
     secret scan, lint, typecheck, and production build.
4. Documentation handoff
   - Update architecture and operations memory with exact evidence, remaining
     hosted gates, rollback, and next action.

## Boundaries

- Exact disposable database: `erp_self_hosted_ci` in `ThirdCodeERP-Test`.
- Exact Redis: local `127.0.0.1:6379`, pinned 7.4.9.
- No hosted SQL, provider call, deployment, Git integration, or paid branch.
- Feature flags and all tenant allowlists remain false/empty.

## Completion evidence

- 104/104 migrations.
- Database 341/341 and API integration 31/31 execute with zero skips.
- Fake worker call count and database `provider_call_count` both stay at one.
- Cleanup removes the disposable database and Redis process.
- Schema SHA-256:
  `4DDF4B3D24906CA2328790342E6406636080BE5475AA0138DF8E7431D615E9F6`.
- Protected browser E2E remains closed because its auth helper mutates hosted
  Supabase Auth; this local proof does not authorize a canary or deployment.
- Final local gates: API 546/546; lint/typecheck; NestJS/Next.js build;
  provider-spend 4/4; controlled-release 5/5; Actionlint; Gitleaks across 539
  commits; pinned workflow refs; diff and clean-room checks.
