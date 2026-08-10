# M3.219 Protected CAD HTTP boundary

## Change

Added a protected Nest controller regression harness for CAD evidence commits.
It exercises the production JWT and capability guards, verifies tenant
membership authority, trims and forwards idempotency, rejects caller-supplied
`tenantId`/`actorId`, and proves Core is not invoked on auth or capability
failure.

## Evidence

- Focused controller + protected tests: 7/7 passed.
- Root tests: shared 315, API 740, Web 749 passed; database integration tests
  remain environment-gated in the ordinary no-`DATABASE_URL` run.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `NEXT_PRIVATE_BUILD_WORKER=0 pnpm build`: PASS, 82/82 routes.
- `pnpm test:provider-spend-guard`: PASS, 4/4; Vercel Git deployments remain
  disabled and deploy automation remains blocked.
- `git diff --check`: PASS.

No Supabase, Vercel, Railway, deployment, or paid action occurred.

## Open gate

Prove protected Web/Core response parity, scope replacement, idempotent replay,
draft-BOM separation, and rollback on disposable PostgreSQL before any canary.
