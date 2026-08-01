# M3.0 Change Request authority boundary

## Scope

- Add the closed-by-default NestJS command for client Change Requests.
- Add tenant-scoped idempotency, composite parent protection, in-app design
  notifications, and semantic audit evidence.
- Keep the existing Next Server Action and UI authoritative until a reviewed
  canary; no hosted migration or provider deployment is included.

## Validation

- Shared contract: 3/3.
- Database schema/migration contract: 3/3; local migration ledger: 63 files.
- Nest Change Request service/controller: 5/5.
- Web Core client: 20/20.
- Workspace typecheck, lint, production build (78/78 routes), secret scan,
  actionlint, workflow-reference checks, and diff checks pass.
- Serial API suite: 27 files, 125/125. Parallel local run had one unrelated
  existing 5-second controller timeout under concurrent load; no Change
  Request test failed.
- GitHub Actions run `30717165544` for source commit
  `765285a57d37885980f01774bffdb27676a203e0` passed Postgres 17 replay/schema
  diff, database tests without skips, Nest transaction integration, container
  smoke, and production build. E2E remained credential-gated.

## Release boundary

Hosted Supabase, Railway, Vercel, flags, queues, worker services, and business
data remain unchanged while the controlled planner reports pending migrations,
duplicate Purchase Orders, and missing owner-approved audit recovery scope.
