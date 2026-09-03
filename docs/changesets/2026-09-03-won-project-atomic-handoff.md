# Won-to-Project atomic handoff

## Outcome

Pipeline Won/Closed Won transitions now fail closed through the existing Core
transaction instead of persisting the stage first and swallowing conversion
failure. The mutation authority, linked-Account validation, KYC gate,
idempotency, Project/checklist handoff, UI visibility, and role policy are
aligned for all thirteen canonical roles.

## Changed areas

- `packages/shared-types/src/authorization.ts`
  - limits Core stage change and conversion to Owner, Admin, and Sales.
- `apps/api/src/crm/opportunity-stage-transition.service.ts`
  - preserves one atomic stage/handoff transaction, validates tenant-linked
    Accounts, and aligns dual-track versus legacy KYC behavior.
- `apps/api/src/crm/opportunity-project-conversion.service.ts`
  - rejects missing/cross-tenant linked Accounts before ledgers or Project
    writes.
- Core guard/service/HTTP integration tests
  - cover all roles, write-boundary rollback/retry, replay/concurrency,
    membership revalidation, tenant isolation, and PostgreSQL adversarial cases.
- `apps/web/src/app/(dashboard)/pipeline/actions.ts`
  - sends Won commands only through the gated Core adapter, validates committed
    results, returns `projectId`, and removes the active legacy fallback.
- `apps/web/src/app/(dashboard)/pipeline/conversion/page.tsx`
  - retains all-role read access while showing stage controls only to
    Owner/Admin/Sales.
- focused Web tests
  - cover fail-closed action behavior and exact all-role page visibility.

No schema, migration, dependency, environment value, demo record, account,
secret, or deployment target changed.

## Verification

| Check | Result |
| --- | --- |
| Shared authorization | PASSED — 32/32 |
| Focused Core guard/services | PASSED — up to 87/87 |
| Neighboring CRM | PASSED — 68/68 |
| PostgreSQL 17 HTTP integrations | PASSED — 2/2 with rollback-contained adversarial cases |
| Focused/final Web suites | PASSED — action 14/14; combined page/route/action/client 255/255 |
| Independent QA | PASSED — rounds 2 and 3 `GO`; no remaining in-scope P1/P2 |
| Shared/API/Web/E2E TypeScript | PASSED |
| API/Web source ESLint | PASSED |
| API/Web production builds | PASSED — Web 89/89 pages |
| WO-13 contract | PASSED — 1/1 |
| Gitleaks and diff checks | PASSED |
| Direct Core supplied-role matrix | PASSED — 3 allowed reached business validation; 8 denied returned 403; no mutation |
| Final built-browser UI matrix | PASSED — 11/11 supplied identities |
| Positive browser Won conversion | BLOCKED — no safe Contract-stage demo fixture |
| Estimator/PM browser cases | BLOCKED — identities not supplied |

## Release status

Implemented locally on the branch stacked above PR #22. No deployment or demo
mutation was performed. Strict status is `PARTIAL`: authorization, rollback,
runtime, and browser visibility are verified, but a successful browser mutation
requires a safe deterministic Contract-stage fixture. ADR-020 requires the
reviewed stack on `main` with green release gates on that exact SHA before
production release.
