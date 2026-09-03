# ERP route and platform boundary remediation

Status: local implementation, partial acceptance; not released.

## Deployment follow-up — 05:43 +08:00

Fixed Resend configuration reporting to require sender plus key, proven by a
failing-then-passing regression. Four service cases and ten controller tests,
API typecheck/build and focused lint pass. Added secure exact-Core identity
environment provisioning to guarded production promotion using existing GitHub
secrets over stdin and `--skip-deploys`; two workflow contract tests, actionlint,
dependency audit and a60305-byte changed-code secret scan pass. Updated the
identity runbook and existing operational notes. No provider setting changed.
Local browser startup found the disposable database absent; a source-only empty
replay applied158 migrations and passed schema/audit176/176 checks. Full API and
nine-case browser suites passed: API196files/1025tests, browser9cases/4.9min,
with0 remaining fixture tenants/platform assignments. Production remains unchanged and all-route
acceptance is still partial. Database restoration remains canceled.

## User memory update — 05:30 +08:00

Removed database-restoration planning and spending approval from active control-center tasks and linked blocker/defect/deployment notes at the user's request. Historical evidence is explicitly superseded, not represented as a passing restore test. No database, backup, provider setting, deployment check or application code was changed. Password-recovery email remains in scope.

## Provider follow-up — 05:29 +08:00

Read-only checks obtained a concrete USD10.18/month recovery-copy quote in existing PAVI/Seoul, with no PITR purchase required for this option. No purchase was submitted. Railway Core and Vercel Web production both lack reusable Resend/sender configuration. Updated the existing vault control/deployment notes and blocker with exact account actions, recovery-copy constraints and evidence. No application code or hosted state changed in this follow-up; prior local test evidence remains unchanged.

## Implemented

- Independently guarded operational analytics now surfaces persisted document metadata usage, pending/overdue/flagged KYC tracks, failed document/generation/indexing jobs and recorded privileged failure/denial counts. Source/refresh/UTC and unconnected telemetry limitations are explicit. Core two-tenant integration and Web response validation pass; final browser proof tracked in Obsidian.

- Resumed repairs: complete176/176 audit trigger coverage; redacted transactional global state audit; multiple audit events per request trace; cookie-bound explicit support enforcement and provider preflight denial.
- Windows browser-fixture teardown cleans exact synthetic records before process termination.
- Settings role/owner navigation, field clearing, transactional audit and accessible inline editing; Reports BigInt money/margins, real CSV link and truthful paid-invoice wording.
- Recent interactive provider authentication required for platform writes (15minutes; refresh/recovery excluded), fail-closed evidence and visible recovery instructions.
- Project Documents hides forbidden controls/tabs, explains evidence review and worker dependencies, announces upload feedback and confines table overflow.

- PRD1.5 and ADR027; separate immutable fixed-email platform authority, lifecycle-aware admission/RLS, global append-only audit, invitation intent, bounded support records.
- Additive migration20260904020000, Drizzle schema, real database negative tests, protected sole-owner bootstrap and recovery runbook.
- Independently guarded Core platform APIs, provider-backed account workflows, validated HTTP responses, bounded provider calls, named/correlated command logging.
- Eight separate platform console pages, persistent support banner, sensitive-operation confirmation and pending state, directory search/pagination.
- Canonical pipeline board/list, query-preserving308 redirects, navigation/cache links and null-project corrections.
- Eleven tenant/role-safe project selectors with complete data/error/empty states.
- Invitation acceptance and a provider-verified recovery-token callback, retaining recent recovery/session binding.
- Exact route inventory and linked repository-vault control/access/defect/verification/deployment notes.

## Verification

Final local checkpoint: fresh3507unit tests pass with171explicit integration skips; separate442/442disposable DB lane passed. Final Web production build, current Core build, lint/typechecks, focused Analytics/support/Documents/Reports browsers and working-tree secret scan all pass. Overall acceptance remains partial for the reasons below; no release occurred.

Latest resumed results supersede the baseline entries: audit coverage176/176 and full158-migration replay442/442database tests,79Core integration passes/2intentional skips; explicit support cookie and recent-auth negative cases; Settings16tests and browser audit; Documents13role+7deletion tests and owner/viewer browser; Reports exact money and tenant-isolated CSV browser; operational Analytics two-tenant Core integration,9response tests and responsive browser9748passed. Focused production-source lint, API/Web typechecks and latest API build passed. Final Web build and full unit completion are tracked in the control center until their processes exit.

- PASSED: fresh full unit lane3442tests (167 explicit integration/provider skips); separate disposable database lane438/438tests and158migrations; API integration78passes/2intentional skips.
- PASSED: full typecheck after a corrected nullable Supabase response type; lint; both production builds; policy gates; doc authority16/16; pnpm audit no known vulnerabilities; history secret scan and actionlint.
- PASSED: latest five-case real Next/Core/Postgres browser rerun after response/pagination changes,2.6minutes. Synthetic Auth is not managed-provider proof.
- PASSED: additional response boundary7, guard/observability43, recovery binding14 tests.
- Historical failure repaired: audit-trigger coverage172/176 became176/176 with four real triggers, no verifier exception or bypass.

## Release blockers / incomplete scope

No hosted application changes made. Production remains157migrations with no platform assignment table. Verified fixed-email identity count is1. Database-restoration work and spending requests are canceled; that cancellation does not mark the existing database-release gate passed. The pending migration, production SMTP and recovery-template rollout, remaining route-family workflows/guides, and authenticated production acceptance remain. See the release preflight changeset for current publication status.

All work was performed sequentially by one agent; no subagents or forks. Existing user changes were preserved. Local browser fixture records were removed by exact random IDs; production records and audits were untouched.
