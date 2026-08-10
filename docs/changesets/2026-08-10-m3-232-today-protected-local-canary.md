# M3.232 — Today protected local HTTP canary

## Scope

Added a disposable protected HTTP integration test for the closed Nest
`GET /v1/today` read authority. The test uses the real route, identity guard,
capability guard, Today service, request-correlation middleware, and a
transaction-bound PostgreSQL client.

## Evidence

- Missing bearer: HTTP 401.
- Tenant A: only current-assignee tasks and tenant-scoped projects.
- Other assignee: other tasks are excluded; `includeProjects=false` returns no
  project context.
- Tenant B: no Tenant A rows are visible.
- Browser-controlled `asOf`: HTTP 400.
- Unsupported test-only role: capability guard returns HTTP 403.
- Supplied UUID request identity is echoed in `x-request-id`.
- Seeded tenants/tasks are absent after the enclosing transaction rolls back.
- Focused canary: 2/2 tests PASS.
- Disposable lane: 116 migrations; database 149/149 suites and 370/370 tests;
  API integration 62/62 suites and 47/47 tests; zero pending/skips; identical
  schema SHA-256
  `4FCC37BD3D4BE7B40F108812C7E57D30BC25806E4D7F71D10E8FDE8665C3FDD2`.
- Root `pnpm test`, typecheck, production build, and lint passed. Managed
  Supabase parity, Web DB-boundary, Vercel spend, workflow-reference, and
  diff guards passed.

## Release boundary

This is disposable local evidence, not hosted production certification. The
Web selector remains disabled. No Supabase, Vercel, Railway, deployment,
provider setting, credential, or paid action occurred.
