# Migration Plan

## M3.171 Provider-neutral circuit alert routing (completed)

1. Added a strict protocol-v1 route envelope and result contract derived from
   validated aggregate circuit events. Unknown keys, URLs, credentials, raw
   payload text, and unscoped result fields are rejected.
2. Added a Nest exact-tenant routing gate, stable adapter-key validation, and a
   bounded failure taxonomy. Adapter messages never return through the route
   result and no route credential is accepted by the router.
3. Added an adapter interface requiring `eventKey` idempotency and local fake
   conformance tests covering duplicate delivery, tenant isolation, bounded
   forwarding, known failures, unknown-error redaction, and invalid keys.
4. Kept provider execution, external paging, hosted SQL, and deployment gates
   closed. No migration was added; M3.170 schema/replay evidence remains the
   database baseline.

Evidence: shared 271/271 across 38 files; API 615/615 across 141 files; Web
676/676; full unit lane; lint/typecheck; serial Nest/Next production build with
82 pages; spend 4/4; controlled release 5/5; Actionlint; pinned actions;
Gitleaks; diff hygiene; and unchanged database baseline of 112/112 migrations
and 367/367 zero-skip tests with equal schema hash
`2FB85C5E4D65132F6474BC9E1ED88719F3EAA0EF3AC285D9AE1591A649A87C37`.

Release gate: keep every Cortex provider/budget/generation/worker/recovery/
Core/Web gate false or empty, route gate false, exact-tenant allowlists empty,
credentials unset, and Vercel Git disconnected. Do not apply hosted SQL,
deploy, call a provider, connect a pager, or create a paid resource under the
cost lock. Rollback disables route and dispatch gates; preserve forward-only
circuit, alert, and route evidence. Do not down-migrate.

Next source-only slice: M3.172 route delivery orchestration seam that maps
durable alert claims to the provider-neutral adapter and preserves delivered/
failed ledger state. Use local fakes only; add no external network, credential,
hosted write, deployment, or provider activation.

## M3.170 Durable Cortex circuit alerts (completed)

1. Added the aggregate-only circuit alert contract and a tenant/policy-scoped
   PostgreSQL ledger with source/recovery uniqueness, status checks, attempt
   bounds, service-only grants, and forced RLS.
2. Added deterministic open-trip and recovery event keys. Repeated health
   observations deduplicate at the database boundary and write privacy-safe
   audit entries without prompts, responses, credentials, attempt IDs, or
   user identities.
3. Added the Nest delivery seam with transactional claims, stale processing
   recovery, bounded attempts, stable `sink_failed` errors, and a local fake
   sink. A failed delivery is retryable by event key and stops the current
   drain to prevent a hot loop.
4. Wired circuit observation to provider spend settlement and recovery, and
   added tenant-isolation, transition-deduplication, and retry-idempotency
   integration coverage.

Evidence: shared 268/268; API 610/610; Web 676/676; AI worker 8/8; DXF worker
11/11; database 367/367 zero-skip; 112/112 clean migrations; 26 integration
files/38 tests; lint/typecheck; Nest/Next production build with 82 pages;
spend 4/4; controlled release 5/5; Actionlint; pinned actions; Gitleaks;
diff hygiene; and equal schema hashes
`2FB85C5E4D65132F6474BC9E1ED88719F3EAA0EF3AC285D9AE1591A649A87C37`.

Release gate: keep every Cortex provider/budget/generation/worker/recovery/
Core/Web gate false or empty, policies absent or disabled, credentials unset,
and Vercel Git disconnected. Do not apply hosted SQL, deploy, call a
provider, connect an external pager, or create a paid resource under the cost
lock. Rollback closes dispatch, reconciles attempts, and preserves the
forward-only alert and circuit evidence. Do not down-migrate.

Next source-only slice: M3.171 provider-neutral alert-routing adapter
conformance with local fakes and strict credential isolation. No external
network, paging credential, hosted write, deployment, or provider activation.

## M3.169 Cortex provider health and circuit authority (completed)

1. Added strict aggregate health query/result contracts and an owner/admin/
   finance Nest endpoint whose tenant comes only from the verified principal.
2. Added bounded circuit configuration and a tenant/policy terminal-attempt
   index without enabling or seeding a provider policy.
3. Derived durable circuit evidence from settled outcomes since the latest
   provider success. A threshold burst remains tripped through cooldown and
   admits one locked half-open probe; success closes it and failure reopens it.
4. Persisted stable provider failure classifications while retaining the
   existing conservative unknown-outcome spend settlement.
5. Added aggregate spend/count/latency reporting and the privacy-safe
   `cortex-provider-circuit` operator runbook. External paging remains absent.

Evidence: shared 266/266; API 610/610; Web 676/676; AI worker 8/8; DXF worker
11/11; database 365/365 zero-skip; 111/111 clean migrations; 26 integration
files/37 tests; lint/typecheck; Nest/Next production build with 82 pages; spend
4/4; controlled release 5/5; Actionlint; pinned workflow actions; Gitleaks;
diff hygiene; and equal schema hashes
`0FA5E8A25E45C1869DE792B4B6C9B77653C4604475A01C8E4A9B015FB7191CF6`.

Release gate: keep every Cortex provider/budget/generation/worker/recovery/Core/
Web gate false or empty, policies absent or disabled, credentials unset, and
Vercel Git disconnected. Do not apply hosted SQL, deploy, or call a provider
under the cost lock. Rollback closes dispatch, reconciles attempts, and
preserves forward-only attempt/circuit evidence. Do not down-migrate.

Next source-only slice: M3.170 durable circuit-alert transition/deduplication
with a local fake sink only. Add no external paging credential, network call,
hosted write, build, deployment, or paid resource.

## M3.168 Cortex provider request/response protocol (completed)

1. Added strict provider plan, request, and response schemas with protocol v1,
   bounded cost/time/content/evidence, model equality, opaque receipt, and
   authorized unique citations.
2. Made Nest construct a re-redacted identity-minimized envelope and derive one
   deterministic dispatch key from the reservation. Persisted request identity
   before fake-adapter dispatch.
3. Added timeout abortion and a terminal post-dispatch error taxonomy. Unknown
   provider outcomes reconcile at the reserved maximum; only reconciliation
   infrastructure failure is retryable.
4. Persisted protocol/request/receipt/response fingerprints, froze dispatch
   authority, and required the response fingerprint to equal the official
   completion hash in both Nest and PostgreSQL.
5. Preserved rolling compatibility for pre-protocol null rows. Kept the
   production adapter unavailable and used in-memory fakes only.

Evidence: shared 264/264; API 605/605; Web 676/676; Python 8/8; database
362/362 zero-skip; 110/110 clean migrations; 26 integration files/36 tests;
lint/typecheck; Nest/Next production build with 82 pages; spend 4/4; controlled
release 5/5; Actionlint; pinned workflow actions; Gitleaks; diff hygiene; and
equal schema hashes
`923B227DB420320E184A26D5ECC4EF2BE79AE4F9E5D98C9B5CFA1BE77FCFE498`.

Release gate: keep every Cortex provider/budget/generation/worker/recovery/Core/
Web gate false or empty, policies absent or disabled, credentials unset, and
Vercel Git disconnected. Do not apply hosted SQL, deploy, or call a provider
under the cost lock. Rollback is forward-only: close dispatch, reconcile open
attempts, and preserve protocol evidence and linked completions. Legacy null
protocol rows remain accepted only for rolling compatibility.

Next source-only slice: M3.169 provider spend/latency/error observability and an
automatic circuit-breaker contract using durable attempt metadata only. Keep
the production adapter unavailable; add no credentials or network calls.

## M3.167 Cortex provider-grounded completion authority (completed)

1. Add a nullable tenant-composite provider-attempt link to the official
   assistant completion ledger. Enforce one completion per attempt and keep
   deterministic outcomes unlinked.
2. Make the provider executor return the exact identifier only after successful
   settlement. Carry it through an internal discriminated completion contract;
   do not expose provider-grounded selection to signed/external callers.
3. In the existing Nest completion transaction, lock and verify the current
   claim, tenant, job, attempt number, settlement, provider success, cost,
   policy model, context, RBAC, and citations before committing the assistant
   message, request, job, and audit.
4. Enforce the same invariant in PostgreSQL for inserts and link changes, then
   freeze linked completion identity/provenance. Prove pre-settlement denial,
   model mismatch denial, valid commit, single-use linkage, immutability, and
   migration reproducibility.

Evidence: shared 261/261; API 599/599; Web 676/676; Python 8/8; database
358/358 with zero skips; 109/109 clean migrations; full API integration;
lint/typecheck; Nest/Next production build with 82 pages; spend 4/4;
controlled release 5/5; Actionlint; pinned workflow actions; Gitleaks across
550 commits; and diff hygiene. Clean replay produced identical schema hashes
`00D5475628D1ADB9042FE0CBCEDB914875121B8460B6850F8FBFA92D68D62FE5`.

Release gate: keep all Cortex provider, budget, generation, worker, recovery,
Core, and Web gates false/empty; policies absent or disabled; credentials
unset; and Vercel Git disconnected. Do not apply hosted SQL or deploy/call a
provider under the cost lock. Rollback is forward-only: close the gates and
stop dispatch. Preserve the nullable column, provider ledger, and any linked
completion; never down-migrate, delete, or repoint settled provenance.

Next source-only slice: M3.168 provider-neutral request/response boundary with
a Nest-built bounded redacted envelope, deterministic dispatch idempotency,
opaque request receipt, timeout/error taxonomy, and fake contract tests. Keep
the production adapter unavailable and perform no network/provider call.

## M3.166 Cortex fake-provider orchestration and recovery (completed)

1. Added independent, disabled-by-default provider-execution flags with exact
   UUID tenant allowlists. Execution also requires the existing generation and
   provider-budget gates for the same tenant.
2. Added a provider-neutral Nest adapter seam. Its production implementation is
   intentionally unavailable; unit tests inject an in-memory fake and perform
   no external call.
3. Added reserve-before-dispatch orchestration, authorized-citation validation,
   actual-cost settlement, dispatched replay refusal, and reuse of the existing
   fenced Nest completion authority.
4. Added transaction-bound reconciliation for cancellation, retry, terminal
   failure, claim failure, stale recovery, superseded attempts, execution
   failure, and replay. Reserved work releases at zero; dispatched uncertainty
   settles at the reserved maximum.
5. Decoupled the exact-tenant recovery scope from intake/worker gates so stale
   work can drain after execution is closed. This recovery gate cannot authorize
   a provider call.

Evidence: shared 260; API 599; Web 676; Python 8; lint/typecheck; Nest/Next
production build with 82 pages; 108/108 clean disposable migration replay;
database 354/354 zero-skip; full API integration; unchanged schema hash
`ED239E894DF4109848F2EFC991F041217DE955880C4CF6092ECF029CEB966E74`;
spend 4/4; release 5/5; Actionlint; pinned actions; Gitleaks across 549 commits;
diff hygiene.

Rollback: keep generation, provider-execution, and provider-budget gates false
and all allowlists empty. Recovery may be enabled only for an explicitly
approved exact tenant to drain stale local/managed work. Before reverting
source after any future activation, reconcile every open attempt; do not
down-migrate or delete the ledger. No migration was added in this milestone.
The next safe source-only slice is M3.167: bind a provider-grounded completion
to exactly one settled current provider attempt, still without a real adapter.

## M3.165 Cortex provider budget authority (completed)

1. Added strict shared reserve, dispatch, settle, release, state, and exact
   integer-micros contracts. Attempt number remains bounded by the existing
   three-attempt generation policy.
2. Added disabled-by-default tenant/provider/model policies and immutable
   provider-attempt reservations. Both tables are forced-RLS, service-only, and
   tenant constrained. Policies have a database audit trigger; supported
   attempt transitions use Nest semantic audit. No policy rows are seeded.
3. Added a Nest internal service, not a public endpoint. It locks the current
   generation job and exact policy, enforces request/daily ceilings, provides
   exact replay, and audits transitions without prompt content.
4. Kept terminal settle/release available after a gate closes, while reserve
   and dispatch require the global gate, exact tenant allowlist, and enabled
   policy. No provider adapter or worker was activated.
5. Added unit, migration-structure, rollback-local database integration, and
   clean-replay coverage for budget caps, replay conflicts, tenant isolation,
   transition guards, policy closure, actual-cost release, and audit.

Evidence: shared 260; API 589; Web 676; Python 8; lint/typecheck; local Nest/
Next production build with 82 pages; 108/108 clean disposable migration replay;
database 354/354 zero-skip; full API integration; identical reproducibility
hash `ED239E894DF4109848F2EFC991F041217DE955880C4CF6092ECF029CEB966E74`;
spend 4/4; release 5/5; Actionlint; pinned actions; Gitleaks across 548 commits;
diff hygiene.

Rollback: leave `ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_ENABLED=false` and the
tenant allowlist empty. Do not seed a policy or down-migrate. If source rollback
is required before managed application, revert this milestone as one unit. If
already applied later, preserve the ledger and stop reserve/dispatch while Core
terminalizes open reservations. The next safe source-only slice is a fake
provider orchestration/recovery proof; it must use no credential or paid call.

## M3.164 protected full-stack Cortex browser certification (completed)

1. Added a loopback-only Playwright lifecycle that provisions six disposable
   identities and starts local Next, built Nest, Redis/BullMQ, provider-free
   Python, and PostgreSQL. Hosted/provider credentials are scrubbed and foreign
   browser egress is blocked.
2. Proved immediate `202`, protected pending/final reads, same-origin job
   location, private/no-store caching, text/citations, current citation/role/
   context authorization, and foreign-user concealment.
3. Proved desktop/mobile layout, keyboard submission, minimum control size,
   zero console/page errors, exactly-once new-chat/unmount cancellation, and a
   bounded ten-poll timeout with durable cancellation.
4. Corrected the observed new-chat contract defect by omitting absent
   `conversationId`; no endpoint accepts or normalizes an invalid null UUID.
5. Added a shared once-only job canceller and `pagehide` handling so hard
   navigation starts one keepalive DELETE before document teardown while the
   polling abort path safely deduplicates the same cancellation.

Evidence: browser 5/5; shared 256; API 586; Web 676; Python 8; lint/typecheck;
Nest/Next production builds with 82 routes; 107/107 clean disposable migration
replay; database 349/349 zero-skip; full API integration; spend 4/4; release
5/5; Actionlint; pinned actions; Gitleaks across 547 commits; diff hygiene.

Rollback: keep all M3.160-M3.163 rollout gates false/empty. Revert the Web
request/cancellation helper and local harness together if needed; no database
rollback exists because M3.164 adds no migration. Before any canary, complete
M3.152 backup/PITR and isolated full-clone evidence. The next safe source-only
slice is a PostgreSQL-authoritative provider-attempt budget/reservation contract
in Nest; it must add no credential, provider call, deployment, or enabled gate.

## M3.163 cost-bounded asynchronous Cortex result handoff

1. Exported the strict successful assistant-turn contract and added strict
   accepted/result contracts that forbid a result unless the durable job
   succeeded.
2. Added a Nest result read over the existing job ledger. It rechecks current
   membership, tenant/user ownership, capability, context, official user turn,
   and citation scope; citation hydration stays in the same transaction.
3. Added a server-only Core client and private authenticated Next GET/DELETE
   job proxy with UUID validation, exact-tenant gating, no-store caching,
   terminal error mapping, stable cancellation idempotency, and bounded rate
   limiting.
4. Replaced selected Next in-request sleeping/polling with immediate `202`,
   `Location`, and one-second retry guidance. The legacy route remains intact.
5. Added client polling capped at ten attempts, exact same-origin location
   validation, abort/unmount/restore cancellation, and a three-second bound on
   the best-effort cancel request. The existing UI is unchanged.
6. Kept every rollout gate false/empty. No migration, provider, hosted data, or
   deployment action occurred.

Validation: shared 256/256; API 586/586; Web 676/676; Python 8/8; ordinary DB
206 passed / 143 expected skips; lint/typecheck; serial cache-bypassed root
suite; local Next/Nest builds with 82 static pages; spend 4/4; release 5/5;
Actionlint; pinned actions; Gitleaks; diff hygiene. Disposable PostgreSQL/Redis
replayed 107/107 migrations, passed database 349/349 zero-skip and full API
integration, and proved rollback-local results plus current-role revocation.

Rollback: keep all M3.160-M3.163 exact-tenant gates false; selected traffic
then remains on the legacy path. Source rollback is one focused revert of the
handoff/result contract; no down-migration exists or is needed. Next safe
milestone: local protected-browser proof of `202 -> pending -> success`, abort,
timeout cancellation, and revoked access with all provider egress blocked.

## M3.162 provider-free Cortex generation jobs

1. Added strict shared start/status/queue/recovery/worker-completion contracts
   and centralized the existing Cortex direct-identifier redaction rules.
2. Added migration `20260808090000`: one forced-RLS, service-only,
   tenant/request-bound PostgreSQL job ledger with explicit states, exact claim
   fencing, bounded attempts, terminal timestamps, and composite tenant FKs.
3. Added Nest start/status/cancel, state, BullMQ transport/recovery, Python
   client, and processor boundaries. Core selects permission-scoped evidence;
   Python returns deterministic advice; Core reauthorizes citations and commits
   message, request, job, and audit in one transaction.
4. Added a private, authenticated, bounded, provider-free Python grounded
   endpoint with no database or ERP authority.
5. Wired Next behind a separate exact-tenant flag. Selected traffic starts and
   polls the Core job, cancels on abort, and replays the stored text/citations;
   the legacy path and public success shape remain unchanged by default.
6. Kept every flag false/empty. No hosted database, provider, or deployment was
   exercised.

Validation: shared 254/254; API 585/585; Web 666/666; Python 8/8; ordinary
database 206 passed / 143 expected skips; workspace lint/typecheck; bounded
root suite; local Nest/Next builds with 82 static pages; spend 4/4; controlled
release 5/5; Actionlint; pinned actions; Gitleaks; diff hygiene. Disposable
PostgreSQL/Redis applied 107/107 migrations, passed database 349/349 without
skips and the complete Nest integration suite, and retained an identical
schema hash after rollback-only tests.

Keep generation intake/worker/recovery Core flags and the Web flag false, all
allowlists empty, and the worker URL/secret unconfigured for this path. Before
canary, finish M3.152 backup/PITR proof, replay all 107 migrations in an
isolated complete clone, configure one private worker and one exact tenant, and
compare start/replay/cancel/retry/failure/recovery/RBAC/context/citation paths.
Rollback is all generation flags false; leave the inert job ledger in place.
External model execution remains deferred until Nest-owned quota reservation,
attempt-cost accounting, and a separately approved spend ceiling exist.

## M3.161 trusted Cortex assistant-generation authority

1. Added strict shared claim, completion, outcome, replay, and signature
   contracts. Neither command accepts tenant, role, actor, or assistant role.
2. Added migration `20260807190000`: a forced-RLS service-only request ledger,
   explicit `processing -> succeeded` state machine, 60-second lease, hashed
   fencing token, one-generation-per-user-turn uniqueness, and composite tenant
   foreign keys.
3. Added Nest claim/completion authority. Core verifies a fresh principal-bound
   HMAC, locks current membership and owned context, requires an official
   M3.160 user message, authorizes citation IDs, hard-codes `assistant`, and
   commits message, ledger, timestamp, and semantic audit transactionally.
4. Wired Next behind independent exact-tenant flags. Claim happens before
   provider quota/retrieval/model work; active/completed retries spend nothing;
   quota denial completes a deterministic grounded fallback; selected Core
   failure never restores direct assistant or audit writes.
5. Preserved all public response shapes and legacy behavior by default. No
   provider, deployment, or hosted database was exercised.

Validation: shared 251/251; API 573/573; Web 661/661 on the canonical run and
two final recounts; ordinary database 203 passed / 143 expected skips; bounded
cache-bypassed root tests; workspace lint/typecheck; local Nest/Next builds with
82 static pages; spend 4/4; controlled release 5/5; Actionlint; and pinned
actions. Disposable PostgreSQL/Redis applied 106/106 migrations, passed
database 346/346 without skips, focused authority 1/1, and the final full API
integration lane 33/33. A first full run exposed an existing transient Redis
connection-close race; isolated semantic-index 3/3 and full retry 33/33 passed.
The schema hash was unchanged after rollback-only tests.

Keep all user-turn and assistant-turn Core/Web flags false, all allowlists
empty, and `ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET` unset. Before canary, finish
M3.152 owner-approved backup/PITR proof, replay all 106 migrations in an
isolated complete clone, configure one shared random secret only in server
runtimes, and compare legacy/Core deterministic/model/failure/replay paths for
one exact tenant. Rollback is the assistant Web/Core flags false; leave the
inert ledger migration in place. Safe source-only next increment: move
retrieval/model execution behind a bounded Nest/BullMQ/Python contract while
keeping final authority in NestJS.

## M3.160 Core Cortex user-turn write authority

1. Added strict shared user-turn command/result contracts. Caller-controlled
   tenant, actor, role, capability, and assistant role are rejected.
2. Added migration `20260807170000`: service-only forced-RLS idempotency ledger,
   exact tenant foreign keys, and composite conversation/message identity.
3. Added the NestJS user-turn command. Membership, `cortex.search`, ownership,
   immutable context, and record visibility are rechecked in one transaction;
   exact retries replay and changed-command retries conflict; audit excludes raw
   content.
4. Added independent Core/Web exact-tenant flags. Next preserves the existing
   chat API and fails closed after selected Core failure. The client now sends
   one idempotency key per chat request.
5. Preserved all legacy behavior by default. Assistant/provider persistence was
   intentionally not exposed through the browser-facing command.

Validation: shared 247/247; API 564/564; Web 650/650; ordinary database 200
passed / 143 expected environment skips; forced bounded root tests; workspace
lint/typecheck; local Nest/Next builds with 82 static pages; provider-spend 4/4;
controlled-release 5/5; Actionlint; pinned actions; pre-commit Gitleaks across
543 commits; and diff hygiene. The disposable PostgreSQL 17.10 + Redis 7.4.9
lane applied 105/105 migrations, passed database 343/343 with zero skips, the
full API integration lane, and the focused new real-transaction test 1/1; its
schema hash was unchanged after tests.

Keep `ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_ENABLED=false`,
`ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API=false`, and both allowlists
empty. Before any canary, finish M3.152 owner-approved backup/PITR proof, apply
all 105 migrations to an isolated complete clone, then compare legacy/Core
creation, append, replay, conflict, revoked-role, revoked-context, and Core-
unavailable behavior for one exact tenant. Rollback is both flags false; leave
the inert ledger migration in place. Safe source-only next increment: define a
trusted service-to-service assistant-turn boundary, never a browser-selected
assistant role.

## M3.159 Core Cortex conversation read authority

1. Added strict shared list/detail projections for saved conversation summaries,
   immutable record context, messages, and current citation records.
2. Added Nest list/detail controllers and service logic. Tenant/user ownership,
   `cortex.search`, current-role node scope, context validation, and citation
   rehydration are server-derived. Missing and forbidden records share 404.
3. Added independent Core and Web exact-tenant gates, all false/empty by
   default. Next keeps its current response shapes and fails closed when a
   selected Core path is unavailable.
4. Preserved the direct database route as the default compatibility path. No
   database schema, migration, chat mutation, provider behavior, or UI changed.

Validation: shared 245/245; API 555/555; Web 646/646; ordinary database 198
passed / 143 expected environment skips; forced root tests; workspace
lint/typecheck; local Nest and Next builds with 82 static pages; provider-spend
4/4; controlled-release 5/5; Actionlint; pinned actions; Gitleaks across 542
commits; diff and runtime clean-room scans. Full database replay was not
repeated because no database source or migration changed.

Keep `ERP_CORTEX_CONVERSATION_READS_ENABLED=false`,
`ERP_CORTEX_CONVERSATION_READS_VIA_API=false`, and both allowlists empty.
Before any canary, finish the M3.152 owner-approved managed backup/PITR proof,
then compare legacy/Core list/detail behavior for two users and every role in
one exact tenant. Source-only next increment: design an idempotent, audited
Core conversation-write boundary without moving AI or transaction authority to
Python.

## M3.158 loopback-authenticated Cortex route proof

1. Mapped middleware, Server Component, profile, direct PostgreSQL, graph,
   conversations, notifications, Realtime, and semantic-index dependencies.
2. Added a loopback-only Supabase contract harness for the exact Auth user and
   server profile calls. It exposes deterministic local session material,
   rejects unsupported endpoints, launches Next with provider/core flags
   closed, and never enters the production route tree.
3. Replayed 104/104 migrations plus deterministic seed into disposable
   PostgreSQL 17. Proved unauthenticated denial and authenticated full-route
   rendering in installed Chrome at desktop/mobile, with a local WebSocket and
   locally fulfilled Fontshare CSS.
4. Replaced document-wide agent auto-scroll with internal-log scrolling and
   added a zero-initial-scroll browser assertion. Allowed configured loopback
   Auth/Realtime origins in development CSP only; production remains closed.
5. Capped root Turbo tests at two packages after unrestricted concurrency
   caused six 5-second Nest setup timeouts. Forced cache-bypass validation then
   passed without weakening timeouts.

Validation: Playwright 1/1; Web 639/639; shared 243/243; API 546/546; ordinary
database 198 passed / 143 environment-gated skips; forced bounded root suite;
workspace lint/typecheck; PostgreSQL release verifier 104/104; provider-spend
4/4; and Nest/Next production build with 82 static pages.

Keep every Cortex Core/indexing flag false, allowlists empty, and AI/provider
credentials absent. Treat this as route-contract evidence, not complete
GoTrue/PostgREST or managed Auth parity. Next release work remains M3.152 owner
approval and proof of the Purchase Order mapping on a complete managed
backup/PITR restore. No hosted mutation or deployment is authorized.

## M3.157 auth-safe Cortex indexing browser proof

Extracted the Cortex page's control decision into one server-owned projection:
only canonical admin/owner roles may see it, and only an exact enabled tenant
may use it. Added a test-only Vite gallery, dedicated Playwright configuration,
installed-Chrome fallback, narrow TypeScript configuration, and a local script.
The gallery imports production component/CSS and never enters the Next.js route
tree.

Validation: focused 6/6; localhost Playwright 5/5 across desktop/mobile; Web
637/637; workspace lint/typecheck; local NestJS/Next.js production build with
82 static pages; provider-spend 4/4; controlled-release 5/5; Actionlint;
Gitleaks across 540 commits; pinned workflow references; diff checks; and
clean-room scan. Tests observed zero external requests and made no Supabase,
database, queue, or provider call.

Keep all semantic-index flags false and allowlists empty. Do not treat the
gallery as authenticated route or release evidence. Remaining release work is
M3.152 owner-approved duplicate remediation on a complete managed backup/PITR
restore, plus full `/cortex` session integration in a complete isolated Auth
stack if route-level canary proof is required. Owner approval must still name
the exact tenant, spend ceiling, and rollback owner before any provider call.

## M3.156 disposable Cortex semantic-index runtime proof

Added always-rollback PostgreSQL and BullMQ integration coverage for M3.155.
The database test executes as `authenticated` and proves that the browser role
cannot select or insert server-owned jobs. The API integration uses nested
savepoints and a deterministic fake embedding worker to exercise authorization,
tenant concealment, idempotency, active-job locking, the 64-node/one-call
ceiling, empty backlog, Redis-loss reconstruction, terminal unknown outcome,
atomic vector/job commit, and semantic-audit linkage without external spend.

Validation: 104/104 migrations on PostgreSQL 17.10; database 341/341 with zero
skips; full API integration 31/31 across 44 suites with zero failures or
pending tests; schema SHA-256
`4DDF4B3D24906CA2328790342E6406636080BE5475AA0138DF8E7431D615E9F6`;
focused API 3/3; focused database runtime/static 4/4; API and database
typecheck. Final gates passed: API 546/546; ordinary no-database tests 198
passed with 143 expected environment-gated skips; workspace lint/typecheck;
NestJS/Next.js production build with 82 static pages; provider-spend 4/4;
controlled-release 5/5; Actionlint; Gitleaks across 539 commits; pinned workflow
references; diff checks; and clean-room scan. The disposable database and
Redis process were removed afterward.

Keep all indexing flags false, tenant allowlists empty, and AI worker/provider
configuration absent. Do not repeat this lane unless indexing source or the
migration ledger changes. Remaining gates are M3.152 owner-approved duplicate
remediation on a complete managed backup/PITR restore and protected
desktop/mobile confirmation/status proof in an auth-safe isolated environment.
Only then may an owner approve one exact-tenant canary with a written spend
ceiling and rollback owner. No hosted mutation or deployment occurred.

## M3.155 cost-bounded Cortex semantic indexing jobs

Added a strict shared command/status/queue contract, server-only job table and
migration, owner/admin capability, audited Nest intake, PostgreSQL state
machine, BullMQ identity-only transport/recovery, Python-only embedding client,
authenticated Web adapters/routes, and a confirmation-first Cortex control.
The old browser 80-by-64 loop is removed. The compatibility embed route is
closed by default.

Keep every `ERP_CORTEX_SEMANTIC_INDEX_*` flag false, all tenant UUID allowlists
empty, and `ERP_CORTEX_LEGACY_EMBED_ENABLED=false`. Do not add worker secrets,
apply migration `20260807160000`, or deploy merely to exercise this slice.
First obtain owner approval for M3.152, replay all 104 source migrations on a
complete disposable managed restore, and prove job/RLS/privilege constraints,
Redis loss recovery, current-role revocation, one-call crash boundaries, Python
response dimensions, audit continuity, and protected browser behavior with a
fake zero-cost embedding provider. Only then approve one exact-tenant canary
with an explicit spend ceiling and rollback owner.

Current validation: focused contract/database/Core/Web behavior passed; shared
243/243, API source 531/531, API e2e 14/14, Web 631/631, database 198 passed
with 142 runtime-gated skips; final queue 3/3 and UI disclosure 2/2 passed;
workspace lint/typecheck and final local Nest/Next builds passed. Docker
service was stopped, so migration execution and runtime
RLS remain unresolved. Source is not deployed and no provider/hosted state
changed. The managed manifest is now 55/104 with an exact 49-file pending
suffix.

## M3.154 Core Cortex entity-context read authority

Added a shared entity parameter/response contract and safe relationship/evidence
projection, Nest pipe/controller/service, independent environment gates,
authenticated Web Core adapter, and fail-closed route selector. Core requires
`cortex.search`, derives tenant and role scope, validates source/type ownership,
limits the context pack to 12 neighbors and six provenance events, and emits at
most 13 citations. The direct Next/database path stays active by default.

Keep `ERP_CORTEX_ENTITY_READS_ENABLED=false`,
`ERP_CORTEX_ENTITY_READS_VIA_API=false`, and both tenant allowlists empty.
After M3.152 owner approval and reviewed managed 103/103 parity, compare legacy
and Core responses for allowed, forbidden, missing, mismatched, malformed, and
Core-unavailable cases in one protected tenant. Prove every relationship and
citation resolves under the caller's role, then capture browser and rollback
evidence. No AI-provider or frontend deployment is needed.

Validation passed: focused 199/199; full API/Web/shared package suites in
single-worker mode; workspace lint/typecheck; one local 81-route production
build; Actionlint; Gitleaks across 537 commits; pinned workflow refs;
controlled-release 5/5; provider-spend 4/4; and diff checks. Live production
inspection was read-only and did not exercise this undeployed source path. No
database or provider state changed.

## M3.153 Core Cortex graph read authority

Added the original shared graph query/response contract, registered source-to-
node ownership map, Nest graph pipe/controller/service, independent environment
gates, authenticated Web Core adapter, and fail-closed Next route selector.
Whole graph reads are tenant-scoped and capped at 1,500 nodes/12,000 links.
Focused reads require one complete registered source identity, verify source
ownership plus role scope, and cap the one-hop neighborhood at 40.

Current behavior is unchanged because
`ERP_CORTEX_GRAPH_READS_ENABLED=false`,
`ERP_CORTEX_GRAPH_READS_VIA_API=false`, and both tenant allowlists are empty.
Do not enable them while managed Supabase remains 55/103 or before graph-table,
role-by-role, protected browser, and rollback evidence. Next migration step:
after the database owner clears M3.152 and managed parity is restored, run a
read-only one-tenant legacy/Core graph parity canary; never couple that canary
to an AI-provider or hosted frontend deployment.

Validation passed: affected contracts/routes/services/adapters; API 523/523 in
a single-worker lane; workspace lint/typecheck; one local 81-route Nest/Next
production build; Actionlint; Gitleaks; pinned workflow refs; controlled-release
5/5; provider-spend 4/4; and clean-room runtime scanning. The parallel workspace
test attempt hit three unrelated five-second controller timeouts under machine
contention; each passed alone and the complete API suite then passed. No hosted
state changed.

## M3.152 Purchase Order owner-review proposal

Added a pure proposal builder and read-only managed planner. The planner
queries duplicate and tenant-scoped number sets inside one repeatable-read,
read-only transaction, recommends the earliest-created/lexical-ID row as
canonical, and allocates the first free `-Rnn` target without exceeding the
existing 50-character limit. It writes atomically outside Git, refuses
overwrite, and produces a proposal that cannot pass the version-1 mapping
preflight.

Managed proof produced one duplicate group, 12 recommendations, one keep, and
11 renumbers. The stable external artifact is 4,220 bytes with SHA-256
`803a25ec80b501ff86154e42777af0ea7ca2ed90d4e21bde4dcf2b749db99510`.
Runtime uniqueness/length checks passed; overwrite and mapping-preflight gates
failed closed. Focused 11/11, workspace tests, lint, typecheck, and one local
production build passed. No hosted state or provider deployment changed.

Next: database owner reviews the recommendations, records approver/time, and
creates a separate complete version-1 mapping. Validate it against a fresh
managed snapshot. Then obtain a complete managed backup/PITR clone containing
Auth, Storage, vector, roles, grants, and provider catalog; apply only the
approved mapping to that clone and run the zero-skip M3.151 parity gates. Keep
hosted SQL, paid branch, canaries, Vercel, and Railway closed.

## M3.151 free local managed-suffix replay

Cleared the tooling half of the M3.150 export blocker without creating a paid
Supabase branch. Export preflight now accepts a separate
`DATABASE_EXPORT_URL`, supports an approved portable PostgreSQL 17
`PG_DUMP_PATH`, requires `pg_dumpall` for role export, rejects wrong client
majors, and emits method-correct pre-data/data/post-data commands.

Reused the hash-verified 2026-08-06 public snapshot and its isolated clone.
After a local rollback dump, applied the nine migrations after the clone's
94-migration head. The localhost-only verifier reports an exact 103-migration
ledger and a 48-file suffix from managed boundary 55. It also reports
`releaseReady: false`: mapping is synthetic clone-only, owner approval is
absent, and managed Auth, Storage, and vector surfaces are missing. Injected
database proof recorded 218 pass, 11 fail, and 108 skip; standard source tests,
lint, typecheck, and production build passed. No hosted state changed.

Next: obtain the database owner's external 12-row mapping and a complete,
fresh managed backup/PITR restore containing Auth/Storage/provider catalog
surfaces. Rehearse the approved mapping on that clone, then run zero-skip
database/API/Redis/browser and reconciliation gates. Keep paid branches,
hosted SQL, canaries, Vercel, and Railway closed.

## M3.150 managed Supabase parity plan (read-only)

Refreshed the exact managed boundary without executing SQL: PostgreSQL 17.6,
55/103 migrations, one linear 48-file suffix, no unexpected or out-of-order
history. Current hard blockers are one tenant-scoped 12-row Purchase Order
duplicate group, 213 anonymous table-privilege rows, 209 `PUBLIC` policies,
blocked supported export, unproved `MIGRATIONS_FAILED` default-branch state,
missing Auth/audit/Storage recovery evidence, and unresolved provider spend
approval. Advisors remain 14 security and 253 performance notices.

Added `managed-supabase-parity-plan.json`, a six-batch review runbook, and a
pure verifier that rejects missing, duplicated, reordered, or stale migration
plans. Focused verifier 4/4, database release 9/9, and Purchase Order duplicate
4/4 tests passed. Full workspace tests, lint, typecheck, production build,
Actionlint, Gitleaks, workflow-action verification, controlled-release 5/5,
provider-spend 4/4, and migration/diff checks passed. No provider mutation
occurred.

Next: database owner supplies the sensitive external 12-row mapping and a
supported session-pooler/direct export path. Validate both read-only, restore
into isolated PostgreSQL 17, apply the owner-approved mapping only to the
clone, and replay all 48 files. Do not create a paid branch or apply hosted SQL
until free local evidence and explicit cost approval pass.

## M3.149 Core user-role assignment authority

Added strict shared command/result contracts, a service-only replay ledger,
database privilege/RLS hardening, and the closed-by-default NestJS admin
command. The existing Web Server Action selects Core only for exact-`true`
plus UUID allowlisting and fails closed after selection. The unselected
server-only compatibility path remains in place; its update is now explicitly
tenant-scoped. Adjacent owner hierarchy checks were added without changing
visible UI or route contracts.

Validation passed: focused and full workspace suites; Web 93 files/610 tests;
typecheck/lint; Nest/Next production build with 81/81 routes; 103-file
migration verifier; Actionlint; Gitleaks; controlled-release 5/5;
provider-spend 4/4; local protected-route browser proof; and fresh disposable
PostgreSQL 17/Redis 7.4.9 replay with 103/103 migrations, database 337/337,
API integration 21/21 files, and stable schema hashes. No provider deployment
or hosted database write occurred.

Next: keep all four role-assignment flags false/empty and reconcile the
48-migration inferred managed gap on a disposable or branch database. Produce
duplicate-data remediation, privilege/RLS diff, backup/PITR restore, Auth
identity, audit recovery, rollback, and bounded-spend evidence before asking
for one reviewed managed batch or one-tenant canary.

## M3.148 anonymous tenant-identity RPC hardening

Added one additive source migration that revokes `public`/`anon` EXECUTE on
`public.auth_tenant_id()` and explicitly preserves `authenticated` and
`service_role`. Added static/runtime database coverage and updated the
reproducibility verifier. Source checkpoint
`9c2b64b81b64b91de013d470e3147c3817dab27b` is pushed to
`origin/agent-02/third-code-erp-landing`.

Validation passed: focused database tests; 102-file migration verifier;
serial workspace tests; typecheck/lint; production build 81/81 routes;
Actionlint; Gitleaks; controlled-release 5/5; provider-spend 4/4; and fresh
PostgreSQL 17/Redis 7.4.9 replay with 102/102 migrations, database 334/334,
API integration 27/27, Redis recovery, and identical schema hash
`278B8F024CED178A943B9E22FB14B9CD3BC7AEC3E339269E9DD20969B4B20843`.
Local desktop/mobile landing QA also passed without UI changes.

Next: keep the managed project and all hosted canaries closed. Reconcile the
now 47-migration managed gap, duplicate Purchase Order data, advisor findings,
backup/PITR, Auth identity, audit recovery, rollback, and spend limits on a
disposable or branch database before proposing any ordered managed apply.

## M3.147 managed Supabase parity audit (read-only)

Inspected the connected `ERP` project without executing SQL or applying a
migration. Project health is `ACTIVE_HEALTHY` on PostgreSQL 17.6.1.121, but
the managed migration ledger stops at 55 migrations
(`20260729233017_notification_outbox_foundation`) while source has 101. The
46 later local migrations, including the customer-invoice draft workflow,
remain unapplied. The managed catalog has 88 public RLS-enabled tables and
does not contain `customer_invoice_draft_create_requests`.

Security/performance advisors and recent logs were captured read-only. Open
findings include missing policies on three RLS tables, exposed
`SECURITY DEFINER` authorization RPCs, public `vector`, leaked-password
protection disabled, 148 unindexed foreign keys, 103 unused indexes, a
duplicate tenant slug index, and recurring duplicate Purchase Order
uniqueness errors. No provider mutation occurred and no billable deploy was
started.

Next: reconcile migration/data/privilege differences on a disposable or
branch database first; produce duplicate-row remediation, backup/PITR,
identity, audit, and bounded-spend evidence; obtain explicit approval before
any ordered managed apply. Keep all ERP write canaries closed.

## M3.146 Core-only customer invoice draft creation

Implemented the smallest compatible migration: added shared invoice-draft
contracts; a service-only tenant/idempotency ledger and migration; NestJS
pipe/controller/service/module/config/tests; Core client and observability
mapping; and thin Billing/Procurement Server Actions. Revoked authenticated
invoice mutation privileges and removed the legacy invoice write policies.
Changed source is checkpoint `473eaf1d6a9ec468165520685e2718eeefea5124`,
pushed to `origin/agent-02/third-code-erp-landing`.

Validation passed: focused DB/API/Web/environment tests; serial workspace
tests; typecheck/lint; production build (81/81 routes); migration verifier;
Actionlint; Gitleaks; controlled-release 5/5; provider-spend 4/4; and
disposable PostgreSQL 17/Redis 7.4.9 replay with 101/101 migrations,
database 54/54 files and 332/332 tests, API 20/20 files and 27/27 tests,
Redis recovery, and identical schema hash
`278B8F024CED178A943B9E22FB14B9CD3BC7AEC3E339269E9DD20969B4B20843`.
No hosted provider state changed.

Next: keep invoice draft Core flags disabled and obtain managed Supabase
catalog/RLS/data parity, supported backup/PITR recovery, Auth identity,
audit recovery, and bounded spend approval before a one-tenant canary.

## M3.145 disposable replay hardening

The first fresh replay after M3.144 stopped at the database verifier because
its minimum-grant fixture still demanded legacy authenticated Cost Entry
writes. The source migration already revoked those grants for Core-only
authority. Removed the obsolete verifier requirements, added an explicit
no-write invariant, and changed the runtime hardening assertion to reject a
permitted role's direct insert. No migration SQL or hosted state changed.

Validation: corrected disposable PostgreSQL 17/Redis 7.4.9 lane applied
100/100 migrations; database 53/53 files and 329/329 tests; API integration
20/20 files and 27/27 tests; Redis restart/reconnect/pending-recovery checks;
schema hash before/after
`18D2840CE47084F159BDF5037F74AE51BD24418EF8F63943096F996509BB6FFC`;
serial workspace tests; typecheck/lint; production build 81/81 routes;
migration verifier; Actionlint; Gitleaks; controlled-release 5/5; and
provider-spend 4/4. Source checkpoint:
`3ca2060332fbda01f56b3044a8cde9e0201af71a`, pushed to
`origin/agent-02/third-code-erp-landing`; remote SHA and clean worktree
verified. Hosted canaries remain closed.

## M3.144 Core Cost Entry restore boundary

Added a separate source migration and Drizzle model for tenant-scoped restore
idempotency. NestJS now exposes a closed-by-default restore command that
locks membership and the voided manual entry, validates a matching prior void
snapshot, clears void metadata transactionally, writes bounded audit evidence,
and replays the exact result. Added strict shared contracts, body pipe,
controller, service tests, environment validation, and database static
coverage. No Web restore UI, hosted migration, provider environment change,
Vercel build, or Railway deploy is authorized.

Validation passed: focused restore boundary (shared 4, database 2, API
service/controller plus environment 64); shared 27/231; database 49/53 files
with 188 passed/141 skipped; API 114/496; Web 92/600; serial Turbo workspace
tests; production build 81/81 routes; typecheck/lint; migration verifier (100
files); Actionlint; Gitleaks; controlled-release 5/5; provider-spend 4/4.
Database skips require `DATABASE_URL`; the disposable replay remains
unperformed for this new migration. Source checkpoint:
`963ae464ac35f9bc388605bcb641b2f42442ac19`, pushed to
`origin/agent-02/third-code-erp-landing`; remote SHA and clean worktree
verified.

## M3.143 Core-only Cost Entry deletion action

Removed the legacy Web direct `cost_entries` delete and duplicate audit path.
The existing Server Action now calls the typed Core DELETE adapter with a
bounded default or supplied reason and idempotency key, verifies tenant,
Project, entry, source, and voided state, then revalidates the existing cost
routes. Core failures and invalid results do not fall back to another writer;
the Cost Table caller and visible copy remain unchanged. The Nest API delete
gate is still false/empty and the void migration remains unapplied to hosted
Supabase. No provider deploy or environment mutation is authorized.

Validation passed: focused Web action/client 14/14; Web 92/600; shared
27/230; database 48/52 files with 186 passed/141 skipped; API 114/489; serial
Turbo workspace tests; production build 81/81 routes; typecheck/lint;
migration verifier (99 files); Actionlint; Gitleaks; controlled-release 5/5;
provider-spend 4/4. The default parallel workspace run exposed three
pre-existing Nest controller timeouts; the same API suite passed when Turbo
was constrained to one package at a time. No hosted state changed. Source
checkpoint: `ad1d8d2f5e902148cf3805d97232f8273afdc88b`, remote verified, clean
worktree.

## M3.140 Core-only Project creation

Removed the Web Project-create direct database fallback and frontend
`ERP_PROJECT_CREATE_WRITES_VIA_API` selector. The action now requires
`project.create`, submits the typed command and idempotency key to
`POST /v1/projects`, checks the Core response tenant, and redirects only after
the official result is valid. Added focused action coverage for Core routing,
idempotency preservation, Core failure, tenant mismatch, and capability
denial. The Nest API gate remains closed by default; this source milestone
does not authorize a hosted canary or provider mutation.

Validation passed: Web 90 files/587 tests; shared 27/229; database 47/51
files with 183 passed/141 skipped; API 112/480; production build 81/81
routes; typecheck/lint; migration verifier; Actionlint; Gitleaks;
controlled-release 5/5; provider-spend 4/4. No hosted state changed.
Source checkpoint: `c702bd9edec41cb3a9efd8b490ae5e82a3a04ceb`, remote verified,
worktree clean.

## M3.141 Core-only manual Cost Entry creation

Removed the Web create fallback and frontend
`ERP_COST_ENTRY_CREATE_WRITES_VIA_API` selector. The action requires
`cost.record`, submits exact integer cents plus idempotency key to
`POST /v1/projects/:projectId/cost-entries`, checks returned tenant/Project
identity, and revalidates only after a valid official result. Added focused
coverage for Core routing, idempotency preservation/generation, Core failure,
scope mismatch, and capability denial. Cost Entry deletion is not included;
it needs its own Core transactional/idempotent contract. No hosted canary or
provider mutation authorized.

Validation passed: focused action 5/5; Core client 113/113; Web 91/591;
shared 27/229; database 47/51 files with 183 passed/141 skipped; API 112/480;
production build 81/81 routes; typecheck/lint; migration verifier;
Actionlint; Gitleaks; controlled-release 5/5; provider-spend 4/4. No hosted
state changed. Source checkpoint: `f9770a015e0c8769010cf08cb4f31f7c26b6f656`,
remote verified, worktree clean.

## M3.142 Core Cost Entry void boundary

Added the source migration and Drizzle model for reversible Cost Entry voids,
tenant-scoped deletion idempotency/snapshot records, and service-only replay
evidence. Added a closed-by-default NestJS DELETE command with locked
membership, `cost.record`, manual-only and tenant/project checks, exact
transaction/audit behavior, and replay. Active Web cost page, dashboard, and
budget reads now exclude voided rows. Direct Web delete is intentionally not
migrated in this slice. No hosted migration or provider action is authorized.

Validation passed: Web 91/591; shared 27/230; database 48/52 files with
186 passed/141 skipped; API 114/489; production build 81/81 routes;
typecheck/lint; migration verifier (99 files); Actionlint; Gitleaks;
controlled-release 5/5; provider-spend 4/4. No hosted state changed.
Source checkpoint: `476903d934c3c1b65bf50b6075497707b8841248`, remote verified,
worktree clean.

## M3.139 self-hosted Core authority evidence

Ran `scripts/ci/run-wsl1-database-lane.ps1` and its cleanup script. The lane
replayed all 98 migrations on PostgreSQL 17 with Redis 7.4.9, passed the
database no-skip gate, ran the Nest API integration suite, and compared schema
before/after with identical SHA256
`6E1CA120B357614D2A9C4CF06F1E306E08210CFB7B11F340A5E2A286D42D1B71`.
No source or schema change was introduced. This evidence is local-only and
does not authorize hosted SQL, Vercel, Railway, or ERP canaries.

## M3.138 retire Project update flag surface

Deleted the unused `projectWritesUseCoreApi` function and its branch tests,
removed the Project update flag/allowlist from both env examples, and replaced
the old flag-driven runbook with a Core-only authority/canary runbook. Updated
database-release and self-hosted-CI guidance so rollback never restores a
direct writer. No runtime provider environment or database schema changed.

Validation: Core client 115/115; Web action 5/5; serial workspace tests
(shared 27/229, database 47/51 with 141 compatibility skips, API 112/480,
Web 89/583); production build 81/81 routes; typecheck, lint, migration
verifier, Actionlint, Gitleaks, controlled-release 5/5, and provider-spend
4/4 passed. Code/ops commit `a978b4f`. Hosted providers and ERP canaries stay
closed.

Remaining boundary: historical architecture/work logs may mention the former
flag as prior evidence, but no current runtime or operator path depends on it.

## M3.137 Project update Core cutover

Removed the final legacy Project update writer from the Web Server Action. The
action now obtains the current Project through the tenant-scoped Core read,
checks returned identity/tenant scope, and sends the full command with
`expectedUpdatedAt` to NestJS. Core owns transition validation, membership
recheck/locks, optimistic concurrency, mutation, and semantic audit. Core
errors are returned to the caller; no direct-database fallback remains.

Validation: focused action 5/5; Core client 116/116; serial workspace tests
(shared 27/229, database 47/51 with 141 compatibility skips, API 112/480,
Web 89/584); production build 81/81 routes; typecheck, lint, migration
verifier, Actionlint, Gitleaks, controlled-release 5/5, and provider-spend
4/4 passed. Code commit `927a2c3`. Hosted Supabase, Vercel, Railway, and ERP
canaries stay closed.

Compatibility boundary: when `ERP_CORE_API_URL` or the authenticated Core
session is unavailable, Project updates now fail closed rather than mutating
the database. Rollback is the reviewed source commit, not a second writer.
The obsolete `ERP_PROJECT_WRITES_VIA_API` configuration surface remains to be
removed in a follow-up cleanup after operator/runtime evidence.

## M3.136 legacy Project update fallback guard

Replaced the Web action's ad-hoc user/tenant lookup with
`requireUserProfile`, added the `project.update` capability, and applied the
shared status-transition table before both write paths. Added focused
regressions for terminal reopen rejection and capability denial before target
read. This is a compatibility hardening slice only: the direct fallback still
does not inherit Core's membership lock, idempotency, optimistic-concurrency,
and audit transaction semantics. No migration, flag, browser redesign, or
provider action was introduced.

Validation: focused Web action 4/4; serial workspace tests (shared 27/229,
database 47/51 with 141 compatibility skips, API 112/480, Web 89/583);
production build 81/81 routes; typecheck, lint, migration verifier,
Actionlint, Gitleaks, controlled-release 5/5, and provider-spend 4/4 passed.
Code commit `5a44ce8`. Hosted Supabase, Vercel, Railway, and ERP canaries stay
closed.

## M3.135 project status state machine

Added a shared Project transition table and applied it inside the existing
NestJS update transaction after membership/Project locks and before mutation.
Forward operational movement, hold/resume, and same-state edits remain valid;
terminal `completed`/`cancelled` records cannot reopen through Core. Invalid
movement returns a bounded conflict and writes no update. No migration, flag,
browser-path rewrite, or provider action was introduced; the legacy Web
fallback remains a separately gated convergence task.

Validation: shared 27/229; focused Project service/HTTP 22/22; WSL
PostgreSQL 17.10/Redis 7.4.9 replay, verifier, 98/98 migrations, and Project
API integration passed; serial workspace tests passed (database 47/51 with
141 compatibility skips, API 112/480, Web 89/581); production build 81/81
routes; typecheck, lint, Actionlint, Gitleaks, controlled-release 5/5, and
provider-spend 4/4 passed. Code commit `97c41f8`. Hosted Supabase, Vercel,
Railway, and ERP canaries stay closed.

## M3.134 project-update authority hardening

Extended the existing Project Core authority so `PATCH /v1/projects/:id`
locks tenant membership and rechecks `project.update` inside the same
transaction as Project row locking, optimistic concurrency, mutation, and
audit. The service now derives a database-backed principal instead of trusting
the request role. No migration, flag, browser write path, or provider action
was introduced.

Validation: focused Project service/HTTP tests 21/21; WSL PostgreSQL 17.10 /
Redis 7.4.9 replay, 98/98 migrations, verifier, and Project API integration
passed; serial workspace tests passed (shared 27/228, database 47/51 with 141
compatibility skips, API 112/479, Web 89/581); production build 81/81 routes;
typecheck, lint, Actionlint, Gitleaks, controlled-release 5/5, and
provider-spend 4/4 passed. Code commit `5534046`. Hosted Supabase, Vercel,
Railway, and ERP canaries stay closed.

## M3.133 project-create authority hardening

Moved the smallest safe authorization boundary into the existing Core project
create transaction. NestJS now locks the tenant membership, rechecks the
`project.create` capability, and uses the resulting database-backed principal
for actor context, idempotency claim, tenant-scoped insert, and semantic audit.
The Web fallback remains available only for non-canary tenants; no critical
business logic moved into React and no new migration or feature flag was
introduced.

Validation: focused project service/HTTP tests 20/20; WSL PostgreSQL 17.10 /
Redis 7.4.9 replay, 98/98 migrations, verifier, and project-create database
integration passed; serial workspace tests passed (shared 27/228, database
47/51 with 141 compatibility skips, API 112/478, Web 89/581); production
build 81/81 routes; typecheck, lint, Actionlint, Gitleaks,
controlled-release 5/5, and provider-spend 4/4 passed. Code commit
`6276d10`. Hosted Supabase, Vercel, Railway, and ERP canaries stay closed.

## M3.132 asset maintenance due projection

Added the smallest read-only operational projection on top of the existing
asset-maintenance history table: strict shared query/result contracts, a
NestJS `GET /v1/assets/maintenance/due` route, latest-record-first tenant SQL
with bounded pagination, and a Core-only Web service-watch panel. The
projection reuses the maintenance-read capability/allowlist, has no migration
or new flag, and does not change create/replay/audit authority.

Validation: WSL PostgreSQL 17.10/Redis 7.4.9 replay and asset-maintenance
integration pass; serial package tests pass (shared 27/228, database
47/51 with 141 compatibility skips, API 112/477, Web 89/581); production
build 81/81 routes; typecheck, lint, migration verifier, Actionlint,
Gitleaks, controlled-release 5/5, and provider-spend 4/4 pass. The parallel
Turbo test command had seven Windows 5-second HTTP timeouts; the serial
workspace run is the retained evidence. Code is committed as `be760ed` and
the reviewed branch is pushed. Hosted Supabase, Vercel, Railway, and canaries
stay closed.

## M3.131 asset maintenance history

Added the smallest vertical slice for service continuity: Drizzle schema and
replayable Supabase migration, shared contracts, capability/environment gates,
Nest list/create authority, Web detail/timeline/form, and focused contracts.
The create path parses and hashes a strict command, locks membership and asset,
claims a tenant-scoped idempotency row, commits the record, writes audit, and
stores a validated replay result. No direct browser table write or legacy
fallback was added. All flags are false with empty allowlists.

Validation: shared contract tests 3/3; API focused run 111 files/473 tests;
Web client tests 116/116; package typechecks; WSL replay 98/98 ordered
migrations, verifier pass, 20 Nest integration files/27 tests, and database
51/51 files/324 tests with zero skips. Serial build, typecheck, lint, full
tests, migration verifier, actionlint, gitleaks, controlled-release, and
provider-spend guards all pass. The code/docs checkpoints were subsequently
pushed. Hosted Supabase, Vercel, Railway, and canaries stay closed for billing
and release-safety reasons.

## M3.130 dashboard fault isolation

Extended `loadDashboardForRole` with an optional executive-failure fallback.
The dashboard passes its existing Today loader as the fallback, renders a
plain-language status notice, and preserves the existing route error boundary
if the scoped fallback also fails. No fake analytics defaults or direct browser
database writes were added.

Validation: dashboard-access tests 17/17, Web tests 89 files/579 tests,
serial typecheck, TS-only lint, production build 81/81 routes, migration-file
verification, Actionlint, Gitleaks, controlled-release (5/5), and spend guard
(4/4) pass. The first parallel gate attempt was discarded because build and
typecheck raced on shared `.next` generated types; the ordered rerun passed.
No hosted or provider mutation occurred.

## M3.129 self-hosted free database lane

Ran `scripts/ci/run-wsl1-database-lane.ps1` on the existing `ThirdCodeERP-Test`
WSL distribution. The lane rebuilt `erp_self_hosted_ci` from the system
bootstrap, applied all 97 migrations plus seed, passed the verifier and
zero-skip database tests, exercised Nest integration with Redis, and compared
schema dumps before/after the tests. The lane was cleaned with
`stop-wsl1-database-lane.ps1`.

The pinned Supabase CLI `2.109.1` direct `--db-url` diff was attempted while
the disposable database was live; it stopped before inspection because the
CLI requires Docker Desktop's Linux engine for its shadow database. This is a
known open CI artifact gate, not a reason to touch hosted Supabase.

## M3.128 cache-safe runtime test gate

Updated `turbo.json` so the root `test` task hashes 14 runtime inputs covering
`DATABASE_URL`, database expectation flags, Redis, and Nest integration gates.
Added `scripts/verify-turbo-test-cache.mjs`, a regression test, and the CI
preflight command `pnpm test:turbo-test-cache`.

Validation: the filtered Turbo database task reported a cache miss with the
disposable PostgreSQL replay and passed 51/51 files, 324/324 tests, zero skips.
Typecheck, TS-only lint, production build (2/2), migration verifier,
Gitleaks, Actionlint, controlled-release (5/5), spend guard (4/4), and the
cache-contract tests pass. No hosted SQL or provider action occurred.

## M3.127 pinned Supabase CLI schema-diff attempt

Attempted `npm exec --yes supabase@2.109.1 -- db diff` against the named
disposable replay, including direct `--from/--to` mode. Both read-only attempts
stopped before database inspection because the Docker Desktop Linux engine pipe
was unavailable while the CLI provisioned its shadow database.

No schema or provider state changed. Next: run the pinned diff in the approved
self-hosted CI/Docker lane, capture the artifact, and keep hosted SQL/deploys
closed until the remaining backup, data, rollback, identity, security, and
spend gates are green.

## M3.126 clean disposable PostgreSQL replay

Replayed the source from zero into local disposable PostgreSQL 17.10 database
`erp_clean_head_20260806_m3125`: applied the Supabase system bootstrap, all 97
ordered migrations, and `supabase/seed.sql`. The verifier passed 97/97 ledger,
RLS, policy, privilege, trigger, function, index, constraint, and service-only
checks. Database Vitest passed 51/51 files and 324/324 tests with zero skips
when all runtime expectation flags were enabled.

Boundary: this replay used the repository bootstrap plus ordered `psql` apply;
it is not a hosted migration, backup, or Supabase CLI schema-diff proof. Next:
capture the pinned CLI diff/CI artifact, then obtain managed backup, duplicate
Purchase Order owner mapping, audit recovery input, rollback, identity,
security, and spend approval before any hosted action.

## M3.125 capability evidence boundary

Refreshed `CAPABILITY_MATRIX.md` to the verified source SHA and current
hosted planner output without changing application or database behavior. Keep
hosted Supabase, Vercel, Railway, and all ERP canary flags unchanged until a
managed backup/rollback path, clean zero-to-head replay, duplicate Purchase
Order owner mapping, audit recovery input, exact provider identity, security,
and spend gates are independently green.

Validation: `git diff --check` and the repository clean-room/branding checks
remain required before the feature branch is pushed. Rollback is a one-file
revert of the matrix and memory documentation; no hosted rollback is needed.

## M3.124 bounded landing carousel and image priority

Implemented a source-only UX correction: clamp team-priority navigation at
`0..3`, expose native disabled states, preserve 44px touch targets, and add a
disabled hover/opacity treatment. Marked the above-fold hero media as a
priority image. Existing landing structure, copy, tokens, GSAP motion, and
clean-room asset contract remain unchanged.

Browser validation: local Playwright at 1440/768/390 showed three-line H1,
no horizontal overflow, correct disabled states, and zero console errors. One
Next development LCP warning remains for a duplicated decorative hero asset.
Next: run full local gates, update release memory, push feature branch only;
do not deploy while provider spend/release gates are red.

## M3.123 read-only catalog security gate

Implemented the database planner catalog query and pure analyzer for direct
anonymous table privileges and `PUBLIC`-role policies. Added tests for blocked
and green catalog states and broadened the replay verifier's policy check to
catch any policy role set containing `public`.

Validation: focused planner tests 9/9, full Turbo tests 4/4, typecheck,
TS-only lint, production build 2/2, migration verifier, Actionlint, Gitleaks,
controlled-release tests 5/5, and spend-guard tests 4/4 pass. The hosted
read-only planner reports 213 anonymous privilege rows and 209 public-role
policies, so the controlled release remains blocked. Next: push only the
reviewed feature branch. Do not apply hosted SQL or trigger Vercel or Railway
while migration drift, security findings, duplicate Purchase Orders, audit
recovery, rollback, identity, and spend gates remain open.

## M3.122 source anonymous-grant and policy hardening

Implemented migration `20260806160000_security_role_baseline.sql`. It removes
anonymous table/sequence authority, protects future public objects through
default privileges, and normalizes only legacy `public`-role tenant policies
to `authenticated`. The verifier now treats anonymous grants and `PUBLIC`
tenant policies as catalog failures.

Validation: disposable PostgreSQL 17.10 suffix replay reached 97/97 and the
database verifier passed every catalog check; database Vitest passed 51/51
files and 324/324 tests with zero skips. Full Turbo tests/build, typecheck,
TS-only lint, Gitleaks, Actionlint, and migration-file validation pass. No
hosted database or provider state changed.

Next: obtain a clean zero-to-head Supabase/PostgreSQL 17 replay artifact and
review public-portal behavior through Nest/service paths. Keep the hosted
55/97 ledger, duplicate Purchase Order mapping, audit recovery tenant, managed
backup, rollback, identity, security, and spend gates unresolved until their
own evidence is complete.

## M3.121 hosted Supabase security and parity refresh

Completed a read-only hosted catalog audit. Supabase is healthy on PostgreSQL
17.6.1 with 55/96 migrations and 88/88 public tables using RLS, but 54 tables
still expose direct `anon` write privileges (321 write-grant rows) and 56
tables use `public`-role tenant policies. No provider or database mutation is
authorized from this evidence. The empty advisor response is recorded as
inconclusive rather than green.

Next: add a narrowly scoped source migration that removes anonymous table and
sequence authority and makes tenant policies explicitly authenticated where
the route is not a documented server-mediated public edge. Replay the complete
source ledger on disposable PostgreSQL 17, then extend the read-only hosted
catalog gate. Do not apply hosted SQL until the managed backup, duplicate-PO
owner mapping, audit-recovery tenant, rollback, and spend gates are green.

## M3.120 dashboard incident revalidation

Completed read-only revalidation of the reported `/dashboard` failure. Live
anonymous behavior is the expected `307 /auth/login`; Vercel runtime-error
clusters for `/dashboard` are zero in the current seven-day window; the active
production deployment is `READY`; and historical root cause remains the
repaired `partial_delivered` enum catalog gap. No source patch, hosted SQL,
provider setting, or deployment was made.

Next: keep the current repair and release gates intact; do not spend a Vercel
build to retest an already-green unauthenticated boundary.

## M3.119 public favicon identity

Completed source-only rebrand of the browser favicon from the legacy `B` mark
to `TC`, with a runtime regression assertion. No migration, hosted setting,
provider build, or tenant data changed.

Evidence: branding-focused test and full local release gates. Next: keep the
hosted release blockers explicit; do not promote this feature branch until
managed migration parity, duplicate Purchase Order mapping, audit recovery
tenant input, readiness, identity, security, and spend checks are green.

## M3.118 Won-to-Project authority seam (2026-08-06)

Implemented the shared empty command/result contract, forced-RLS service-only
idempotency ledger migration, Nest controller/pipe/service, capability and
tenant gates, atomic project/checklist/notification/audit transaction, and Web
compatibility adapter. All new selectors remain false/empty. Focused and full
local validation is green; the read-only hosted plan remains blocked by
migration drift, duplicate Purchase Orders, and missing audit recovery tenant
input. No hosted SQL, tenant data, Storage, provider setting, build, or deploy
changed.

## M3.117 Purchase Order mapping-template preflight

Completed a read-only owner-review artifact generator for the existing
tenant-scoped duplicate Purchase Order gate. It takes one repeatable-read
snapshot, refuses repository/build/public paths and overwrite, and emits a
schema-compatible skeleton with blank replacement numbers. It never repairs
rows, changes migration history, applies hosted SQL, or authorizes release.

Evidence: focused template tests 3/3 and existing mapping tests 4/4. The
hosted mapping file is still missing; no provider or database action is
authorized.

Next: database owner fills and approves the external mapping, then rerun the
read-only validator and managed Supabase parity gate.

## M3.116 Togal BOM commit authority seam (2026-08-06)

Added strict shared command/result contracts, a service-only
`togal_bom_commit_requests` idempotency ledger migration, Drizzle schema, and
Nest controller/service/pipe. Added role capability parity, tenant-scoped
feature flags, optional material/vendor tenant checks, row locking, exact
cent arithmetic, atomic BOM line/total updates, replay, and in-transaction
audit. The Next compatibility route delegates only for an explicit canary and
returns the historical snake_case response; it never falls back when Core is
enabled but unavailable. Browser commit now sends a per-attempt idempotency
key.

Focused contracts pass: shared 3/3, database migration 3/3, API authority 7/7,
Web adapter 112/112, and Web route 3/3. Full Turbo tests (4/4 package tasks),
typecheck, production build, gitleaks, actionlint, and the 95-file repository
migration-ledger verifier pass. The read-only controlled release plan remains
review-required for hosted migration drift, duplicate Purchase Orders, and
missing audit-recovery tenant input. No provider or hosted state changed; all
new flags remain false/empty.

## Next gate

Push the reviewed feature branch only after the new migration is included in
the disposable replay verifier. Keep Core flags closed. Do not promote until
managed Supabase parity, owner PO mapping, rollback, canary, exact provider
identity, readiness, and spend gates clear.

## M3.115 provider spend gate (2026-08-06)

Integrated the static provider spend guard into the controlled release planner.
It now fails closed when Vercel Git deployment is enabled, when workspace
automation contains a Vercel/Railway deploy command, or when the spend report
is missing. Added pure tests for the Railway command and missing-gate cases.
No provider or hosted state changed.

## Next gate

Keep the spend guard green and Vercel Git disconnected. Do not create a preview
or production build. Obtain the owner mapping, managed Supabase backup/parity,
audit evidence, rollback proof, and explicit spend approval before any single
provider promotion.

## M3.114 Purchase Order duplicate-mapping preflight (2026-08-06)

Added `scripts/plan-purchase-order-mapping.mjs` and a pure validator. The
command reads a versioned mapping outside Git, compares it to duplicate and
tenant-scoped rows in one repeatable-read transaction, rejects stale,
cross-tenant, incomplete, unknown, and occupied-target mappings, and prints
only opaque conflict evidence. It never writes SQL or edits hosted data.
Pure mapping tests pass 4/4; no owner mapping exists yet.

## Next gate

Obtain the database owner's mapping file and run the preflight. If ready,
repeat supported managed backup/catalog/data/audit/auth/storage/grants/vector
parity and ordered disposable replay. Keep hosted SQL and provider builds
closed until all release gates pass.

## M3.113 close historical secret-scan findings (2026-08-06)

Confirmed six historical Gitleaks hits as deterministic unit-test delivery
idempotency values. Added exact path/value-scoped provenance allowlisting in
`.gitleaks.toml`; no runtime or production secret changed. Pinned scan passes
with 474 commits scanned and zero leaks.

## Next gate

Keep allowlist scope exact and review any future scan finding as a possible
credential. Continue managed Supabase backup/catalog/data/audit parity and
owner-approved duplicate Purchase Order mapping. Do not trigger provider
builds or hosted SQL.

## M3.112 recoverable export and ordered disposable replay (2026-08-06)

Verified the session pooler on port 5432 with a read-only PostgreSQL 17.6
query. Created a supplemental four-file public/roles safety export outside
Git using a free PostgreSQL 17.10 client; artifacts were hashed in a temp
manifest. Restored the hosted snapshot to an isolated local PostgreSQL 17.10
clone. The exact first suffix migration stopped on its intended 12-record
duplicate Purchase Order guard. After synthetic, clone-only duplicate renames,
all 39 pending migrations applied 39/39; 29/29 migration-created tables were
present with RLS and the delivery workflow enum values expanded. This is
dependency/syntax evidence only: the local clone omits Supabase-managed auth,
vector HNSW, and provider grants, so the full verifier is not release-green.

## Next gate

Keep Supabase unchanged. Obtain the owner-approved canonical mapping for the
12 duplicate Purchase Orders and a supported managed backup/catalog/data/audit
export or an explicitly approved disposable managed clone. Repeat the replay
with managed auth/storage/grants/vector parity, run zero-skipped database and
protected-flow checks, then review rollback, exact provider identity, and
spend caps. Do not call `supabase_apply_migration` or trigger Vercel/Railway.

## M3.111 read-only Supabase export preflight (2026-08-06)

Added a pure export planner and CLI report. It validates connection-string
metadata without printing secrets, rejects the current transaction pooler
port 6543 for dumps, and requires Supabase CLI plus Docker or PostgreSQL 17
client tools. Unit tests pass 4/4. The repository URL is readable as
PostgreSQL 17.6 with a 25 MB database, 88 public tables, and 55 migrations
through `20260729233017`; local export tooling is absent. Serial package
validation is green: API 105/452, Web 88/570, shared-types 25/219, database
45/177 with 141 expected skips, lint/typecheck, and Next build 81/81.

## Next gate

Use an approved session-pooler/direct URL on port 5432 and install or expose a
supported dump tool. Create encrypted roles/schema/data exports outside Git,
hash them, restore them into a disposable PostgreSQL 17 clone, and compare
catalog/RLS/policies/data/audit/financial totals before any hosted SQL.

## M3.110 public landing UX and SEO smoke audit (2026-08-06)

Performed a read-only browser pass at 1440px and 390px. Verified the hosted
title, canonical, description, OG image, JSON-LD, H1, responsive width, and
zero console errors. No code or provider change was needed; the audit only
records the currently hosted landing page and does not validate the branch's
dashboard recovery boundary.

## Next gate

Do not trigger a build for this evidence slice. Obtain supported Supabase
backup/catalog/data/audit export, reconcile the 39 migration suffix in an
isolated PostgreSQL 17 replay, obtain owner mapping for the duplicate PO group,
and review security warnings before canary or promotion.

## M3.109 dashboard render recovery boundary (2026-08-06)

Added a route-group error boundary for protected dashboard render failures.
The boundary displays a calm recovery state with retry and dashboard
navigation, preserves only the Next digest reference, and states that records
remain unchanged. Added responsive navy/gold styling and a source contract
test forbidding `error.message` exposure. No API, schema, migration, or
provider behavior changed. Web full tests are 88/570, production build is
81/81 routes, and typecheck/lint pass.

## Next gate

Source commit `6eb0b0a0388d0e9cc00981173c5a40f2ce458116` is pushed to the
feature branch by `kurtgav`; `origin/main` remains unchanged. Keep Vercel Git
disconnected and do not trigger a build. Continue hosted Supabase backup/
catalog/data/audit export, ordered 39-migration reconciliation, duplicate-PO
owner mapping, security review, protected canary, rollback, readiness, exact
identity, and spend gates.

## M3.108 hosted Supabase parity refresh (2026-08-06)

Performed a read-only hosted snapshot against `aqqrtkmtcsfkbyyqxowv` and
cross-checked the repository migration planner. PostgreSQL is 17.6; hosted is
55/94 migrations through `20260729233017`; the public catalog has 88 tables,
88 RLS-enabled tables, 22 forced-RLS tables, and 303 policies. Data counts are
2 tenants, 13 users, 13 Purchase Orders, 4 invoices, 662 audit rows, 385
Cortex nodes, and 454 Cortex edges. `public.assets` and
`delivery_schedule_create_requests` are absent. The duplicate planner reports
one 12-record tenant-scoped group, and Supabase security advisors report 14
notices/11 warnings. Vercel `/dashboard` runtime-error and 500-log queries are
empty; Railway readiness/health are 200. No provider or hosted mutation was
performed.

## Next gate

Obtain supported backup/catalog/data/audit export; reconcile the 39 source
migrations after hosted `20260729233017` in order on a protected disposable
lane; resolve the owner-approved duplicate-PO mapping and security warnings;
then run rollback/protected-canary/readiness/exact-identity/spend gates. Keep
all new Core selectors and tenant allowlists false/empty, and do not trigger a
Vercel or Railway build.

## M3.107 inventory UOM maintenance authority (2026-08-06)

Added the strict shared UOM update command/result, Nest pipe/service/controller
with tenant membership and capability recheck, row locks, tenant-scoped update,
semantic audit, and fail-closed feature flag/allowlist. Added the compatibility
Web action/Core selector and compact Inventory editor for name and active state;
code and decimal precision remain immutable. No migration or provider action
was needed. Local evidence is shared 29/29, API 452 passed with 26 skipped,
Web 569/569, Next 81/81, and repository lint/type checks.

## Next gate

Source/docs commit `ead54aac876ed6a52f1b693c7fe6fec8f2026f8b` is pushed to the
feature branch by `kurtgav`; `origin/main` remains unchanged. Keep UOM update
flags and tenant allowlists empty/false. Continue supported Supabase
backup/catalog/data/audit export for `aqqrtkmtcsfkbyyqxowv`, reconcile all 39
source migrations after hosted `20260729233017` in order, resolve the
owner-approved tenant-scoped Purchase Order duplicate mapping, and review
security warnings before any hosted SQL, canary, Railway promotion, or Vercel
build.

## M3.106 inventory item policy control surface (2026-08-06)

Exposed per-item base-UOM and perpetual-tracking maintenance in Inventory using
the existing authenticated Web action and Core selector. The form keeps item
identity stable and prevents selecting newly inactive UOMs; no migration or
provider action was needed. Local Web focused tests 125/125, full suite
87/567, typecheck, and production build 81/81 routes pass.

## Next gate

Source/docs commit `7570cda` is pushed to the feature branch only;
`origin/main` remains unchanged. Keep the item-policy selector
compatibility-default and complete supported Supabase backup/export,
ordered suffix reconciliation, duplicate-PO mapping, and security review before
any hosted apply, canary, Railway promotion, or Vercel build.

## M3.105 inventory warehouse control surface (2026-08-06)

Exposed the existing Warehouse update authority through the Inventory UI with
name and active-state controls. The immutable code/project boundary and
zero-net-stock guard remain in the server action/Core service; no migration or
provider work was needed. Local Web typecheck, focused inventory/Core tests
125/125, full Web 87/567, and production build 81/81 routes pass.

## Next gate

Feature branch commit `e9ee5adb44e3bc2da5cab54af2828065f117f343` is pushed;
`origin/main` remains unchanged. Keep the Core selector compatibility-default
and proceed with supported Supabase backup/export plus ordered source suffix
reconciliation before any hosted apply, canary, Railway promotion, or Vercel
build.

## M3.104 provider spend guard audit (2026-08-06)

Expanded `scripts/verify-vercel-spend-guard.mjs` to discover all workspace
`package.json` manifests and `.github/workflows/*.{yml,yaml}` files. The guard
still requires `apps/web/vercel.json` `git.deploymentEnabled=false` and now
blocks hidden Vercel deploy commands. Guard tests pass 3/3. This source-only
change does not authorize a provider build; hosted Supabase parity and the
single-promotion gate remain open.

## M3.103 closed delivery schedule creation authority (2026-08-06)

Added `20260806130000_delivery_schedule_create_idempotency.sql`, a new
server-only request state enum/table with tenant/idempotency uniqueness,
composite tenant-safe foreign keys, forced RLS, and service-role-only grants.
Added strict shared scheduling contracts, a Nest pipe/controller/service
command, exact API/Web flags, Core adapter, retry-key form seam, and
rollback-only integration. Nest rechecks membership and `delivery.receive`,
locks an issued PO, creates the schedule, in-app role notifications, replay
result, and semantic audit in one transaction. The selected Web path never
falls back to a browser mutation after a Core error.

Validation: shared delivery 16/16; API controller/service 47/47; Web action
22/22; schedule database integration 1/1; disposable PostgreSQL migration,
RLS, privilege, and catalog verification 94/94 with 4 service-only tables;
database 49/318; API 104/449; Web 87/567; typechecks/lint; and production
build 2/2 with 81/81 routes. Source SHA
`b3b3bdd935f50ff229d9f2fc8ed8447df6f8cba9` is pushed to the feature branch;
`origin/main` remains unchanged. No hosted SQL,
Storage write, Vercel build, Railway build, or tenant canary occurred.

## Next gate

Keep all delivery schedule selectors and API flags false/empty. Before any
provider promotion, reconcile the source suffix after hosted
`20260729233017` in order on a supported backup/replay lane, verify the new
ledger table's RLS/grants/foreign keys/audit behavior, resolve the owner-
approved 12-record tenant-scoped PO duplicate group, review security warnings,
and run one protected scheduling browser canary with duplicate retry,
cross-tenant denial, notification/audit evidence, rollback, readiness, and
spend checks. Do not apply hosted SQL or trigger Vercel/Railway builds yet.

## M3.102 closed delivery in-transit transition (2026-08-06)

Added `20260806120000_delivery_in_transit_workflow.sql`, extending the
existing server-only `delivery_workflow_action` enum with `mark_in_transit`.
Added strict shared contracts, a Nest pipe/controller/service command, exact
config gates, a Next Core adapter, and rollback-only database evidence. The
transaction rechecks `delivery.receive`, derives tenant/actor membership,
locks the same-tenant `site_ready` schedule, claims the tenant/idempotency
ledger, updates only when the status predicate still matches, stores the
strict result, and writes semantic audit in one transaction. The selected Web
path never falls back to a browser write after a Core error.

Validation: shared 14/14; API delivery service/controller 43/43; Web delivery
adapter/actions 131/131; rollback-only PostgreSQL 17 delivery integrations
2/2; full reproducibility verifier 93/93 migrations, 32 protected tables,
3 service-only tables; shared/database/API/Web typechecks pass; Web 87/565 and
broad API 104/445 pass; and the isolated Nest/Next production build passes
81/81 routes. The inventory UOM HTTP contract test-app startup budget is 15
seconds to avoid a false negative under the full serial suite; application
behavior is unchanged. Source and evidence docs are pushed to both GitHub
refs. Railway automatically promoted the backend commit once from `main`:
deployment `27591050-3977-4755-92ae-941a6894ac77` is `SUCCESS`, `/ready` and
`/health` are 200, and the protected assets route is 401 without auth. No
hosted migration apply, Vercel build, Storage write, or tenant canary occurred.

## Next gate

Keep all delivery selectors, including the new in-transit pair, false/empty.
Reconcile the source suffix after hosted `20260729233017` in order on a
supported backup/replay lane before applying anything to Supabase. Confirm the
new enum value and existing delivery ledger/RLS/audit metadata, resolve the
owner-approved 12-record PO duplicate mapping, review the 11 security
warnings, then run one protected delivery browser canary with rollback and
spend evidence. Do not trigger an automatic Vercel build or Railway rebuild.

## M3.101 hosted Supabase Asset Register parity snapshot (2026-08-06)

Read-only project inspection confirms `ACTIVE_HEALTHY`, PostgreSQL 17.6.1,
55 hosted migrations through `20260729233017`, and no
`20260806110000_asset_register_foundation` entry. `public.assets` is absent;
therefore hosted asset RLS, service-role grants, audit trigger, indexes, and
data are not yet verifiable. Security advisors remain at 14 notices/11
warnings, including public SECURITY DEFINER execution and disabled leaked
password protection. No Supabase write or provider build occurred.

## Next gate

Keep `ERP_ASSET_READS_ENABLED=false`, `ERP_ASSET_READS_TENANT_IDS` empty,
`ERP_ASSET_READS_VIA_API=false`, and its allowlist empty. Obtain supported
backup/catalog/data/audit export and owner-approved duplicate PO mapping,
reconcile the 37 source migrations in order, and review security warnings.
Only after hosted parity may a protected browser canary be considered.

## M3.100 disposable Asset Register replay parity (2026-08-06)

Added a rollback-only API integration fixture and expanded the reproducibility
verifier to require `20260806110000_asset_register_foundation.sql`, the
service-only `assets` table, all five asset indexes, and `audit_assets`. The
fixture compares direct/Core rows and total counts for two tenants, same-tenant
Project names, page 1/page 2 ordering, search, retired dates, and cross-tenant
exclusion; it checks audit and forced-RLS/client privilege boundaries.

Validation: disposable PostgreSQL 17/Redis 7.4.9, schema hash unchanged at
`36AC6C9CFB138589031C4BE6FF328748CA80AD45B07DAB40BAEE10C05E2F0B0B`, API
17/24, database 49/318, verifier 92/92 migrations with 32 protected and 3
service-only tables, and API typecheck. Source SHA
`8586beb9e53d5fafd2289451eda576ea5b1a1726` is pushed to both refs. No hosted
write or provider build occurred.

## Next gate

Hosted Supabase still reports 55/92 migrations; the asset migration is not
applied there. Obtain supported backup/catalog/data/audit export, reconcile
pending migrations in order, resolve the owner-approved 12-record Purchase
Order duplicate group, and review security warnings. Only then run a protected
asset browser canary with exact flags and rollback/spend evidence. Do not
trigger Vercel or Railway builds for this replay-only source change.

## M3.99 closed Web Asset Register read surface (2026-08-06)

Implemented the smallest Web increment over the already closed Core asset
projection: shared adapter validation, exact boolean/UUID tenant selection,
`asset.read` route authorization, Operations navigation, bounded filter form,
read-only table, pagination, and explicit staged/error states. No direct DB
fallback or mutation control exists on the page.

Validation: Web 87/561, focused adapter/navigation 2/122, typecheck, TS-only
lint, production build 81/81 routes, Vercel spend guard, and diff check. Source
SHA `b7f274ad078965239a9138545a96bd6468b4dcda` is pushed to both GitHub refs.
No Vercel build, Railway build, hosted Supabase write, Storage write, or tenant
canary occurred.

## Next gate

Keep `ERP_ASSET_READS_ENABLED=false`,
`ERP_ASSET_READS_TENANT_IDS` empty,
`ERP_ASSET_READS_VIA_API=false`, and
`ERP_ASSET_READS_VIA_API_TENANT_IDS` empty. Replay the source asset migration
suffix on disposable PostgreSQL 17, compare direct/Core asset rows and
project joins, review RLS/audit behavior, and obtain hosted backup/catalog/data
parity before any protected browser canary. Do not trigger a Vercel build or
Railway build for this source-only slice; preserve the rollback target at
`9e87d855a2ea96de28fbe6cf02159c195a4f67a6`.

## M3.98 shell rebrand correction (2026-08-06)

Source fix replaces the authenticated sidebar's leftover `A` mark with an
accessible `TC` mark. Validation: web 87/559, typecheck, TS-only lint,
production build 80/80, and diff check. SHA
`a719d2321410c09658faca30c20c6c374f502360` is pushed to both refs. No
Railway/API source changed. Vercel Git/build remains disabled for spend
control; live UI proof is intentionally pending an approved manual release.

## M3.97 hosted parity snapshot (2026-08-06)

Read-only Supabase inspection: project `aqqrtkmtcsfkbyyqxowv` is healthy on
PostgreSQL 17.6; hosted migration count is 55 through `20260729233017` while
source has 92; all 37 newer source migrations remain unapplied. The hosted
catalog reports 88 public tables with RLS enabled and 303 policies. Data
snapshot is 2 tenants, 13 users, 13 Purchase Orders, 4 invoices, 662 audit
rows, 385 Cortex nodes, 454 Cortex edges, and zero cash accounts, cash
transactions, or supplier bills. Duplicate planner: one tenant-scoped PO
group, 12 records.

Security/performance advisors: 14 security notices (11 warnings) and 253
performance notices (one warning). No hosted write or provider build is
authorized from this evidence. Next gate is supported backup/catalog/data/RLS/
audit export and owner-approved duplicate mapping; keep production selectors
closed and avoid Vercel builds.

## M3.96 replay parity evidence (2026-08-06)

Added a rollback-only API integration proof for the closed cash register read
projection. The fixture covers two tenants, cash accounts, business/vendor
counterparties, posted/draft/reversed states, journal evidence, exact-cent
aggregates, direction/date filters, and direct-query parity. It uses the same
Nest service/database transaction boundary as production and never commits
probe data.

Evidence: isolated PostgreSQL 17 and Redis 7.4.9 replay applied 92/92
migrations; database 112/112 suites and 318/318 tests passed with zero skips;
API integration 32/32 suites and 23/23 tests passed with zero skips; schema
before/after SHA256 was
`36AC6C9CFB138589031C4BE6FF328748CA80AD45B07DAB40BAEE10C05E2F0B0B`; source
`91ed37570ea57fa456b569d247802cfd996cb9c6` is pushed to both GitHub refs;
Railway `133e14b7-c879-4090-8ce1-26d9b42d93ca` is `SUCCESS`/running; live
readiness/health are 200 and unauthenticated cash register is 401. No hosted
SQL, Supabase Storage/data write, Vercel build, or extra AI/provider spend.

## Next gate

Keep all cash read flags false/empty. Local parity is complete, but do not
enable a tenant until supported Supabase backup/catalog export, ordered
migration/data/RLS/audit parity, duplicate Purchase Order mapping, protected
browser proof, rollback evidence, and budget guard are complete. No new
Railway build for docs-only changes; no Vercel build; keep Python advisory-only.

## M3.96 - Closed cash transaction register read projection (2026-08-06)

Implemented the smallest safe cash read seam: shared bounded filters and
strict result types, Nest controller/pipe/service, `finance.read`
authorization, same-tenant cash-account and optional business/vendor joins,
exact-cent register rows, and posted receipt/disbursement aggregates. The
existing Cash page remains the compatibility path unless
`ERP_FINANCE_CASH_READS_VIA_API=true` and the tenant is in the exact allowlist;
selected tenants fail closed on Core errors and over-limit results. API and
Next flags remain false/empty.

Validation: shared 25 files/214 tests; API 104 files/440 tests; Web 87 files/558
tests; database 45 files/177 active tests with 4 files/141 skipped integration/
RLS tests without local `DATABASE_URL`; package-serial tests; typecheck; serial
lint; production build 80/80; Vercel spend guard; and diff check. Source SHA
`ddadd2fa3f7c2451dcfc97f53529ba9edba1f3ee` is pushed to both GitHub refs.
Railway `fbfc7eb0-4820-4359-a42f-74b3c0351558` is `SUCCESS` with the API
Dockerfile; live `/ready` 200, `/health` 200, and unauthenticated cash register
401. No hosted SQL, Supabase data/Storage write, Python transaction, Vercel
build, or extra AI/provider spend occurred.

## Next gate

Keep `ERP_FINANCE_CASH_READS_ENABLED=false`,
`ERP_FINANCE_CASH_READS_TENANT_IDS` empty,
`ERP_FINANCE_CASH_READS_VIA_API=false`, and
`ERP_FINANCE_CASH_READS_VIA_API_TENANT_IDS` empty. Do not enable a tenant
until cash/account/vendor data is replayed on disposable PostgreSQL 17,
direct and Core exact-cent rows/aggregates match, RLS/audit behavior is
reviewed, a protected browser canary passes, and rollback/spend evidence is
recorded. No new Railway build for docs-only changes; no Vercel build; keep
Supabase read-only while its migration/duplicate-record gate is unresolved.

## M3.95 - Closed supplier payables read projection (2026-08-06)

Implemented the smallest safe payables read seam: shared bounded filters and
strict result types, Nest controller/pipe/service, `finance.read`
authorization, same-tenant Supplier Bill/Vendor/Purchase Order/Project joins,
posted cash-allocation math, exact-cent balances, server-computed aging, and a
typed Next adapter. The existing page remains the compatibility path unless
`ERP_FINANCE_PAYABLES_READS_VIA_API=true` and the tenant is in the exact
allowlist; selected tenants fail closed on Core errors and over-limit results.
API and Next flags remain false/empty.

Validation: shared 24 files/211 tests; API 102 files/435 tests; Web 87 files/556
tests; database 45 files/177 active tests with 4 files/141 skipped integration/
RLS tests without local `DATABASE_URL`; package-serial tests; typecheck; serial
lint; production build 80/80; Vercel spend guard; and diff check. Source SHA
`de0b7e1909ec127ec94ec044202f78f44ab8bd4a` is pushed to both GitHub refs.
Railway `dcb4579e-5bb5-4661-9896-fc1fd607bd92` is `SUCCESS`/`RUNNING` with the
API Dockerfile; live `/ready` 200, `/health` 200, and unauthenticated
payables 401. No hosted SQL, Supabase data/Storage write, Python transaction,
Vercel build, or extra AI/provider spend occurred.

## Next gate

Keep `ERP_FINANCE_PAYABLES_READS_ENABLED=false`,
`ERP_FINANCE_PAYABLES_READS_TENANT_IDS` empty,
`ERP_FINANCE_PAYABLES_READS_VIA_API=false`, and
`ERP_FINANCE_PAYABLES_READS_VIA_API_TENANT_IDS` empty. Do not enable a tenant
until supplier-bill/allocation data is replayed on disposable PostgreSQL 17,
exact-cent and aging totals match the direct path, RLS/audit behavior is
reviewed, a protected browser canary passes, and rollback/spend evidence is
captured. Do not trigger a Vercel build; Supabase remains read-only at 55/92
with 37 missing migrations and the 12-record Purchase Order duplicate group.

## M3.94 - Closed customer receivables read projection (2026-08-06)

Implemented the smallest safe receivables read seam: shared bounded filters and
strict result types, Nest controller/pipe/service, `finance.read` authorization,
same-tenant invoice/project/account joins, posted cash-allocation math, and a
typed Next adapter. The existing page remains the compatibility path unless
`ERP_FINANCE_RECEIVABLES_READS_VIA_API=true` and the tenant is in the exact
allowlist; selected tenants fail closed on Core errors and over-limit results.
API and Next flags remain false/empty.

Validation: shared 23 files/208 tests; API 100 files/430 tests; Web 87 files/554
tests; database 45 files/177 active tests with 4 files/141 skipped integration/
RLS tests without local `DATABASE_URL`; package-serial tests; typecheck; serial
lint; production build 80/80; Vercel spend guard; and diff check. Source SHA
`f298b61a215ea43753f627010444c488f0c46518` is pushed to both GitHub refs.
Railway `bfec3369-dee7-4ed9-9cb7-37f1e71fe9ab` is `SUCCESS`/`RUNNING` with the
API Dockerfile; live `/ready` 200, `/health` 200, and unauthenticated
receivables 401. No hosted SQL, Supabase data/Storage write, Python
transaction, Vercel build, or extra AI/provider spend occurred.

## Next gate

Keep `ERP_FINANCE_RECEIVABLES_READS_ENABLED=false`,
`ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS` empty,
`ERP_FINANCE_RECEIVABLES_READS_VIA_API=false`, and
`ERP_FINANCE_RECEIVABLES_READS_VIA_API_TENANT_IDS` empty. Do not enable a
tenant until invoice/allocation data is replayed on disposable PostgreSQL 17,
exact-cent and aging totals match the direct path, RLS/audit behavior is
reviewed, a protected browser canary passes, and rollback/spend evidence is
captured. Do not trigger a Vercel build; Supabase remains read-only at 55/92
with 37 missing migrations and the 12-record Purchase Order duplicate group.

## M3.93 - Closed Finance general-ledger read projection (2026-08-06)

Implemented the smallest safe Finance read seam: shared bounded query/result
contracts, Nest controller/pipe/service/module, `finance.read` capability, and
an authenticated Next adapter. The adapter is selected only by
`ERP_FINANCE_LEDGER_READS_VIA_API=true` plus an exact UUID tenant allowlist;
otherwise the existing page path remains unchanged. Core failure does not
fall back for a selected tenant. API and Next flags remain false/empty.

Validation: shared 22 files/206 tests; API 98 files/425 tests; Web 87 files/552
tests; package-serial tests; typecheck; serial lint; production build 80/80;
Vercel spend guard; and diff check. Database integration/RLS tests remain
skipped without local `DATABASE_URL`. Source SHA
`c279f61555ba772579fb4091dd3d5884b48af273` is pushed to both GitHub refs.
Railway `ac9f3fee-0a54-4bf7-91db-2b6815a3638e` is `SUCCESS`/`RUNNING` with the
API Dockerfile and live `/ready` 200, `/health` 200, and unauthenticated
Finance Ledger 401. No hosted SQL, Supabase data/Storage write, Python
transaction, Vercel build, or extra AI/provider spend occurred.

## Next gate

Keep `ERP_FINANCE_LEDGER_READS_ENABLED=false`,
`ERP_FINANCE_LEDGER_READS_TENANT_IDS` empty,
`ERP_FINANCE_LEDGER_READS_VIA_API=false`, and
`ERP_FINANCE_LEDGER_READS_VIA_API_TENANT_IDS` empty. Do not enable a tenant
until the ordered Supabase suffix is replayed on disposable PostgreSQL 17,
data/RLS/audit parity is reviewed, a protected browser canary passes, and
rollback and spend evidence exists. The production 401 boundary is the only
live proof required for this closed seam; do not trigger a Vercel build.
Supabase remains read-only at 55/92 with 37 missing migrations and one
12-record Purchase Order duplicate group.

## M3.92 - Closed Cortex keyword read projection (2026-08-06)

Implemented the smallest safe Cortex authority seam: shared bounded query and
source-result contracts, Nest controller/pipe/service/module, explicit
`cortex.search` capability, server-owned role scope, and exact API flags. The
existing Next search route now has a compatibility adapter selected only by
`ERP_CORTEX_SEARCH_VIA_API=true` plus a strict tenant allowlist. Core errors do
not fall back to direct database reads for a selected tenant. Defaults stay
false/empty, so current users and UI behavior are unchanged.

Validation: shared 21 files/203 tests; API 96 files/419 tests; Web 87 files/550
tests; package-serial test run; typecheck; serial lint; production build
80/80 routes; and diff check. The root turbo test was also run in parallel and
reported five timeout failures from cross-package Nest HTTP-test contention;
the isolated API suite and package-serial run passed. Source SHA
`cd94e274a6a5cb19f715c73fa96fc717879644cc` is pushed to both GitHub refs and
Railway deployment `e9e90045-f907-4f6c-ae49-5fa3dcff3cd9` is `SUCCESS` using
the API Dockerfile; live readiness/health are 200 and unauthenticated Cortex
search is 401. No hosted SQL, Supabase data/Storage write, Python transaction,
Vercel build, or extra provider spend occurred.

## Next gate

Keep `ERP_CORTEX_SEARCH_ENABLED` and both Cortex tenant allowlists false/empty.
The new endpoint must remain an unauthenticated 401 boundary in production;
do not enable a tenant until the ordered Supabase replay, role-scope review,
protected browser proof, rollback evidence, and spend controls are complete.
The reviewed API release is complete; retain the readiness/health and 401
evidence above and do not trigger a Vercel build. Supabase remains read-only
at 55/92 with 37 missing migrations and one 12-record Purchase Order duplicate
group.

## M3.91 - Closed operational asset read projection (2026-08-06)

Added the smallest safe NestJS read seam for the source operational asset
register. Shared Zod contracts bound query shape and response size; the API
derives tenant scope from the verified principal, requires `asset.read`,
supports only same-tenant Project context, and stays fail-closed behind exact
`ERP_ASSET_READS_ENABLED` plus `ERP_ASSET_READS_TENANT_IDS`. No Web adapter,
browser write, hosted SQL, or data mutation changed.

Validation: focused API 60/60; shared asset contract 2/2; root `pnpm test`
(API 93/410; shared 20/200); typecheck; serial lint; production build 80/80;
diff check. Source SHA `f11b1467b5d3def986b73411a54a6f501339c803` is pushed to
both GitHub refs. Railway deployment `f0358fdd-f927-465c-b930-ec68b0baf240`
is `SUCCESS`; live readiness/health are 200 and unauthenticated asset reads
are 401. Supabase was not written; Vercel stayed on the retained revision
without a build/deploy.

## Next gate

Keep both asset flags false/empty and the route out of the browser. Keep the
Supabase target read-only at PostgreSQL 17 with 55/92 migrations applied, 37
missing, and one duplicate Purchase Order group containing 12 records. Obtain
the supported backup/export, dependent/audit export, and owner-approved
mapping; replay the ordered suffix including
`20260806110000_asset_register_foundation.sql` on disposable PostgreSQL 17;
reconcile catalog/data/RLS/audit and rollback evidence; then run a protected
tenant canary before adding a Web adapter. Do not trigger another manual
Railway deploy after the approved API release;
keep Vercel builds disabled for spend control.

## M3.90 - Operational asset register foundation (2026-08-06)

Added a source-only operational asset register contract. It introduces
controlled `asset_kind` and `asset_status` values, tenant/tag/serial uniqueness,
tenant-composite Project and creator foreign keys, date/state checks, audit
coverage, forced RLS, and service-role-only table privileges. The glossary and
domain boundary explicitly defer accounting fixed-asset, maintenance, and
history workflows. No API route, flag, UI, hosted SQL, or data write changed.

Validation: focused migration contract 4/4; root `pnpm test`; root typecheck;
serial lint; production build 80/80; diff check; read-only Supabase planner at
55/92 with 37 missing; duplicate planner still review-required for one group of
12 records; Vercel spend guard clear. Source SHA
`5541840b1fe3ea24fdfef09ffac98b236af5aab5` is pushed to both GitHub refs.
Railway deployment `1a072ca0-9267-4a16-aad6-fdc2c7ba83ff` is `SUCCESS`; live
`/ready` and `/health` are 200 and unauthenticated PO creation remains 401.

## Next gate

Keep the asset register source-only: no hosted migration apply, browser access,
or API authority. Obtain the supported Supabase backup/export, dependent/audit
export, and owner-approved mapping for the duplicate Purchase Order group.
Replay the complete ordered suffix, including
`20260806110000_asset_register_foundation.sql`, on disposable PostgreSQL 17;
reconcile tenant data and prove RLS, composite-FK, audit, rollback, and provider
spend gates. Only then define a closed Nest read projection and a separate
idempotent command slice.

## M3.89 - Purchase Order uniqueness-conflict guard (2026-08-06)

Added a source/runtime guard around direct and grouped Nest Purchase Order
header inserts. Only the named tenant/PO unique constraint is converted to a
bounded conflict response; raw database messages and business identifiers are
not returned. This is compatible with the source migration's duplicate
preflight and does not change flags or hosted data.

Validation: focused service 11/11; full API 90/402; root `pnpm test`; root
typecheck; serial lint; production build 80/80; diff check. Source SHA
`354401d434f3556d39bed2600748822b755c6c69` is pushed to both refs. Railway
deployment `b6149479-1856-4ba5-baac-3e8df22bd262` is `SUCCESS`; live readiness
and health are 200; unauthenticated PO creation is 401. Supabase remains
read-only: PostgreSQL 17, 55/91 migrations applied, one duplicate group with
12 records. Vercel remains on `31c04942a93d` without a build.

## Next gate

Keep PO/BOM/grouped PO flags false and tenant allowlists empty. Obtain a
supported Supabase backup/export, dependent/audit export, and owner-approved
mapping for the one duplicate group. Replay the ordered migration suffix on a
disposable PostgreSQL 17 clone, reconcile the 12 records, then prove the unique
index, role/cross-tenant denial, idempotent replay, audit redaction, rollback,
and spend cap before any named-tenant canary or hosted apply.

## M3.88 - Purchase Order creation boundary proof (2026-08-06)

Added executable service proof around the existing Purchase Order command:
role/tenant denial happens before idempotency; one transaction creates exact
header/line cents and tax totals; semantic audit stores bounded identifiers and
hash evidence; replay returns the exact stored result without a second insert
or audit event.

Validation: focused service 10/10; full API 90/401; root typecheck; serial
lint; production build 80/80; diff check. Source SHA
`e4db66a8eb4eed15a68ced1b76d9cf26f7ce6462` is pushed to both refs. Railway
deployment `a7fb39dc-94c9-4cf0-8ad4-b0c3b7f32aa3` is `SUCCESS`; live readiness
and health are 200; unauthenticated PO creation is 401. Supabase remains
read-only; Vercel remains on `31c04942a93d` without a build.

## Next gate

Keep PO and all Core write flags false/empty. Obtain supported Supabase
backup/export, owner tenant mapping, and disposable PostgreSQL 17 replay of
the ordered migration suffix. Then prove protected role/cross-tenant,
duplicate-number, rollback, audit-redaction, and idempotent replay behavior
before any named-tenant canary or hosted apply.

## M3.87 - Protected cost-entry boundary proof (2026-08-06)

Added executable service-level proof for the M3.86 command without changing
production behavior: disabled flags do not open a transaction; viewer and
missing-tenant membership are denied before idempotency; replay returns the
stored result without a second ERP insert/audit; and semantic audit diff keeps
descriptive fields out while retaining only bounded identifiers, amount, and
hash evidence.

Validation: focused service 5/5; full API 90/397; root typecheck; serial lint;
production build 80/80; diff check. Source SHA
`8be86304cf892fe645a3e3722d60275cdb01192a` is pushed to both refs. Railway
deployment `61680ed6-7a13-4dc1-9bfb-d3c9c8b29352` is `SUCCESS`; live readiness
and health are 200; unauthenticated command is 401. Supabase remains
read-only; Vercel remains on `31c04942a93d` without a build.

## Next gate

Obtain supported Supabase backup/export, owner tenant mapping, and disposable
PostgreSQL 17 replay including migration 91. Then run protected role,
cross-tenant, redaction, and idempotent integration/browser evidence. Keep
Core flags false/empty, do not apply hosted SQL, and set explicit provider
spend cap before a named tenant canary.

## M3.86 - Project cost-entry creation authority (2026-08-06)

Implemented the smallest safe financial execution slice. Added strict shared
command/result contracts, a Drizzle `cost_entry_create_requests` ledger, and
source migration `20260806100000_cost_entry_create_idempotency.sql` with
tenant-composite FKs, state checks, forced RLS, and service-role-only grants.
Nest now owns the opt-in command transaction and audit; the existing Next
action remains the default fallback. The form carries one opaque retry key.

Validation: API 90/393; database 44/173 active plus 141 guarded skips;
shared 19/198; Web 87/546; typecheck; serial lint; production build 80/80;
Actionlint; spend guard 3/3; diff check. Source SHA `bcee984`.

Release boundary: API flags
`ERP_COST_ENTRY_CREATE_WRITES_ENABLED=false` and
`ERP_COST_ENTRY_CREATE_WRITES_TENANT_IDS` empty; matching Web adapter flags
false/empty. Supabase project `aqqrtkmtcsfkbyyqxowv` remains read-only at
55/91 (36 pending, `review_required`). Do not apply the migration, enable a
 tenant, or create a paid Vercel build from this source evidence alone.

Controlled release observation: source/docs are pushed to both GitHub refs;
Railway deployment `76c27b43-47cd-4912-bca0-19a597190318` is `SUCCESS` for
`f2457fd13bc7d7d1911e9f3bbb231cddb4de571b`, with live `/ready` and `/health`
200 and unauthenticated command 401. Vercel stayed on `31c04942a93d` with no
new build.

## Next gate

Probe the exact API release's protected role/cross-tenant/redaction/idempotent
boundaries. Keep Vercel Git/build disabled. Before any
cost canary: run a disposable PostgreSQL 17 replay including migration 91,
obtain backup/export plus owner mapping, prove protected role and
cross-tenant denial, verify audit redaction and idempotent replay, capture
rollback evidence, and set an explicit provider spend cap.

## M3.85 - Vercel spend guard (2026-08-06)

Added `scripts/verify-vercel-spend-guard.mjs` plus three Node tests. The guard
requires the checked-in Vercel project config to keep Git deployment disabled
and scans repository automation for `vercel deploy`/`vc deploy` patterns. CI
runs it before the build job. It never calls a provider, creates a deployment,
or changes a setting.

Validation: spend-guard 3/3; actionlint 1.7.12; Web 87/545; root typecheck;
serial lint; production build 80/80 routes; and diff check. Source SHA
`9cfee695f75e66375c2578235d0f1544a987e3ab` is ready to push. No Railway,
Supabase, or Vercel mutation occurred.

## Next gate

Push source/docs only. Keep Vercel Git disabled and Supabase read-only at
55/90. The next functional gate remains protected role/cross-tenant/redaction
browser proof, owner tenant mapping, clone reconciliation, rollback evidence,
and an explicit spend cap before any Core canary.

## M3.84 - Audit summary count polish (2026-08-06)

Changed only the project Audit summary copy: it now uses the authoritative
filtered total and removes the duplicate total/page line. No query, state
machine, tenant predicate, API authority, migration, or provider setting
changed.

Validation: focused audit helper 3/3; Web 87 files/545 tests; root typecheck;
serial lint; production build 80/80 routes; and diff check. Source SHA
`5b1cc83ae387deeb83ca98c2ae96782d471dc46c` is ready to push. No Railway,
Supabase, or Vercel mutation occurred.

## Next gate

Push the reviewed source/docs only. Keep Vercel Git/build disabled, Supabase
read-only at 55/90, and all Core audit flags false/empty. Protected role,
cross-tenant, redaction, clone reconciliation, rollback, and spend-cap
evidence remain required before a canary.

## M3.83 - Clean-room runtime branding hardening (2026-08-05)

Removed legacy comparison labels from runtime source comments and changed the
local E2E fallback address to `test@thirdcode.local`. The branding guard now
rejects `Rework` and `BuildOps` variants in addition to ERPNext/Frappe/ABI Ops
markers across Web, API, package, and public text roots. The timestamped
Supabase migration filename is retained as immutable internal provenance; no
SQL or migration content was applied.

Validation: clean-room 1/1; Web 87/545; root typecheck; serial lint; build
80/80 routes; diff check; runtime scan zero outside the historical migration
path. Source SHA `1c5b8de` is pushed to both refs. Railway deployment
`2e4c80f9-e243-46c3-acfa-6af417a448ee` is `SUCCESS` on the API Dockerfile and
live probes are ready/health 200, unauthenticated audit 401. Supabase and
Vercel were not mutated.

## Next gate

Keep the clean-room guard in every release lane. Do not rename or replay the
historical migration without a migration-ledger plan. Keep Supabase 55/90
read-only and Vercel Git/build disabled; next functional canary still needs
protected role/cross-tenant/redaction evidence and clone reconciliation.

## M3.82 - Project audit filters and pagination (2026-08-05)

Added a read-only usability slice to the existing project Audit page. Users
can filter by supported action/entity values and move through 25-row pages via
stable URL parameters. Direct reads apply the same tenant/filter/offset rules;
the Core adapter forwards the filters and uses its redacted totals. The Core
flag remains closed by default, no migration was added, and no visible default
authority or write path changed.

Validation: helper 3/3; Web 87 files/545 tests; root typecheck; serial lint;
production build 80/80 routes; diff check pass. Source SHA `e98a03b` is
pushed to both target refs. No Railway API build, Supabase write, or Vercel
build occurred; Vercel read-only probes still resolve retained revision
`31c04942a93d`.

## Next gate

Keep Core audit flags false/empty. Obtain protected role/browser evidence for
the filter and redaction states, then reconcile the hosted clone and secure
owner-approved tenant mapping before any canary. Do not trigger Vercel or
apply the 35 pending Supabase migrations.

## M3.81 - Core-gated project audit read adapter (2026-08-05)

Added the smallest UI authority cutover slice: the existing project Audit page
can consume the redacted Nest `GET /v1/audit/activity` projection behind
`ERP_AUDIT_ACTIVITY_READS_VIA_API` plus an exact tenant allowlist. The adapter
enforces the existing capability roles, bounds related entity IDs to 500,
uses strict shared result parsing, and fails closed on Core errors. The legacy
direct read remains the default compatibility path; no visible default UI or
copy changed and no database migration was added.

Validation: shared audit 3/3; API focused guard/activity 14/14; web Core
client 96/96; full web 86 files/542 tests; root typecheck; serial lint; and
production build 80/80 routes pass. Source SHA
`e8d993d5d23e34b1690781f083b7a0c1c5a0603a` is pushed to both target refs.
Railway deployment `5a562db0-d682-4d99-adba-0adb20436bc8` is `SUCCESS` for
the exact SHA; live `/ready` and `/health` are 200 and unauthenticated audit
activity is 401. The API Dockerfile file manifest is correct, while stale
`@buildops/web` provider metadata remains unresolved by design. Supabase and
Vercel were not mutated.

## Next gate

Keep the adapter flag false and its tenant list empty. Obtain owner-approved
tenant mapping, protected role/browser proof, redaction review, rollback
evidence, and hosted clone reconciliation before selecting one canary tenant.
Do not apply the 35 pending Supabase migrations, alter provider settings, or
trigger Vercel builds; Python remains advisory.

## M3.80 - Tenant-scoped audit activity read (2026-08-05)

Added `GET /v1/audit/activity` as a read-only Nest authority seam over the
existing `audit_log`. The shared contract enforces bounded pagination and
strict entity/action filters; the API requires `audit.read`, derives tenant
scope from the verified principal, and returns hash-chain metadata without
exposing stored `diff` JSON. No migration, RLS policy, or Next UI path changed.

Validation: shared-types 18/195; API 88/388 with 22 environment-skipped
integration tests in a single worker; focused changed coverage 14/14; root
typecheck; serial lint; Nest/Web production build; static migration verifier;
and `git diff --check` pass. Source SHA
`1170b55d73b87ac3c932a3c85f267201564cd7bc` is pushed to both target refs.
Railway `e62e25b9-7e26-4b59-bb32-35ba524c6ae2` is `SUCCESS` for the exact SHA;
live readiness/health are 200 and the unauthenticated activity boundary is
401. The provider file manifest used the API Dockerfile, while a stale
`@buildops/web` build-command string remains in metadata; no provider setting
was changed. Supabase and Vercel were not mutated.

## Next gate

Keep all workflow flags and tenant allowlists false/empty. Add a browser
activity view only after role-specific protected-flow proof and redaction review.
Reconcile hosted schema/data/RLS/tenant/audit/financial drift with a supported
backup/export and owner mapping before any Supabase action. Inspect, but do not
blindly mutate, the stale Railway metadata; avoid Vercel builds.

## M3.79 - Read-only clone reconciliation (2026-08-05)

Added a source-only reconciliation tool and pure helper tests. The tool
requires separate `DATABASE_URL` (hosted target) and `REPLAY_DATABASE_URL`
(disposable clone), refuses identical connection identities, and executes
both snapshots in PostgreSQL `READ ONLY` transactions. It compares the
migration ledger, relation/RLS/policy/index/trigger/function/grant catalogs,
tenant row counts, exact financial totals, and audit first/last hashes.

Validation: reconciliation helpers 3/3; combined script/plan tests 10/10;
static migration verifier; root typecheck; serial TS-only lint; Nest/Web
production build. The live read-only run found PostgreSQL 17 on both targets,
35 hosted migration gaps, 26 missing relations, 114 missing indexes, two
missing triggers, grant/function drift, five financial-total differences, and
data/audit count drift. Exit status is intentionally nonzero
(`reconcile_required`). No SQL write, hosted repair, provider setting, or
Vercel action occurred.
Railway recorded only `SKIPPED`
`8812b0dd-a1bd-4040-925d-c83389447dc6` for the docs push; no build ran.
Source commit `cc0e1f7e14ef999cc550894e39c05938d7b0e326` contains the tool and
tests.

## Next gate

Keep all workflow flags and tenant lists false/empty. Use the report to obtain
the supported backup/export, dependent/audit export, and owner-approved tenant
mapping; restore an isolated clone and reconcile the drift before reviewing a
protected canary. Do not auto-repair or replay the hosted suffix.

## M3.78 - Disposable PostgreSQL 17 + Redis replay (2026-08-05)

Ran `scripts/ci/run-wsl1-database-lane.ps1 -Distribution
ThirdCodeERP-Test` from a clean disposable database. All 90 source
migrations applied in timestamp order; the read-only verifier and release
planner reported an exact 90/90 ledger, PostgreSQL 17, complete protected
catalog/RLS/grant/index checks, and no schema drift. Redis 7.4.9 was started
for queue integration. The database suite ran with no environment skips:
108 files and 311 tests passed, including the API integration lane. Schema
before/after SHA-256 was
`0EFDA48EFE75700E980145569ABC2BF73CB2C58DA81F7F6124A14D2C1511AFD9`.

The only code change was a test correction for the M3.72 Warehouse guard:
normal nonzero-balance deactivation is rejected, while a simulated legacy
inactive Warehouse can use the explicit reversal event allowlist. Source
commit `a13b2e21cb8c37b099b3c057764a132d8b8f8cc2` is included in docs commit
`303f2667044bb11537c16cc54f7280297c2d2913`. Because
`packages/database/**` is a Railway watch path, the push caused exactly one
automatic deployment `a7371ef0-0b16-45c6-b4fd-323f33ddf634`, which succeeded;
live `/ready` and `/health` are 200. No manual redeploy, Supabase SQL,
Storage/provider setting, or Vercel build was triggered.

## Next gate

Keep all workflow flags and tenant lists false/empty. The hosted read-only
planner remains 55/90 with 35 pending migrations; the verifier reports the
expected missing source-only ledgers/indexes. Obtain a supported backup/export
and owner-approved mapping, restore an isolated clone, compare catalog/data/
RLS/tenant/audit/financial totals against this replay, and capture rollback
and spend-cap evidence before any hosted action or protected browser canary.

## M3.77 - Stock Movement posting/reversal authority (2026-08-05)

Implemented strict Nest command endpoints for Stock Movement post and
reverse. The transaction locks verified membership and movement scope, claims
and replays a tenant/key/request-hash ledger, invokes the existing database
functions, completes the exact result, and audits the state transition. The
new migration is source-only; forced RLS and service-role-only grants are
verified by contract and added to the read-only verifier. Next selects the
adapter only behind an exact flag/tenant allowlist and never falls back to
direct SQL after selection; one browser retry key is retained per operation.

Results: shared 17/193; database 43/170 active with 140 skipped without
`DATABASE_URL`; changed API 26 tests; changed Web 100 tests; root typecheck;
serial lint; Nest/Web production builds; static verification; read-only plan
55/90 with 35 pending; live Railway `/ready`/`/health` 200; and unauthenticated
post/reverse 401. The aggregate API run had one unrelated existing HTTP
bootstrap timeout under parallel contention; the affected test passes in
isolation. Source commit `7f19315b967f81e120fa64bebc95ed338c4ad2cb` was pushed
to both target refs; Railway deployment
`5320235d-c242-4b3c-8b24-c8de9e1cd8cd` is `SUCCESS`. No Supabase SQL/data,
Storage, provider setting, or Vercel deployment changed.

## Next gate

Keep all workflow flags false/empty. The hosted catalog still lacks the
source-only ledger and six indexes. Before any hosted apply or canary, obtain
a supported backup/export, owner-approved mapping, a disposable PostgreSQL 17
replay with Redis, catalog/data/RLS comparison, protected browser evidence,
rollback proof, and an explicit spend cap.

## M3.75 - Stock Movement draft creation authority (2026-08-05)

Implemented `POST /v1/inventory/stock-movements` as a fail-closed Nest command
for draft creation. It uses a tenant-scoped idempotency ledger, one database
transaction for membership lock, invariant checks, draft/line inserts, result
completion, and semantic audit. Shared types preserve exact quantities/money;
the Next form keeps one retry key and the Core adapter has no direct-write
fallback when selected. Posting/reversal/delete remain unchanged.

Validation: shared 17/192; API 85/378 (isolated single-worker run); Web
86/537; database 42 files, 169 active tests, and 140 environment-skipped
tests; typecheck; serial lint; local Nest/Web production builds; focused
tests; `git diff --check`; and a read-only database release plan. Source
commit `3b920185fdc438dfc5dd5972f738ea9e0a1d7e30` is pushed to both target
refs. Railway deployment `e231fe1f-bd37-4e68-bef9-a2d26e0c1061` is `SUCCESS`
for that exact SHA; live `/ready` and `/health` are 200 and unauthenticated
command access is 401. No Vercel build/deploy or hosted Supabase write was
triggered.

Migration state: hosted Supabase remains an exact prefix at 55/89, with 34
ordered source migrations pending and status `review_required`. The new
`20260805110000_stock_movement_create_idempotency.sql` is source-only. The
planner found 27 `drop-object` and six transaction-control risk findings in
the pending suffix; no SQL executed.

Rollback: leave both Stock Movement create flags false and tenant lists empty,
or revert to the prior successful Railway API deployment. The legacy direct
Server Action remains available; no hosted state requires repair.

## M3.76 - Hosted catalog verifier hardening (2026-08-05)

Extended the read-only reproducibility verifier with the Stock Movement
idempotency ledger's forced-RLS/server-only contract and three required
indexes. `node scripts/verify-database-repro.mjs --files-only` passes for all
89 source migrations; the hosted run passes PostgreSQL 17 and all prior
catalog/RLS/security checks, then fails only on the expected 55/89 ledger gap
and source-only table/indexes.

Validation: Node syntax check, static verifier, database release-plan tests
7/7, and `git diff --check`. Source commit
`7c3f6c8e204f208cea43de2e1630c6f653005df8` is pushed to both target refs. No
Railway code deployment was triggered because `scripts/**` is outside the
service watch set; no Vercel build/deploy or hosted Supabase SQL ran.

Open gate: Docker has no reachable local daemon, so clean PostgreSQL 17
replay, clone catalog/data/RLS diff, and zero-skip database evidence remain
unproven. Do not apply the hosted suffix or enable Stock Movement writes.

## M3.74 - Stock Movement detail read authority (2026-08-05)

Implemented `GET /v1/inventory/stock-movements/:movementId` as a strict
tenant-scoped Nest read for the movement header, bounded lines, and immutable
ledger evidence. Timestamps are normalized to UTC ISO strings; quantities and
money remain exact strings. The Next detail page uses an independently gated
Core adapter and retains its legacy read by default; posting, reversal, and
delete actions were not moved. No migration was added.

Validation: shared 17/185; API 83/370 (isolated single-worker run); Web
85/532; database 41 files, 168 active tests, and 140 environment-skipped
tests; typecheck; serial lint; local production build; focused tests; and
`git diff --check`. Source commit
`a693e15fafc4b4b5d2df4f3fd6bef6f72015d702` is pushed to both target refs.
Railway deployment `a62a237e-2a82-4a40-88ca-2354011d3c9d` is `SUCCESS` for
that exact SHA; live `/ready` and `/health` are 200 and unauthenticated detail
access is 401. No Vercel build/deploy or hosted Supabase write was triggered.

Rollback: leave the detail Core flag false and tenant list empty, or revert to
the prior successful API deployment. The existing compatibility read/actions
remain available; no hosted state requires repair.

## M3.73 - Inventory Stock Movement register read (2026-08-05)

Implemented a bounded, tenant-scoped Nest read at
`GET /v1/inventory/stock-movements` with shared query/result schemas, explicit
filters, exact posted-value strings, and `inventory.read` authorization. The
Next Stock Movement register now has an exact-flag plus tenant-allowlist Core
adapter while retaining the legacy server-side read by default. No migration
was added and no UI layout/copy changed.

Validation: shared 17/184; API 81/366 (isolated single-worker run); Web
84/527; database 41 files, 168 active tests, and 140 environment-skipped
tests; typecheck; serial lint; local production build; focused tests; and
`git diff --check`. Source commit
`9d3cf5ed179f24c0382ecd7b53b9b94f87812578` is pushed to both target refs.
Railway deployment `4cbaefcf-82a4-4549-83f4-2bfa094fcebb` is `SUCCESS` for
that exact SHA; live `/ready` and `/health` are 200 and unauthenticated route
access is 401. No Vercel build/deploy or hosted Supabase write was triggered.

Rollback: leave the Core flag false and tenant list empty, or revert to the
prior successful API deployment. The compatibility read remains available;
no hosted state requires repair.

## M3.72 - Inventory Warehouse deactivation integrity boundary (2026-08-05)

Implemented a narrow correctness guard for
`PATCH /v1/inventory/warehouses/:warehouseId`: Nest rejects active-to-inactive
transitions when tenant-scoped stock ledger quantity or value is nonzero, with
HTTP 409 and no update/audit side effect. Added the matching forward-only
database trigger contract, including compatible row-lock serialization for
ledger writes and an explicit reversal allowlist for inactive Warehouses. The
SQL is source-only; it was not applied to Supabase because hosted migration
parity is still 55/88 with 33 pending migrations.

Validation: shared 17/183; API 79/362; Web 83/523; database 41 files,
168 active tests, and 140 environment-skipped tests; focused guard/controller
and migration-contract tests; typechecks; serial lint; Nest build; Web
production build; and `git diff --check`. Source commit
`f391f49d0aa002101649afa79dfc75872120df72` is pushed to both target refs.
Railway deployment `48cc2b18-1c5d-45eb-b59d-b54571fe673c` is `SUCCESS`; live
`/ready` and `/health` are 200 with database and Redis healthy, and protected
unauthenticated routes return 401. No Vercel build/deploy or hosted Supabase
write was triggered.

Rollback: keep the Nest compatibility/canary flags false and tenant lists
empty, or roll back to the prior successful Railway deployment. Because the
new SQL has not been applied, no hosted state repair is required. Before any
database apply, reconcile the ordered migration ledger, obtain backup/export,
dependent/audit export and owner mapping, replay on disposable PostgreSQL 17,
and set an explicit spend cap.

## M3.71 - Inventory Warehouse closeout/readiness read (2026-08-05)

Implemented `GET /v1/inventory/warehouses/:warehouseId/closeout` as a strict,
tenant-scoped Nest read. It locks membership and the Warehouse for share,
rechecks `inventory.manage`, aggregates exact ledger quantity/value strings,
and returns a deterministic readiness disposition without writing. Added a
disabled-by-default Next adapter and tenant allowlist gate; no UI path was
changed and no migration was added.

Validation: shared 17/183, API 79/360, Web 83/523, focused closeout tests,
typechecks, serial lint, Nest build, Web production build, and
`git diff --check`. Commit `425c66a757ffa66cd4dfefca2079ebfd61fb3bbf` is
pushed to both target refs. Railway deployment
`1ee3706a-5ef3-4004-9708-ac3efcad5483` is `SUCCESS` for that exact SHA using
the settled `apps/api/Dockerfile` manifest; `/ready` and `/health` are 200
with database and Redis healthy, and unauthenticated closeout access is 401.
Rollback is leaving the adapter flag disabled or reverting to the prior
successful API deployment; no hosted state requires repair. No Supabase or
Vercel provider action was triggered.

## M3.70 - Inventory Warehouse update/deactivation command boundary (2026-08-05)

Implemented `PATCH /v1/inventory/warehouses/:warehouseId` as a strict
tenant-scoped Nest command. It accepts only name and active state; code and
project scope remain outside the command because database guards preserve
Warehouse identity after stock evidence. The transaction locks and rechecks
membership/capability, locks the tenant Warehouse, applies an idempotent state
update, and writes semantic before/after audit evidence. The Next adapter is
exact-flag plus tenant-allowlist gated; direct Server Action behavior remains
default. No migration was added.

Validation: shared 17/182, API 77/355, Web 82/521, focused Warehouse
create/update tests, typechecks, serial lint, Nest build, Web production
build, and `git diff --check`. Commit
`4737fec37f97360f8c3ffe6bc98f0bdc78a4cdf5` is pushed to both target refs.
Railway deployment `382d281a-b022-4296-8b9d-ee84a07c80b1` is `SUCCESS` for
that exact SHA using the settled `apps/api/Dockerfile` manifest; `/ready` and
`/health` are 200 with database and Redis healthy, and unauthenticated
Warehouse POST/PATCH both return 401. Rollback is the disabled adapter flag or
prior successful API deployment; no hosted state requires repair. No Supabase
or Vercel provider action was triggered.

## M3.69 - Inventory Warehouse creation command boundary (2026-08-05)

Implemented `POST /v1/inventory/warehouses` as a strict tenant-scoped Nest
command. The transaction locks and rechecks membership/capability, validates
an optional same-tenant project, checks the tenant Warehouse code, uses a
database uniqueness conflict guard, creates the Warehouse, and writes
semantic audit evidence. The Next adapter is exact-flag plus tenant-allowlist
gated; direct Server Action behavior remains default. No migration was added.

Validation: shared 17/181, API 75/351, Web 81/518, focused Warehouse tests,
typechecks, serial lint, Nest build, Web production build, and
`git diff --check`. Commit `7b0ccf1d9dda19a61d8f2c26ead42b562b6f2534` is
pushed to both target refs. Railway deployment
`fbbda042-9b51-4c21-a518-a6e4c2fb2752` is `SUCCESS` for that exact SHA using
the settled `apps/api/Dockerfile` manifest; `/ready` and `/health` are 200
with database and Redis healthy, and unauthenticated Warehouse creation is
401. Rollback is the disabled adapter flag or prior successful API deployment;
no hosted state requires repair. No Supabase or Vercel provider action was
triggered.

## M3.68 - Inventory UOM creation command boundary (2026-08-05)

Implemented `POST /v1/inventory/uoms` as a strict tenant-scoped Nest command.
The transaction locks and rechecks membership/capability, checks the tenant
UOM code, uses a database uniqueness conflict guard, creates the UOM, and
writes semantic audit evidence. The Next adapter is exact-flag plus
tenant-allowlist gated; direct Server Action behavior remains default. No
migration was added.

Validation: shared 17/180, API 73/346, Web 80/515, focused UOM tests,
typechecks, serial lint, Nest build, Web production build, and
`git diff --check`. Commit `ae6d7992ebdfcb0439f181ecdcd72b9cb8673c2b` is
pushed to both target refs. Railway deployment
`5ffd0087-7951-4111-92b6-72293cadef14` is `SUCCESS` for that exact SHA using
the settled `apps/api/Dockerfile` manifest; `/ready` and `/health` are 200
with database and Redis healthy, and unauthenticated UOM creation is 401.
Rollback is the disabled adapter flag or prior successful API deployment; no
hosted state requires repair. No Supabase or Vercel provider action was
triggered.

## M3.67 - Inventory item policy command boundary (2026-08-05)

Implemented a strict, tenant-scoped Nest command for setting a material item’s
base UOM and perpetual-stock flag. Membership and `inventory.manage` are
rechecked inside the transaction; the UOM and item are locked with repeated
tenant predicates; semantic audit captures before/after state; repeated same
state is a no-op. The Next adapter is exact-flag plus tenant-allowlist gated,
with the direct server action preserved by default. No migration was added.

Validation: shared 17/179, API 71/341, Web 79/512, focused command/client/
action tests, typechecks, serial lint, Nest build, Web production build, and
`git diff --check`. Commit `8a0c059826aabf3b0711277c68f1b182db46aa25` is
pushed to both target refs. Railway deployment
`19b808c7-f07c-40f3-a268-df35aaf86071` is `SUCCESS` for that exact SHA using
the effective `apps/api/Dockerfile` manifest; live `/ready` and `/health`
are 200 with database and Redis healthy, unauthenticated inventory summary
access is 401, and startup logs map the command route. Rollback is the
disabled adapter flag or the prior successful API deployment; no hosted state
requires repair. No Supabase or Vercel provider action was triggered.

## M3.66 - Inventory summary authority seam and read-only ledger refresh (2026-08-05)

Read-only planning confirms Supabase has 55 applied migrations while the
repository has 87, with a linear 32-version pending suffix, no unexpected or
out-of-order versions, and no data-rewrite statement. The suffix was not
applied or repaired. Implemented the smallest safe Nest
`GET /v1/inventory/summary` contract with strict tenant-scoped reads,
`inventory.read`, bounded results, exact numeric strings, and an exact
flag/tenant allowlist for the Next adapter. Preserved the direct inventory
page path by default; no schema migration added.

Validation: focused shared/API/Web tests, serial full suites (shared 17/178,
API 69/336, Web 78/509), typecheck, serial root lint, Nest build, Web
production build (80 routes), and `git diff --check`. Commit
`4da9772516f80255a2cb4adbe376d4ca733513e4` is pushed to both target refs.
Railway deployment `6ba50aba-0f58-4f02-b7b4-655b3e71a70f` is `SUCCESS` for
that SHA; `/ready` and `/health` are 200, unauthenticated inventory summary
access is 401, and startup logs expose the mapped route. Rollback is the
disabled adapter flag plus the prior Railway API deployment; no hosted state
requires repair. A docs-only push is outside Railway watch patterns. No
Vercel or Supabase provider action was triggered.

## M3.65 - Nest CRM opportunity detail read handoff (Railway verified, 2026-08-05)

Added `GET /v1/crm/opportunities/:opportunityId` with a strict shared result
envelope, verified-principal tenant scope, explicit `opportunity.read`,
tenant-scoped account/project joins, and tenant-scoped progress aggregates for
PPRF, inspections, designs, and change requests. The opportunity detail page
can adopt the adapter only through `ERP_OPPORTUNITY_READS_VIA_API` and its exact
tenant UUID allowlist; direct DB behavior remains the compatibility path and is
tenant-hardened.

Validation: shared 17 files/176 tests; API 67 files/332 tests in the serial
bounded Vitest run; Web 77 files/504 tests; focused Web adapter/query 89/89;
database 41 files with 166 passed and 140 expected integration/RLS/Cortex
skips; workspace typecheck/lint; Nest build; Web 80/80 production build; and
`git diff --check`. The initial concurrent API run timed out on two unrelated
5-second tests; no source change was needed. Commit `3eb9e69e` is pushed to
both target branches. Railway deployment
`e51c6641-5b68-443a-ac16-81bf3912531d` is `SUCCESS` for that exact SHA using
`apps/api/Dockerfile`; `/ready` and `/health` are 200, unauthenticated
opportunity detail access is 401, and startup logs expose the route. GitHub
exact branch refs match the SHA. Supabase stayed read-only at 55/87 and all
inspected public tables have RLS enabled; Vercel stayed at zero deployments.

Rollback: keep `ERP_OPPORTUNITY_READS_VIA_API=false` and its allowlist empty, or
redeploy the prior successful Railway API source; no hosted state requires
repair. Next: reconcile the hosted/source migration ledger only after a
supported recoverable backup/export, dependency/audit export, disposable
PostgreSQL 17 replay, owner-approved mapping, protected browser evidence, and
an explicit spend cap.

## M3.64 - Nest CRM KYC queue read handoff (Railway verified, 2026-08-04)

Added `GET /v1/crm/accounts/kyc-queue` with a strict shared result envelope,
`account.kyc_review` authorization, verified-principal tenant scope, a
tenant-scoped artifact join, deterministic ordering, a hard 200-row cap, and
a separate tenant-scoped pending-account total. The KYC queue page can adopt
the adapter only through `ERP_ACCOUNT_KYC_QUEUE_READS_VIA_API` and its exact
tenant UUID allowlist; direct DB behavior remains the compatibility path.
Wrong-tenant rows fail closed.

Validation: shared 16/174; API 65/328 serial; Web 76/497; focused Web 89/89;
database 41 files with 166 passed and 140 expected integration/RLS/Cortex
skips; workspace typecheck/lint; API build; Web 80/80 production build; and
`git diff --check`. Commit `5a5a35a3` is pushed to both target branches.
Railway deployment `fbf64a41-e2df-4ec6-8fd5-e8e3060edf28` is `SUCCESS` for
that exact SHA; `/ready` and `/health` are 200, unauthenticated KYC queue
access is 401, and GitHub's exact API status is `success`. Supabase stayed
read-only at 55/87 and Vercel had zero deployments/builds. No provider setting
changed.

Rollback: leave `ERP_ACCOUNT_KYC_QUEUE_READS_VIA_API=false` and its allowlist
empty, or redeploy the prior successful Railway source; no hosted state
requires repair. Next: keep the KYC canary closed pending supported Supabase
recovery, protected browser, and explicit spend gates.

## M3.63 - Nest CRM account detail read handoff (Railway verified, 2026-08-04)

Added `GET /v1/crm/accounts/:accountId` with strict account detail, contact,
KYC artifact/document, opportunity, and project schemas. Nest derives tenant
scope from the verified principal, repeats tenant predicates for every child
read, caps child collections at 200, and computes opportunity totals with a
separate scoped count. The account detail page uses the adapter only when
`ERP_ACCOUNT_READS_VIA_API` and the exact tenant allowlist opt in; direct DB
reads remain the compatibility path. Wrong-tenant nested rows fail closed.

Validation: shared types 16/172; API 65/326 in the serial bounded run; Web
76/492; workspace typecheck/lint; API build; Web 80/80 production build; and
`git diff --check`. Commit `c4fb282f` is pushed to both target branches.
Railway deployment `abedf9fd-1785-4b8f-b4f7-00436466b708` is `SUCCESS` for
that exact SHA with `apps/api/Dockerfile`; `/ready` and `/health` are 200,
unauthenticated account collection/detail boundaries are 401, and GitHub's
exact API status is `success`. Supabase stayed read-only at 55/87 and Vercel
had zero new deployments/builds. No provider setting changed.

Rollback: leave `ERP_ACCOUNT_READS_VIA_API=false` and its allowlist empty, or
redeploy the prior successful Railway source; no hosted state requires repair.
Next: keep the detail canary closed pending supported Supabase recovery,
protected browser, and explicit spend gates.

## M3.62 - Nest CRM account collection read handoff (Railway verified, 2026-08-04)

Added `GET /v1/crm/accounts` with strict query normalization, tenant-scoped
filters, explicit `account.read`, stable sorting, capped pagination, and
opportunity counts. The Accounts page has a disabled-by-default adapter behind
`ERP_ACCOUNT_READS_VIA_API` and an exact tenant UUID allowlist; direct DB reads
remain the compatibility path. Wrong-tenant rows and page/limit drift fail
closed.

Validation: shared types 16/170; API 65/323; Web 76/488; workspace
lint/typecheck; API build; Web 80/80 production build; `git diff --check`.
Commit `eae78a4e` is pushed to both target branches. Railway deployment
`6ead24ac-47d0-4b16-bb6f-0732d4ef2c56` is `SUCCESS` for that exact SHA with
`apps/api/Dockerfile`; `/ready` and `/health` are 200, unauthenticated account
reads are 401, and GitHub's exact API status is `success`. No hosted migration/
data repair, Vercel build, or provider setting changed. Keep the flag false/empty
until supported Supabase backup/export,
dependent/audit export, owner-approved duplicate-PO mapping, disposable
PostgreSQL 17 replay, protected browser evidence, and rollback gates pass.

## M3.61 - Nest project update audit hardening (Railway verified, 2026-08-04)

Added the missing semantic audit write to the existing tenant-scoped,
optimistic-concurrency `PATCH /v1/projects/:projectId` transaction. The audit
captures the controlled Project fields before and after the update; a failure
rolls back the ERP update. The shared `projectUpdateResultSchema` now validates
the returned result at runtime.

Validation: focused project service 12/12; isolated controller specs 3/3 and
8/8; full API 62/318; workspace lint/typecheck; Nest build; and
`git diff --check`. Commit `7332902e` is pushed to both target branches.
Railway deployment `21832e50-5f29-4471-979d-28bf90afbb48` is `SUCCESS` for that
SHA; `/ready` and `/health` are 200, unauthenticated project read/update
boundaries are 401, and GitHub's exact API status is `success`. Supabase stayed
read-only at 55/87 and Vercel had zero new deployments/builds. Keep
`ERP_PROJECT_WRITES_VIA_API=false` and its tenant allowlist empty until the
protected canary and supported data-recovery gates pass.

## M3.60 - Nest project collection read contract (Railway verified, 2026-08-04)

Added `GET /v1/projects` with tenant-scoped query parsing, bounded search/
status/type filters, allowlisted sort/order, and page/limit pagination. Next
adoption is gated by `ERP_PROJECT_LISTS_VIA_API` plus a strict tenant UUID
allowlist; direct DB behavior remains the default. Adapter validation rejects
wrong-tenant rows and page/limit drift.

Validation: API 62 files/318 tests, shared types 15/167, Web 75/484,
API/Web typecheck, API build, Web 80/80 production build, root lint, and
`git diff --check`. Commit `78ad5f63` is pushed to both target branches.
Railway deployment `0e553e93-cb82-448f-8290-06956e89767d` is `SUCCESS` for that
SHA; `/ready` and `/health` are 200, the unauthenticated list boundary is 401,
and GitHub's exact API status is `success`. Supabase remained read-only at
55/87 and Vercel had zero new deployments/builds. Keep the flag false/empty
until protected canary and supported data-recovery gates pass.

## M3.59 - Railway Nest Redis module wiring (source fix, 2026-08-04)

The first M3.58 API deployment exposed a runtime-only dependency error:
`ProviderQuotaService` could not resolve `THIRD_CODE_ERP_REDIS_CLIENT`. Move
the existing Redis factory/lifecycle into a shared global `RedisModule`, export
the token, and import it explicitly in `AppModule` and `ProviderQuotaModule`.

Validation: Redis/quota focused tests 5/5, full API 61 files/313 tests, root
lint, API typecheck, Nest production build, and `git diff --check`. Commit
`d7f62faf` is pushed to both target branches. Railway deployment
`5f3e4a02-45c9-4142-a0d8-7629844076a7` is `SUCCESS`; startup logs show the
shared modules initialized, GitHub's exact API check is `success`, and live
`/ready` plus `/health` return 200. No Vercel build or Supabase mutation is
part of this fix.

## M3.58 - Nest project detail read contract (source complete, 2026-08-04)

Added `GET /v1/projects/:projectId` with explicit `project.read` capability,
verified-principal tenant scope, and a shared camelCase read schema. The
project detail page has a disabled-by-default adapter controlled by
`ERP_PROJECT_READS_VIA_API` plus a strict tenant UUID allowlist. Identity and
tenant mismatches fail closed; the default direct query remains intact.

Validation: focused API 26/26, shared types 4/4, Web core/project reads 77/77,
full Web 75/479, shared types 15/164, API typecheck/build, Web typecheck/build,
workspace lint, and `git diff --check`. Full API under concurrent load had one
procurement controller timeout (311/312); isolated rerun passed 8/8.

No hosted migration, data repair, provider setting, Railway setting, or Vercel
build occurred. Keep the read flag false/empty until the supported Supabase
backup/export, duplicate-PO owner mapping, disposable replay, and protected
browser canary gates pass.

## M3.57 - Stale Supabase refresh-token recovery (source complete, 2026-08-04)

The observed Vercel /middleware refresh_token_not_found error is now handled
as a recoverable anonymous-session boundary. The middleware clears only
chunked Supabase auth cookies, updates the forwarded cookie header, and keeps
protected routes on the existing /auth/login redirect. Unrelated errors are
rethrown.

Changed files: apps/web/src/middleware.ts,
apps/web/src/lib/supabase-session-recovery.ts,
apps/web/src/middleware.test.ts, and the helper test. Validation: Web
75/476, focused recovery 5/5, typecheck, git diff --check, and 80/80-route
production build. No Vercel build or hosted database mutation occurred.

Next gate: supported Supabase backup/export, owner-approved duplicate-PO
mapping, and disposable PostgreSQL 17 replay. Keep frontend spend protection
closed.

## M3.54 - Cortex sources in the command palette (source complete, 2026-08-04)

Added an explicit Ask Cortex mode to the existing global palette. It searches
the existing bounded Cortex source contract only after mode selection and a
two-character term, normalizes away unsafe/non-actionable nodes, and keeps
canonical navigation separate from the explicit AI handoff. Default record
search behavior and request volume are unchanged.

Changed files: `apps/web/src/components/nav/command-palette.tsx`,
`apps/web/src/lib/cortex/command-palette-search.ts` and test, plus
`docs/research/components/command-palette-cortex-sources.spec.md`.

Validation: focused tests 14/14; full Web 72 files/465 tests; workspace lint,
typecheck, `git diff --check`, and 80/80-route production build pass. The
parallel full-gate attempt was discarded because concurrent build/typecheck
processes removed shared `.next` type artifacts; the sequential rerun passed.

Source `6c975261122c635668a4b80795549cb06fb63843` was pushed once to `main`
and `agent-02/third-code-erp-landing` as `kurtgav`. GitHub/Railway is green,
live Railway readiness is healthy, Vercel has zero deployments since
`1785840000000`, and Supabase remains unchanged at 55/87. No hosted mutation
or paid frontend action occurred.

Next gate: supported Supabase backup plus dependent-row/audit export and
owner-approved mapping for the 12 duplicate Purchase Orders, followed by
read-only planner and disposable PostgreSQL 17 replay. Keep Vercel closed.

## M3.55 - Provider-backed burst cost guard (source complete, 2026-08-04)

Extended the existing edge-compatible request limiter with a pure policy and
counter helper. General traffic remains unchanged. Chat/similar-item provider
routes share a 20/minute authenticated bucket (10 anonymous), while embedding
uses 6 authenticated (2 anonymous). Middleware emits `X-RateLimit-Limit` and
`X-RateLimit-Scope` on rejection. No route body, authorization rule, schema, or
provider setting changed.

Validation: focused rate-limit tests 5/5; Web 72 files/468 tests; workspace
lint/typecheck; `git diff --check`; and 80/80 production routes pass. Source
`4d190dfdf01c753812f7d5924f8c269c8a9de8bd` was pushed once to both target
branches. No Vercel build or hosted DB mutation occurred.

This is burst protection only: cold starts and multiple edge instances can
reset the map. Next backend milestone: shared Redis quota/lock accounting in
NestJS, with tenant/user dimensions and audit/metrics, after disposable tests.

## M3.56 - Shared Redis provider quota gateway (source complete, 2026-08-04)

Added `ProviderQuotaModule` to the Nest modular monolith. Its authenticated
`POST /v1/provider-quotas/consume` endpoint accepts only fixed bucket names;
`SupabaseJwtGuard` and `CapabilityGuard` derive/authorize the principal. A Lua
script increments tenant/user hashed keys with expiry, stops unbounded count
growth after the limit, and returns a bounded TTL. No ERP record or provider
payload is stored in Redis.

Integrated Next Cortex chat/embed, project AI chat, and BOM similar-item
retrieval behind an exact `ERP_PROVIDER_QUOTA_VIA_API` plus UUID allowlist
canary. Disabled by default. Enabled failures return 503/429 before provider
work; success leaves existing route bodies and response contracts unchanged.

Validation: API 60 files/308 tests; Web 73 files/471 tests; focused API 7/7 and
Web 3/3 provider-quota tests plus route suites; workspace lint/typecheck; API
Nest build; `git diff --check`; and Web 80/80-route production build pass. No
Vercel deployment or hosted Supabase mutation occurred.

Landing reconnaissance added `docs/research/BEHAVIORS.md` and
`docs/research/components/third-code-landing.spec.md` from live 1440/390
Playwright evidence. This is a specification artifact, not a claim that a new
frontend release was deployed.

Next gate: supported Supabase backup plus dependent-row/audit export and
owner-approved mapping for the 12 duplicate Purchase Orders, then read-only
planner and disposable PostgreSQL 17 replay. Keep quota canary disabled until
Railway exact-SHA and Redis/auth replay evidence exists.

## M3.53 - Clean-room runtime branding audit (source complete, 2026-08-04)

Expanded `branding-clean-room.test.ts` to scan web source/public, API source,
and package text assets. Added forbidden marker variants and per-file failure
reporting, plus `docs/research/CLEAN_ROOM_REBRAND_AUDIT_20260804.md` with the
classification and live landing evidence. No product copy, route, schema,
migration, or provider setting changed.

Validation: focused clean-room/landing tests 6/6; Web 71 files/463 tests;
workspace lint/typecheck; `git diff --check`; and 80/80-route production
build pass. Live landing marker/metadata/responsive checks pass at 1440/768/390
with zero console errors. Do not trigger Vercel or mutate Supabase for this
source-only guard.

Source `0c911f8` is pushed once to `main` and
`agent-02/third-code-erp-landing`. GitHub's exact Railway check is `success`,
live Railway readiness/health are 200, Vercel created zero deployments, and
Supabase remains unchanged at 55 applied migrations. Keep the duplicate-PO
migration gate closed.

## M3.52 - Cortex operational brief presentation (source complete, 2026-08-04)

Wired the existing bounded `getCortexOperationalBrief` read into the
authenticated Cortex page and added a registry-backed presentation model plus
responsive `CortexBriefPanel`. The panel is source-link only, uses a six-item
render bound over the server's eight-item read, and has no browser write,
provider, AI, Python, or migration dependency. Added focused model and static
render tests and a component interaction specification.

Validation: focused Cortex tests 9/9, full Web 71 files/463 tests, workspace
lint/typecheck, `git diff --check`, and 80/80-route production build pass.
Local browser proof covers the public landing at 1440/768/390 with zero
overflow and console errors; `/cortex` fails closed to `/auth/login` without a
session. Do not use a real tenant credential merely to extend visual proof.

Source `1e5aa4d` was pushed once to `main` and
`agent-02/third-code-erp-landing` as `kurtgav`. GitHub's exact-SHA Railway
check is `success`; live Railway readiness and health are 200. Vercel's
deployment inventory returned zero new artifacts, and Supabase stayed at 55
applied migrations with no hosted SQL/data change. The next action remains the
owner-approved duplicate-PO backup/export and ordered replay gate.

## M3.51 - Cortex operational brief (source-only, 2026-08-04)

Added `getCortexOperationalBrief` and `GET /api/cortex/brief`. The query runs
two bounded, tenant-filtered graph reads under the caller's role scope; the API
serializes only registered entity references, safe titles/summaries, freshness,
timestamps, and existing graph statistics. It has no migration, no write path,
and no external AI/provider dependency.

Validation is source-only: workspace lint and typecheck pass; the production
build generates 80/80 routes including `/api/cortex/brief`. The Turbo-parallel
test run had one API resource-contention timeout in the stock-receipt controller;
package-isolated reruns pass API 58/300, Web 69/458, Database 41/166, and
Shared Types 15/163. Database integration suites requiring `DATABASE_URL`
remain skipped. Do not apply Supabase SQL or trigger Vercel for this slice.

The source-only slice was pushed once; keep the hosted 55/87 migration boundary
unchanged.

Completed provider check: source `cfffa7a756609c49fa84b293ec71611c892182dd`
is on both target branches; GitHub's exact-SHA Railway check is `success`;
live `/ready` and `/health` are healthy; Vercel returned zero deployments; and
Supabase remains `ACTIVE_HEALTHY` at 55 applied migrations. The next action is
the existing owner-approved duplicate-PO backup/export and ordered replay gate,
not another deployment.

## M3.50 - cost-capped provider and hosted-ledger audit (read-only, 2026-08-04)

Ran the repository database release planner and the Purchase Order duplicate
planner against the configured Supabase target using repeatable-read/read-only
transactions. Result: PostgreSQL 17, 55/87 migrations, linear prefix, 32
pending files, one duplicate tenant group containing 12 records. No SQL was
executed and no migration-history row was written. Supabase advisor snapshots
are recorded as follow-up security/performance work only.

Verified provider spend controls: `apps/web/vercel.json` keeps Git deployment
disabled; Vercel returned zero deployments after the source/docs push. GitHub
is `kurtgav`, both target branches carry the reviewed source plus the
docs-only audit checkpoints, and the exact-SHA Railway check is green. This
checkpoint is source/docs-only; no Vercel build or hosted DB replay occurred.

Next migration action: obtain a supported backup and dependent-row/audit
export, then get an owner-approved canonical mapping for the duplicate group.
Re-run both planners and disposable PostgreSQL 17 replay before applying the
ordered suffix. Rollback remains a reviewed forward migration, never a reset.

## M3.49 - supplier confirmation review portal (source-gated, 2026-08-04)

Added the source-only public review read model, strict shared contract, Nest
GET seam, Next portal page, and server action for US-014. No migration is
added: the read query depends on the existing supplier-session, Purchase
Order, project/vendor, and line-item schema, and every join repeats tenant
scope. The read flag and tenant allowlist default false/empty; the POST
decision authority and existing supplier email behavior are unchanged.

Validation: API 58/300, Web 68/454, shared types 15/163; workspace lint,
typecheck, and 79/79-route build pass. Local closed-gate runtime proof is
HTTP 200 with the support state. Do not apply Supabase SQL or call Vercel for
this source milestone. The next hosted step is a recoverable backup and
owner-approved duplicate `PO-0002` repair before any ordered suffix replay,
then disposable supplier-link canaries with rollback and spend controls.

Post-push evidence: `386fd2a` is on both target branches. GitHub's exact-SHA
Railway check is `success`; Railway deployment
`430e835a-c2bc-4dfb-8994-a5b7e5a0e1ce` is `SUCCESS`, and `/ready`/`/health`
are healthy. A valid-format public read probe returns `503` while the gate is
closed. Vercel created zero deployments after the push. Supabase remains
unchanged at 55 migrations; its latest branch-action log repeats the duplicate
`PO-0002` `P0001` failure. No DB release occurred.

## M3.48 - landing GEO structured data (source complete, 2026-08-04)

Added a pure landing structured-data builder and linked `Organization`,
`WebSite`, `WebPage`, `SoftwareApplication`, and `FAQPage` graph. Added en-PH
metadata and website Open Graph identity without changing the validated visual
surface. No migration is required.

Validation: focused 5/5; Web 67 files/451 tests; workspace lint/typecheck,
diff check, and 79/79-route production build pass. Local production HTML
returned 200 with expected JSON-LD and no legacy-brand markers.

Exact next action after the verified push: keep Supabase unchanged at 55/87
until the supported backup, dependent-row/audit export, and owner-approved
duplicate `PO-0002` repair are complete. Keep Vercel disconnected and
spend-protected; do not call this a DB or Vercel release.
Post-push: `ce1ae6e` is present on both target branches. GitHub is successful;
Railway deployment `c0103db6-da9a-415c-9fe3-4ca96f5a56f2` is `SKIPPED` for
the unchanged API watch set and `/ready`/`/health` remain 200. Vercel created
zero deployments after the push; its public URL still serves the prior
release. Supabase's default branch is `MIGRATIONS_FAILED` at 55 applied
migrations with the duplicate-PO `P0001` preflight; no DB release occurred.

## M3.47 - proposal read tenant scope (source complete, 2026-08-04)

Source checkpoint: `9270919`. Hardened both proposal server-rendered pages with repeated tenant predicates
for the opportunity/account join and every related PPRF, inspection, design,
and change-request read. The nullable design join is tenant-constrained. The
canonical story index now records US-009 as Live.

Validation: focused proposal actions 2/2; Web 66 files/450 tests; workspace
lint/typecheck, diff check, and 79/79-route production build pass. No migration
is required; no hosted SQL or provider action is authorized for this slice.

Exact next action: preserve the Supabase/Vercel release gates; do not call this
a DB release. Post-push evidence: `5a5e525` is on both target branches;
GitHub's exact-SHA Railway check is `success`, Railway skipped the
frontend/docs-only commit, and live `/ready`/`/health` are 200. Vercel reports
zero deployments after the push. Supabase remains at 55 migrations; the
branch API says `MIGRATIONS_FAILED`; the last successful branch-action log read
fails `20260801090000_purchase_order_create_idempotency.sql` with `P0001` for
the duplicate tenant `PO-0002` group. A subsequent logs request returned
`INVALID_ARGUMENT`, so no newer outcome is claimed.

## M3.46 - command palette accessibility and race safety (source complete, 2026-08-04)

Added a pure navigation helper and a presentation-only command-palette
hardening slice. The input now owns combobox semantics; Search/Cortex options
have stable IDs and announced status states; each debounced request is
sequence-checked so an older response cannot replace a newer query.

Source checkpoint: `e3dc6d6`. Validation: focused navigation/selection 7/7,
Web 66 files/450 tests, workspace lint/typecheck, `git diff --check`, and the
79/79-route production build pass. Authenticated browser proof remains open
when local Supabase DNS cannot resolve. No migration is needed. Do not trigger
Vercel or apply Supabase SQL for this source-only slice.

Exact next action: push both target branches once, verify
the exact GitHub/Railway SHA and live readiness, then record the unchanged
Supabase/Vercel provider state.
Post-push evidence: source/docs `0a085b7` is on `main` and
`agent-02/third-code-erp-landing`; GitHub's exact-SHA Railway status is
`success`. Railway recorded `SKIPPED` for this docs/frontend-only commit
because no API watch pattern changed, while the existing service remains
Online and `/ready`/`/health` are 200. Supabase is still 55/87 with
`MIGRATIONS_FAILED` at the Purchase Order uniqueness preflight. Vercel's
read-only query shows zero deployments after the push; no paid build ran.

## M3.45 - Cortex search accessibility (source complete, 2026-08-04)

Source checkpoint: `71c5cba`. Added pure, tested result selection and
keyboard-first Cortex navigation without adding a mutation or database seam.
The graph search now exposes stable ARIA relationships and explicit loading,
empty, and error states; new terms clear stale results before the debounce
window.

Validation: focused 3/3; Web 65 files/447 tests; workspace lint/typecheck,
diff check, and 79/79-route production build pass. Unauthenticated browser
redirect proof is clean. Authenticated Cortex proof is still open because the
local Next Edge runtime could not resolve the configured Supabase host. Do not
trigger Vercel or apply hosted SQL for this presentation-only slice.

Exact next action: rerun authenticated desktop/mobile Cortex proof from a
runtime with working Supabase DNS, then continue the supported backup and
owner-approved duplicate Purchase Order repair before ordered migration
replay. Source/evidence are pushed at `e6fe073` to both target branches;
GitHub's Railway check is successful, Railway readiness is 200, Supabase stays
at 55/87 migrations, and Vercel reports no deployment for this SHA.

## M3.44 - read-only admin data-quality review (2026-08-04)

Status: source complete; hosted database intentionally unchanged.

Added `/admin/data-quality` as the smallest safe vertical slice for the known
Purchase Order uniqueness blocker. `requireUserProfile()` plus
`admin.system_config` gates the route; every query is tenant-scoped; no browser
write or repair action exists. Group and detail reads are capped and the pure
report helper is covered by 2/2 focused tests.

Validation: Web 64 files/444 tests, API 294, shared-types 162, database 166
executed with 140 environment-gated skips, lint/typecheck, diff check, and
79/79-route build all pass. Authenticated browser proof passed at 1440px and
390px with no overflow, no repair controls, and no new console errors.

Source checkpoint: `63bbf22`; evidence checkpoint `eab1719` is pushed to both
target branches. GitHub's Railway check is successful, and Railway
`/ready`/`/health` are 200 for the linked production service. Supabase remains
at the 55-row prefix and Vercel has no deployment for this SHA. Exact next
action: supported backup, dependent-row/audit export, owner-approved repair,
then ordered suffix replay. Do not auto-repair business rows, hand-edit
migration history, reconnect Vercel Git, or trigger a preview/build.

## M3.43 — supported Supabase reconciliation before mutation (2026-08-04)

Status: read-only audit complete; hosted SQL intentionally paused.

Evidence: the repository contains 87 ordered migrations while the configured
Supabase target has 55. The protected branch is `MIGRATIONS_FAILED` at the
first pending file, `20260801090000_purchase_order_create_idempotency.sql`,
because tenant-scoped `PO-0002` is duplicated 12 times. The public catalog has
88 RLS-enabled tables, three policyless internal tables, one private Storage
bucket with 37 objects, and advisor findings recorded in
[`docs/research/supabase-reconciliation-20260804.md`](../research/supabase-reconciliation-20260804.md).

Required order: supported recoverable backup; dependent-row and audit export;
owner-approved canonical duplicate repair; one audited repair migration;
ordered suffix replay; catalog/data/RLS/Storage verification; only then a
tenant-scoped Nest mutation canary. Do not reset the protected branch, insert
fake migration history, or apply raw DDL to work around the provider error.

Strategy: strangler migration by complete vertical transaction slices. Keep
the current application usable and keep each new route disabled until its
evidence is green.

## M3.42 - Project Command Center (source complete)

Added a read-only project operating surface on top of existing tenant-scoped
tables: pending/overdue tasks, project evidence, pending variation decisions,
open punchlist, active deliveries joined through project-owned purchase
orders, and the latest progress percentage. The overview remains a server
read path; buttons are navigation to existing routes/Cortex context, not
browser writes. Project tabs are contained on mobile and the data boundary
uses ISO date strings.

Source checkpoint: `a225340`. Focused tests 4/4, workspace tests green,
lint/typecheck, diff check, and production build 78/78 routes passed. Browser
MCP proof passed at 390px and 1440px with no overflow and no console errors.
No database/provider mutation occurred. Exact next action: push once, verify
Railway/GitHub/live readiness against the exact SHA, and retain the Supabase
55-row and Vercel spend gates.

## M3.41 - Read-only Today Command Center (source complete)

Source checkpoint: `ab905091ada2f7db927e6cf4c2de687ee2010194`. Added
`getTodayCommandCenter` on top of existing tenant/assignee-scoped queries and
a responsive Today/Project Command Center component. Executive dashboards
also receive the surface; non-executive roles receive only their authorized
work and the private project empty state. Project/Cortex links remain
navigation handoffs and do not commit ERP state.

Changed files are the dashboard query, page, Today component/CSS/test, and
viewer role E2E assertions. Focused 2/2 and full Web 440/440 tests, lint,
typecheck, diff check, and 78-route production build passed. Authenticated
browser MCP proof passed at mobile and desktop; CLI Playwright remains
blocked by the missing local Chromium executable. No database or provider
mutation occurred.

Exact next action: push the reviewed source/docs history once, verify GitHub
and Railway against the exact SHA, and recheck live `/ready`/`/health`.
Keep Supabase at its 55-row hosted prefix, all mutation flags closed, and
Vercel Git disconnected/spend-protected; do not trigger a Vercel build.

## M3.40 - Governing BuildOps product contract (documentation complete)

Added `docs/BuildOps_PRD_v1.md` from the existing product/refactor, clean-room,
architecture, and release records. It defines the construction-first product
outcome, shared multi-business foundations, Today/Project Command Center/
Ask surfaces, Nest/PostgreSQL authority, Python advisory boundary, exact
money, tenant/RLS, audit, idempotency, workflow, accessibility, SEO/GEO,
testing, rollback, and provider-spend definition of done. No runtime, hosted
database, Storage, Railway, or Vercel state changed.

Validation for this documentation slice: clean-room runtime scan under
`apps`, `packages`, and `supabase` has no ERPNext/Frappe/ABI Ops marker;
existing landing evidence remains green at 1440/768/390px; source baseline
and provider identities were rechecked. Checkpoint
`a66b43bd9c1694f19de69ad3f0a49808fc41b8fd` is pushed to both target branches
under `kurtgav`; Railway's GitHub check and live `/ready`/`/health` are green.
Supabase remains read-only at 55 applied migrations with head
`20260729233017`, no `project_create_requests` table, and the existing
`MIGRATIONS_FAILED` branch status. Exact next action: resolve the
Supabase connector `INVALID_ARGUMENT` and reported `MIGRATIONS_FAILED` state
through a supported, recoverable path. After that gate, implement the smallest
read-only Today/Project Command Center slice without opening mutation flags.

## M3.39 - Durable project-create idempotency (source complete)

Committed at `b77227df402082d494538b92d706f7f092fa1fe5`. Added the
`project_create_requests` migration/schema with tenant/key uniqueness,
canonical SHA-256 request hash, strict state/result checks, composite tenant
foreign keys, forced RLS, and service-only grants. Nest now requires and
validates `Idempotency-Key`, transactionally claims the request, replays a
stored typed result, rejects same-key/different-payload reuse, completes the
ledger with the project and audit evidence, and rolls back both rows on
failure. The Next form and core adapter supply the key; default flags remain
closed, preserving the legacy Server Action behavior.

Evidence: disposable PostgreSQL 17 + Redis applied 87/87 migrations;
database tests passed 306/306 with zero skips; API integration passed 15 files
/ 22 tests; focused API 13/13, web adapter 72/72, shared 162/162, web 438/438,
API 294/294; lint, typecheck, `git diff --check`, and production build 78/78
pages passed. Hosted Supabase, Railway variables, Storage, and Vercel were
not mutated. Exact next action: obtain approved backup/restore and full
55/87 catalog/data/RLS/Storage diff, then review one canary while both flags
remain closed until owner/provider/spend gates pass.

## M3.38 - Guarded project-create authority seam (source-only)

Implemented in source checkpoint `7f3a9fc`: strict shared command/result
schemas; Nest controller, Zod pipe, service transaction, audit context, and
`project.create` capability; plus a typed Next adapter and exact tenant flags.
The legacy Server Action is unchanged by default. If the adapter is selected,
it does not fall back to direct writes; Nest returns a fail-closed 503 until
its explicit server flag and tenant allowlist are enabled.

Validation passed: shared 162/162, API serial 57 files / 291 tests, web
438/438, lint, typecheck, and Next production build 78/78 pages. The parallel
test run exposed two unrelated 5-second API contention timeouts; the serial
Turbo run passed. Supabase hosted SQL, migration history, Storage, and data
were not mutated. The connected Railway main-branch check automatically
deployed this source at `36530493-b9a9-4c1e-9c7a-dd0671a198ed` and reported
success; no Railway variable changed. No Vercel build or promotion occurred.

Exact next slice: add a tenant-scoped durable project-create idempotency
ledger (request key, request hash, state, result), prove replay/conflict and
rollback on the disposable two-tenant PostgreSQL/Redis lane, then run a
reviewed canary with both flags still closed until owner/provider/spend gates
are approved. Do not apply SQL to the 55/86 Supabase target or trigger Vercel.

## M3.37 - Read-only live-provider incident and catalog reconciliation

Re-verified the GitHub, Railway, Supabase, and Vercel identities after the
M3.36 source release. Both target GitHub branches point to
`318b7e0d9efdc115624d70a43384f086d10a73b2`; Railway `/ready` and `/health`
are HTTP 200 with database/Redis healthy. Vercel remains Git-disconnected and
spend-protected. Its grouped runtime evidence ties digest `862076041` to the
older `partial_delivered` enum failure on `dpl_2WnStFHAqLchG71rjWKjvyEBY3WK`,
while the current hosted enum already contains that value. An unauthenticated
live request returns the expected `/auth/login` redirect.

The Supabase release planner is still a linear 55/86 prefix and the hosted
catalog lacks the 23 table objects introduced by the source suffix. This
milestone is read-only: no SQL, migration ledger row, Storage object, Railway
variable, Vercel build, or domain promotion changed. The next gate remains an
approved backup/clone, full catalog/data/RLS diff, zero-skipped replay,
rollback/recovery evidence, owner/provider identity, and spend-bounded canary.

The disposable replay was rerun as part of this milestone: PostgreSQL 17 and
Redis passed 86/86 migrations, database 300/300 with zero skips, and API
integration 15 files / 22 tests. The schema hash stayed
`DDBBB7421C09146F9F34B816679135F6D33EBCB19BF10996C5F187B87606C91D`; only the
local Redis overcommit warning was emitted.

## M3.36 - Supplier-issued outbox contract replay (evidence complete)

The first full disposable replay found that `scm_issue` emitted
`vendor_confirmation_session_id` while the database constraint still allowed
only the required supplier payload keys. Added the forward-only migration
`20260803170000_purchase_order_supplier_session_payload.sql`; it preserves
strict key allowlisting and validates the optional value as absent, JSON null,
or a UUID. No prior migration was changed.

Evidence: PostgreSQL 17 + Redis applied 86/86 source migrations; schema and
release planner checks passed; database tests passed 300/300 with zero skips;
API database/Redis integration passed 15 files / 22 tests; root lint,
typecheck, full tests, and production build passed. The local fixtures were
stopped after the run. Commit `11c8168248edc02eed93aff9be0204c12559152b` is
pushed to both target branches under `kurtgav`, and Railway auto-deployed it as
`52dca77c-5bec-442f-85cd-f1cd81bde478` with `/ready` and `/health` green.
Hosted Supabase is still 55/86; no hosted database/provider setting changed,
and no Vercel build was triggered.

Next: retain the hosted-apply block. Reconcile the complete 31-file suffix
against an approved backup/restore and catalog/data/RLS diff, then obtain
owner/provider/spend approval before any forward-only hosted migration or
controlled deploy.

## M3.35 - Authenticated Cortex browser proof (evidence complete)

Added persistent E2E assertions for exact browser/API boundary: protected
dashboard paths redirect to `/auth/login` without session, while
`/api/cortex/search` returns 401 JSON with private/no-store and Cookie-varying
headers. Fresh local runtime passed authenticated Cortex graph, focused-record,
conversation deep-link, responsive, and viewer-role suites (1/1 each). Demo
Supabase session was generated for test and revoked; no business-table write
occurred.

This evidence is not isolated disposable-database proof. Next action remains a
two-tenant PostgreSQL/Redis replay covering cross-tenant denial, citations,
redaction, audit, and rollback before any hosted migration or promotion.

## M3.34 - Authenticated browser route boundary (source complete)

Centralized dashboard session-gating in `lib/protected-route.ts`, added missing
`/cortex`, `/finance`, and `/inventory` browser prefixes, and changed matching
to exact path segments. API routes remain handler-authorized; `/api/cortex/*`
does not redirect to HTML. This closes a route-level auth inconsistency without
changing tenant queries, role policy, request bodies, or hosted state.

Evidence: local Playwright `/cortex` navigation redirects to `/auth/login`;
web tests 436/436, root lint/typecheck, and the 78-page production build pass.
No Supabase, Railway, Vercel, Storage, or business data mutation occurred.
Next step is authenticated disposable-tenant browser verification of allowed,
denied, cross-tenant, redacted, and citation-bearing Cortex flows.

## M3.33 - Authenticated Cortex transport privacy (source complete)

Standardized the private response contract across Cortex chat, search, graph,
entity, conversation, and embedding handlers. Every handler response now uses
`Cache-Control: private, no-store, max-age=0` and `Vary: Cookie`; graph no
longer permits a private fifteen-second cache. Request/response bodies,
streaming, citations, tenant filters, and authorization behavior are unchanged.

Validation is complete for 31 focused route tests, full workspace tests (API
287, shared types 159, web 434, database 162 passed with 137
environment-skipped), root lint/typecheck, the 78-page production build, and
local unauthenticated POST/header probes. Commit `36a37e9` is pushed to both
target branches under `kurtgav`; no database or provider mutation occurred.
The next step is authenticated browser permission/citation verification with
disposable tenant fixtures, followed by a separately approved, spend-bounded
promotion.

## M3.32 - Landing Cortex preview and evidence-led UI slice (source complete)

Added a local, read-only Cortex query preview to the existing platform bento.
Question buttons expose `aria-pressed` state; answer and source chips update in
an `aria-live="polite"` region. No backend, database, auth, approval, or
provider contract changed. Captured live desktop/mobile screenshots and wrote
the behavior bible, topology, and component specifications under
`docs/research/`.

Keep this demo clearly read-only. The next release step is controlled browser
verification against the exact commit, not an automatic Vercel deploy; Vercel
spend protection remains active and Railway watches the API surface only.

## M3.31 - Read-only Supabase reconciliation audit (source complete)

Audited the authorized Supabase target against the complete source migration
ledger. Source has 85 files and the hosted ledger has an exact 55-file prefix;
30 ordered files are pending. The suffix risk scan and hosted catalog checks
are recorded in [`DATABASE_RECONCILIATION_M3.31.md`](./DATABASE_RECONCILIATION_M3.31.md).

This milestone performs no hosted mutation. Keep all supplier-confirmation
flags false/empty and do not apply the suffix or repair
`supabase_migrations.schema_migrations` until the target is restored into an
isolated PostgreSQL 17 clone, all source files replay cleanly, catalog/data/RLS
drift is reconciled, and backup, integration, recovery, owner, provider, and
spend gates are evidenced.

## M3.30 - Gated supplier confirmation link delivery (source complete)

The existing supplier-email delivery worker can now reconstruct a confirmation
URL at send time from the redacted session UUID. It performs a tenant/PO,
pending-state, and expiry check in the same claim transaction, then derives
the HMAC token in memory. Link delivery requires both the explicit link
allowlist and the public-write allowlist for the tenant, plus an HTTPS API
base URL and the server-only token secret. No migration is added and no
existing email is changed while the controls are closed.

Keep all M3.30 controls false/empty and the base URL unset until the ordered
hosted suffix, disposable email replay/expiry/revocation proof, provider
identity, rollback, owner-input, and spend gates clear. This source slice
does not authorize Supabase or Vercel mutation.

## M3.29 - Protected supplier session minting (closed Railway runtime seam)

Local source extends the M3.28 supplier-confirmation authority at the
authorized `scm_issue` transition. A separate tenant flag gates creation of a
pending confirmation session. The token is deterministically derived from a
random session UUID, tenant UUID, and server-only HMAC secret; only its SHA-256
hash is persisted. The session records the source workflow-request id for
replay association and the schema prevents two pending sessions for one
tenant-scoped Purchase Order. The supplier-issued outbox contains only the
session UUID as a redacted association; no raw token or public link is emitted.

The source migration is
`20260803160000_vendor_confirmation_session_minting.sql`. Keep
`ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_ENABLED` and its tenant
allowlist false/empty, and keep the token secret unset, until the complete
ordered hosted suffix, disposable insert/replay/expiry proof, rollback,
provider identity, owner-input, and spend gates clear. Existing supplier email
copy, retry, and delivery state are unchanged. Public link delivery remains a
separate follow-on slice.

Source checkpoint `e81087e` is published to `main` and
`agent-02/third-code-erp-landing` under `kurtgav`. Railway deployment
`dacccb49-9bca-4754-8a48-17feded185bf` is `SUCCESS`; `/ready` reports database
and Redis `ok`, and a valid-format public-command probe returned `503` with the
controls closed. Supabase remains at 55 applied migrations versus 85 in
source; Vercel was not deployed.

## M3.28 - Supplier confirmation authority (closed Railway runtime seam)

Local source now adds a tenant-scoped, hashed-token supplier-confirmation
session; an explicit `pending -> accepted | declined | changes_requested` state
machine; a durable tenant/idempotency replay ledger; and a closed-by-default
NestJS public command at
`POST /v1/public/purchase-orders/:token/confirmation`. NestJS derives Purchase
Order and tenant scope from a locked session, requires the Purchase Order to be
issued, commits response metadata and nullable-actor audit atomically, and
never alters delivery, receipt, inventory, or payment state. Existing supplier
email and Purchase Order UI behavior remain unchanged; session minting and
email-link delivery are a follow-on slice so no existing notification retry
path is changed here.

The source migration is
`20260803150000_vendor_confirmation_workflow.sql`; it is not applied to hosted
Supabase. Keep `ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_ENABLED` and
`ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_TENANT_IDS` false/empty until the
ordered hosted suffix, disposable replay/expiry/revocation/cross-tenant proof,
rollback, provider identity, owner-input, and spend gates clear.

Commit `850eee5` is published to `main` and
`agent-02/third-code-erp-landing`. Railway deployment
`3227b3a3-79e9-472f-9770-78f96faf636f` is `SUCCESS` under `kurtgav`; live
`/ready` reports database and Redis `ok`, and a valid-format public-command
probe returned `503` because the controls remain closed. Vercel was not
deployed; Supabase was not mutated.

See [`CAPABILITY_MATRIX.md`](./CAPABILITY_MATRIX.md) for the acceptance
boundary and current capability evidence.

## M3.27 - Public client-signing authority (local source complete)

Local source adds strict public-signing body/result contracts,
`20260803140000_public_signing_workflow.sql`, and the closed-by-default
NestJS route `POST /v1/public/signatures/:token`. The route uses the hashed
session token as its only unauthenticated authority, derives tenant and source
scope from the locked session, bounds and validates PNG data, uploads through
the service-role Storage adapter, writes the signature document and source
stamp transactionally, persists a service-only replay result, and writes
nullable-actor semantic audit. Matching concurrent retries cannot delete a
Storage object that may belong to a processing or succeeded request. Next.js
remains a compatibility adapter with a stable retry key; selected Core errors
never fall back to direct database writes. Existing portal UI and copy remain
unchanged.

The migration is source-only. Supabase remains at 55 applied migrations
against 83 source migrations; do not apply this migration alone. Keep
`ERP_PUBLIC_SIGNING_WRITES_ENABLED`,
`ERP_PUBLIC_SIGNING_WRITES_TENANT_IDS`, `ERP_PUBLIC_SIGNING_VIA_API`, and
`ERP_PUBLIC_SIGNING_VIA_API_TENANT_IDS` false/empty until ordered hosted
parity, disposable signing replay/expiry/revocation/source-stamp proof,
rollback, duplicate-data, audit-chain, provider-identity, owner-input, and
spend gates clear.

Validation: shared 155/155, database 158/158 with guarded integration skips,
focused API 59/59, Web 431/431, package typechecks/lint, Nest build, Next
build 78/78 routes, and diff checks passed. The serialized full API runner
exceeded the 360-second execution ceiling before returning a result and is
not claimed green. Source checkpoint `af8690d` is published to both target
branches; Railway deployment `d4afe970-6958-4f38-a17a-fa8c01ca13d4` is
`SUCCESS` at that SHA and `/ready` is green. Vercel Git remains disconnected;
no `af8690d` deployment or paid build occurred, and production remains on
the older revision `31c04942a93d`. No hosted SQL, feature flag, or provider
setting changed.

## M3.26 - Document deletion authority (local source complete)

Local source adds strict document deletion contracts,
`20260803130000_document_delete_workflow.sql`, and the closed-by-default
NestJS route `DELETE /v1/documents/:documentId`. NestJS derives tenant and
actor from a locked membership, rechecks `document.manage`, claims a durable
tenant-scoped idempotency result, refuses documents with processing history,
deletes derived scope rows and the document transactionally, and writes
semantic audit. Next.js remains a compatibility adapter with a stable retry
key and post-commit Storage cleanup; selected Core failures never fall through
to a second write.

The migration is source-only. Supabase remains at 55 applied migrations
against 82 source migrations; do not apply this migration alone. Keep
`ERP_DOCUMENT_DELETE_WRITES_ENABLED`,
`ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS`,
`ERP_DOCUMENT_DELETE_WRITES_VIA_API`, and
`ERP_DOCUMENT_DELETE_WRITES_VIA_API_TENANT_IDS` false/empty until ordered hosted
parity, disposable transaction/replay proof, rollback, duplicate-data,
audit-chain, provider-identity, and spend gates clear.

Validation: shared 152/152, database 156/156 with guarded integration skips,
focused API 56/56, Web 425/425, package typechecks/lint, Nest build, Next
build 78/78 routes, and diff checks passed. The serialized full API runner
exceeded the execution ceiling before returning a result and is not claimed
green. Source checkpoint `5ad72ec` is published fast-forward to both target
branches under `kurtgav <kurtgavin.design@gmail.com>`. The existing Railway
deployment at source `5ad72ec` is `SUCCESS` and `/ready` reports PostgreSQL
and Redis ready. No hosted SQL or new deployment occurred; this runtime signal
does not clear migration-parity, protected-flow, rollback, or spend gates.

## M3.25 - Cash draft mutation authority (local source complete)

Local source adds strict cash draft command/result contracts,
`20260803120000_cash_transaction_draft_workflow.sql`, and the closed-by-
default NestJS save/delete routes. NestJS derives tenant and actor from a
locked membership, rechecks `finance.manage_cash`, validates active Cash
Accounts and tenant-owned open allocation targets, writes the draft and its
allocations transactionally, claims a tenant-scoped idempotency record, and
writes semantic audit. The replay ledger deliberately retains deleted target
UUIDs. Next.js remains a compatibility adapter with stable retry keys; a
selected Core failure never falls back to a direct database write. Visible
cash UI and copy remain unchanged.

The implementation is commit `8404d20`, with source publication checkpoint
`46035fa` by fast-forward. Both `main` and
`agent-02/third-code-erp-landing` include that source. All cash-draft controls
remain false/empty. Source now has 81
migrations and Supabase remains at 55 applied; do not apply this migration
alone. Reconcile the complete 26-migration suffix only after duplicate-PO
mapping, canonical audit-recovery tenant approval, guarded Postgres/Redis
integration, rollback, provider identity, and spend gates clear.

Validation: shared 149/149, database 154/154 with guarded integration skips,
API 251/251 under an explicit 30-second Vitest timeout, Web 421/421, package
typechecks/lint, Nest build, release-plan/workflow-reference checks, and diff
checks passed. The default parallel API run had unrelated 5-second runner
timeouts. An initial Next production-build runner attempt timed out before
returning; an isolated retry with `NEXT_TELEMETRY_DISABLED=1` and `CI=1`
passed with 78/78 generated routes. This remains local evidence only; no
hosted build or deployment occurred. Audit-hash verification remains blocked
without the required Postgres and owner-approved tenant inputs.

## M3.24 - Customer invoice cancellation authority (local source complete)

Local source adds strict customer-invoice cancellation contracts,
`20260803110000_customer_invoice_cancel_workflow.sql`, and the closed-by-
default NestJS route
`POST /v1/finance/customer-invoices/:invoiceId/cancel`. NestJS rechecks
`finance.issue_invoice`, locks tenant membership and the invoice, claims a
tenant-scoped idempotency record, reuses the existing
`cancel_customer_invoice` PostgreSQL function, persists a strict cancelled
result, and writes semantic audit atomically. Next.js remains a compatibility
adapter with one stable retry key; selected Core failures never fall back to a
second write. Visible invoice UI and copy remain unchanged.

The reviewed implementation is commit `c71fbd4`; publishing that source does
not authorize hosted SQL, feature flags, or provider deployments.

Validation: shared-types 147/147, database 152/152 with guarded integration
skips, API source 240/240, Web 418/418, all package typechecks and lint, API
build, Next build 78/78 routes, release-plan checks, workflow reference
checks, and diff checks passed. Guarded PostgreSQL/Redis integration was not
run without `DATABASE_URL` and `ERP_API_INTEGRATION_EXPECTED=1`.

Keep all customer-invoice cancellation controls false/empty. Source now has
80 migrations and Supabase remains at 55 applied; do not apply this migration
alone. GitHub publication, Railway identity, duplicate-PO remediation,
audit-recovery approval, rollback, and spend gates still block hosted
promotion.

## M3.23 - Customer invoice reversal authority (local source complete)

Local source adds strict customer-invoice reversal contracts,
`20260803100000_customer_invoice_reverse_workflow.sql`, and the
closed-by-default NestJS route
`POST /v1/finance/customer-invoices/:invoiceId/reverse`. NestJS rechecks
`finance.issue_invoice`, locks tenant membership and the invoice, claims a
tenant-scoped idempotency record, reuses the existing
`reverse_customer_invoice` PostgreSQL function, persists a strict cancelled
result, and writes semantic audit atomically. Next.js remains a compatibility
adapter with one stable retry key; selected Core failures never fall back to a
second write. Visible invoice UI and copy remain unchanged.

The reviewed implementation is commit `8c7159c`; publishing that source does
not authorize hosted SQL, feature flags, or provider deployments.

Validation: shared-types 146/146, database 150/150 with guarded integration
skips, API source 234/234, Web 414/414, all package typechecks, Nest build,
Next build 78/78 routes, and diff checks passed. The focused additions were
the shared reversal contract, database migration contract, four API boundary
tests, and the Core/action delegation tests. Guarded PostgreSQL/Redis
integration was not run without `DATABASE_URL` and
`ERP_API_INTEGRATION_EXPECTED=1`.

Keep all customer-invoice reversal controls false/empty. Source now has 79
migrations and Supabase remains at 55 applied; do not apply this migration
alone. GitHub publication, Railway identity, duplicate-PO remediation,
audit-recovery approval, rollback, and spend gates still block hosted
promotion.

## M3.22 - Customer invoice issuance authority (local source complete)

Local source adds strict customer-invoice issuance contracts,
`20260803090000_customer_invoice_issue_workflow.sql`, and the closed-by-
default NestJS route
`POST /v1/finance/customer-invoices/:invoiceId/issue`. NestJS rechecks
`finance.issue_invoice`, locks tenant membership and the invoice, claims a
tenant-scoped idempotency record, reuses the existing
`issue_customer_invoice` PostgreSQL function, persists a strict issued result,
and writes semantic audit atomically. Next.js remains a compatibility adapter
with one stable retry key; selected Core failures never fall back to a second
write. Invoice cancel and reversal remain legacy in this slice.

Validation: shared finance 10/10, database migration 3/3, API focused 47/47,
Web client/invoice 63/63, all package typechecks, Nest build, Next build
78/78 routes, and diff checks passed. Guarded PostgreSQL/Redis integration was
not run without `DATABASE_URL` and `ERP_API_INTEGRATION_EXPECTED=1`.

Keep all invoice issue controls false/empty. Source now has 78 migrations and
Supabase remains at 55 applied; do not apply this migration alone. GitHub,
Railway, duplicate-PO, audit-recovery, rollback, and spend gates still block
hosted promotion.

## 2026-08-03 GitHub source publication checkpoint

Remote `main` and `agent-02/third-code-erp-landing` contain the M3.22
implementation `33089abe` plus the publication checkpoint docs, published by
`kurtgav <kurtgavin.design@gmail.com>` with fast-forward pushes. No hosted SQL,
provider setting, feature flag, or deployment changed; the release remains held
by duplicate Purchase Order data and the missing owner-approved audit-recovery
tenant.

## M3.21 - Cash transaction posting/reversal authority (local source complete)

Local reviewed commit `44e678e` adds strict cash post/reverse contracts,
`20260802230000_cash_transaction_workflow_idempotency.sql`, the NestJS
transaction authority, semantic audit, observability labels, guarded Next
adapters, and stable UI retry keys. The database functions remain the sole
accounting/journal authority; NestJS owns authorization, idempotency, and
commit orchestration. Existing UI copy/layout and the legacy path for
unselected tenants are unchanged.

Validation: shared 9/9, database 2/2, cash API 4/4, web cash/client 62/62,
all package typechecks, Nest build, Next build 78/78, controlled-release 4/4,
database-release 7/7, and diff checks. The full serial Nest run reached
40/40 files and 226/226 passing tests before the Windows runner timed out
waiting for process exit; no failed assertion was reported. Guarded database
integration was not run without explicit Postgres credentials and gate.

Keep these controls false/empty:
`ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED`,
`ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS`,
`ERP_FINANCE_CASH_WORKFLOW_WRITES_VIA_API`, and
`ERP_FINANCE_CASH_WORKFLOW_WRITES_VIA_API_TENANT_IDS`. Do not apply the
migration independently; reconcile the complete ordered 23-migration suffix
only after duplicate PO mapping, canonical audit-recovery tenant, disposable
integration, rollback, and provider identity gates clear. GitHub publication
to `Third-Code-Solutions/ERP` is blocked under the requested `kurtgav`
connection because that account currently receives 404/no repository access.

## 2026-08-03 hosted recheck checkpoint

The read-only recheck confirmed the same 55/78 Supabase migration gap, one
12-record duplicate Purchase Order group, and missing owner-approved audit
tenant. Railway health/readiness are green but CLI authorization is not
`kurtgav`; Vercel production remains on `31c04942a93d` with no recent runtime
errors. No hosted mutation or paid build occurred. The next release action is
still owner input plus one rerun of the planner, not a bypass.

## M3.20 - Supplier Bill reversal authority (source complete)

Source commit `806860e` is published to both `origin/main` and
`origin/agent-02/third-code-erp-landing` under `kurtgav`. This slice moves
supplier-bill reversal behind the NestJS transaction authority while keeping
the existing Next.js action behavior for unselected tenants.

1. Add the strict reversal body/command/result contracts and the ordered
   migration `20260802220000_supplier_bill_reverse_workflow.sql`. The
   migration creates a forced-RLS, service-only, tenant-scoped idempotency
   ledger with request-hash and result validation plus tenant-composite
   foreign keys.
2. Add the closed-by-default NestJS route
   `POST /v1/finance/supplier-bills/:supplierBillId/reverse`. Recheck
   membership and `finance.post`, lock the bill, call the existing
   `reverse_supplier_bill` function, store a strict replay result, and write
   semantic audit atomically.
3. Route the existing Next action only when the exact API selector and UUID
   tenant allowlist match. Preserve the visible UI and legacy behavior for
   unselected tenants; selected Core errors never fall through to a duplicate
   write. Keep one opaque reversal retry key across retries.
4. Keep the four reversal controls false/empty until the ordered hosted
   suffix, duplicate PO decision, audit-recovery tenant, disposable
   integration, canary, rollback, and spend gates are green.

Source validation: focused shared 7/7, database 2/2, API/observability 18/18,
web 63/63, API/web typechecks, Nest build, controlled-release and
database-release-plan checks passed. The guarded PostgreSQL integration was
invoked and skipped without its explicit environment. A broad concurrent API
run had two known resource/concurrency timeouts in unrelated suites; the
bounded serial API suite then completed cleanly at 38 files/219 tests. No
hosted SQL or provider mutation occurred. Source now has 76 migrations versus
55 hosted.

Release gate: keep
`ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_ENABLED`,
`ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS`,
`ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API`, and
`ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API_TENANT_IDS` false/empty. Do
not apply `20260802220000_supplier_bill_reverse_workflow.sql` alone; reconcile
the complete 21-migration suffix only after owner-approved data and audit
inputs.

## M3.19 - Supplier Bill posting authority (source complete)

Source commit `f50c8bc5c540b97134764b56a297c41e8578f9f2` is published to both
`origin/main` and `origin/agent-02/third-code-erp-landing` under `kurtgav`.
This slice keeps supplier-bill reversal separate and moves only posting behind
the NestJS transaction authority.

1. Add the strict `postingDate` command/result and the ordered migration
   `20260802210000_supplier_bill_post_workflow.sql`. The migration creates a
   service-only, forced-RLS, tenant-scoped idempotency ledger with validated
   replay payloads and tenant-composite foreign keys.
2. Add the closed-by-default NestJS route
   `POST /v1/finance/supplier-bills/:supplierBillId/post`. Recheck membership
   and `finance.post`, lock the draft bill, call the existing database payable
   function, store the strict result, and write semantic audit atomically.
3. Route the existing Next action only when the exact API selector and UUID
   tenant allowlist match. Preserve the visible UI and legacy direct RPC for
   unselected tenants; selected Core errors never fall through to a second
   write.
4. Keep the API and frontend controls false/empty until the ordered hosted
   suffix, duplicate PO decision, audit-recovery tenant, disposable integration,
   canary, rollback, and spend gates are green.

Source validation: shared types 141/141; database 141 passed with 137 guarded
skips; web 59 files/397 passed; API serial 36 files/213 passed; focused API
40/40; API/web/shared/database typechecks; Nest build; Next build 78/78;
release-plan/controlled-release/workflow-reference tests; Actionlint;
Gitleaks; diff checks. The guarded database integration compiled and skipped
without its explicit environment. No hosted SQL or provider mutation occurred.
The root Turbo test was attempted but its concurrent API harness timed out in
five pre-existing suites; the API suite passed serially with one worker.

Release gate: keep
`ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED`,
`ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS`,
`ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API`, and
`ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API_TENANT_IDS` false/empty. Do not
apply `20260802210000_supplier_bill_post_workflow.sql` alone; reconcile the
complete 20-migration suffix only after owner-approved data and audit inputs.

## M3.18 - Delivery site-preparation completion authority (source complete)

Source commit `140f4e8cb518445ab0903d7d885b68cebc7ce8f0` contains this reviewed
source slice and is ready for controlled publication only; no hosted mutation
has occurred.

1. Extend the existing `delivery_workflow_action` enum with
   `complete_site_preparation`; no new table is introduced.
2. Add the closed-by-default NestJS command. Recheck membership and
   `delivery.receive`, preflight tenant visibility, claim the shared ledger,
   lock `site_preparing`, persist preparation notes/timestamps/actor, return a
   strict replay result, and write semantic audit in one transaction.
3. Route the existing `markSiteReady` action through Nest only for exact
   `true` plus UUID allowlisting. Keep one opaque completion retry key and fail
   closed after a selected core error; preserve visible UI and legacy behavior.
4. Prove strict contracts, replay/conflict behavior, RBAC, tenant isolation,
   audit, and migration reproducibility before canary activation.

Source validation passed: shared types 139/139; database 138 passed with 137
guarded skips; web 59 files/393 passed; focused API 72/72; API/web/shared/
database typechecks; Nest build; Next production build with 78/78 routes;
release-plan/controlled-release tests; Actionlint; Gitleaks; diff checks. The
PostgreSQL/Redis integration compiled but skipped without its explicit
environment. No hosted SQL or provider mutation occurred.

Release gate: keep
`ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_ENABLED`,
`ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS`,
`ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API`, and
`ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API_TENANT_IDS` false/empty.
Do not apply `20260802200000_delivery_site_preparation_complete_workflow.sql`
alone or deploy providers while hosted parity/data-integrity gates remain
blocked.

## Current source/release handoff (M3.17, 2026-08-02)

Source commit `0b7cb532b0b3a32f687f58437f2756259ba68c27` is pushed to
`agent-02/third-code-erp-landing` as `kurtgav
<kurtgavin.design@gmail.com>`. This slice moves delivery site-preparation
start authority into NestJS while preserving the existing Next.js action and
UI. It adds strict shared contracts, API validation, tenant/capability checks,
transactional idempotency and audit, the forward-only migration
`20260802190000_delivery_site_preparation_start_workflow.sql`, a guarded
Next adapter, and integration assertions for cross-tenant/viewer denial.

Source has 73 ordered migrations; the read-only Supabase ledger remains at 55,
so 18 migrations are pending. The hosted release is `review_required`: the
duplicate Purchase Order-number group and audit-recovery tenant remain
unresolved, and the hosted database was not changed. GitHub CI run
`30755868510` failed before executable steps because the account
payment/spending-limit gate blocked the runner. No Railway/Vercel deployment
was attempted; the current production artifact remains the prior reviewed
release.

Local gates: shared types 137/137; database 137 passed with 137 guarded skips;
web 59 files/388 passed; focused API contracts 64/64 with a 30-second timeout;
API/web typecheck; Nest build; release-plan/actionlint/gitleaks; and guarded
database integration invocation (skipped without `DATABASE_URL`). The Next
build reached 78/78 generated routes but the Windows worker did not return a
definitive exit code within the bounded run; API full-suite execution exceeded
the local ten-minute ceiling. Feature flags remain false/empty.

## Current source/release handoff (2026-08-02)

The reviewed CAD evidence and atomic draft-BOM slice is published on
`agent-02/third-code-erp-landing` at `4c166142056ee80c7cb2089afefd6bdcb360db63`
under `kurtgav <kurtgavin.design@gmail.com>`. Source gates are green. The
controlled hosted release is intentionally `review_required`: Supabase is
55/62 migrations with seven forward-only candidates, one tenant-scoped
Purchase Order-number duplicate group contains 12 demo records, and
`AUDIT_RECOVERY_TENANT_ID` is not configured. Railway and Vercel readiness are
HTTP 200, but no hosted SQL, flags, provider settings, or deployments were
changed.

## Milestones

### M0 — Baseline audit

Status: complete on 2026-07-27.

- Inventory frameworks, actions, routes, workers, schema, RLS, tests, and
  deployment.
- Record security and production risks.
- Establish current and target architecture documents.

### M1 — Nest transaction-authority foundation

Status: source published; hosted database reconciled through migration 51;
NestJS/Redis deployed on Railway; Next.js deployed on Vercel; live
Auth/capability/tenant isolation proved without writes; command observability
and safe source-level rollback selection proved; controlled hosted mutation,
audit reconciliation, and exact-value restoration proved. A supplemental
native PostgreSQL/Redis lane now passes clean replay plus zero-skip database and
Nest integration tests. Signup provisioning is hardened and verified on hosted
Supabase. Dedicated-canary onboarding and provider-level enable/rollback remain.

- Add NestJS modular-monolith application.
- Add validated configuration, health/readiness endpoints, Supabase identity
  verification, database-backed tenant membership, deny-by-default capability
  guard, PostgreSQL access, Redis, and BullMQ foundation.
- Move one low-blast-radius command: Project update.
- Preserve the existing Server Action contract through a feature-flagged
  adapter.
- Prove tenant scoping, optimistic concurrency, strict boundary validation,
  atomic actor attribution, type safety, tests, and production compilation.
- In the existing clean-database CI job, run the real Nest guards and
  transaction service against PostgreSQL 17, build the production container,
  and smoke it against real PostgreSQL and Redis.
- Keep pnpm 10 dependency overrides in `pnpm-workspace.yaml`; require a frozen
  install with an unchanged reviewed lockfile before CI execution.

Production entry status:

- Complete: the no-cost disposable PostgreSQL/Redis lane is green locally and
  through the approved short-lived self-hosted workflow; paid hosted runners
  are not required for M1 database evidence.
- Complete: repository access and reviewed source publication to
  `Third-Code-Solutions/ERP`.
- Complete: real Supabase Auth identity resolution using consumed one-time
  links without password resets.
- Complete for backend infrastructure: Railway NestJS `/health` and `/ready`
  are green with PostgreSQL and Redis.
- Complete for frontend infrastructure: Vercel production is READY on the
  `4fd1451e756ccb578ed013016d644e5048af6f92` runtime baseline or its
  documentation-only successor, the canonical alias is current, Web Analytics
  is enabled, and desktop/mobile browser gates pass.
- Complete: live missing/invalid 401, malformed 400, Viewer 403, cross-tenant
  404, and stale authorized 409 responses with unchanged Project/audit state.
- Complete: Web-to-Nest UUID correlation and sanitized structured command
  outcomes, including a deployed pre-guard 401 matched in Railway logs.
- Complete: local rollback-selection rehearsal proves exact `false` uses the
  legacy write/audit path and exact `true` uses Nest only. Provider-level
  enable/rollback remains deferred; the hosted flag was never enabled.
- Complete in source: tenant-scoped canary selection requires exact `true` and
  an explicit matching tenant allowlist. Empty, malformed, non-matching, and
  mixed-wildcard values fail closed. Deployment and provider drill remain.
- Complete: read-only hosted target discovery and a redacted Project-cutover
  planner. The current demo tenant is blocked by historical predecessor/hash
  integrity failures; the clean QA tenant is blocked by missing application
  and Auth users. No production flag or data changed.
- Remaining M1 prerequisite: use the existing public signup plus authenticated
  Project-create flow for one user-controlled email identity. Confirm the
  resulting active Auth identity, Admin profile, reversible E2E Project, and
  genesis-rooted chain with
  `pnpm plan:project-cutover -- --require-ready`.
- Complete: one authorized, same-tenant Nest Project update against designated
  demo data, followed by exact-value restoration through a second Nest
  transaction. Both 200 responses correlated to safe Railway command logs;
  Supabase confirmed two actor-attributed audit rows and continuous hashes.
- Complete: hosted database release gate at 50/50 migrations with the
  protected-catalog verifier green and business baselines unchanged.
- Complete locally: clean replay of 50 migrations plus seed, 220/220 database
  tests with no skips, and the Nest transaction-authority integration test
  against disposable PostgreSQL and Redis.
- Complete hosted release: applied and verified the three forward migrations
  `20260727194749`, `20260727194757`, and `20260727194805`.
- Complete emergency database repair: applied forward migration
  `20260728005112` to align the hosted `purchase_order_status` catalog with
  the canonical application contract. Purchase-order and audit baselines are
  unchanged, and the verifier now rejects enum-catalog drift.
- Complete signup hardening: applied `20260729051205` with an empty privileged
  function path, fully qualified objects, deterministic bounded slugs, bounded
  display metadata, and direct execution revoked from client roles. Hosted
  identity/tenant counts remained unchanged.
- Complete onboarding classification persistence: applied
  `20260729054456`, added a constrained non-authoritative tenant organization
  type, safely backfilled existing tenants to `other`, and aligned the shared
  catalog across Web, TypeScript, Drizzle, trigger SQL, tests, and the database
  verifier. Hosted identity/tenant counts remained unchanged.
- Complete Cortex conversation authority: applied `20260729115110`, added an
  immutable optional canonical record-reference pair, reauthorized saved
  context on every read/reply, and revoked authenticated browser writes from
  Cortex conversations and messages. Existing unscoped history remains valid.
- Complete local database evidence for that slice: 51-migration clean replay,
  224/224 zero-skip database tests, authenticated direct-write denial, pair
  constraint enforcement, Nest database integration, and stable rollback
  fingerprint.
- Complete in source: Cortex page focus is server-authorized before entering
  chat; active scope is visible; unavailable focus fails closed; saved history
  is scope-labeled; and only the exact canonical pair restores in place.
- Complete local presentation evidence: context/component/API tests, full
  lint/typecheck/test/build, authenticated production-browser QA at
  1440/768/390, zero overflow/errors, and global test-session revocation.
- Pending activation: include this candidate in one explicitly approved
  consolidated Vercel production build. Do not reconnect Git or create a
  separate preview.
- Complete in source: validated saved-conversation deep links, automatic
  authorized restore, URL synchronization after create/load/new-chat, and
  one-click cross-context history navigation. Latest-request-wins protection
  prevents stale restore responses from replacing newer chat state.
- Complete local proof: pure URL-contract tests, full repository gates, real
  authenticated page/record authorization, deterministic no-write deep-link
  browser restore, responsive overflow checks, clean console, and global
  one-time-session revocation.
- Complete in source: local keyboard-first search over the existing 30
  authorized recent conversations using title and human record-scope labels.
  The UI names the bounded recent scope and exposes no internal identifiers.
- Complete local proof: helper/component tests, full repository gates,
  authenticated mobile search/clear/deep-link browser QA, no overflow or
  console errors, and global one-time-session revocation.
- Complete emergency route proof: authenticated Admin `/dashboard` hard reload
  renders KPI and Risk Signals content with zero browser-console errors;
  Vercel records successful route requests and zero runtime errors in the
  proof window.
- Complete source/provider release: commit
  `42010b9adce6ae89286449edfc1e27c9ffe1eda7` is synchronized to both refs;
  Vercel and Railway released the exact SHA under `kurtgav`.
- Complete in source: the Actionlint bootstrap is pinned to version 1.7.12
  with an exact Linux archive SHA-256. Local Linux validation and pinned
  GitHub Action reference checks pass.
- Complete release evidence: release-tool source commit
  `d4ef08151fa60e62e239c0f049b08b1f83820789` is synchronized to both
  GitHub refs; Vercel production/preview are READY on that SHA. Railway
  recorded a watched-path skip and retains the healthy API artifact from
  `42010b9adce6ae89286449edfc1e27c9ffe1eda7`.
- Complete locally: a no-cost short-lived self-hosted workflow and runner
  bootstrap are implemented. The exact lane passes lint, typecheck, tests,
  production build, 48-migration PostgreSQL 17 replay, 212/212 database tests
  with zero skips, Nest integration and native runtime smoke, stable schema
  fingerprint, and full-history secret scan.
- Complete cost control: Vercel Git is disconnected and repository guard
  `git.deploymentEnabled=false` is published. The guard push created zero
  Vercel deployments; current production remained READY and HTTP 200.
- Complete entry evidence: self-hosted run `30422175962` passed every gate on
  exact SHA `277e03484c00b6c9c6e27bae7d708302bb6d2e88` without remote cache
  or artifact upload. Runner registration and process counts returned to zero;
  credential files were erased.
- Keep `ERP_PROJECT_WRITES_VIA_API=false` and the tenant allowlist empty until
  the dedicated canary passes the read-only cutover planner.
- Exact next action: after explicit email approval, exercise normal signup and
  confirmation, create one reversible non-critical Project, and require a
  zero-blocker planner result. Do not enable routing or request a paid Vercel
  build before that evidence exists.
- Before M2 application code, reconcile the missing-PRD and obsolete-stack
  rules in `AGENTS.md` through a separately reviewed owner-approved governance
  change. Current owner-approved architecture documents remain authoritative.

### Parallel public landing QA correction

Status: source candidate complete; deployment not authorized.

- Preserve the accepted landing architecture and generated image; do not
  rewrite the page.
- Correct the 390px six-line hero to three lines, remove decorative ordinals,
  and enforce 44px visible mobile controls.
- Keep analytics enabled on Vercel while suppressing unavailable Vercel
  telemetry scripts on self-hosted production builds.
- Verify the optimized production build, 1440/768/390 overflow and typography,
  accordion/carousel/FAQ interactions, structured data, and clean console.
- Keep Vercel Git disconnected. Publish source only after all local gates pass;
  request no paid build until the user explicitly approves the disclosed cost.

### Parallel RFQ quote-workflow integrity slice

Status: source and hosted database complete on 2026-07-30; frontend activation
not authorized.

- Replace independent quote/status/audit commits with one row-locked,
  tenant-scoped transaction service.
- Preserve Server Action behavior and visible design while deriving authority
  only from the authenticated profile.
- Persist stable BOM-line identity and tenant-scoped quote submission
  idempotency.
- Enforce tenant-composite quote parents and the explicit RFQ state graph in
  PostgreSQL.
- Recheck complete quote coverage under lock before terminal transition.
- Keep completion notification post-commit and non-authoritative.
- Prove action/service failure paths, exact retry, key conflict, cross-tenant
  denial, audit rollback, invalid transition, clean migration replay, and
  stable schema fingerprint.
- Apply only the reviewed forward migration. Do not reverse the live
  cross-tenant, idempotency, or state-machine constraints.
- Keep Vercel Git disconnected. Include this source in the one consolidated
  production build only after explicit approval.
- Next code slice: add an inert NestJS procurement command adapter for the
  same quote/complete/cancel contract, disabled by default. Do not cut traffic
  until contract, integration, canary, rollback, and provider gates pass.

### M2 — Remove unauthorized worker writes

Status: design complete; application code blocked by M1 and governance gates.

- Contract:
  `docs/architecture/M2_DOCUMENT_PROCESSING_EVIDENCE_CONTRACT.md`.
- M2.1 adds inert shared contracts, database constraints, persisted job and
  evidence state, explicit capabilities, Nest endpoints, and a BullMQ
  processor. It routes no user or production traffic.
- M2.2 removes Python database and Storage service-role authority from the new
  path. Python returns bounded, immutable, hash-linked CAD evidence.
- M2.3 makes NestJS validate and transactionally commit pending-review scope
  rows plus one idempotent draft-BOM result.
- M2.4 adds a Next.js compatibility adapter behind an exact flag and
  database-derived tenant allowlist.
- M2.5 proves one authorized demo-tenant job, duplicate delivery, retry,
  audit, reconciliation, and rollback before expansion.
- M2.6 removes the Python/Inngest write path only after every consumer and
  rollback check passes.
- M2.7 migrates visual/text extraction through the same evidence boundary.
- Keep current user-visible upload result fields and completion summary.
- Do not start M2 application code before M1 canary evidence and separately
  approved repository-governance reconciliation.

### Parallel upload tenant-access hardening

Status: source candidate complete; deployment not authorized.

- Fix shared Project lookup to query tenant and Project ID together.
- Require same-tenant Project existence in upload sign and complete routes
  before quota, Storage, document insert, parsing, AI, or queue work.
- Preserve valid upload response and UI behavior.
- Ship only in one consolidated, explicitly approved Vercel production build.
- Keep M2 composite database constraints as required defense in depth.

### Parallel document mutation authority

Status: source candidate complete; deployment not authorized.

- Add explicit `document.manage` capability for operational roles; deny
  `viewer`.
- Require capability before upload-sign, upload-complete, or document-delete
  side effects.
- Audit signed URL issuance before returning the credential.
- Commit document creation plus audit in one PostgreSQL transaction.
- Commit derived scope deletion, document deletion, and audit in one
  PostgreSQL transaction; run Storage cleanup only after commit.
- Ship only in the existing consolidated, explicitly approved Vercel
  production build. Do not buy a separate build for this candidate.
- Keep M2 composite constraints, durable processing evidence, Nest authority,
  and audit triggers as required later controls.

### M3 — Sensitive project and procurement commands

- Migrate approvals, commitments, purchase orders, and inventory commands one
  workflow at a time.
- Introduce explicit persisted state machines and idempotency for retryable
  transitions.
- Remove each legacy write only after equivalence and rollback validation.

### M4 — Finance authority

- Migrate posting/reversal/allocation commands with exact decimal types,
  balanced-entry constraints, immutable evidence, and serializable transaction
  tests.

### M5 — Async consolidation and legacy retirement

- Move appropriate retryable jobs from legacy schedulers to BullMQ.
- Retire duplicated Next, Inngest, Edge Function, and Python write paths only
  when their consumers and operational runbooks are migrated.

## Per-slice definition of done

- Acceptance criteria and compatibility contract documented.
- Tenant, permission, validation, concurrency, idempotency, audit, and failure
  tests appropriate to the command.
- Lint, typecheck, unit/integration tests, and production build pass.
- Preview runtime, database, queue, and logs verified.
- Feature flag, rollback procedure, and data-reconciliation query exercised.
- Current-state, decisions, work log, and next action updated.

## Consolidated frontend activation

Status: exact source candidate prepared; deployment awaits explicit approval.

- Candidate `36e618274769ef49a18974dbe3bed8f0b4db7edd` contains 33
  reviewed commits after the retained production source.
- All 72 changed Web files are inventoried as 44 runtime and 28 test/E2E files.
- Lint, typecheck, 396 application tests, production builds, combined
  authenticated/public browser regression, secret scan, workflow scan, and
  prohibited-source scan pass.
- Vercel Git remains disconnected. Builds are queued one at a time on Standard
  4 vCPU/8 GB. No preview or production deployment was created.
- Activation, production validation, and rollback are defined in
  `docs/operations/FRONTEND_RELEASE_CANDIDATE.md`.
- Do not deploy until the user explicitly approves the single manual
  production build.

## Parallel permission-aware Today slice

Status: source candidate complete; deployment not authorized.

- Select dashboard data mode from the verified application role before
  invoking any query.
- Preserve the existing executive dashboard only for roles allowed to access
  `/pipeline/board`.
- Give restricted roles tenant- and assignee-scoped pending task counts and
  canonical authorized workspace links.
- Keep the slice read-only. No new mutation, schema, provider, or AI authority.
- Include it in the one approved consolidated frontend build and verify at
  least one executive and one restricted role after activation.

## Parallel Cortex consistency slice

- Keep one 48-type application registry aligned with the versioned database
  enum.
- Derive graph scope, entity-source validation, display metadata, and record
  navigation from the registry instead of maintaining independent maps.
- Preserve tenant-scoped node resolution, non-enumerating permission denial,
  and role-filtered citations.
- Add each future entity only with its source mirror, database authorization,
  application route, and enum-completeness tests.
- Activate this source candidate only in the next explicitly approved
  consolidated Vercel build; do not buy a separate build.

## Parallel Cortex citation navigation slice

Status: source candidate complete; deployment not authorized.

- Preserve the existing `text/plain` chat response while adding bounded
  citation metadata for new answers.
- Rehydrate stored citation IDs using current tenant and role scope before
  rendering history.
- Route visible citations through the canonical 48-type entity registry.
- Omit stale, malformed, cross-tenant, superseded, and forbidden nodes.
- Include this candidate in the next explicitly approved consolidated Vercel
  build. Keep Vercel Git disconnected and do not create a separate preview.
- After activation, verify exact record navigation and role-downgrade behavior
  with authorized Admin, finance, procurement, estimator, sales, and viewer
  sessions.

## Parallel Cortex operational context slice

Status: source candidate complete; deployment not authorized.

- Resolve exact supported dashboard detail routes to canonical Cortex source
  tables in one tested server utility.
- Render one shared context panel after existing page content.
- Preserve existing Project-detail panel without duplication.
- Keep collection, create, edit, print, portal, malformed, and unsupported
  routes unchanged.
- Preserve dashboard RBAC and entity-API tenant/current-role authorization.
- Activate only in the next explicitly approved consolidated Vercel build.
  Keep Git integration disconnected and do not create a separate preview.

## Public-origin portability slice

Status: source candidate complete; deployment not authorized.

- Replace Vercel-specific public URL literals in metadata, structured data,
  robots, and sitemap generation with one validated resolver.
- Preserve the current production hostname as the compatibility fallback.
- Reject malformed, credential-bearing, non-HTTP(S), or path-scoped origins.
- Remove the unverified build-time sitemap `lastModified` value.
- Verify helper precedence/failure behavior, SEO endpoints, structured data,
  desktop/tablet/mobile behavior, console output, overflow, full repository
  gates, and security scans.
- For any future alternative host, set `NEXT_PUBLIC_SITE_URL` before its single
  reviewed production build. Do not reconnect Vercel Git or create a Vercel
  deployment for this source slice.
- Rollback is one source commit. No database, Railway, Supabase, or Vercel
  rollback is required.

## Milestone: inert NestJS RFQ quote command

Status: implementation and local validation complete; activation not authorized.

- Added shared strict command/result contracts and a modular-monolith
  ProcurementModule.
- Preserved the Next.js writer as default and added exact flag plus UUID
  tenant allowlist routing.
- Added fail-closed API transport and retained complete/cancel on Next.js.
- Validated disposable PostgreSQL rollback, tenant isolation, authorization,
  exact retries, conflict behavior, state transition, and audit evidence.
- Next milestone: inspect provider gates, then propose one tenant canary.

Provider inspection complete:

- Exact RFQ adapter commit is healthy on Railway.
- Vercel incurred no new deployment.
- No hosted tenant currently satisfies Auth, role, Project, and genesis-rooted
  audit requirements.
- Do not select either existing tenant. Create a dedicated canary only through
  approved public signup and authenticated Project creation.
- Root `AGENTS.md` reconciliation remains a separate owner-approved governance
  milestone; do not silently apply its obsolete stack rules or edit it without
  sign-off.

## Parallel atomic RFQ-dispatch slice

Status: source and hosted database complete; frontend activation not authorized.

- Preserve the browser action's `{ rfqId } | { error }` compatibility shape.
- Remove caller-controlled system tenant authority and derive manual authority
  from the authenticated server profile.
- Wire current and historical BOM-approval events to one server-only
  transaction service.
- Lock the tenant-scoped BOM and commit retry check, RFQ creation, and audit in
  one transaction.
- Add tenant-composite BOM ownership and one-RFQ-per-tenant/BOM constraints.
- Keep notification post-commit and suppress duplicate retry notification.
- Remove direct browser write privileges for RFQs and quotes while preserving
  authenticated tenant-scoped reads.
- Apply only forward migrations; never edit the 53 applied migration files.
- Move this authority into NestJS later without changing the compatibility or
  integrity contract.

## Parallel permission-safe universal search slice

Status: source candidate complete; deployment not authorized.

- Normalize and cap query input before role-filtered query fan-out.
- Escape PostgreSQL `ILIKE` escape, percent, and underscore characters so
  browser input is always literal.
- Repeat authenticated tenant predicates on every base and joined table.
- Preserve assignee-scoped tasks and the canonical route-based role matrix.
- Mark every search response private/no-store and vary it on the session
  cookie.
- Verify helper behavior, role policy, authenticated normal and literal
  searches, command-palette rendering, 1440/768/390 layouts, console output,
  overflow, and global one-time-session revocation.
- Activate only in the next explicitly approved consolidated Vercel build.
  Keep Git integration disconnected and do not create a separate preview.

## Parallel private Search-to-Cortex handoff slice

Status: source candidate complete; deployment not authorized.

- Preserve the existing permission-filtered record-search path as the default
  command-palette mode.
- Require an explicit Ask mode and prevent it from issuing `/api/search`
  requests.
- Move only a bounded draft through same-tab, opaque, five-minute,
  single-consume browser state; keep prompt text out of URLs and server logs.
- Accept handoff only for company-wide Cortex, clear the marker URL, prefill
  and focus the composer, and never auto-send.
- Verify real authorized search, exact draft transfer, zero search/chat
  requests during handoff, one-time removal, 1440/768/390 layouts, console
  output, overflow, and global one-time-session revocation.
- Activate only in the next explicitly approved consolidated Vercel build.
  Keep Git integration disconnected and do not create a separate preview.

## Parallel atomic public-signing slice

Status: source candidate complete; deployment not authorized.

- Preserve the existing public signing URL, form, token hash, and successful
  response contract.
- Bound and validate PNG input before mutation.
- Resolve tenant and source only from the one-time signing session.
- Upload once, then lock and recheck the exact session inside one database
  transaction.
- Commit document, tenant-scoped source transition, session stamp, and
  nullable-actor entity audit together.
- On replay, create nothing. On database or audit failure, roll back official
  state and remove the uploaded object.
- Verify focused failure/success/replay paths, unauthenticated invalid-token
  rendering, full repository gates, and provider no-deployment state.
- Activate only in the next explicitly approved consolidated Vercel build.
  Use a controlled new canary signing session for production proof; never
  mutate historical demo signatures.
- Later NestJS migration must preserve this contract and cannot return
  transaction authority to Python or the browser.
- After activation, verify one populated and one empty record for each role
  family, exact backlinks, non-enumerating denial, and responsive behavior.

## Parallel Cortex relationship-meaning slice

Status: source candidate complete; deployment not authorized.

- Reuse the existing entity authorization gate and role-filtered context pack.
- Convert canonical edge type plus direction into bounded human labels.
- Return at most 12 relationship rows joined only to already-authorized
  neighbor citations.
- Render canonical backlinks with origin metadata, static fallback, visible
  focus, 44px targets, and responsive two-to-one-column behavior.
- Activate only in the next explicitly approved consolidated Vercel build.
  Keep Git integration disconnected and do not create a separate preview.
- After activation, verify representative incoming/outgoing edges, unknown-edge
  fallback, exact routes, role downgrades, and cross-tenant denial.

## Parallel Cortex evidence-trail slice

Status: source candidate complete; deployment not authorized.

- Reuse existing node provenance already loaded by the authorized context pack.
- Cap retrieval and response at six newest events.
- Normalize provenance server-side to safe kind, label, explanation, and ISO
  timestamp only.
- Never expose actor, internal reference, hash-chain, sequence, tenant, or
  subject identifiers.
- Render a collapsed native disclosure with 44px target, visible focus, UTC
  timestamps, reduced-motion support, and zero horizontal overflow.
- Activate only in the next explicitly approved consolidated Vercel build.
  Keep Git integration disconnected and do not create a separate preview.
- After activation, verify authorized mutation evidence, empty state, role
  downgrade, cross-tenant denial, and raw-field absence in browser responses.

## Parallel Cortex focused-neighborhood slice

Status: source candidate complete; deployment not authorized.

- Preserve the no-query whole-graph contract.
- Accept focus only as a complete registered source table plus UUID.
- Resolve tenant and role exclusively from the authenticated session.
- Reauthorize source/type ownership and role access before neighborhood
  retrieval; use a non-enumerating 404 for missing, mismatched, and forbidden
  records.
- Return a server-derived focus node plus a bounded one-hop neighborhood with
  explicit tenant predicates on focus, edges, and joined neighbors.
- Link operational record context to the focused graph, auto-open the exact
  record, maintain a persistent highlight, and offer a clear route back to the
  whole graph.
- Activate only in the next explicitly approved consolidated Vercel build.
  Keep Git integration disconnected and do not create a separate preview.
- After activation, verify Admin and restricted-role focus, role downgrade,
  cross-tenant denial, invalid focus, exact backlink navigation, and
  1440/768/390 console/overflow behavior.

## Parallel Cortex recent-conversation search slice

Status: source candidate complete; deployment not authorized.

- Filter only the existing bounded authorized history response; do not expand
  the API, database query, or retention boundary.
- Match case- and diacritic-insensitively across conversation title and human
  scope label while preserving server order.
- Keep tenant, user, record UUID, and graph-node identifiers out of searchable
  and visible text.
- Show the recent-count boundary, accessible search/clear controls, bounded
  empty state, visible focus, 44px mobile targets, and zero overflow.
- Activate only in the next explicitly approved consolidated Vercel build.
  Keep Git integration disconnected and do not create a separate preview.

## Portable self-hosted Web runtime slice

Status: source candidate complete; deployment and traffic cutover not
authorized.

- Preserve the existing Next.js application and API behavior.
- Add opt-in standalone output and a non-root Node 22 image without changing
  the default build used by local development or retained Vercel rollback.
- Expose provider-neutral release identity through liveness and readiness.
- Prove the isolated standalone server renders the real landing page and
  returns nonce CSP, canonical robots, sitemap, and manifest output.
- Do not change DNS, Supabase Auth redirects, Vercel settings, Railway
  services, or live traffic in this source slice.
- Before cutover, build the Docker image on a Linux/Docker-capable host, scan
  it, configure the exact canonical hostname and Auth allowlists, then require
  authenticated browser/API/database/log/tenant-isolation evidence.
- Roll back source by reverting this isolated commit. After a later host
  release, roll back to the retained image tag or retained Vercel artifact.

## RFQ terminal NestJS adapter slice

Status: source candidate complete; provider routing disabled.

- Preserve `completeRfq` and `cancelRfq` Server Action behavior.
- Add one strict Nest command route for complete/cancel with server-derived
  identity and `rfq.dispatch`.
- Keep RFQ lock, tenant predicates, state-machine checks, full quote coverage,
  guarded update, and semantic audit in one PostgreSQL transaction.
- Route only through an independent exact flag plus strict tenant allowlist.
  Never fall back after an enabled API attempt.
- Validate shared, HTTP, service, Web adapter, and real PostgreSQL paths,
  including cross-tenant denial, conflict, cancel reason evidence, and
  rollback cleanup.
- Keep all provider flags absent/false. No Vercel build is required.

Rollback: unset the terminal flag/allowlist or revert this source milestone.
No database or provider rollback is required because the adapter reuses the
current integrity schema and remains disabled.
# 2026-07-30 RFQ creation adapter milestone

Status: source implementation and local release gates complete; production
cutover disabled.

- Added strict shared RFQ creation command and durable result contracts.
- Added capability-guarded NestJS `POST /v1/procurement/rfqs`.
- Added tenant-scoped BOM row locking, replay idempotency, contracted-rate
  filtering, atomic RFQ creation, and semantic audit.
- Added an independent Next.js tenant gate with fail-closed no-fallback
  behavior after Nest selection.
- Preserved the existing Server Action response, post-commit notification,
  route revalidation, and background Inngest flow.
- Kept both creation cutover variables unset.
- Completed root lint, typecheck, tests, production build, all 54 migrations,
  236/236 zero-skip database checks, 2/2 Nest integration tests, action
  validation, release-planner tests, secret scanning, and prohibited external
  ERP runtime scanning.

Next migration milestone:

1. Specify the automatic BOM-approved RFQ dispatch contract.
2. Add a NestJS/BullMQ producer-consumer path behind an independent disabled
   tenant gate.
3. Preserve the current trusted event behavior during compatibility mode.
4. Prove retry idempotency, tenant isolation, audit atomicity, dead-letter
   handling, and Redis recovery against disposable PostgreSQL and Redis.
5. Do not enable provider flags or deploy the frontend without explicit
   approval.

## 2026-07-30 approved-BOM RFQ BullMQ milestone

Status: source implementation, all local release gates, and Railway deployment
complete; production cutover disabled.

- Added the original HTTP, job, retry, dead-letter, authority, compatibility,
  and rollback contract before implementation.
- Added protected NestJS enqueue authority with a deterministic
  tenant/BOM/version job ID and strict server-derived payload.
- Added a NestJS BullMQ processor that revalidates membership and capability,
  requires an approved tenant BOM, and reuses the existing atomic RFQ
  transaction.
- Added five-attempt exponential retry and deterministic final dead-letter
  handling.
- Added an independent exact Next.js flag and strict tenant allowlist. The
  current Inngest producer remains selected by default; a selected Nest failure
  never invokes a second producer.
- Proved the full queue contract against disposable PostgreSQL 17 and Redis
  7.4.9, including a real Redis restart.
- Kept both production cutover variables unset. No schema, data, UI, Python,
  Storage, Supabase, or Vercel change was made.

Next migration milestone:

1. Specify an idempotent RFQ notification outbox and delivery contract inside
   the NestJS modular monolith.
2. Commit notification intent atomically with a newly created automatic RFQ;
   replay must not create another intent.
3. Deliver through BullMQ with bounded retry, dead-letter, audit-safe
   observability, and no transaction-finalizing authority outside NestJS.
4. Prove create/replay/failure/recovery behavior with disposable PostgreSQL and
   Redis.
5. Keep automatic RFQ routing disabled until controlled hosted canary,
   reconciliation, monitoring, and rollback receive explicit approval.

## 2026-07-30 RFQ notification outbox milestone

Status: implementation, hosted schema, local release gates, and Railway
deployment complete; production routing disabled.

- Added the original outbox, delivery state-machine, retry, provider
  idempotency, compatibility, and rollback contract before implementation.
- Added atomic automatic-RFQ outbox and same-tenant procurement-recipient
  snapshots.
- Added UUID-only BullMQ delivery jobs, deterministic duplicate suppression,
  five bounded attempts, dead-letter evidence, and opt-in stale recovery.
- Added idempotent in-app delivery and fail-closed Resend delivery using
  server-only configuration.
- Applied the inert server-only migration to the correct Supabase project and
  verified zero rows, closed browser privileges, and validated composite
  constraints.
- Kept automatic routing, tenant allowlist, and recovery-sweep flags disabled.
  Existing Inngest behavior remains authoritative.

Next migration milestone:

1. Do not canary automatic RFQ routing without an explicitly approved clean
   tenant, exact environment diff, baseline, monitoring, reconciliation, and
   rollback.
2. Audit and specify purchase-order creation as the next bounded procurement
   transaction-authority slice.
3. Preserve current API and UI behavior; add one disabled NestJS adapter only.
4. Require tenant constraints, exact money types, permission checks, audit,
   idempotency, and disposable PostgreSQL evidence before any cutover.
5. Create no Vercel build and keep Vercel Git disconnected.

## 2026-07-30 controlled production release milestone

Status: complete; schema was already current, frontend promoted, backend
retained, and automatic Vercel Git deployment disconnected.

- Proved repository and hosted Supabase parity at 55/55. Applied no migration
  because there was no pending SQL.
- Completed sequential lint, typecheck, 444 application tests, the production
  build, Actionlint, immutable action-reference verification, release-planner
  tests, Gitleaks, and the disposable PostgreSQL 17/Redis 7.4.9 lane.
- The disposable lane replayed all 55 migrations, passed 240/240 database
  assertions and 7/7 Nest integration tests, and retained schema fingerprint
  `5429BBD50089170BFCA7E624C928DB6EBEA30E3D2585E26439CEF592710B6E8C`.
- Promoted exact source
  `31c04942a93dce78f165880fb02bdf38d25eb506` through one Vercel preview build
  and one required production-environment rebuild. No deployment was retried.
- Reused the already healthy Railway application deployment because the
  source delta was documentation-only.
- Verified canonical web and API health/readiness, authenticated dashboard
  rendering, zero Vercel runtime errors, zero provider HTTP 5xx, and protected
  RFQ dispatch.
- Disconnected Vercel Git immediately after production verification.

Next migration milestone:

1. Keep all RFQ automatic-routing, allowlist, and notification-sweep flags
   absent/false.
2. Perform the read-only purchase-order transaction-authority audit already
   defined below; do not combine it with another production release.
3. Create no new Vercel deployment until application source changes, all gates
   pass again, and explicit production authorization is recorded.
4. Keep Vercel Git disconnected. Use one reviewed manual release only when a
   frontend change is ready.
5. Preserve Vercel deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt` and Railway
   deployment `50fad0aa-8506-457a-a405-152dc31d2340` as rollback evidence.

## 2026-08-01 purchase-order authority milestone

Status: audit complete; source hardening and disabled Nest contract complete;
no hosted schema or provider deployment performed.

- Audited all PO write entry points, including BOM/grouped/standalone creation,
  cost-code assignment, legacy/current transitions, approvals, issuance, and
  receiving. Confirmed direct Server Action writes remain authoritative.
- Added tenant-derived capability enforcement to existing PO write actions and
  same-tenant project/vendor checks before creation. Added `po.receive` to the
  permission matrix.
- Added strict shared command/result schemas, a Nest pipe, controller, service,
  and tests for `POST /v1/procurement/purchase-orders`. Service fails closed
  and performs no write; route is not selected by any tenant.
- Kept `ERP_PO_CREATE_WRITES_ENABLED=false` by default and did not add it to
  Railway/Vercel environments. No migration was created or applied.
- Full source gates pass: 453 application tests, lint, typecheck, and 77/77
  production pages. Database/Redis disposable lane remains valid from prior
  schema-only release and was not rerun.

Next migration milestone:

1. Design and apply one tenant-composite idempotency table/migration only
   after disposable PostgreSQL proof and hosted parity review.
2. Implement standalone PO transaction in Nest with row locks, same-tenant
   references, budget constraints, semantic audit, and replay tests.
3. Add server-only tenant allowlist gate in Next action, fail closed on API
   outage, and cut over one approved demo tenant with reconciliation.
4. Migrate approval, issuance, receiving, and grouped/BOM creation separately;
   do not combine them into one release.
5. Keep Vercel Git disconnected and create no deployment for this source-only
   backend milestone.
## Milestone: standalone PO idempotency and transaction seam (2026-08-01)

Status: implementation complete locally; production cutover not authorized.

- Added candidate migration 20260801090000 with tenant-composite request
  idempotency and PO-number uniqueness.
- Added Drizzle schema and contract tests.
- Implemented the Nest transaction with locks, bounded integer-centavo math,
  same-tenant validation, semantic audit, and exact replay.
- Added server-only API/Next tenant gates and stable client idempotency keys.
- Hosted Supabase remains 55/55; Vercel Git remains disconnected; no provider
  deployment was created.

Exit criteria still open: replay all 56 migrations against disposable
PostgreSQL 17, prove Redis/readiness and real HTTP transaction cases, reconcile
against hosted schema, then canary one approved tenant with both flags enabled.

## Landing regression milestone (2026-08-01)

Status: complete for source and live evidence; no release was created.

- Added `third-code-landing.test.ts` to protect hero, bento, responsive, and
  accessibility/SEO invariants.
- Captured `docs/research/LIVE_LANDING_AUDIT_20260801.md`, the live
  accessibility snapshot, and the desktop screenshot.
- Browser verification passed at 1440px and 390px with zero console errors;
  full web tests are 298 passed.
- Docker remains unavailable because local hardware virtualization is disabled;
  disposable PostgreSQL/Redis proof was completed through the owned WSL1 lane
  recorded below.

## Disposable authority proof (2026-08-01)

Status: complete locally; hosted cutover still gated.

- Owned Alpine WSL1 lane rebuilt PostgreSQL 17 and Redis 7.4.9 without paid
  services or Docker.
- All 56 migrations applied from zero; release planner reported 56/56 current
  and schema-before/schema-after hashes matched.
- Database tests passed 243/243 without skips; Nest integration passed 7/7,
  including PO idempotency/rollback and BullMQ Redis recovery.
- Remaining gates: read-only hosted Supabase reconciliation, Railway
  readiness/log identity, correct provider account authentication, and a
  reviewed single-tenant canary with both write flags still false by default.

## PO approval workflow authority (2026-08-01)

Status: local implementation and disposable proof complete; hosted migration
and cutover not authorized.

- Added `20260801100000_purchase_order_workflow_idempotency.sql`, Drizzle
  schema, strict shared command/result contracts, Nest pipe/controller/service,
  environment gates, unit tests, and a real PostgreSQL integration test.
- Supported transitions are intentionally bounded: `draft` → PM approval,
  PM approval → Commercial approval, Commercial approval → SCM issuance, and
  rejection back to `draft` from the first two pending states.
- The service performs no email/outbox side effect and does not issue, receive,
  or alter the existing Server Action behavior. This preserves rollback by
  leaving flags false and the legacy path active.
- Validation: 57/57 migrations, 243/243 database assertions, 8/8 Nest/Redis
  integration tests, API focused suite 74/74, shared contracts 17/17, API and
  database typechecks, and root lint passed.

Next exact action: reconcile hosted Supabase read-only against the 57-migration
repository head, authenticate Vercel/Railway as `kurtgav`, then review a
single-tenant canary. Do not enable either workflow flag or deploy this source
before those gates.

Read-only reconciliation completed after this slice: PostgreSQL 17 with
55 applied migrations; repository 57; missing only the two linear candidates
`20260801090000` and `20260801100000`; no unexpected history and no SQL run.

The Next workflow client seam is now implemented and tested (18/18 focused web
tests), but its delegation flag remains absent/false. Do not treat the client
contract as a cutover or as notification parity.

## PO workflow notification parity milestone (2026-08-01)

Status: local implementation and disposable proof complete; hosted cutover not
authorized.

- Added candidate migration `20260801110000_purchase_order_workflow_notifications.sql`
  with strict payload integrity for Purchase Order workflow events.
- Added an independent notification feature gate and tenant allowlist. Nest
  atomically creates role-routed outbox/delivery intent alongside status,
  audit, and idempotency completion. BullMQ validates and delivers in-app or
  Resend email notices with stale/retry/dead-letter protections.
- Full local evidence: 58/58 migrations, 244/244 database assertions without
  skips, 8/8 Nest/Redis integration tests, shared 94, API 79, web 300, root
  typecheck/lint, and 77/77 Next pages. Hosted Supabase remains read-only at
  55/58; no provider release occurred.

Next exact action: keep all PO and notification flags false, review the three
linear hosted candidates and duplicate/constraint evidence, then authenticate
Vercel/Railway as `kurtgav` before any one-tenant canary decision. Do not apply
SQL or deploy while provider sessions are unresolved.

## Read-only canary audit gate (2026-08-01)

The existing demo tenant/project/actor was evaluated without writes on
PostgreSQL 17. Target existence, Supabase Auth identity, project audit
trigger, hardened audit function, and non-public audit function permissions
passed. The cutover planner remains `blocked` because the tenant audit chain
has 2 predecessor-link mismatches and 151 hash mismatches, and the selected
actor lacks `project.update`. No canary, flag enablement, audit repair, hosted
SQL, or deployment is authorized until those findings are separately reviewed.

## Audit hash parity hardening milestone (2026-08-01)

The API and Next server audit writers previously used the shared JSON hash
while the database trigger used its concatenated PostgreSQL timestamp formula.
The shared audit package now exposes a database-compatible helper; both server
writers and chain verification use it, with a fixed parity vector and UTC
timestamp normalization. No migration or historical row rewrite is included.

Validation: focused shared audit tests 17/17; serial repository tests shared
95, database 107 with 137 normal environment-gated skips, web 300, API 79;
disposable PostgreSQL 17/Redis 7.4.9 58/58 migrations, 244/244 DB assertions,
8/8 integration; root typecheck/lint/build and 77/77 Next pages passed. Hosted
forensic review remains read-only and the canary remains blocked by the audit
findings recorded above.

## Read-only audit recovery planner milestone (2026-08-01)

Added `scripts/plan-audit-recovery.mjs` and its pure contract tests. It
requires an explicit tenant UUID, runs a repeatable-read/read-only transaction,
checks PostgreSQL 17 and hardened/non-public audit controls, and reports only
opaque tenant references, counts, timestamps, and system event labels. The
`--require-clear` option exits non-zero while historical mismatches remain.

Validation: audit recovery contract 4/4, database-release contract 7/7,
project-cutover contract 6/6, actionlint passed. Hosted read-only execution
reproduced 661 rows, 2 link mismatches, 151 hash mismatches, UTC timezone, and
`review_required`; no SQL or deployment occurred.

## Audit hash profile verification milestone (2026-08-01)

Added `scripts/verify-audit-hash-profiles.mjs` and contract tests. The tool
reads the selected tenant's immutable audit rows in a repeatable-read/read-only
transaction and classifies only the current PostgreSQL formula, the historical
JSON writer formula, both, or unknown. It prints no entity IDs or business
values and exits non-zero with `--require-current` whenever links or unknown/
legacy profiles remain.

Hosted result: 661 rows; database profile 510, legacy JSON profile 40, unknown
111, broken links 2. Contract tests 3/3 passed; no hosted SQL or deployment
occurred. Unknown rows remain unrepaired and block canary approval.

## Controlled hosted release attempt (2026-08-01)

- Re-ran the read-only planner: PostgreSQL 17, 55 applied migrations, linear
  missing suffix of exactly `20260801090000`, `20260801100000`, and
  `20260801110000`.
- Preflight found one tenant/PO-number duplicate group containing 12 demo
  records. The three migrations were submitted as one transaction; the first
  migration's explicit uniqueness guard rejected the dataset and PostgreSQL
  rolled back. The ledger remains 55/58. No repair, constraint weakening,
  audit rewrite, permission change, feature-flag enablement, or deployment
  followed.
- Next exact action: obtain an approved, reversible remediation for the
  duplicate group; rerun the read-only planner and apply the unchanged three
  migrations atomically only after that decision. Keep provider production
  promotion and all migrated write flags disabled until the audit recovery and
  canary gates also clear.

## Duplicate remediation evidence milestone (2026-08-01)

- Added a read-only Purchase Order duplicate planner with repeatable-read
  isolation, opaque references, bounded groups/records, and a `--require-clear`
  release gate.
- Hosted result: one duplicate tenant/PO-number group, 12 records, one project,
  statuses across draft, PM approval, SCM issuance, and issued. No business
  number or entity ID was printed; no database state changed.
- Contract tests 4/4, actionlint, typecheck, lint, full serial tests, and
  production build passed. Next action is owner approval of a reversible data
  remediation, not weakening the uniqueness migration.

## Clean-room runtime branding milestone (2026-08-01)

- Scanned runtime source and text assets for ABI Ops, ERPNext, and Frappe
  markers; none were found.
- Added a recursive web branding regression test. Rework provenance comments
  remain internal and are not treated as production copy.
- No UI, database, provider, or deployment change occurred; the guard is part
  of the normal web test suite.

## Controlled release gate aggregator milestone (2026-08-01)

Added a provider-neutral, read-only release gate that composes migration
parity, Purchase Order duplicate evidence, audit recovery, and Railway/Vercel
readiness into one explicit result. `--require-clear` fails closed; the tool
cannot apply SQL, enable flags, change provider settings, or deploy.

Validation: controlled gate contract 4/4; existing release, cutover, audit,
hash-profile, and duplicate contracts passed; actionlint, gitleaks, typecheck,
lint, full package tests, and production build (77/77 pages) passed. Hosted
execution remains `review_required` at 55/58 migrations and one 12-record
duplicate group; live readiness checks returned 200. No hosted state changed.

Next action: run the gate with the explicitly approved audit tenant selector
after the owner approves reversible duplicate remediation. Keep all write
flags, tenant allowlists, and provider deployment operations disabled.

## Stock Receipt draft authority milestone (2026-08-01)

Implemented the smallest safe inventory receiving seam without changing the
existing UI or Server Action behavior:

- migration `20260801120000_stock_receipt_create_idempotency.sql`;
- Drizzle table/enums and shared Zod command/result contracts;
- disabled NestJS inventory module, controller, validation pipe, and atomic
  creation service;
- `inventory.manage` capability plus fail-closed API environment flags;
- HTTP, service-boundary, shared exact-arithmetic, migration-contract, and
  disposable PostgreSQL integration coverage.

The disposable lane replayed all 59 migrations and passed its schema verifier,
database tests without skips, and API integration tests. Hosted Supabase was
not mutated: its read-only ledger remains 55/59, with the prior three PO
candidate migrations plus this inventory migration missing. No Railway or
Vercel release was created. The next action is hosted owner-gated data/audit
remediation, not enabling this route.

## Milestone: CAD worker becomes evidence-only (2026-08-01)

Scope: remove the Python worker's direct database write authority while keeping
the existing upload and queued parsing behavior stable.

Changed: worker configuration/dependencies no longer include PostgreSQL;
`src/db.py` was removed; the worker returns `ParseResult` evidence; the web
application validates a shared contract and commits derived scope rows through
one tenant-scoped transaction with exact line totals and audit logging; the
authenticated upload path supplies the actor; Inngest uses the same commit
boundary.

Validation: 4/4 worker-contract tests, 50 web test files/305 tests, web
typecheck/lint, ordered Next production build (77/77 pages), and Python source
compilation. Python pytest remains unavailable because the checkout has no
pytest installation. No hosted SQL or provider deployment was performed.

Next exact action: add a NestJS CAD evidence-commit adapter with the same
contract and transaction tests, then canary it behind a separate false flag;
do not remove the Next compatibility path until parity and rollback evidence
are recorded.

## NestJS CAD evidence-commit adapter (2026-08-01)

Implemented the next smallest authority seam without changing visible UI or
the transitional Next path. Shared Zod contracts bound worker evidence to one
document, one project, 5,000 lines, bounded strings, and safe integer money.
NestJS now has a disabled, capability-guarded command with PostgreSQL-derived
membership, composite tenant references, document-derived replacement,
idempotency replay/conflict handling, exact totals, and semantic audit in one
transaction. The Python worker has no database dependency or ERP write path.

Validation: disposable PostgreSQL 17/Redis 7.4.9 replayed all 60 repository
migrations; 250/250 database assertions executed without skips; 10/10 API
integration assertions passed, including cross-tenant rejection and rollback.
Root tests, typecheck, serial lint, production build (77/77 pages),
Actionlint, Gitleaks, and diff checks passed. Hosted Supabase remains at its
prior ledger; no provider deployment or flag enablement occurred.

Next exact action: keep the Nest flag disabled, review the hosted duplicate PO
and audit recovery blockers, then design a separate canary cutover test before
retiring the Next compatibility path.

## NestJS CAD processing-job intake (2026-08-01)

Implemented the additive M2.1 intake slice: shared contracts and tests;
`document_processing_jobs` Drizzle schema and migration
`20260801140000_document_processing_jobs.sql`; disabled Nest controller,
service, pipe, opaque BullMQ queue, capability/environment gates, and
observability mapping; database integration coverage; and clean-room landing
research artifacts/captures. The route is inert by default and has no worker
bridge; existing Next upload/parsing behavior is unchanged.

Evidence: focused API 105/105; disposable PostgreSQL 17/Redis 7.4.9 replay
61/61 migrations, database 253/253 with zero skips, API integration 11/11.
Full root gates remain the final source milestone check.

Next exact action: add the private Nest-to-Python evidence adapter and durable
worker state transitions behind a separate false bridge flag. Keep intake
false, allowlists empty, and the Next compatibility path active until retry,
stall, idempotency, and canary parity are proven.

## M2.3 signed Nest-to-Python evidence bridge (2026-08-01)

Status: source candidate implemented; activation and hosted release blocked.

- Private `/parse-evidence` accepts only a timestamp/job-bound HMAC request.
- NestJS resolves the tenant-scoped job/document in PostgreSQL, issues a
  short-lived exact-object Storage URL, validates the bounded response, and
  invokes the existing Nest CAD evidence commit transaction.
- BullMQ carries only the opaque job UUID. PostgreSQL claim, retry, terminal
  failure, duplicate delivery, and stale requeue state remain authoritative.
- Python returns source hash, producer identity, deterministic item keys, and
  bounded evidence. It receives no ERP identifiers, database URL, or service
  role for the new path. The old `/parse` endpoint remains compatibility-only.
- `createDraftBom=true` fails closed until an idempotent Nest BOM command is
  implemented; the bridge cannot report a partial success.
- No migration, UI, Next routing, hosted SQL, provider setting, flag, or
  deployment changed in this source slice.

Source validation so far: shared 6/6 focused contract tests, API 111/111
focused/full-package tests, API typecheck, isolated worker pytest 11/11, and
Python compileall. The disposable PostgreSQL 17/Redis 7.4.9 lane passed 61/61
migrations, 253/253 database assertions without skips, 11/11 API integration
assertions, and an unchanged schema hash. Ordered full tests, typecheck,
serial lint, production build, Actionlint, Gitleaks, and diff checks also pass;
all hosted gates remain fail-closed.

## M2.4 durable evidence and draft BOM source candidate (2026-08-01)

Added migration `20260801150000_document_processing_evidence.sql`, strict
Drizzle schema, evidence-attempt persistence, independent draft-BOM gate, and
idempotent Nest draft-BOM transaction. Evidence is persisted before scope
commit; duplicate attempt payloads replay only when hash, producer, formats,
and validated payload match. BOM creation locks the processing job, creates
one draft plus line rows with exact integer totals, attaches `draft_bom_id`,
and writes semantic audit evidence. No Python or browser path can create a
BOM.

Validation: disposable PostgreSQL 17/Redis 7.4.9 lane passed 62/62
migrations, 253/253 database assertions without skips, and 11/11 API
integration assertions. Full workspace gates also passed: shared 114/114,
API 113/113, web 301/301, database 116 passing with 137 environment-gated
local skips, typecheck, serial lint, Nest/Next production build (77/77
pages), Actionlint, Gitleaks, diff checks, and Python worker pytest 11/11.
Activation flags remain false/empty; hosted migration and provider state were
not changed.

## Release evidence update (2026-08-01)

CI run `30707238189` is green for all executable gates, including the clean
schema diff, database assertions, Nest/Redis integration, container smoke, and
production build. E2E remains skipped by explicit credential gating. The
read-only hosted planner still blocks promotion at 55/62 migrations because
the first candidate enforces Purchase Order number uniqueness against a
12-record demo duplicate group; audit recovery also lacks an owner-approved
tenant UUID. Do not apply SQL or deploy this SHA until those inputs are
resolved and the planner is rerun.

## M2.5 processor canary source proof (2026-08-02)

Added `document-processing-processor.database.integration.spec.ts`. The test
exercises the actual Nest processor with the database-backed job state,
signed worker request/response validation, evidence persistence, authority
commit, duplicate delivery, scope reconciliation, semantic audit, and full
rollback. CI run `30708078211` passed all executable gates. This is source
proof only; activation remains blocked by hosted migration drift, duplicate
Purchase Order data, audit-recovery tenant selection, and missing production
E2E credentials.

## M2.5 Redis transport proof (2026-08-02)

Added `document-processing.redis.integration.spec.ts`. The real Redis lane
uses `DocumentProcessingJobQueue`, validates the opaque queue contract, and
proves duplicate enqueue/delivery results in one transport job and one worker
execution. CI run `30708445023` passed this test and the processor canary.
Remaining M2.5 proof is bounded retry/final-failure, stale requeue, and
recovery after Redis loss; production flags remain closed.

## M2.5 recovery completion (2026-08-02)

The source slice now proves bounded BullMQ retry/final-failure, PostgreSQL
stale-claim recovery, and re-enqueue after Redis transport loss. Recovery
resets stale claims in PostgreSQL and feeds at most 100 opaque IDs through the
existing idempotent queue transport. CI run `30709595007` passed the full
executable lane; E2E remains skipped by explicit credential gating.

The recovery entry point remains dormant until a periodic scheduler has
explicit feature and tenant gates, observability, and canary approval. Hosted
schema drift, duplicate Purchase Order data, and the missing audit-recovery
tenant selector still block release promotion.

## Final branch push and release audit (2026-08-02)

Reviewed source and architecture/operations memory are pushed at
`39f6a62c2bf0463ac0fdcf4fe2788cb876f65510`. CI run `30710003798` passed all
executable gates and the production build; E2E is skipped by explicit hosted
credential gating. The read-only planner still reports `review_required` for
55/62 hosted migrations, the 12-record tenant Purchase Order duplicate group,
and the missing approved `AUDIT_RECOVERY_TENANT_ID`. Do not apply SQL or deploy
providers until owner inputs clear those gates.

## M2.6 tenant-scoped recovery scheduler source candidate (2026-08-02)

Added explicit recovery env gates and tenant allowlist intersection, a BullMQ
job scheduler, an opaque scheduler contract, and a Nest processor branch that
rebuilds transport from PostgreSQL state. The query resets stale claims and
returns at most 100 queued IDs only for the approved tenant scope. Local API,
shared, typecheck, lint, build, and diff checks pass; database/Redis integration
requires the CI credential lane. The scheduler remains disabled by default and
must not be enabled until hosted migration, audit, duplicate-PO, and canary
gates clear.

CI run `30711326355` then passed the complete executable lane, including the
Postgres 17/Redis recovery and cross-tenant exclusion proof, production build,
and container smoke. E2E remains skipped by explicit hosted-credential gating.
The read-only hosted planner is still `review_required` at 55/62 migrations;
do not apply SQL or deploy providers until the owner inputs clear it.

## M2.7 Cortex source-grounded search (2026-08-02)

Status: source candidate implemented; hosted release blocked by existing
database-integrity and audit-recovery gates.

- Added a tenant-session-bound `GET /api/cortex/search` keyword route with
  role-derived node-type scope, registry/ref-table validation, source metadata,
  freshness, and safe deep links.
- Added a debounced graph-toolbar result surface. Typing uses only the local
  keyword route; no embedding or LLM call occurs per keystroke, controlling
  Vercel execution and provider spend.
- Hardened shared Cortex ILIKE retrieval by escaping wildcard characters.
- Preserved canonical ERP authority: Cortex search reads derived graph rows and
  cannot approve, mutate, or finalize business transactions.
- Focused Cortex/search/graph tests pass 22/22; full Web tests pass 306/306;
  database tests pass 116 with 137 explicit environment-gated skips;
  workspace typecheck, serial lint, and Next production build pass.

Commit `6d55248110e630ed01c16f903972c8d52ff70af2` is pushed under `kurtgav`.
CI run `30712546507` passed Actionlint, secret scan, typecheck, lint, unit
tests, Postgres 17/Redis reproducibility, and production build; E2E is skipped
by explicit hosted-credential gating. Next exact action: rerun the read-only
controlled-release planner. Do not apply the seven hosted migrations or deploy
Railway/Vercel while it reports the duplicate Purchase Order group or missing
approved `AUDIT_RECOVERY_TENANT_ID`.

## M2.8 RAG suggestion hardening (2026-08-02)

Implemented the smallest safe RAG slice before moving the feature into a
dedicated Nest module: the existing Next compatibility endpoint now derives
tenant and role from the session, gates BOM visibility, bounds provider input,
returns only finite high-confidence approved-history matches, and maps outages
to a safe 503. The client contract remains unchanged for empty and configured
responses; the new `source` field makes provenance explicit. Next step is a
Nest read adapter only after hosted release evidence and API deployment
identity are available.

## M2.8 evidence checkpoint (2026-08-02)

`fa283f94376aacd8f7febd9324b162697571efa1` is the reviewed source candidate.
GitHub Actions run `30713863937` passed all executable gates, including a
zero-to-current Postgres rebuild, empty schema diff, database tests without
skips, Nest transaction integration, container smoke, and production build.
Keep the Next compatibility route in place until the hosted planner clears;
do not apply hosted migrations or deploy providers from this checkpoint.

## M2.9 Python AI advisory worker (2026-08-02)

Status: source candidate implemented; worker deployment and hosted enablement
not authorized.

- Added a standalone FastAPI `/v1/embeddings` worker with private bearer auth,
  bounded input, provider timeout, response-shape/dimension validation, and
  no database or ERP write capability.
- Added a TypeScript worker client and worker-first selection in the shared
  embedding helper. Existing OpenAI TypeScript behavior remains unchanged when
  `AI_WORKER_URL` is absent; partial worker configuration fails closed.
- Updated BOM RAG, auto-BOM, and Inngest refresh gates to use the shared
  provider-availability check.
- Python 6/6 tests, focused Web 10/10 tests, full workspace tests, typecheck,
  lint, build, secret scan, actionlint, and workflow-reference validation pass.
  Docker smoke is pending local Docker engine recovery.

Next: deploy the worker only as a separately reviewed Railway service after
the controlled planner is clear; then run authenticated worker, provider-cost,
tenant-isolation, and exact-release-SHA evidence before enabling the URL.

## M2.9 CI evidence checkpoint (2026-08-02)

Reviewed source candidate `56bb76eb2dc7f4f7f00fbe4690e06323696b0618` passed
GitHub Actions run `30715179369`: static checks, secret scan, full unit suites,
Postgres reproducibility, Nest transaction integration, container smoke, and
production build. E2E remains explicitly skipped by hosted-credential gating.
This green source result does not authorize hosted SQL or provider deployment
while the controlled planner reports integrity blockers.

## M3.0 Change Request authority slice (2026-08-02)

Implemented the smallest safe backend authority seam for US-009. The new
`change_request_create_requests` migration is forward-only and server-only;
its tenant/key uniqueness and composite parent foreign key make retries
deterministic. Nest validates the opportunity and optional design file inside
one transaction, inserts design-role in-app notification intent, and writes a
semantic audit record. `change_request.create` is explicit and mapped to
owner/admin/sales. Next.js receives a client seam only; the existing action
remains live until a reviewed canary.

Validation complete for the source slice: shared 3/3, database 3/3, Nest
5/5, Web client 20/20, environment 11/11, serial API 125/125, workspace
typecheck/lint, production build 78/78 routes, secret scan, actionlint,
workflow refs, and diff checks pass. GitHub Actions run `30717165544` for
commit `765285a57d37885980f01774bffdb27676a203e0` also passed the zero-to-
current Postgres 17 replay, schema diff, database tests without skips, Nest
transaction integration, container smoke, and production build; E2E remains
credential-gated. Do not apply the new migration to hosted Supabase or deploy
providers while the controlled planner remains `review_required`.

## M3.0 database evidence checkpoint (2026-08-02)

Added a disposable PostgreSQL integration contract for the Change Request
authority. It uses a transaction-bound Nest database service and rolls back
all probe rows. The evidence checks two-tenant isolation, viewer denial,
opportunity ownership, idempotent replay, conflicting-key rejection, one
design notification, one semantic audit entry, and zero tenant-B writes.
The local run is explicitly skipped without disposable database credentials;
the source typecheck and serial API suite pass (126 tests, one skipped).

Next: run this integration lane in CI (where Postgres 17 is disposable), then
rerun the read-only hosted planner. Keep the command flags and migration
closed until the planner is `clear` and a tenant canary is approved.

## M3.0 disposable CI evidence checkpoint (2026-08-02)

Commit `77b6e04206a48ff47ffeee5567b56bf3e3195e65` passed CI run
`30718464238`. The Postgres 17 reproducibility lane executed
`change-request.database.integration.spec.ts` with one passing test,
database tests without skips (256/256), migration/schema replay, Nest
transaction/container smoke, and the production build. E2E remains skipped by
the hosted-credential gate. Hosted release remains blocked by the independent
planner and must not be mutated.

## M3.1 web compatibility seam checkpoint (2026-08-02)

Implemented the smallest safe vertical slice in commit `d5ee498`:

- `packages/auth/src/server.ts`: explicit `change_request.create` capability
  with the existing admin/owner/sales role mapping.
- `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.ts`:
  closed-by-default tenant gate to the Nest command; legacy direct write,
  notification, and audit path preserved when disabled.
- `apps/web/src/components/proposal/change-request-form.tsx`: stable per-submit
  idempotency token, reset only after success; no visible UI change.
- `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.test.ts`:
  gated routing, token propagation, and UUID fallback coverage.

Validation passed: 53 web test files / 320 tests, workspace lint, production
build 78/78 routes, actionlint, gitleaks, workflow action references, and
diff checks. No hosted mutation. Next action remains the read-only planner,
then owner-approved data remediation before any flag or provider change.

## M3.1 disposable CI and hosted planner checkpoint (2026-08-02)

GitHub Actions run `30732430851` passed on SHA
`1b3bff1efac5901e34859263f43b1be94835eced`: all executable checks, Postgres
17 zero-to-current replay, database tests without skips (256/256), Nest
transaction/container smoke, and build. E2E stayed skipped by credential
gating. The read-only planner still returns `review_required`; keep the seam
closed and do not apply hosted SQL or deploy providers.

## M3.2 Purchase Order workflow seam checkpoint (2026-08-02)

Implemented commit `fa3c20a`:

- `apps/web/src/app/(dashboard)/procurement/actions.ts`: submit, PM approval,
  and Commercial approval route through the existing Nest workflow client only
  for explicitly allowlisted tenants; direct legacy writes remain fallback.
- `apps/web/src/app/(dashboard)/purchase-orders/[id]/po-status-actions.tsx`:
  stable per-action browser retry keys; no visible copy or layout change.
- `apps/web/src/app/(dashboard)/procurement/actions.workflow.test.ts`: five
  tests for routing, UUID fallback, and fail-closed outage behavior.

SCM issuance and rejection intentionally remain legacy because current Nest
workflow schema/service does not support those states. Validation passed: Web
54 files / 325 tests, workspace typecheck/lint, production build 78/78 routes,
actionlint, gitleaks, workflow-reference checks, and diff checks. No hosted
mutation. Next action: CI evidence, then read-only planner recheck.

## M3.2 CI and planner checkpoint (2026-08-02)

GitHub Actions run `30733168171` passed on final SHA
`1bc232e55fa2f122aea5182b5ca442d536e916d4`: all executable jobs, Postgres 17
zero-to-current replay, database tests without skips (256/256), Nest
transaction/container smoke, and production build. E2E stayed skipped by
credential gating. Planner remains `review_required`; no hosted SQL or provider
deployment is authorized.

## M3.3 — Purchase Order rejection parity (completed source slice)

Scope: route rejection from all pending approval states through the existing
Nest command for explicitly allowlisted tenants; add the forward-only outbox
constraint extension and stable browser idempotency key; retain legacy SCM
issuance until supplier-email side effects are server-owned.

Evidence: source commit `16904f0`; GitHub Actions run `30733959058` passed
Actionlint, lint, secret scan, unit tests, typecheck, fresh Postgres 17 replay
and no-skip database tests, Nest transaction/container smoke, and production
build. E2E remains credential-gated. Local full Web/API/database suites and
build also passed; local database integration is credential-gated.

Release boundary: no hosted SQL or provider deployment. The planner reports
55/64 hosted migrations (nine pending), one 12-record duplicate Purchase Order
group, and missing `AUDIT_RECOVERY_TENANT_ID`. Next slice: design and prove a
supplier issuance outbox contract, then re-run the planner before any canary.

## M3.4 - SCM issuance and supplier outbox (completed source slice)

Scope delivered:

- Add `scm_issue` to the shared workflow contract and Nest state machine with
  `po.issue` capability authorization.
- Keep the existing Next.js SCM action and button stable while routing only
  explicitly allowlisted tenants through Nest with an opaque retry key.
- Create the supplier-issued event and tenant-scoped delivery snapshot in the
  same transaction as status `issued`; never call Resend inside that
  transaction.
- Add separate BullMQ supplier jobs, deterministic job IDs, bounded retries,
  durable dead letters, provider idempotency, `supplier_email_sent_at`, and
  semantic audit evidence.
- Add database schema/migration, contract tests, email/queue/processor tests,
  and disposable Postgres integration coverage for issue, replay, supplier
  outbox, delivery, evidence, and audit.

Evidence: source commits `21a152d` and `52b6288`; CI run `30735228348` passed
all executable jobs, including zero-to-current Postgres 17 replay, no-skip DB
tests, Nest integration/container smoke, lint, typecheck, unit tests, and
production build. E2E remains credential-gated. The first CI attempt
`30735062767` exposed and was fixed for PostgreSQL's nullable-side `FOR UPDATE`
restriction.

Release boundary: the planner is still `review_required` at Supabase 55/65,
with ten unapplied migrations, one 12-record duplicate Purchase Order group,
and missing `AUDIT_RECOVERY_TENANT_ID`. No hosted SQL, provider deployment,
flag, queue, or business-data mutation occurred. Next action: obtain owner
mapping/audit tenant inputs, re-run the read-only planner, then review the
forward-only migration set as one controlled database release.

## M3.5 - Finance journal posting authority (completed source slice)

Scope delivered:

- Add a strict shared journal-post command/result contract and a Nest
  `finance.post` capability with a closed-by-default tenant gate.
- Add tenant-scoped idempotency storage, composite foreign keys, state/result
  checks, forced RLS, and service-role-only privileges in
  `20260802120000_finance_journal_post_idempotency.sql`.
- Move official posting authority into a Nest transaction that locks the
  tenant membership and journal, calls the existing database posting function,
  persists/replays the result, and writes semantic audit evidence. Keep the
  database function as the ledger authority and the Next action as a
  compatibility seam.
- Carry a stable browser retry key without changing visible finance UI.

Evidence: source commit `97106ba`; CI run `30736271967` passed all executable
jobs, including fresh Postgres 17 replay, empty schema diff, no-skip database
tests, Nest transaction/container smoke, unit tests, typecheck, lint, secret
scan, and production build. E2E remains credential-gated. Local serial suites
and build also passed.

Release boundary: no hosted SQL or provider deployment. The read-only planner
now reports 55/66 hosted migrations (eleven pending), one 12-record duplicate
Purchase Order group, zero audit rows, and missing `AUDIT_RECOVERY_TENANT_ID`.
The two finance write gates and tenant allowlists remain false/empty. Next
action: obtain owner data/audit decisions, re-run the planner, then review one
controlled forward migration set before any Railway/Vercel action.

## M3.6 - Cortex external-model privacy boundary (completed source slice)

Scope delivered:

- Add a reusable deterministic redaction policy for direct identifiers and
  apply it to graph prompt context, semantic embedding input, and all chat
  message turns sent to the external model.
- Replace raw Cortex query text in audit metadata with started/completed
  phases, stable prompt/response hashes, model/fallback outcome, redacted
  previews, source counts, and citation counts.
- Preserve tenant/RBAC retrieval, deterministic grounded fallback, durable
  authorized chat history, and the existing public landing design.

Evidence: source commit `08f1315`; focused Cortex tests 10/10, full Web suite
55 files / 332 tests, and Web typecheck passed. No migration was added. No
hosted SQL or provider deployment occurred; the finance and PO write gates
remain closed.

Release boundary: this is source evidence only. Re-run the read-only planner
before any hosted release; current blockers remain 11 pending migrations,
duplicate Purchase Orders, zero audit rows, and missing
`AUDIT_RECOVERY_TENANT_ID`.

CI evidence: run `30736912185` passed all executable jobs for source commit
`08f1315`; Actionlint, typecheck, unit tests, lint, secret scan, the clean
Postgres 17/Redis reproducibility lane (including Nest transaction/container
smoke), and production build all passed. E2E remains skipped by explicit
hosted-credential gating. CI green is not hosted-release authorization.

## M3.7 - CAD processing authority handoff (completed source slice)

Scope delivered:

- Add a closed-by-default Next selector and strict tenant allowlist for the
  binary-DWG canary. Default tenants and non-DWG formats preserve the current
  behavior.
- Delegate selected jobs to Nest/BullMQ through the existing signed
  document-processing contract. If core rejects or is unavailable, return a
  durable processing-unavailable result; never invoke the legacy Next CAD
  writer after core selection.
- Add the authenticated status proxy and bounded browser polling so the
  existing upload surface can show queued, processing, succeeded, or failed
  state without moving business logic into React.

Evidence: commit `0cfb72a`; focused 36/36 tests, full Web 57 files / 342 tests,
lint, typecheck, and production build 78/78 routes passed. GitHub Actions run
`30738075103` is the source candidate gate; E2E remains credential-gated. No
database migration was added and no hosted SQL/provider action occurred.

Release boundary: leave `ERP_DOCUMENT_PROCESSING_VIA_API` and
`ERP_DOCUMENT_PROCESSING_TENANT_IDS` false/empty, together with all API-side
processing, evidence, worker-bridge, and draft-BOM gates. The hosted planner
is still `review_required` at 55/66 migrations with a 12-record duplicate PO
group, zero audit rows, and missing `AUDIT_RECOVERY_TENANT_ID`. After owner
mapping and audit-tenant inputs, re-run the planner, then validate one demo
tenant end to end (queue, signed evidence, scope commit, status polling,
RBAC-negative, audit, readiness, exact SHA, and rollback) before any provider
promotion.

## M3.8 - Stock Receipt creation authority (completed source slice)

Scope delivered:

- Add the Next selector `ERP_INVENTORY_RECEIPT_CREATE_VIA_API` with strict
  `ERP_INVENTORY_RECEIPT_CREATE_TENANT_IDS` allowlisting.
- Route selected Stock Receipt creates through the existing Nest transaction
  contract with normalized nullable fields and fail-closed error handling.
- Carry one opaque browser idempotency key across retries without changing the
  visible receipt form. Add client/action contract tests and environment docs.

Evidence: focused 31/31 tests, full Web 58 files / 348 tests, workspace lint,
Web typecheck, and production build 78/78 routes passed. No database migration
was added and no hosted SQL/provider action occurred. GitHub Actions run
`30739156350` passed all executable jobs on exact SHA
`3f4bca7d6a1416f751599ba268f4c0fad565a73f`; E2E remains credential-gated.

Release boundary: keep both inventory selector variables false/empty. The
hosted planner remains `review_required` at 55/66 migrations, with eleven
pending, one 12-record duplicate Purchase Order group, zero audit rows, and
missing `AUDIT_RECOVERY_TENANT_ID`. After owner mapping and audit-tenant
inputs, re-run the planner and validate one demo tenant (RBAC, PO/warehouse/
delivery binding, micros/cents, idempotent retry, audit, readiness, exact SHA,
and rollback) before any provider promotion.

## M3.9 - Stock Receipt post/reversal authority (completed source slice)

Scope delivered:

- Add strict shared post/reverse commands and result contracts plus Nest
  `inventory.post_receipt` routes with tenant membership/RBAC rechecks.
- Add durable tenant-scoped post/reverse idempotency, composite foreign keys,
  state/result constraints, forced RLS, and service-only privileges in
  `20260802130000_stock_receipt_workflow_idempotency.sql`.
- Keep the existing PostgreSQL posting/reversal functions as numbering, ledger,
  fiscal-period, and state authority. Nest commits the function result,
  idempotency state, and semantic audit in one transaction; exact retries replay
  without a second posting or reversal.
- Add independent Next canary selectors and stable browser retry refs. Selected
  core paths fail closed and never fall back to direct RPCs; visible inventory
  UI/copy/design remain unchanged.

Local evidence: focused shared/API/Web/database contract tests passed; full API
30 files / 140 tests, Web 58 files / 353 tests, and shared 10 files / 123 tests
passed. Workspace lint/typecheck and production build 78/78 routes passed;
Actionlint, Gitleaks, diff checks, and the disposable WSL1 PostgreSQL 17 /
Redis 7.4.9 lane passed 67/67 migrations, 260/260 DB assertions without skips,
and 18/18 Nest/Redis integration assertions. One existing Redis-loss test
flaked once and passed on the immediate retry.

Release boundary: no hosted SQL or provider deployment. Supabase remains at
55 applied migrations while source has 67; the aggregate duplicate-PO report
is 1 group / 12 records and the owner still must provide
`AUDIT_RECOVERY_TENANT_ID`. Railway/Vercel readiness are healthy, but this
planner state keeps every inventory write gate and provider action closed.

Source/CI evidence: commit `6121740ea2a3db189e7cc1c5e83f970db73f6b74` is
pushed under `kurtgav`; CI run `30740581304` passed all executable jobs. The
next gate is read-only hosted planner revalidation, not migration application
or provider deployment.

## M3.10 - BOM-to-Purchase Order authority (completed source slice)

Scope delivered:

- Add strict shared BOM-to-PO commands/results, Nest validation, and the
  tenant-authorized `POST /v1/procurement/purchase-orders/from-bom` boundary.
- Reuse the existing PO-create idempotency table; commit membership/RBAC,
  BOM/project/vendor/line validation, exact cent amounts, PO/line inserts,
  BOM lock, replay result, and semantic audit in one transaction.
- Add independent Next canary/API write gates and a stable browser retry key.
  Selected core failures never invoke the compatibility direct writer. Keep
  the existing grouped-by-supplier flow out of scope.

Validation: local focused contracts and full workspace lint/typecheck/tests pass;
Web and Nest production builds pass; CI run `30741816314` passes all executable
jobs including 67/67 migrations, 260/260 database assertions, Nest integration,
and production build. E2E remains credential-gated.

Release boundary: no migration was added, so no hosted SQL is authorized. Keep
`ERP_PO_BOM_CREATE_WRITES_VIA_API`,
`ERP_PO_BOM_CREATE_WRITES_ENABLED`, and both UUID allowlists false/empty until
the hosted planner, duplicate-PO review, audit-recovery tenant, readiness, exact
SHA, and rollback gates clear. Do not deploy Railway or Vercel for this slice.

## M3.11 - Grouped BOM-to-Purchase Order authority (completed source slice)

1. Define a strict `{ bomId }` command and grouped supplier preview result;
   reject browser-supplied tenant/actor authority.
2. Move rate-card/vendor selection, budget mapping, exact cent math, tenant PO
   numbering, all inserts, BOM lock, replay, and audit into one Nest
   transaction. Reuse the existing PO-create idempotency table and store the
   full grouped result for exact retry replay.
3. Keep Next as a fail-closed compatibility adapter with a stable retry key;
   do not change the existing group-by-supplier UI surface.
4. Prove focused contracts and the complete grouped transaction in the
   disposable PostgreSQL 17/Redis lane before any canary decision.

Evidence: source commit `16b52aa9ff3bc0fe3609e1656a26e5bbe9121840`; CI run
`30742910106` passed every executable job including 67/67 migrations, 260/260
database assertions, Nest integration, and production build. E2E remains
credential-gated. No migration or hosted/provider mutation occurred.

Release gate: keep
`ERP_PO_BOM_GROUPED_CREATE_WRITES_ENABLED`,
`ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS`,
`ERP_PO_BOM_GROUPED_CREATE_WRITES_VIA_API`, and
`ERP_PO_BOM_GROUPED_CREATE_WRITES_VIA_API_TENANT_IDS` false/empty. Re-run the
hosted planner only after the duplicate-PO mapping and audit-recovery tenant
are owner-approved; then validate one disposable/demo tenant canary and
rollback before any Railway/Vercel action.

## M3.12 - Delivery receipt authority (completed source slice)

Scope delivered:

- Add strict `{ notes? }` delivery-receipt command/result contracts and the
  tenant-composite `delivery_workflow_requests` idempotency ledger with forced
  RLS and service-only privileges.
- Add `POST /v1/procurement/deliveries/:deliveryScheduleId/receipt`. Nest now
  rechecks membership and `delivery.receive`, locks the same-tenant delivery,
  permits only `scheduled` or `in_transit`, updates receipt stamps and notes,
  persists the result, and writes semantic audit evidence in one transaction.
- Route only the existing `recordReceipt` Server Action through the new
  command for an exact-`true` plus UUID-allowlisted tenant. Core failures never
  fall back to the direct writer; the existing panel gets one stable opaque
  retry key without a visible design or copy change. Other delivery steps stay
  legacy and unchanged.

Validation: shared/API/Web focused and full unit suites pass; database contract
test, API controller/service tests, API/Web typecheck, workspace lint,
production builds, Actionlint, Gitleaks, release-plan tests, and diff checks
pass. The disposable database integration is present and runs only when the
explicit PostgreSQL integration gate is supplied; local execution skipped it
because no `DATABASE_URL`/`ERP_API_INTEGRATION_EXPECTED` was present.

Release boundary: migration
`20260802140000_delivery_receipt_workflow_idempotency.sql` is source-complete
but not applied to hosted Supabase. Keep
`ERP_DELIVERY_RECEIPT_WRITES_ENABLED`,
`ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS`,
`ERP_DELIVERY_RECEIPT_WRITES_VIA_API`, and
`ERP_DELIVERY_RECEIPT_WRITES_VIA_API_TENANT_IDS` false/empty. Re-run the
read-only hosted planner and obtain owner-approved duplicate-PO mapping plus
`AUDIT_RECOVERY_TENANT_ID` before any SQL or provider action.

Correction evidence: CI run `30744414270` passed the Postgres 17/Redis
delivery integration after the service added a same-tenant schedule preflight;
the earlier run `30744214638` correctly caught the composite-FK/not-found
contract defect. The same run's Build job was blocked by GitHub account
payments/spending-limit state, while all executable source, database, and
container jobs passed. No hosted state changed.

## M3.13 - Finance journal reversal authority (completed source slice)

1. Add strict reason/date/result contracts and a tenant-scoped
   `journal_reverse_requests` idempotency ledger with composite tenant foreign
   keys, forced RLS, and service-only privileges.
2. Add the closed-by-default Nest reversal command. Recheck membership and
   `finance.post`, preflight journal visibility before the ledger claim, lock
   the journal, call `reverse_journal_entry`, persist one exact result, and
   write semantic audit in the same transaction.
3. Route the existing finance Server Action through the command only for an
   exact-`true` plus UUID allowlist. Keep one opaque UI retry key and never
   fall back after a selected core failure; preserve all visible finance UI.
4. Prove contracts, replay, RBAC, tenant isolation, audit, and full database
   behavior in the disposable PostgreSQL 17/Redis lane before any canary.

Evidence: source `441ec74c0c776022c2a41485ff45ae2907dbb3ef` is pushed under
`kurtgav`. Local shared/database/API/Web tests, typecheck, lint, Nest/Web
builds, release-plan tests, Actionlint, Gitleaks, and diff checks passed. The
new integration is explicit-gate skipped locally. GitHub run `30745515593`
was blocked before execution by account payment/spending-limit state, so it is
not source-test evidence.

Release gate: keep all four journal-reversal flags false/empty. Do not apply
`20260802150000_finance_journal_reverse_idempotency.sql`, deploy Railway or
Vercel, or reconnect Vercel Git until the hosted planner, duplicate mapping,
audit-recovery tenant, readiness, exact SHA, rollback, and spend gates clear.

## M3.14 - Delivery inspection-start authority (completed source slice)

1. Extend the existing `delivery_workflow_action` enum with
   `start_inspection`; keep the tenant/idempotency ledger and its forced-RLS,
   service-only boundary unchanged.
2. Add the closed-by-default Nest inspection-start command. Recheck
   membership and `delivery.receive`, preflight tenant visibility, lock the
   `received` schedule, insert a pending inspection, transition to
   `inspecting`, persist the exact result, and write semantic audit in one
   transaction.
3. Route the existing Server Action through Nest only for exact-`true` plus
   UUID-allowlisted tenants. Keep one opaque retry key and fail closed after a
   selected core error; preserve the visible delivery panel.
4. Prove strict contracts, replay/conflict behavior, RBAC, tenant isolation,
   audit, and migration reproducibility before any canary.

Evidence: source `08567b8b4b529f43126925ff67df132e15f71818` is pushed under
`kurtgav`. Local shared/database/API/Web suites, typecheck, lint, Nest/Web
builds, release-plan tests, Actionlint, Gitleaks, and diff checks passed. The
database integration was explicitly invoked but skipped without the guarded
PostgreSQL environment. GitHub run `30746647147` failed before job execution,
so local evidence is authoritative for this slice and hosted promotion stays
gated.

Release gate: keep
`ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED`,
`ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS`,
`ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API`, and
`ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API_TENANT_IDS` false/empty. Do not
apply `20260802160000_delivery_inspection_start_workflow.sql`, deploy Railway
or Vercel, or reconnect Vercel Git until the hosted planner, duplicate-data
mapping, audit-recovery tenant, readiness, exact SHA, rollback, and
spend-bounded provider gates clear.

## M3.15 - Delivery inspection-completion authority (completed source slice)

1. Extend `delivery_workflow_action` with `complete_inspection`; retain the
   existing forced-RLS, service-only, tenant/idempotency ledger.
2. Add the closed-by-default Nest terminal command. Recheck membership and
   `delivery.receive`, preflight tenant visibility, lock the inspecting
   schedule and pending inspection, require defect notes for failure, persist
   the inspection result, transition to accepted/rejected, store exact replay,
   and write semantic audit in one transaction.
3. Route the existing inspection form through Nest only for exact-`true` plus
   UUID-allowlisted tenants. Keep one opaque completion retry key and fail
   closed after a selected core error; preserve visible delivery UI.
4. Prove strict contracts, replay/conflict behavior, terminal-state stamps,
   RBAC, tenant isolation, audit, and migration reproducibility before any
   canary.

Evidence: source `67beedab53680238f785e0947d90588eedd71e3e` is pushed under
`kurtgav`. Local shared/database/API/Web suites, typecheck, lint, Nest/Next
builds, release-plan tests, Actionlint, Gitleaks, and diff checks passed. The
guarded delivery database integration was explicitly invoked but skipped
without the PostgreSQL integration environment. GitHub run `30748096044`
failed before job execution, so hosted promotion stays gated.

Release gate: keep
`ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_ENABLED`,
`ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS`,
`ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API`, and
`ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API_TENANT_IDS` false/empty. Do
not apply `20260802170000_delivery_inspection_complete_workflow.sql`, deploy
Railway or Vercel, or reconnect Vercel Git until hosted planner, duplicate-data
mapping, audit-recovery tenant, readiness, exact SHA, rollback, and
spend-bounded provider gates clear.

## M3.16 - Delivery cancellation authority (completed source slice)

1. Extend the existing `delivery_workflow_action` enum with
   `cancel_delivery`; add nullable cancellation timestamp, actor, and bounded
   reason columns on `delivery_schedules` with a tenant composite foreign key.
2. Add the closed-by-default Nest cancellation command. Recheck membership and
   `delivery.receive`, preflight tenant visibility, claim the existing
   idempotency ledger, lock a cancellable schedule, transition it to
   `cancelled`, persist the exact replay result, and write semantic audit in
   one transaction.
3. Route the existing delivery action through Nest only for exact-`true` plus
   UUID-allowlisted tenants. Keep one opaque retry key and fail closed after a
   selected core error; preserve visible delivery UI and legacy behavior for
   unselected tenants.
4. Prove strict contracts, replay/conflict behavior, RBAC, tenant isolation,
   terminal evidence, audit, and migration reproducibility before any canary.

Evidence: source `e8d4a6c181358756879435a76e8bd5a9317cc751` is pushed under
`kurtgav`. Local shared/database/API/Web suites, typecheck, lint, Nest/Next
builds, release-plan tests, Actionlint, Gitleaks, and diff checks passed. The
guarded PostgreSQL/Redis integration was explicitly invoked but skipped
without its required environment. GitHub run `30749461755` failed before
executable steps because of the external account payment/spending-limit gate.

Release gate: keep
`ERP_DELIVERY_CANCEL_WRITES_ENABLED`,
`ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS`,
`ERP_DELIVERY_CANCEL_WRITES_VIA_API`, and
`ERP_DELIVERY_CANCEL_WRITES_VIA_API_TENANT_IDS` false/empty. Do not apply
`20260802180000_delivery_cancel_workflow.sql`, deploy Railway or Vercel, or
reconnect Vercel Git until hosted planner, duplicate-data mapping,
audit-recovery tenant, readiness, exact SHA, rollback, integration, and
spend-bounded provider gates clear.
# M3.118 Won-to-Project handoff (in progress)

1. Add the shared empty-command/result contract and server-only replay ledger.
2. Implement the Nest transaction with tenant/capability checks, locks,
   contract evidence, project/checklist/notification/audit side effects, and
   exact replay.
3. Add the Web compatibility adapter and keep it disabled by default; never
   fall back after a selected Core failure.
4. Run focused and full local gates, migration-file verification, and a
   read-only controlled-release plan. Keep the new migration source-only until
   hosted parity and owner approval exist.

## M3.117 completed

The Purchase Order duplicate gate has a read-only owner-review template
generator. It writes only to an explicit secure path outside the repository,
refuses overwrite, leaves replacement numbers blank, and never mutates hosted
state.
