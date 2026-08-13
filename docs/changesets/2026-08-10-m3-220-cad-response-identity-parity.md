# M3.220 CAD Web/Core response identity parity

## Change

The server-only CAD Web adapter now requires Core's successful result to match
the requested document ID, command project ID, and verified tenant ID. A
schema-valid mismatch is terminal `502`; the upload route cannot report false
success or fall back to the compatibility writer.

## Evidence

- Focused Web CAD adapter + upload route tests: 17/17 passed.
- Root tests: shared 315, API 740, Web 752 passed; ordinary database
  integration tests remain environment-gated without `DATABASE_URL`.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `NEXT_PRIVATE_BUILD_WORKER=0 pnpm build`: PASS, 82/82 routes.
- `pnpm test:provider-spend-guard`: PASS, 4/4; Vercel Git deployments stay
  disabled and deploy automation stays blocked.
- `git diff --check`: PASS.

No Supabase, Vercel, Railway, deployment, or paid action occurred.

## Open gate

Disposable parser-to-Core database replay remains required for scope
replacement, exact totals, idempotent replay, no draft BOM, tenant isolation,
and rollback before a canary.
