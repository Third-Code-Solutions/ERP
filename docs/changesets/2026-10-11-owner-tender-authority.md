# Independent owner and tender authority

Authorization: independent ABI OPS remediation, ADR-040; local implementation only.

## Agent 04 → Agent 05

Added two forward migrations: tender writes are Core-owned (browser grants revoked,
restrictive deny policies retained), while tenant reads and trusted server writes remain.
Platform owner identity is no longer fixed to the seller's email. Existing immutable
bindings remain untouched. An unexposed, database-owner-only, invoker bootstrap accepts
an explicit verified active identity once and writes its audit event atomically.

Verification: both migrations applied on the synthetic `erp-abi-ops-remediation-db`
PostgreSQL 17.6 container. `independent-owner-tender.database.test.ts`: 11 PASSED,
covering tenant isolation, tender write denial, trusted writes, independent ownership,
bootstrap repeat/role/verification/lifecycle denial, immutable binding and audit rollback.
No hosted database or provider operations.

→ Handoff to Agent 05. Inputs: new owner identity contract and private bootstrap function.
Expected output: Core guard compares verified identity with stored assignment; explicit
offline bootstrap command; no email/environment self-grant or ownership transfer.

## Agent 05 → Agent 03

Core owner guard now compares provider-verified email and immutable ID with the stored
assignment, retaining single-owner and recent-authentication gates. Removed the shared
seller-email authorization constant. Offline `scripts/bootstrap-platform-owner.mjs`
requires migration credentials, explicit target/UUID/email/reason, previews by default,
and requires `--apply` for the once-only database function. It never loads local env files.

Verification: bootstrap argument checks 3 PASSED; owner guard, authentication freshness
and platform lifecycle tests 22 PASSED. Updated integration fixtures use independent
synthetic identity. Database/HTTP integration checks pending after Web handoff.

→ Handoff to Agent 03. Inputs: assignment-based owner decision and unchanged
`is_platform_owner` RPC. Expected output: middleware/settings consume that decision
without a seller-email prefilter; non-owners and provider failures stay denied.

## Agent 03 → Agent 12

Middleware and Settings now use the authoritative owner RPC for any verified identity.
Updated the loopback browser harness and specs to bootstrap an independent synthetic
owner and accept an explicitly supplied loopback-only database target.

Verification: middleware and Settings tests 20 PASSED, including unverified identity
and provider-failure denial. Platform/invitation database HTTP
integration tests 13 PASSED on the isolated database. Browser execution is deferred
to the main agent's coordinated final pass; Core build and loopback Redis are required.

→ Handoff to Agent 12. Inputs: migrations, guards, offline bootstrap and browser harness.
Expected output: regression review, focused lint and exact verification boundary.

## Agent 12 → Agent 01

Reviewed assignment matching, bootstrap privilege/identity checks, once-only locking,
audit atomicity, grants and restrictive policies. Added operator runbook. Historical
migrations and existing owner rows are unchanged. No production owner was selected.

Final targeted checks:

- PASSED: owner/tender database and existing platform boundary tests, 27 tests.
- PASSED: platform/invitation database HTTP tests, 13 tests.
- PASSED: Core owner/fresh-auth/lifecycle unit tests, 22 tests.
- PASSED: Web middleware/Settings tests, 20 tests.
- PASSED: offline bootstrap argument/target checks, 3 tests.
- PASSED: `git diff --check`.
- BLOCKED: targeted ESLint failed because `eslint-plugin-react-hooks` could not
  resolve from the root through `eslint-config-next`. Main dependency repair and
  final integration pass must rerun lint. Duplicate stalled lint process stopped.
- NOT RUN: browser and full build/typecheck suites; main agent coordinates after
  subsequent financial changes. No hosted Auth, provider, deployment or transfer proof.

Browser command after Core build, with loopback Redis available:
`PLATFORM_BROWSER_DATABASE_URL=<explicit-loopback-postgres-url> pnpm --filter @third-code-erp/web exec playwright test --config playwright.platform-admin.config.ts platform-admin-loopback.spec.ts`.
The harness starts Next dev and Core on ports 4417–4419; it creates/cleans only its
synthetic fixture IDs. Database migrations were applied to the local container directly,
not entered into a hosted or local migration ledger.

→ Handoff to Agent 01. Main owns integration, final lint/build/browser verification,
installation-specific provider/owner acceptance, and deployment authorization.
