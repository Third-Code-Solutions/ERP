# Next Actions

## Latest CAD worker and web promotion - 2026-08-13

- Railway `ABI OPS CAD Worker` deployment
  `9c864abc-2308-42f3-b47d-d4388e25273a` is Online at
  `https://abi-ops-cad-worker-production.up.railway.app`; health reports
  `dwg_support=true` and `evidence_only=true`.
- Worker production probes pass: unauthenticated parse 401, authenticated
  DXF parse 200, and authenticated DWG conversion parse 200. Worker tests:
  14/14.
- Vercel deployment `dpl_8L2HQin9DH2vxYaxm8sbwzdTudq6` is READY and aliased
  to `https://thirdcode-erp.vercel.app`; `/api/health` and `/api/ready`
  are 200. Vercel env wiring is confirmed by the real-Chrome BOM assertion
  `Worker online`.
- Real Chrome regression on the new deployment: 4/4 passed (branding, major
  route console smoke, 11-role matrix, CAD-worker wiring). Web unit suite:
  385 passed, 4 explicit environment-gated skips. Web typecheck passed.

The release remains PARTIALLY VERIFIED: the worktree is dirty and repository
CI credentials, human/device validation, optional provider scheduling/email,
RAG worker production deployment, and full technical namespace migration are
not proven by this promotion.

The three Supabase fallback Edge Functions are deployed and JWT-protected.
The target has no pg_cron relation/jobs and no optional Resend/CNPS
configuration, so scheduled execution and outbound email are explicit
follow-up gates. The documented preferred Inngest path remains separate.

## Final production promotion recheck - 2026-08-13

The user-authorized production promotion is complete at the provider level.
The release remains PARTIALLY VERIFIED because the worktree is dirty and
repository, human, and device gates are not equivalent to a provider deploy.

- Vercel: dpl_AUme5sfo7WfZqDKgD8319PqTVWkK, Ready, serving
  https://thirdcode-erp.vercel.app; /api/health and /api/ready return 200
  with revision dpl_AUme5sfo and database up. `/crm/opportunities` now
  redirects to `/pipeline/board` instead of returning 404.
- Railway: d0873402-3516-4094-ae7a-7dac11b9eef4, SUCCESS; /health is 200
  and /ready is 200 with database and Redis ok.
- Supabase aqqrtkmtcsfkbyyqxowv: 140/140 migrations applied, zero pending in
  `db push`, reproducibility/security lane passed, and audit coverage is
  170/170 tenant-scoped tables.
- Supabase Edge Functions cnps-survey-sender, permit-staleness-checker, and
  sla-checker are ACTIVE at version 2 with JWT verification; unauthenticated
  probes returned 401.
- Real Chrome authenticated regression: 3/3 passed, including the 11-role
  access matrix. US-009 page E2E: 1/1. API unit tests: 53/53. Web unit tests:
  385/389 with 4 explicit environment-gated skips.
- ABI OPS brand contract and public production-surface checks pass. Internal
  governance/history identifiers remain intentionally preserved for migration
  and audit traceability.

- Hosted US-009 demo-tenant mutation E2E: 1/1 passed for create, exact replay,
  resolve, persisted reload, no duplicate, no console errors, and no 404s.
  Direct Supabase verification found one seeded-demo row with two domain log
  events and a succeeded idempotency ledger.
- Final critical production Chrome regression on dpl_AUme5sfo: 3/3 passed;
  Vercel runtime log scan then found zero HTTP 5xx and zero HTTP 404 responses.

The new proposal change-request slice is deployed and protected-page/browser
verified. Its disposable-PostgreSQL integration proves idempotent create,
resolve, conflict denial, and tenant isolation. Its production mutation path
was exercised only in the seeded `buildops-e2e` demo tenant; no customer tenant
was used.

## Production release recheck — 2026-08-13

The user authorized production deployment. The current local working tree was
deployed once to the exact linked targets; it was not committed or pushed.

- Vercel project `pavi-2e9809a4/thirdcode-erp`, deployment
  `dpl_DUT3PBLM8gUhkmrLSJfVSPKdeNUy`, status `READY`, explicitly promoted to
  `https://thirdcode-erp.vercel.app`; project Node.js runtime is `22.x`.
- Vercel `/api/health`: HTTP 200, service `abi-ops-web`, revision
  `dpl_DUT3PBLM`; `/api/ready`: HTTP 200, `database=up`.
- `pnpm verify:production-surface -- --url https://thirdcode-erp.vercel.app`:
  PASS. Real Chrome public responsive E2E: 1 passed. Authenticated hosted
  route smoke, ABI OPS branding, 11-role access matrix, Cortex focused graph,
  and viewer dashboard safety E2E also passed.
- Current-source self-hosted CI lane: PASS. The WSL disposable lane replayed
  all 140 migrations, passed database reproducibility/security invariants,
  ran 264 database tests plus WO-04/05/06 gates, and completed standalone
  web/API smoke with exit code 0. Redis emitted only its known
  memory-overcommit warning.
- Railway service `c45b3d01-036a-4663-a524-0713d782fce3`, deployment
  `2c19f8b8-a5cb-462f-9f92-d35e16647056`, status `Online`.
- Railway `/health`: HTTP 200, service `abi-ops-api`; `/ready`: HTTP 200,
  `database=ok`, `redis=ok`. Protected API route returned the expected 401
  without credentials.
- Supabase linked database: migration dry-run empty; local and remote ledgers
  match through `20260813210000`; audit coverage is `169/169` tenant-scoped
  tables. Duplicate production PO numbers were reconciled without deleting
  rows or changing IDs/FKs.

## Remaining verification and release hygiene

1. Run the hosted CI workflow with repository-managed `E2E_USER_EMAIL` and
   `E2E_USER_PASSWORD` secrets. Local linked Supabase role-harness proof is
   complete; CI secret execution remains unverified.
2. Review and commit the deployed working tree, then push through the normal
   PR/CI path so the provider release is reproducible from Git. Do not force
   push or discard unrelated existing changes.
3. Reconcile the root `AGENTS.md`/`CLAUDE.md` bootstrap reference to the actual
   `docs/PRD.md` only with owner sign-off; this is governance work, not a silent
   runtime change.
4. Keep the remaining PRD open questions and human sign-offs explicit; the
   deployed artifact is not evidence that the entire ERP PRD is complete.
5. GitHub control-plane read-only check: `gh secret list` and `gh variable list`
   are empty for `Third-Code-Solutions/ERP`; no hosted E2E URL or dedicated
   test credentials exist. The hosted E2E job now runs on every pull request
   and fails closed when this configuration is absent instead of silently
   skipping. Recent historical CI run `31529154170` also failed a database
   verifier invariant on its older SHA; the current-source local lane now
   passes, but neither result supplies repository-hosted CI execution evidence.

## Standing M1 controls

Complete remaining M1 controls without enabling production writes:

1. Treat the current linked ledger as release evidence: 139/139 migrations
   applied through `20260813210000`, with a zero-pending dry-run. Preserve the
   additive migration history; do not replay or rewrite applied migrations.
2. Treat organization type as constrained tenant profile data only. Never use
   it for roles, capabilities, memberships, approvals, or tenant access.
3. Keep deployed tenant-canary source at
   `ERP_PROJECT_WRITES_VIA_API=false`; leave the tenant allowlist empty.
4. Obtain explicit approval for one unused user-controlled email identity.
   Through live `/auth/signup`, create and confirm the account; do not use
   direct SQL or a service-role provisioning script.
5. As that new Admin, create one non-critical reversible E2E Project through
   `/projects/new`. Do not repair or waive existing tenants' historical audit
   mismatches.
6. Run `pnpm plan:project-cutover -- --require-ready` against that exact target.
   Capture the complete mutable Project baseline in a restricted release
   artifact; keep identifiers and business values out of Git and logs.
7. Before any paid frontend build, confirm the exact expected Vercel charge
   and obtain user approval. Do not reconnect Git or create a duplicate
   preview.
8. After approval, perform the provider-level enable/rollback drill for the
   controlled tenant:
   capture provider configuration, enable exact `true`, prove one compatible
   Web-to-Nest demo command and reconciliation, restore exact `false`, and
   prove the legacy branch is selected.
9. Record provider release IDs, runtime logs, final data reconciliation, and
   the tested rollback procedure before starting M2.
10. Retry physical deletion of credential-free runner work directories after
   Windows releases their transient file handles.
11. Before M2 code, obtain owner sign-off for a dedicated `AGENTS.md`
    reconciliation: remove the missing PRD bootstrap dependency and replace
    obsolete pnpm 9, PostgreSQL 16, tRPC, and Inngest target rules with the
    approved architecture. Do not mix that governance rewrite into canary work.

## Prepared frontend release candidate

- Landing mobile QA correction is source-only. Keep Vercel Git disconnected.
- Before any frontend deployment, re-confirm zero new deployments, disclose the
  exact provider charge, and obtain explicit user approval.
- If approved, deploy the single reviewed green SHA once. Do not create a
  duplicate preview and production build.
- After deployment, repeat 1440/768/390 browser checks, metadata/JSON-LD,
  interactions, analytics, health/readiness, console, and exact release
  identity before calling the frontend slice complete.
- Include upload tenant-Project hardening in that same reviewed SHA. After
  deployment, verify same-tenant signed upload and document recording plus a
  non-mutating cross-tenant/missing-Project denial. Do not buy a separate build
  for this security candidate.
- Include document mutation authority in that same reviewed SHA. Use the
  controlled canary tenant to prove `viewer` denial, authorized signed upload,
  atomic document/audit creation, reversible deletion, deletion audit, and
  post-commit Storage cleanup. Do not exercise destructive proof against
  historical demo documents and do not buy another build.
- Include the canonical Cortex registry in that same reviewed SHA. After
  deployment, use authorized Admin, finance, procurement, estimator, sales,
  and viewer sessions to verify graph filtering, citation labels, record
  navigation, finance/inventory entity context, and non-enumerating denial.
  Do not buy a separate build for this source-only consistency change.
- Include grounded citation navigation in that same reviewed SHA. Verify the
  answer body remains plain text, new and restored citations open the exact
  authorized record, malformed/stale citations disappear, and a role downgrade
  removes now-forbidden sources. Do not buy a separate build.
- Include operational record context in that same reviewed SHA. Verify one
  populated and one empty record per role family across CRM, finance,
  procurement, inventory, claims, variation, punchlist, and warranty. Confirm
  exact links, Project-panel non-duplication, and non-enumerating denial. Do not
  buy a separate build.
- Include directional relationship meaning in that same reviewed SHA. Verify
  representative incoming/outgoing edges, origin labels, exact record links,
  unknown-edge fallback, role-downgrade omission, and responsive behavior. Do
  not buy a separate build.
- Include the Cortex evidence trail in that same reviewed SHA. Verify mutation
  evidence on an authorized populated record, all safe future origin labels,
  exact newest-first order, empty state, role-downgrade/cross-tenant denial,
  and absence of every raw provenance field. Do not buy a separate build.
- Include the focused Cortex neighborhood in that same reviewed SHA. Verify a
  real record backlink, exact server-derived focus, bounded one-hop response,
  restricted-role and cross-tenant non-enumerating denial, whole-graph
  compatibility, and 1440/768/390 console/overflow behavior. Do not reconnect
  Git or buy a separate preview.
- Include Cortex saved-conversation deep links in that same reviewed SHA.
  Verify exact-context and company-wide restore, foreign/revoked/mismatched
  denial, one-click cross-record history navigation, URL synchronization after
  create/load/new-chat, stale-response suppression, and absence of
  tenant/user/content data in URLs.
- Include Cortex recent-conversation search in that same reviewed SHA. Verify
  the visible recent-count boundary, title and human record-scope matching,
  company-wide and empty states, clear/reset, keyboard focus, 44px mobile
  targets, and absence of internal identifiers. Do not expand the API or buy a
  separate build.
- Include the permission-aware dashboard in that same reviewed SHA. Verify one
  authorized executive role retains pipeline analytics and one restricted role
  receives only assignee-scoped work and permitted links. Confirm no executive
  query/content leak, 1440/768/390 behavior, and session revocation.
- Include permission-safe universal search in that same reviewed SHA. Verify
  literal `%`, `_`, and backslash handling, private/no-store responses,
  joined-record tenant isolation, per-role result types, authorized normal
  search, command-palette navigation, and 1440/768/390 behavior. Do not expand
  result scope or buy a separate build.
- Include the private Search-to-Cortex handoff in that same reviewed SHA.
  Verify explicit Search/Ask modes, zero Ask-mode search requests, opaque
  prompt-free routing, one-time/expiring browser state, exact composer prefill,
  zero chat request before Send, and 1440/768/390 behavior. Do not buy a
  separate build.
- Include atomic public canvas signing in that same reviewed SHA. Use a new,
  controlled, non-historical signing session to prove bounded PNG validation,
  one-shot locking, tenant-scoped source stamp, nullable-actor audit, exact
  document linkage, replay denial, and compensating Storage cleanup. Do not
  exercise destructive proof against existing signatures and do not buy a
  separate build.
- Include atomic RFQ auto-dispatch in that same reviewed SHA. Verify one
  controlled same-tenant approval creates one RFQ and one audit, a replay
  returns the same RFQ without duplicate notification, direct browser writes
  remain denied, and the current/manual compatibility contract is preserved.
  Do not buy a separate build.
- Include atomic RFQ quote/terminal workflow in that same reviewed SHA. Verify
  one controlled quote, exact retry, conflicting-key denial, full-coverage
  completion, invalid transition denial, actor-attributed audits, and
  post-commit notification behavior. Do not buy a separate build.

## Following milestone

M2: remove the Python `scope_items` direct-write path. Python returns immutable
processing evidence; BullMQ transports it; a new Nest command authorizes,
idempotently validates, and commits accepted changes.

Design is ready at
`docs/architecture/M2_DOCUMENT_PROCESSING_EVIDENCE_CONTRACT.md`. First code
slice is inert M2.1: contracts, composite tenant constraints, durable
job/evidence state, explicit capabilities, and a Nest BullMQ processor with no
caller. Do not begin it until M1 canary and separate `AGENTS.md`
reconciliation gates pass.

## Completed unblocked integrity slice

The inert NestJS procurement adapter is source-complete and remains disabled:

1. Preserves existing `logQuote`, `completeRfq`, `cancelRfq`, and award result
   contracts.
2. Uses NestJS Zod command validation, capability guards, tenant-derived
   identity, and transaction services.
3. Reuses PostgreSQL idempotency, tenant-composite, coverage, audit, price
   provenance, and RFQ state-machine invariants.
4. Keeps every cutover route disabled by default with exact booleans and
   explicit tenant allowlists.
5. Has contract, tenant-isolation, retry, concurrency, audit, rollback, and
   disposable PostgreSQL/Redis integration coverage.
6. Hosted deployment, flag enablement, and production migration remain
   blocked by M1 canary/provider gates.

## Completed integration reliability slice

Production external integrations now fail closed when credentials are absent:

1. Resend email throws in production without `RESEND_API_KEY` and `EMAIL_FROM`.
2. Semaphore SMS throws in production without `SEMAPHORE_API_KEY` and
   `SEMAPHORE_SENDER_NAME`.
3. Direct DocuSeal submission throws in production without configuration; the
   in-app canvas path remains an explicit real signing mechanism.
4. Focused integration tests pass 8/8, full web tests pass 376/376 with three
   environment-gated skips, typecheck passes, production build passes, and
   local Chromium public smoke passes 1/1.
5. Legacy `dev-sub-*` BOM signing links are rejected before lock/award and
   rendered as unavailable recovery states; the focused DocuSeal routing test
   passes 4/4 after this guard.
6. Live provider delivery was not exercised; credentials and external send
   acceptance remain deployment-time checks.

## Completed notification evidence slice

1. External email rows are pending until a real provider response.
2. Development stubs and provider failures do not stamp `sent_at`.
3. In-app notifications survive optional email failure; structured delivery
   failure logs preserve operational visibility.
4. CNPS surveys stamp `sent_at` only after delivery and remain retryable after
   provider failure.
5. Focused notification evidence tests pass 3/3; CNPS delivery evidence tests
   pass 3/3; web typecheck passes.

## Do not start yet

- No finance migration before M1 integration evidence.
- No broad Server Action replacement.
- No production feature-flag enablement.
- No new microservices.
- No external ERP source, schema, UI, or wording reuse.

## Exact next action after RFQ quote and pricing loop

1. Keep `ERP_RFQ_QUOTE_WRITES_VIA_API` unset/false everywhere.
2. Keep `ERP_RFQ_TRANSITION_WRITES_VIA_API` unset/false everywhere; the
   complete/cancel adapter is source-ready but not enabled.
3. Verify M1 Railway/Supabase readiness and a real tenant/auth canary account.
4. Present the exact tenant UUID, environment changes, monitoring, and
   rollback for approval.
5. If approved, enable one tenant only and verify quote create/retry/conflict,
   completion/cancellation, audit evidence, logs, and rollback.
6. Do not enable wildcard routing or deploy Vercel without explicit approval.
7. Keep `ERP_RFQ_AWARD_WRITES_VIA_API` unset/false everywhere. The local
   award path and disabled Core API path are both verified; no hosted canary
   or production write is authorized.
8. Keep WO-09 blocked until ABI supplies the real PPRF/SI/BOE/BOQ/Schedule
   workbooks. Do not generate synthetic acceptance fixtures.

Provider inspection result:

- No existing tenant may be used for the canary.
- Await explicit approval for one unused user-controlled email, then use normal
  signup and authenticated Project creation.
- Await explicit owner sign-off before reconciling root `AGENTS.md` from pnpm
  9/PostgreSQL 16/tRPC/Inngest rules to the approved pnpm 10/PostgreSQL
  17/NestJS/Redis/BullMQ modular-monolith architecture.
- Until both approvals exist, keep all cutover flags disabled and continue only
  source work that does not bypass those gates.

## Exact next action after public-origin portability

1. Keep Vercel Git disconnected and create no Vercel preview or production
   deployment.
2. Review a no-cost/self-hosted frontend target that can run this dynamic
   Next.js CSP-nonce architecture; static-only hosting is not equivalent.
3. Before any alternative-host build, set its canonical
   `NEXT_PUBLIC_SITE_URL` and verify metadata, structured data, robots,
   sitemap, auth callback allowlists, portal links, CSP, and Supabase redirect
   URLs against that exact hostname.
4. Keep the retained Vercel production artifact as rollback until the
   alternative passes authenticated browser, API, database, Redis, logs, and
   tenant-isolation proof.
5. Do not cut traffic, reconnect Git, or remove Vercel until explicit approval.

## Exact next action after standalone runtime preparation

1. Keep Vercel Git disconnected. Create no preview or production deployment.
2. Select an already-owned Linux host with Docker and a controlled test
   hostname; do not purchase infrastructure without explicit approval.
3. Build and scan `apps/web/Dockerfile` on that host using the exact reviewed
   SHA and test hostname.
4. Add the test hostname to Supabase Auth redirects, then verify health,
   readiness, authenticated login, tenant isolation, portal links, Cortex,
   browser console, responsive layouts, logs, restart behavior, and rollback.
5. Present exact DNS, redirect, monitoring, rollback, and cost impact before
   any traffic cutover. Retain Vercel throughout the proof.
