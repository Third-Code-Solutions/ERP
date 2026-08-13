# M3.141 - Core-only manual Cost Entry creation

## Scope

Remove the Web manual Cost Entry create fallback and make NestJS the only
official creation writer.

## Changes

- Require `cost.record` before command submission.
- Send exact integer cents and a supplied/generated idempotency key to
  `POST /v1/projects/:projectId/cost-entries`.
- Verify Core-returned tenant and Project identity before revalidation.
- Remove the frontend create selector/allowlist.
- Add focused tests for routing, keys, Core failure, scope mismatch, and
  capability denial.

## Explicit boundary

Cost Entry deletion remains on legacy Web path. It is not declared migrated;
next slice must add Core transaction, idempotency, audit, and rollback proof
before removing that writer.

## Safety

API-side `ERP_COST_ENTRY_CREATE_WRITES_ENABLED` plus tenant allowlist remains
closed by default. No hosted SQL, Vercel build, Railway deploy, or provider
mutation occurred.

Validation: focused action 5/5; Core client 113/113; Web 91/591; shared
27/229; database 47/51 files with 183 passed/141 skipped; API 112/480;
production build 81/81 routes; typecheck/lint, migration verifier, Actionlint,
Gitleaks, controlled-release 5/5, and provider-spend 4/4 passed. Database
skips require `DATABASE_URL`; prior disposable replay supplies no-skip
evidence. Hosted providers remain closed.
