# M3.149 - Core user-role assignment authority

## Scope

- Move official user-role assignment into a typed NestJS Core transaction.
- Preserve the existing admin caller surface and legacy server-only path for
  unselected tenants.
- Revoke authenticated direct mutation of `public.users` while retaining
  tenant-scoped reads.
- Add tenant-scoped idempotency, explicit hierarchy/state checks, atomic
  audit, local replay evidence, and closed-by-default canary flags.

## Changed source

- Shared user-role assignment command/result contracts.
- Database enum/schema/export, service-only replay ledger migration, static
  privilege tests, and reproducibility verifier.
- NestJS admin module, pipe, controller, service, capability/config/
  observability wiring, unit tests, and real database integration.
- Web Core client, admin action adapter/hierarchy guards, tests, environment
  examples, and environment documentation.
- M3.149 handoff plus architecture and operations records.

## Validation

- Shared: 28 files / 234 tests passed.
- Database disposable lane: 103/103 migrations and 337/337 tests passed
  without skips.
- API unit: 118 files / 516 tests passed.
- API database integration: 21/21 files passed, including role assignment.
- Web: 93 files / 610 tests passed.
- Typecheck, lint, Nest/Next production build: passed; 81/81 Next routes.
- Actionlint, Gitleaks, controlled-release 5/5, provider-spend 4/4: passed.
- Redis recovery and database schema stability: passed.
- Local production browser: protected admin route redirected to sign-in;
  zero console warnings/errors and no failed requests.

## Release and rollback

Hosted state is unchanged. Managed Supabase was not refreshed; its last
verified 55 migrations versus 103 source implies a 48-migration gap. All four
role-assignment flags remain false/empty. Vercel Git deployments remain
disabled by repository guard, and no Vercel/Railway deploy occurred.

Application rollback: keep both API/Web selectors disabled and revert the
M3.149 source commit if required. Database rollback after a future approved
apply must use a reviewed forward migration; do not restore authenticated
user-table writes except as an explicitly reviewed emergency compatibility
measure, and never edit the managed migration ledger manually.
