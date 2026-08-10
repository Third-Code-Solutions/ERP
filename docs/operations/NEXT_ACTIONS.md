# Next Actions

## Exact next action after M3.226 E2E typecheck cleanup

Start disposable local auth, Web, Core, PostgreSQL, and Storage-compatible
services. Run `E2E_CONTROLLED_UPLOAD=1` with local credentials/storage state;
capture upload progress, request payloads, blocked unexpected Storage calls,
console, page errors, accessibility tree, and responsive screenshots. Do not
use hosted URLs or real provider credentials.

## Exact next action after M3.225 controlled upload fixture

Keep fixture opt-in and localhost-only. Start disposable local auth, Web, Core,
PostgreSQL, and Storage-compatible runtime; provide non-production test
credentials or storage state; run with `E2E_CONTROLLED_UPLOAD=1`. Capture
progress states, request payloads, blocked unexpected Storage calls, console,
page errors, accessibility tree, and desktop/tablet/mobile screenshots. Fix
existing E2E type errors separately before claiming browser gate green. Do not
use hosted URLs or real provider credentials.

## Exact next action after M3.224 Storage contract

Keep production Core selectors false/empty and Supabase/Vercel/Railway spend
lock active. Add a controlled Playwright upload fixture that intercepts the
signed Storage upload and `/api/upload/complete` responses. Assert file-input
selection, preparing/uploading/finalizing/done states, terminal Core warning,
and no unexpected provider requests. Do not use live credentials or deploy.

## Exact next action after M3.223 protected upload-complete runtime

Keep `ERP_CAD_EVIDENCE_COMMIT_WRITES_VIA_API=false` and every Core selector or
tenant allowlist false/empty in production. Add a provider-neutral Storage
contract test against a local HTTP-compatible stub, then exercise the
protected upload flow in a controlled browser fixture. Verify object download,
document recording, parser metadata, Core identity, terminal Core failure, and
no compatibility fallback. Do not touch Supabase, Vercel, or Railway while
the spend lock is active.

## Exact next action after M3.222 parser-to-Core HTTP parity

Keep `ERP_CAD_EVIDENCE_COMMIT_WRITES_VIA_API=false` and every Core selector or
tenant allowlist false/empty. Run the protected Web `/api/upload/complete` path
against disposable PostgreSQL with Storage/session test doubles and Core HTTP;
verify document recording, actual parser output, identity forwarding,
idempotency, replacement, no draft BOM, tenant isolation, rollback, and
terminal Core failure without legacy fallback. Do not touch Supabase, Vercel,
or Railway under the spend lock.

## Exact next action after M3.221 disposable CAD Core replay

Keep `ERP_CAD_EVIDENCE_COMMIT_WRITES_VIA_API=false` and every Core selector or
tenant allowlist false/empty. Feed actual Web `parseCadEvidence` output through
the protected Web/Core HTTP path against disposable PostgreSQL; verify storage
download, parser metadata, identity forwarding, exact totals, replacement,
idempotency, no draft BOM, tenant isolation, and rollback. Do not touch
Supabase, Vercel, or Railway under the spend lock.

## Exact next action after M3.220 CAD response identity parity

Keep `ERP_CAD_EVIDENCE_COMMIT_WRITES_VIA_API=false` and every Core selector or
tenant allowlist false/empty. Run disposable parser-to-Core PostgreSQL replay:
compare response metadata and exact totals, replace only document-owned scope,
replay idempotently, assert no draft BOM, prove tenant isolation, and force a
rollback. Do not touch Supabase, Vercel, or Railway under the spend lock.

## Exact next action after M3.219 protected CAD boundary

Keep `ERP_CAD_EVIDENCE_COMMIT_WRITES_VIA_API=false` and every Core selector or
tenant allowlist false/empty. Run disposable protected Web-to-Core CAD parity,
scope replacement, idempotent replay, draft-BOM separation, and rollback
checks. Capture release identity and readiness before any single-tenant
hosted canary; do not touch Supabase, Vercel, or Railway under the spend lock.

## Exact next action after M3.218 project-comment evidence fix

Keep `ERP_CAD_EVIDENCE_COMMIT_WRITES_VIA_API=false` and every other Core
selector/tenant allowlist false/empty. Run protected Web/Core CAD response
parity, scope replacement, idempotent replay, draft-BOM separation, and
rollback checks. Capture exact release identity and readiness before any
single-tenant hosted canary; do not touch Supabase, Vercel, or Railway while
the spend lock is active.

## Exact next action after M3.217 CAD parser-to-Core boundary

Run root tests/lint/typecheck/build and guards. Keep
`ERP_CAD_EVIDENCE_COMMIT_WRITES_VIA_API=false` and its allowlist empty. When
Docker works, replay direct/Core CAD results on disposable PostgreSQL 17 with
tenant/RLS, scope replacement, idempotency, audit, exact totals, and separate
draft-BOM assertions before any canary or hosted action.

## Exact next action after M3.216 CAD evidence adapter

Push only reviewed source/docs; do not trigger Vercel, Railway, or Supabase.
Keep
`ERP_CAD_EVIDENCE_COMMIT_WRITES_VIA_API=false` and its allowlist empty. Next,
prove parser-to-Core response parity, scope replacement, exact totals,
idempotent replay, auto-BOM separation, and rollback in disposable PostgreSQL
before connecting `upload/complete` for one tenant.

## Exact next action after M3.215 DocuSeal webhook authority

Push only the reviewed source/docs commit as `kurtgav`; do not trigger Vercel,
Railway, or Supabase. Root tests, lint, production build, Web DB-boundary,
migration files-only, workflow refs, provider-spend, and diff checks passed.
When Docker is healthy, replay PostgreSQL 17 + Redis and prove submission
tenant isolation, token/BOM locking, duplicate webhook suppression, audit
hash continuity, and Web/Core response parity before enabling one canary.

## Exact next action after M3.214 notification read-state authority

Root tests, lint, production build, migration files-only, workflow refs, and
spend guards passed. Push only the reviewed source/docs commit as `kurtgav`;
do not trigger Vercel, Railway, or Supabase. Once Docker is healthy,
replay PostgreSQL 17 + Redis and prove notification tenant/recipient isolation,
audit hash continuity, direct/Core response parity, and selected-Core terminal
failure before any canary or hosted action.

## Exact next action after M3.213 Core reconciliation read

Push only the reviewed source/docs commit as `kurtgav`; do not trigger Vercel,
Railway, or Supabase actions while the spend guard is active. Confirm Docker
health, replay PostgreSQL 17 + Redis against the complete source ledger, and
run no-skip RLS/tenant/role checks. Compare direct Web and Core reconciliation
rows, dates, exact cents, statement totals, match counts, and truncation under
protected tenants. Collect release identity, readiness, rollback, and spend
evidence before opening one UUID canary or deploying hosted.

## Exact next action after M3.212 source-safe Cortex chat retrieval

Push only the reviewed M3.212 source/docs commit as `kurtgav`; do not trigger
Vercel, Railway, or Supabase actions while spend controls are active. Once
Docker health is real, replay PostgreSQL 17 + Redis against the complete source
ledger and run no-skip Cortex/RLS tests. Then perform protected browser/API
checks for tenant isolation, role scope, canonical source identity, malformed
rows, deterministic fallback citations, and selected-Core terminal failure.
Collect exact release identity, readiness, rollback, and spend evidence before
opening any canary or deployment.

## Exact next action after M3.211 Web graph compatibility hardening

Run the focused Web graph route tests and root lint/build. Keep all canaries and
hosted provider actions closed. Push only the reviewed source/docs commit.
After Docker health is real, replay PostgreSQL/Redis and compare Core/Web graph
coverage and malformed-row behavior under protected tenants.

## Exact next action after M3.210 resilient graph projection

Keep all hosted/provider/canary flags closed. Docker Desktop processes exist,
but `docker info` does not return within the bounded timeout. Do not force
Supabase, Vercel, or Railway access. Once local Docker health is confirmed,
create disposable PostgreSQL 17 + Redis, replay the full migration ledger, run
no-skip Cortex/RLS tests, and compare canonical table counts with graph nodes.

Then run protected graph/search/entity browser/API checks and collect release
identity, readiness, rollback, and spend evidence before any tenant selector.

## Exact next action after M3.209 shared Cortex source contract

Do not enable any Core canary or call Supabase/Vercel/Railway. Confirm the
local Docker daemon is healthy, then create a disposable PostgreSQL 17 + Redis
runtime, replay the source migration ledger, and run the no-skip Cortex
substrate/RLS suite. Compare canonical source-row counts against current graph
nodes, including universal-search sources.

After replay, run protected API/browser checks for tenant, role, source
identity, malformed payloads, and selected-Core terminal failure. Record exact
release identity, readiness, rollback, and spend evidence before any tenant
selector changes.

## Exact next action after M3.208 Core Cortex source validation

Keep all Core selectors/canaries closed. Restore disposable PostgreSQL 17 and
Redis locally (Docker daemon is currently unavailable), replay the full source
migration ledger, and run the no-skip Cortex substrate/RLS suites. Compare
canonical row counts with current `cortex_nodes` coverage for every registered
source, including the universal-search subset. Do not use Supabase, create a
paid branch, enable a canary, or deploy Vercel/Railway.

Then run protected API/browser checks for tenant isolation, role scope, source
identity, malformed graph rows, and selected-Core terminal failure. Collect
release identity, readiness, rollback, and spend evidence before opening one
exact tenant.

## Exact next action after M3.207 universal-search Core seam

Keep all four flags closed:
`ERP_UNIVERSAL_SEARCH_READS_ENABLED=false`,
`ERP_UNIVERSAL_SEARCH_READS_TENANT_IDS=[]`,
`ERP_UNIVERSAL_SEARCH_READS_VIA_API=false`, and
`ERP_UNIVERSAL_SEARCH_READS_VIA_API_TENANT_IDS=[]`. Do not run `supabase db
push`, repair migration history, create a paid branch, enable a canary, or
deploy Vercel/Railway.

Restore a disposable PostgreSQL 17/Redis runtime and replay the full source
migration ledger. Backfill and compare every graph-indexed search source,
then run no-skip database/API integration plus protected browser checks for
tenant, canonical role, task assignee, capability, malformed source, exact
tenant selection, and terminal selected-Core failure. Collect release identity,
readiness, rollback, and spend evidence before selecting one exact tenant.

Current source validation is recorded in M3.207: serial Turbo tests, typechecks,
lint, production build, boundary/parity/clean-room/spend/release-plan guards
passed; default concurrent `pnpm test` had eight environment-sensitive timeout
files that passed isolated one-worker; DB/RLS integration is still unverified.

## Exact next action after M3.206 universal search contract

Root lint, full tests, production build, clean-room tests, managed-parity
verification, Web DB-boundary verification, and Vercel/Railway spend guard are
green. Source commit `19177d9aeea07b4820c913a3a0ccdfc7daafccc0` is pushed as
`kurtgav`; local and `origin/agent-02/third-code-erp-landing` match. Do not
query or mutate Supabase, repair migration history, create a paid branch,
deploy Vercel/Railway, or open a canary.

After the source push, implement the disabled Nest Core universal-search
read adapter with the same contract, explicit capability/tenant/assignee
scope, exact tenant allowlist, and terminal selected-Core failure. Require
disposable PostgreSQL replay and protected-browser evidence before activation.

## Exact next action after M3.205 parity manifest refresh

Keep managed Supabase status `review_required`; applied boundary remains 55
migrations through `20260729233017`. Source ledger now has 115 migrations
through `20260810110000`, with 60 pending in nine ordered review batches.
Do not run `supabase db push`, repair migration history, create a paid branch,
enable a canary, or deploy Vercel/Railway.

Next: restore or enable a disposable PostgreSQL 17 runtime, replay all 115
migrations, run no-skip database/API integration, catalog/RLS/tenant/audit
checks, and Redis recovery. Then collect backup/PITR, Auth/Storage, exact
release identity, rollback, readiness, browser, and spend evidence. Source
manifest correctness is not hosted parity.

## Exact next action after M3.204 project comment deletion

Keep `ERP_PROJECT_COMMENT_DELETE_WRITES_ENABLED=false`,
`ERP_PROJECT_COMMENT_DELETE_WRITES_TENANT_IDS=[]`,
`ERP_PROJECT_COMMENT_DELETE_WRITES_VIA_API=false`, and
`ERP_PROJECT_COMMENT_DELETE_WRITES_VIA_API_TENANT_IDS=`. Keep the existing
project-comment creation flags false/empty too. Source changes are prepared
and pushed as `00d6a4064c9d6ed99105d02778be508a8b9e7b79` to
`agent-02/third-code-erp-landing` by `kurtgav`; local and remote SHAs match.
No Supabase, Vercel, Railway, provider, browser, or paid action is authorized
under the cost lock.

M3.204 is source evidence only. The migration has not been applied to the
managed database, and real PostgreSQL replay/integration is pending because
WSL virtualization and Docker are unavailable. Once a disposable DB runtime
exists, replay zero-to-current, run no-skip integration, verify RLS/FKs and
ledger replay, then capture exact API/Web release IDs, rollback targets,
readiness, and protected-browser evidence. Do not open a tenant canary or
deploy a new hosted build before those gates and explicit spend review.

## Exact next action after M3.203 project comment authority

Keep `ERP_PROJECT_COMMENT_CREATE_WRITES_ENABLED=false`,
`ERP_PROJECT_COMMENT_CREATE_WRITES_TENANT_IDS=[]`,
`ERP_PROJECT_COMMENT_CREATE_WRITES_VIA_API=false`, and
`ERP_PROJECT_COMMENT_CREATE_WRITES_VIA_API_TENANT_IDS=`. Source commit
`78fb551611a763b7eef14063d1948516935a78eb` is pushed as `kurtgav`; local and
remote branch SHAs match. Disposable zero-to-current replay, composite
tenant/FK, RLS, ledger, browser-DML, and no-skip integration evidence are
complete. No Supabase, Vercel, Railway, provider, browser, or paid action under
the current cost lock.

M3.203 is source evidence only; do not approve a tenant canary until replay,

Exact next action: collect API/Web release identity, rollback, readiness, and
protected-browser evidence; keep hosted migration and canary behind explicit
spend approval.

## Exact next action after M3.202 canonical upload payload

Source push is complete: local and
`origin/agent-02/third-code-erp-landing` both resolve to
`f36cdc9c8c906abd10a6fcab757624855496f13c`; the worktree is clean and the
active GitHub identity is `kurtgav`. Keep
`ERP_DOCUMENT_INTAKE_WRITES_ENABLED=false`,
`ERP_DOCUMENT_INTAKE_WRITES_TENANT_IDS=[]`,
`ERP_DOCUMENT_INTAKE_WRITES_VIA_API=false`, and its tenant list empty. No
Vercel, Railway, Supabase, provider, browser, or paid action under the current
cost lock.

Exact next action: prepare release identity/rollback/readiness evidence. A
hosted non-extractor replay requires explicit spend approval and must remain a
separate controlled milestone.

## Exact next action after M3.201 guarded upload selection

Keep `ERP_DOCUMENT_INTAKE_WRITES_ENABLED=false`,
`ERP_DOCUMENT_INTAKE_WRITES_TENANT_IDS=[]`,
`ERP_DOCUMENT_INTAKE_WRITES_VIA_API=false`, and its tenant list empty. Route
selection now exists but must not be enabled in hosted environments yet.

Run full tests/typecheck/lint/build and release-policy guards. Then collect
exact API/Web release identities, rollback targets, readiness, and one approved
hosted non-extractor replay. Do not enable CAD/AI extractor cutover until its
processing and response parity is separately proven.

## Exact next action after M3.200 replay/parity freeze

Keep `ERP_DOCUMENT_INTAKE_WRITES_ENABLED=false`,
`ERP_DOCUMENT_INTAKE_WRITES_TENANT_IDS=[]`,
`ERP_DOCUMENT_INTAKE_WRITES_VIA_API=false`, and its tenant list empty. Do not
wire `apps/web/src/app/api/upload/complete/route.ts` to the disposable canary.

Run the full source gates and review the exact diff, commit/push the reviewed
branch with `kurtgav`, then capture matching API/Web release IDs, readiness,
rollback targets, and managed-database migration evidence. Only after those
checks and explicit spend approval can one non-extractor tenant be considered.
CAD/AI/visual extraction remains legacy-authoritative until a separate parity
milestone. No Vercel, Railway, Supabase, provider, or paid action under the
current cost lock.

M3.200 is local source/replay evidence only, not hosted database or deployment
approval.

## Exact next action after M3.199 document-intake seam

Keep `ERP_DOCUMENT_INTAKE_WRITES_ENABLED=false`,
`ERP_DOCUMENT_INTAKE_WRITES_TENANT_IDS=[]`,
`ERP_DOCUMENT_INTAKE_WRITES_VIA_API=false`, and its tenant list empty. Do not
wire `apps/web/src/app/api/upload/complete/route.ts` yet.

M3.200: replay the new migration from zero locally, test duplicate keys and
foreign tenant/project prefixes against the real Postgres transaction lane,
freeze legacy upload response parity, and add a disposable Web canary harness.
Only after exact release/rollback identities, readiness, spend, and browser
evidence are reviewed can a single tenant be considered for canary approval.

M3.199 is source contract evidence only, not hosted database or deployment
approval.

## Exact next action after M3.198 Web database-boundary guard

Keep all Core canaries disabled and all hosted/provider actions closed under
the cost lock. Do not add a new direct Next API write or broaden an allowlist
without a migration owner and parity test.

M3.199: specify a tenant-scoped, idempotent Nest document-intake command and
HTTP contract; add protected tests and an unconnected Web adapter. Remove the
`upload/complete` allowlist entry only after local parity, rollback, and
release-identity gates pass. Server Actions/internal service inventory remains
separate.

M3.198 is source policy evidence only, not production authority or deployment
approval.

## Exact next action after M3.197 release identity planner

Keep Core/Web flags disabled with empty exact tenant allowlists. Do not run
Vercel, Railway, Supabase, provider, or paid actions under current cost lock.

M3.198 choice gate: if explicit budget/access approval arrives, collect exact
API/Web release IDs, matching source SHAs, rollback IDs, readiness evidence,
and one controlled browser replay. Otherwise continue source-only reliability,
tenant isolation, and UX work. Never infer hosted identity from local SHA or
HTTP 200 alone.

M3.197 is source release evidence only, not deployment or canary approval.

## Exact next action after M3.196 protected auth boundary

Keep Core/Web owner-context flags disabled with empty exact tenant allowlists.
Do not import the seam into `apps/web/src/app/api/cortex/chat/route.ts`; keep
Supabase, Vercel, Railway, provider, and paid actions closed under the cost
lock.

Next safe source-only milestone: M3.197 capture the exact candidate SHA,
API/Web release identity, readiness/log evidence, and reversible rollback
artifact. Hosted auth/session and cross-tenant replay require explicit budget
and access approval; do not infer them from local synthetic evidence.

M3.196 is local protected-boundary evidence only, not hosted, browser,
deployment, rollback, or spend approval.

## Exact next action after M3.195 protected HTTP harness

Keep Core/Web owner-context flags disabled with empty exact tenant allowlists.
Do not import the seam into `apps/web/src/app/api/cortex/chat/route.ts`; keep
retrieval, conversation writes, generation, semantic indexing, Supabase,
Vercel, Railway, provider, and paid actions closed.

Next safe source-only milestone: M3.196 disposable protected auth/cross-tenant
harness, including verified session principal, foreign tenant concealment,
role scope, release identity, rollback artifact, and no-fallback evidence. Do
not enable tenant or wildcard canary.

M3.195 is local HTTP source evidence only, not hosted, browser, deployment,
rollback, or spend approval.

## Exact next action after M3.194 owner/context parity fixture

Keep `ERP_CORTEX_CONVERSATION_CONTEXT_READS_ENABLED=false` and both exact
tenant allowlists empty. Do not import the seam into
`apps/web/src/app/api/cortex/chat/route.ts`; keep retrieval, conversation
writes, generation, semantic indexing, Supabase, Vercel, Railway, provider,
and paid actions closed under the cost lock.

Next safe source-only milestone: M3.195 protected HTTP parity and selected
Core no-fallback harness, including malformed query, cross-tenant/foreign
ownership, role-forbidden focus, Core 503, strict projection, and rollback
evidence. Do not enable tenant or wildcard canary.

M3.194 is deterministic local source evidence only, not hosted, browser,
deployment, rollback, or spend approval.

## Exact next action after M3.193 owner/context parity seam

Keep `ERP_CORTEX_CONVERSATION_CONTEXT_READS_ENABLED=false` and
`ERP_CORTEX_CONVERSATION_CONTEXT_READS_TENANT_IDS=[]`; keep Web
`ERP_CORTEX_CONVERSATION_CONTEXT_READS_VIA_API=false` with an empty exact
tenant allowlist. Do not import the seam into
`apps/web/src/app/api/cortex/chat/route.ts`; keep retrieval, conversation
writes, generation, semantic indexing, Supabase, Vercel, Railway, provider,
and paid actions closed under the cost lock.

Next safe source-only milestone: M3.194 deterministic parity between the
legacy chat owner/context behavior and the Core resolution, plus a review
packet covering protected roles, cross-tenant/foreign ownership, revoked
focus, 404/409 semantics, rollback, hosted identity, and spend. Do not enable
a tenant or wildcard canary.

M3.193 is local source evidence only, not browser, hosted, deployment,
rollback, or spend approval.

## Exact next action after M3.192 unconnected Web chat seam

Keep `ERP_CORTEX_CHAT_RETRIEVAL_READS_VIA_API` disabled and
`ERP_CORTEX_CHAT_RETRIEVAL_READS_VIA_API_TENANT_IDS` empty. Do not import the
seam from `apps/web/src/app/api/cortex/chat/route.ts`; keep all conversation,
write, generation, semantic, provider, SQL, Supabase, Vercel, and Railway
actions closed under the cost lock. Vercel Git remains disconnected.

Next safe source-only milestone: M3.193 design/test conversation ownership and
focused-record context parity as a separate unconnected server seam. Preserve
current 404/409 behavior, tenant/session/RBAC derivation, idempotency, and
no-fallback rules. Do not enable a tenant or wildcard canary.

M3.192 is source seam evidence only, not browser, hosted, deployment,
rollback, or spend approval.

## Exact next action after M3.191 chat retrieval parity fixture

Keep `ERP_CORTEX_CHAT_RETRIEVAL_READS_ENABLED=false` and
`ERP_CORTEX_CHAT_RETRIEVAL_READS_TENANT_IDS=[]`; keep Web chat direct and
unconnected. Do not query/mutate managed Supabase, build/deploy Vercel or
Railway, call AI/image/provider services, run semantic embeddings, or create
paid resources. Keep every other Cortex flag/allowlist false/empty and Vercel
Git disconnected.

Next safe source-only milestone: M3.192 design an unconnected Web server seam
for chat retrieval plus conversation ownership/context parity. It must select
Core only for an exact tenant, fail closed with no direct fallback, preserve
the current 404/409 owner/context behavior, and remain disabled until
protected role/cross-tenant, rollback, release-identity, and spend evidence
passes. Do not wire the route in that milestone.

M3.191 parity is deterministic source evidence, not production or hosted
activation approval.

## Exact next action after M3.190 Cortex chat retrieval contract

Keep `ERP_CORTEX_CHAT_RETRIEVAL_READS_ENABLED=false` and
`ERP_CORTEX_CHAT_RETRIEVAL_READS_TENANT_IDS=[]`. Keep the Web chat route on
its current direct path; do not add a Core adapter, semantic/provider call,
conversation ownership cutover, SQL migration, hosted Supabase query/write,
Vercel/Railway build/deploy, AI/image/provider call, or paid resource under
the cost lock. Keep every other Cortex flag/allowlist false/empty and Vercel
Git disconnected.

Next safe source-only milestone: M3.191 build a deterministic fixture proving
legacy chat retrieval and the Core projection agree on one tenant, then record
a review-only packet with exact identity, protected role/cross-tenant checks,
rollback, and spend blockers. Do not enable a tenant canary until those gates
and the M3.152 backup/PITR plus isolated 112-migration replay evidence pass.

M3.190 is source authority only, not production or hosted activation approval.

## Exact next action after M3.189 Chat retrieval audit

Keep `ERP_CORTEX_BRIEF_READS_ENABLED=false`,
`ERP_CORTEX_BRIEF_READS_TENANT_IDS=[]`, and the Web Core brief flag disabled
with an empty tenant allowlist. Keep all Cortex generation, worker, provider,
read, queue, conversation, graph, entity, and alert-routing gates false;
provider policies disabled; route credentials unset; and Vercel Git
disconnected. Do not query or mutate managed Supabase, deploy/build Vercel or
Railway, call AI/image/provider services, or create a paid resource under the
cost lock.

Next safe source-only milestone: M3.190 define the bounded chat retrieval
contract and Nest authority. Keep recent/keyword/focused/semantic context
separate, require strict projection/citations/freshness, preserve tenant and
role scope, and fail closed for an exact tenant. Do not implement a canary,
move provider embedding, or widen a write/search/graph flag.

Before any real canary, complete M3.152 backup/PITR and isolated clone replay
of all 112 migrations, then approve one exact tenant, low request/daily micros,
credential scope, reviewed release SHA, live RBAC/cancellation checks, and a
rollback drill. M3.189 is source-only and not activation approval.

## Exact next action after M3.188 Release metadata reconciliation

Keep `ERP_CORTEX_BRIEF_READS_ENABLED=false`,
`ERP_CORTEX_BRIEF_READS_TENANT_IDS=[]`, and the Web Core brief flag disabled
with an empty tenant allowlist. Keep all other Cortex generation, worker,
provider, read, queue, and alert-routing gates false; provider policies
disabled; route credentials unset; and Vercel Git disconnected. Do not query or
mutate managed Supabase, deploy/build Vercel or Railway, call AI/image/provider
services, or create a paid resource under the cost lock.

Next action is external evidence only: owner/provider supplies exact Railway/API
rollback identity, hosted schema/PITR parity, approved tenant identity/RBAC,
and spend ceiling. Local source cannot certify those facts. Do not enable a
tenant or wildcard canary.

Before any real canary, complete M3.152 backup/PITR and isolated clone replay
of all 112 migrations, then approve one exact tenant, a low request/daily
micros policy, credential scope, reviewed release SHA, live RBAC/cancellation
checks, and a rollback drill. M3.188 is local-only and not activation approval.

## Exact next action after M3.187 Exact-tenant brief gate

Keep `ERP_CORTEX_BRIEF_READS_ENABLED=false`,
`ERP_CORTEX_BRIEF_READS_TENANT_IDS=[]`, and the Web Core brief flag disabled
with an empty tenant allowlist. Keep all other Cortex generation, worker,
provider, read, queue, and alert-routing gates false; provider policies
disabled; route credentials unset; and Vercel Git disconnected. Do not query or
mutate managed Supabase, deploy/build Vercel or Railway, call AI/image/provider
services, or create a paid resource under the cost lock.

Next safe source-only action: reconcile local release/rollback metadata in
`CORTEX_BRIEF_CANARY_REVIEW.md`; hosted deployment identity, schema/PITR,
identity/RBAC, rollback artifact, and spend approval remain external blockers.
Do not enable a tenant or wildcard canary.

Before any real canary, complete M3.152 backup/PITR and isolated clone replay
of all 112 migrations, then approve one exact tenant, a low request/daily
micros policy, credential scope, reviewed release SHA, live RBAC/cancellation
checks, and a rollback drill. M3.187 is local-only and not activation
approval.

## Exact next action after M3.186 Cortex brief review packet

Keep `ERP_CORTEX_BRIEF_READS_ENABLED=false`,
`ERP_CORTEX_BRIEF_READS_TENANT_IDS=[]`, and the Web Core brief flag disabled
with an empty tenant allowlist. Keep all other Cortex generation, worker,
provider, read, queue, and alert-routing gates false; provider policies
disabled; route credentials unset; and Vercel Git disconnected. Do not query or
mutate managed Supabase, deploy/build Vercel or Railway, call AI/image/provider
services, or create a paid resource under the cost lock.

Next safe source-only action: close only locally verifiable review gaps in
`CORTEX_BRIEF_CANARY_REVIEW.md`. Hosted schema/PITR, exact tenant identity,
live RBAC, deployment identity, rollback artifact, and spend approval require
explicit owner/provider evidence; do not infer them from local tests.

Before any real canary, complete M3.152 backup/PITR and isolated clone replay
of all 112 migrations, then approve one exact tenant, a low request/daily
micros policy, credential scope, reviewed release SHA, live RBAC/cancellation
checks, and a rollback drill. M3.186 is review-only and not activation
approval.

## Exact next action after M3.185 Dashboard parity

Keep all Cortex generation, worker, provider, read, queue, and alert-routing
gates false; exact-tenant allowlists empty; provider policies disabled; route
credentials unset; and Vercel Git disconnected. Do not query or mutate managed
Supabase, deploy/build Vercel or Railway, call AI/image/provider services, or
create a paid resource under the cost lock.

Next safe source-only milestone: M3.186 prepare a one-tenant canary review
packet containing exact identity, role/RBAC, parity, rollback artifact, request
budget, and spend evidence, but do not enable any flag or hosted action.
No process metrics, exporter, hosted telemetry, external network, deployment,
or provider activation.

Before a real provider canary, complete M3.152 backup/PITR and isolated clone
replay of all 112 migrations, then approve one exact tenant, a low request/daily
micros policy, credential scope, reviewed release SHA, live RBAC/cancellation
checks, and rollback drill. M3.185 is source-only and not activation approval.

## Exact next action after M3.184 Dashboard brief seam

Keep all Cortex generation, worker, provider, read, queue, and alert-routing
gates false; exact-tenant allowlists empty; provider policies disabled; route
credentials unset; and Vercel Git disconnected. Do not query or mutate managed
Supabase, deploy/build Vercel or Railway, call AI/image/provider services, or
create a paid resource under the cost lock.

Next safe source-only milestone: M3.185 add deterministic dashboard parity
fixtures comparing the legacy and normalized Core projections, record exact
identity/RBAC/rollback/spend review evidence, and keep every tenant canary
closed. No process metrics, exporter, hosted telemetry, external network,
deployment, or provider activation.

Before a real provider canary, complete M3.152 backup/PITR and isolated clone
replay of all 112 migrations, then approve one exact tenant, a low request/daily
micros policy, credential scope, reviewed release SHA, live RBAC/cancellation
checks, and rollback drill. M3.184 is source-only and not activation approval.

## Exact next action after M3.183 Cortex brief authority

Keep all Cortex generation, worker, provider, read, queue, and alert-routing
gates false; exact-tenant allowlists empty; provider policies disabled; route
credentials unset; and Vercel Git disconnected. Do not query or mutate managed
Supabase, deploy/build Vercel or Railway, call AI/image/provider services, or
create a paid resource under the cost lock.

Next safe source-only milestone: M3.184 add the dashboard server-component
adapter seam, reuse the strict brief contract, preserve the legacy path for
unselected tenants, fail closed on Core errors, and verify parity, identity,
RBAC, rollback, and spend before any flag. No process metrics, exporter,
hosted telemetry, external network, deployment, or provider activation.

Before a real provider canary, complete M3.152 backup/PITR and isolated clone
replay of all 112 migrations, then approve one exact tenant, a low request/daily
micros policy, credential scope, reviewed release SHA, live RBAC/cancellation
checks, and rollback drill. M3.183 is source-only and not activation approval.

## Exact next action after M3.182 Cortex direct-read fallback inventory

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, Core, queue, and alert-routing gate false; all exact-tenant
allowlists empty; provider policies absent or disabled; route credentials
unset; and Vercel Git disconnected. Do not query or mutate managed Supabase,
deploy/build Vercel or Railway, call an AI/image/provider or external pager, or
create a paid resource under the cost lock.

The next safe source-only milestone is M3.183: define the Cortex brief read
contract and NestJS authority without enabling a tenant canary. Specify stats,
freshness, item bounds, role scope, strict response validation, Web adapter
behavior, parity fixtures, rollback, and spend evidence. Keep chat retrieval
and conversation bootstrap separate; do not treat a write/provider canary as
read approval, and do not add process-metric access, exporter, hosted
telemetry, external network, deployment, provider activation, or public route.

Before any real provider canary, complete M3.152 backup/PITR and isolated
complete-clone replay of all 112 migrations, then approve one exact tenant, one
low request/daily micros policy, credential scope, one reviewed release SHA,
live RBAC/cancellation checks, and a rollback drill. M3.182 is source-only and
not activation approval.

## Exact next action after M3.181 user-facing Cortex search consumer boundary

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, Core, queue, and alert-routing gate false; all exact-tenant
allowlists empty; provider policies absent or disabled; route credentials
unset; and Vercel Git disconnected. Do not query or mutate managed Supabase,
deploy/build Vercel or Railway, call an AI/image/provider or external pager, or
create a paid resource under the cost lock.

The next safe source-only milestone is M3.182: inventory Cortex chat, brief,
and graph direct-read fallbacks before any additional Core read cutover.
Preserve tenant/role scope, strict result projections, process scope, no-tenant
attribution, redaction, retention, rate, sink, spend, release, and rollback
gates. Do not add process-metric access, an authenticated adapter, exporter,
hosted telemetry write, external network, deployment, provider activation, or
public browser route.

Before any real provider canary, complete M3.152 backup/PITR and isolated
complete-clone replay of all 112 migrations, then approve one exact tenant, one
low request/daily micros policy, credential scope, one reviewed release SHA,
live RBAC/cancellation checks, and a rollback drill. M3.181 is source-only and
not activation approval.

## Exact next action after M3.180 operational adapter consumer ownership audit

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, Core, queue, and alert-routing gate false; all exact-tenant
allowlists empty; provider policies absent or disabled; route credentials
unset; and Vercel Git disconnected. Do not query or mutate managed Supabase,
deploy/build Vercel or Railway, call an AI/image/provider or external pager, or
create a paid resource under the cost lock.

The next safe source-only milestone is M3.181: review user-facing Cortex/ERP
search consumer boundaries. Preserve `consumer: none_registered`, all nine
trigger reviews, process scope, no-tenant attribution, redaction, retention,
rate, sink, spend, release, and rollback gates. Do not add process-metric
access, an authenticated adapter, exporter, hosted telemetry write, external
network, deployment, provider activation, or public browser route.

Before any real provider canary, complete M3.152 backup/PITR and isolated
complete-clone replay of all 112 migrations, then approve one exact tenant, one
low request/daily micros policy, credential scope, one reviewed release SHA,
live RBAC/cancellation checks, and a rollback drill. M3.180 is source-only and
not activation approval.

## Exact next action after M3.179 fail-closed operational adapter trigger conditions

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, Core, queue, and alert-routing gate false; all exact-tenant
allowlists empty; provider policies absent or disabled; route credentials
unset; and Vercel Git disconnected. Do not query or mutate managed Supabase,
deploy/build Vercel or Railway, call an AI/image/provider or external pager, or
create a paid resource under the cost lock.

The next safe source-only milestone is M3.180: review evaluator consumer
ownership. Preserve all nine reviews, advisory-only eligibility, process
scope, no-tenant attribution, redaction, retention, rate, sink, spend,
release, and rollback gates. Do not add a consumer, authenticated adapter,
exporter, hosted telemetry write, external network, deployment, provider
activation, or public browser route.

Before any real provider canary, complete M3.152 backup/PITR and isolated
complete-clone replay of all 112 migrations, then approve one exact tenant, one
low request/daily micros policy, credential scope, one reviewed release SHA,
live RBAC/cancellation checks, and a rollback drill. M3.179 is source-only and
not activation approval.

## Exact next action after M3.178 operational snapshot ownership and release evidence

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, Core, queue, and alert-routing gate false; all exact-tenant
allowlists empty; provider policies absent or disabled; route credentials
unset; and Vercel Git disconnected. Do not query or mutate managed Supabase,
deploy/build Vercel or Railway, call an AI/image/provider or external pager, or
create a paid resource under the cost lock.

The next safe source-only milestone is M3.179: review adapter trigger
conditions. Preserve the named ERP backend owner, exact Git SHA release
identity, last-known-good rollback artifact, process scope, no-tenant
attribution, redaction, retention, rate, sink, spend, and deployment gates. Do
not add an authenticated adapter, exporter, hosted telemetry write, external
network, deployment, provider activation, or public browser route.

Before any real provider canary, complete M3.152 backup/PITR and isolated
complete-clone replay of all 112 migrations, then approve one exact tenant, one
low request/daily micros policy, credential scope, one reviewed release SHA,
live RBAC/cancellation checks, and a rollback drill. M3.178 is source-only and
not activation approval.

## Exact next action after M3.177 deployment observability access-policy audit

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, Core, queue, and alert-routing gate false; all exact-tenant
allowlists empty; provider policies absent or disabled; route credentials
unset; and Vercel Git disconnected. Do not query or mutate managed Supabase,
deploy/build Vercel or Railway, call an AI/image/provider or external pager, or
create a paid resource under the cost lock.

The next safe source-only milestone is M3.178: review operational snapshot
ownership and release evidence. Preserve the frozen policy, module-boundary
test, process scope, no-tenant attribution, redaction, retention, rate, sink,
spend, and deployment gates. Do not add an authenticated adapter, exporter,
hosted telemetry write, external network, deployment, provider activation, or
public browser route.

Before any real provider canary, complete M3.152 backup/PITR and isolated
complete-clone replay of all 112 migrations, then approve one exact tenant, one
low request/daily micros policy, credential scope, one reviewed release SHA,
live RBAC/cancellation checks, and a rollback drill. M3.177 is source-only and
not activation approval.

## Exact next action after M3.176 backend-only operational snapshot seam

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, Core, queue, and alert-routing gate false; all exact-tenant
allowlists empty; provider policies absent or disabled; route credentials
unset; and Vercel Git disconnected. Do not query or mutate managed Supabase,
deploy/build Vercel or Railway, call an AI/image/provider or external pager, or
create a paid resource under the cost lock.

The next safe source-only milestone is M3.177: audit snapshot access against
deployment observability policy. Any authenticated adapter must define exact
caller authorization, process-versus-tenant scope, redaction, retention,
rate limits, and cost controls before code binds the snapshot to a route or
exporter. Do not add external network, hosted telemetry writes, deployment,
provider activation, or a public browser route.

Before any real provider canary, complete M3.152 backup/PITR and isolated
complete-clone replay of all 112 migrations, then approve one exact tenant, one
low request/daily micros policy, credential scope, one reviewed release SHA,
live RBAC/cancellation checks, and a rollback drill. M3.176 is source-only and
not activation approval.

## Exact next action after M3.175 local post-commit enqueue observability

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, Core, queue, and alert-routing gate false; all exact-tenant
allowlists empty; provider policies absent or disabled; route credentials
unset; and Vercel Git disconnected. Do not query or mutate managed Supabase,
deploy/build Vercel or Railway, call an AI/image/provider or external pager, or
create a paid resource under the cost lock.

The next safe source-only milestone is M3.176: review a read-only operational
snapshot seam for the fixed-cardinality post-commit/recovery enqueue counters.
Keep snapshot access backend-only or explicitly authenticated; expose no
tenant IDs, event keys, alert payloads, credentials, or raw transport errors.
Do not add an exporter, hosted telemetry write, external network, deployment,
provider activation, or public browser route until security and cost review.

Before any real provider canary, complete M3.152 backup/PITR and isolated
complete-clone replay of all 112 migrations, then approve one exact tenant, one
low request/daily micros policy, credential scope, one reviewed release SHA,
live RBAC/cancellation checks, and a rollback drill. M3.175 is source-only and
not activation approval.

## Exact next action after M3.174 post-commit enqueue wiring

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, Core, queue, and alert-routing gate false; all exact-tenant
allowlists empty; provider policies absent or disabled; route credentials
unset; and Vercel Git disconnected. Do not query or mutate managed Supabase,
deploy/build Vercel or Railway, call an AI/image/provider or external pager, or
create a paid resource under the cost lock.

The next safe source-only milestone is M3.175: add bounded local metrics for
post-commit enqueue success/failure and recovery fallback. Preserve the alert
ledger as the transactional outbox, event-key idempotency, tenant scope,
bounded retries, stale recovery, and stable failures. Do not add external
network, paging credentials, hosted writes, deployment, or provider activation.

Before any real provider canary, complete M3.152 backup/PITR and isolated
complete-clone replay of all 112 migrations, then approve one exact tenant, one
low request/daily micros policy, credential scope, one reviewed release SHA,
live RBAC/cancellation checks, and a rollback drill. M3.174 is source-only and
not activation approval.

## Exact next action after M3.173 disabled-by-default BullMQ alert delivery

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, Core, queue, and alert-routing gate false; all exact-tenant
allowlists empty; provider policies absent or disabled; route credentials unset;
and Vercel Git disconnected. Do not query or mutate managed Supabase,
deploy/build Vercel or Railway, call an AI/image/provider or external pager, or
create a paid resource under the cost lock.

The next safe source-only milestone is M3.174: wire opened/recovered alert
observations to a post-commit enqueue seam with an explicit transactional
outbox boundary and local fake proof. Preserve event-key idempotency, tenant
scope, durable claims, bounded retries, stale recovery, and stable failures.
Do not add external network, paging credentials, hosted writes, deployment, or
provider activation.

Before any real provider canary, test-fire approved external alert routing,
complete M3.152 backup/PITR and an isolated complete-clone replay of all 112
migrations, then approve one exact tenant, one low request/daily micros policy,
credential scope, one reviewed release SHA, live RBAC/cancellation checks, and
a rollback drill. M3.173 proves local queue transport only; it is not
activation approval.

## Exact next action after M3.172 durable claim-to-route orchestration

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, Core, alert-routing, and queue gate false; all exact-tenant
allowlists empty; provider policies absent or disabled; route credentials unset;
and Vercel Git disconnected. Do not query or mutate managed Supabase,
deploy/build Vercel or Railway, call an AI/image/provider or external pager, or
create a paid resource under the cost lock.

The next safe source-only milestone is M3.173: add a disabled-by-default
BullMQ alert delivery job seam with deterministic event-key job identity,
bounded backoff, stale-job handling, and local fakes. Preserve durable claim
state and stable failure codes. Do not add external network, paging
credentials, hosted writes, deployment, or provider activation.

Before any real provider canary, test-fire approved external alert routing,
complete M3.152 backup/PITR and an isolated complete-clone replay of all 112
migrations, then approve one exact tenant, one low request/daily micros policy,
credential scope, one reviewed release SHA, live RBAC/cancellation checks, and
a rollback drill. M3.172 proves local durable delivery only; it is not
activation approval.

## Exact next action after M3.171 provider-neutral alert routing

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, Core, and alert-routing gate false; all exact-tenant allowlists
empty; provider policies absent or disabled; route credentials unset; and
Vercel Git disconnected. Do not query or mutate managed Supabase, deploy/build
Vercel or Railway, call an AI/image/provider or external pager, or create a
paid resource under the cost lock.

The next safe source-only milestone is M3.172: connect durable alert claims to
the provider-neutral adapter seam. Preserve tenant/policy scope, event-key
idempotency, delivered/failed ledger state, stale-claim recovery, and stable
failure codes. Use local fakes only. Do not add external network, paging
credentials, hosted writes, deployment, or provider activation.

Before any real provider canary, test-fire approved external alert routing,
complete M3.152 backup/PITR and an isolated complete-clone replay of all 112
migrations, then approve one exact tenant, one low request/daily micros policy,
credential scope, one reviewed release SHA, live RBAC/cancellation checks, and
a rollback drill. M3.171 proves credential-free routing conformance only; it is
not activation approval.

## Exact next action after M3.170 durable circuit alerts

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, and Core gate false; all exact-tenant allowlists empty; provider
policies absent or disabled; credentials unset; and Vercel Git disconnected.
Do not query or mutate managed Supabase, deploy/build Vercel or Railway, call
an AI/image/provider or external pager, or create a paid resource under the
cost lock.

The next safe source-only milestone is M3.171: define provider-neutral alert
routing adapter conformance and strict credential isolation using local fakes.
Prove event-key idempotency, bounded payload forwarding, tenant/policy scope,
failure classification, and no raw secret/error persistence. Do not connect a
real pager, add production credentials, or activate a provider.

Before any real provider canary, test-fire approved external alert routing,
complete M3.152 backup/PITR and an isolated complete-clone replay of all 112
migrations, then approve one exact tenant, one low request/daily micros policy,
credential scope, one reviewed release SHA, live RBAC/cancellation checks, and
a rollback drill. M3.170 proves local durable alerting only; it is not
activation approval.

## Exact next action after M3.169 provider health/circuit authority

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, and Core gate false; all exact-tenant allowlists empty; provider
policies absent or disabled; credentials unset; and Vercel Git disconnected.
Do not query or mutate managed Supabase, deploy/build Vercel or Railway, call
an AI/image/provider, or create a paid resource under the cost lock.

The next safe source-only milestone is M3.170: define durable circuit alert
transitions and deduplication from aggregate provider evidence, with a local
fake sink only. Prove one alert per open transition, one recovery event after a
successful probe, exact tenant/provider/model scope, retry idempotency, and no
prompt/response/credential or external network call. Do not add production
paging credentials or activate a provider.

Before any real provider canary, test-fire approved external alert routing,
complete M3.152 backup/PITR and an isolated complete-clone replay of all 111
migrations, then approve one exact tenant, one low request/daily micros policy,
credential scope, one reviewed release SHA, live RBAC/cancellation checks, and
a rollback drill. M3.169 proves local spend control only; it is not activation
approval.

## Exact next action after M3.168 provider protocol

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, and Core gate false; all exact-tenant allowlists empty; provider
policies absent or disabled; credentials unset; and Vercel Git disconnected.
Do not query or mutate managed Supabase, deploy/build Vercel or Railway, call
an AI/image/provider, or create a paid resource under the cost lock.

The next safe source-only milestone is M3.169: derive tenant/provider/model
spend, remaining budget, success/error count, unknown outcomes, and bounded
latency from durable provider attempts without prompts or response payloads.
Nest must stop new reservations/dispatch through an automatic fail-closed
circuit-breaker authority when configured thresholds are exceeded. Prove exact
tenant scope, concurrent behavior, recovery/reset authority, audit, and no
provider call with in-memory fakes and local PostgreSQL only.

Before any real provider canary, complete M3.152 backup/PITR and an isolated
complete-clone replay of all 110 migrations. Separately approve one exact
tenant, one low request/daily micros policy, credential scope, alerts, one
reviewed release SHA, live RBAC/cancellation checks, and a rollback drill.
M3.168 proves protocol integrity only; it is not activation approval.

## Exact next action after M3.167 provider completion authority

Keep every Cortex generation, worker, provider-execution, provider-budget,
recovery, Web, and Core gate false; every exact-tenant allowlist empty; every
provider policy absent or disabled; credentials unset; and Vercel Git
disconnected. Do not query or mutate managed Supabase, deploy/build Vercel or
Railway, call an AI/image/provider, or create a paid resource under the current
cost lock.

The next safe source-only milestone is M3.168: define a provider-neutral
request/response boundary without a production network adapter. Nest must build
one bounded redacted evidence envelope, derive deterministic dispatch
idempotency from the immutable reservation, accept only bounded output and an
opaque provider receipt, classify timeout/retryable/terminal outcomes, and
prove that retries do not dispatch an attempt twice. Audit and logs must never
contain prompts or raw provider payloads. Use an in-memory fake only.

Before any real provider canary, complete M3.152 backup/PITR and an isolated
complete-clone replay of all 109 migrations. Separately approve one exact
tenant, one low request/daily micros policy, credential scope, spend/latency/
error observability and alerts, one reviewed release SHA, live RBAC and
cancellation checks, and a rollback drill. M3.167 proves completion
provenance only; it is not activation approval.

## Exact next action after M3.166 provider orchestration proof

Keep every Cortex generation, worker, provider-execution, provider-budget, Web,
and Core gate false; every exact-tenant allowlist empty; every provider policy
absent or disabled; credentials unset; and Vercel Git disconnected. Do not
query or mutate managed Supabase, deploy/build Vercel or Railway, call an
AI/image/provider, or create a paid resource under the current cost lock.

The next safe source-only milestone is M3.167: define an explicit
provider-grounded assistant completion contract and immutable linkage from the
official completion to exactly one settled provider attempt for the current
job attempt. Nest must atomically verify tenant/job/attempt identity, settled
state, bounded cost, authorized citations, and the current claim fence before
official commit. Keep the production adapter unavailable and add no credential,
public activation endpoint, hosted write, or paid call.

Before any real provider canary, complete M3.152 backup/PITR and an isolated
complete-clone replay of all 108 migrations. Then separately approve one exact
tenant, one low request/daily micros policy, a credential-scoped adapter,
spend/latency/error observability with alerts, one reviewed release SHA, live
RBAC/cancellation verification, and a rollback drill. M3.166 proves fake
orchestration only; it is not activation approval.

## Exact next action after M3.165 provider budget authority

Keep every Cortex provider/Core/Web/worker/recovery gate false, every exact-
tenant allowlist empty, every policy absent or disabled, provider credentials
unset, and Vercel Git disconnected. Do not query or mutate managed Supabase,
deploy/build Vercel or Railway, call an AI/image provider, or create a paid
resource under the current cost lock.

The next safe source-only milestone is M3.166: add a fake-provider Nest
orchestration and recovery proof around the new reservation state machine. It
must demonstrate reserve-before-dispatch, exact retry replay, cancellation and
failure release, dispatched-attempt settlement, stale-worker fencing, and
reconciliation of non-terminal reservations without network/provider access.
Redis may transport opaque work only. Python remains advisory and cannot
reserve, approve, settle, release, or commit official ERP state.

Before any real provider canary, complete M3.152 backup/PITR and an isolated
complete-clone replay of all 108 migrations. Then separately approve one exact
tenant, one disabled-to-enabled policy with low request/daily micros ceilings,
one credential-scoped provider adapter, observability/alerts, one release SHA,
and a rollback drill. M3.165 is budget infrastructure, not activation approval.

## Exact next action after M3.164 protected browser certification

Keep all M3.160-M3.163 Core/Web/worker/recovery gates false, exact-tenant
allowlists empty, worker/provider secrets unset, and Vercel Git disconnected.
Do not query or mutate managed Supabase, deploy/build Vercel or Railway, call an
AI/image provider, or create a paid resource under the current cost lock.

The next safe source-only milestone is M3.165: define the Nest-owned provider
attempt budget/reservation contract without calling a provider. PostgreSQL must
record tenant/job/attempt idempotency, exact reserved/consumed cost units,
bounded daily/request ceilings, terminal release/settlement, and audit. Nest
must reserve before dispatch and refuse over-budget work. Redis transports only
opaque job identity; Python may return bounded analysis but cannot reserve,
approve, settle, or commit ERP state. Every new flag defaults false and every
allowlist empty.

Before any managed Cortex canary, the owner must separately complete M3.152
backup/PITR proof and an isolated complete-clone replay of all 107 migrations,
then approve one exact tenant, one low spend ceiling, one release action, exact
SHA verification, live RBAC/cancellation checks, observability, and rollback.
The M3.164 local proof does not waive those gates.

## Exact next action after M3.163 asynchronous Cortex handoff

Keep all M3.160-M3.163 Core/Web/worker/recovery gates false, exact-tenant
allowlists empty, and the worker URL/secret unconfigured. Do not change managed
state. Build a local-only protected-browser proof using the disposable
PostgreSQL 17/Redis lane, rejecting loopback Auth contract, local Nest, local
Next, and local provider-free Python worker.

The proof must cover:

- one `202` start followed by pending and final same-bubble text/citations;
- private/no-store headers and exact same-origin opaque job location;
- no browser direct database write or foreign/provider request;
- no Next request held open for worker completion;
- new-chat and unmount abort with one cancellation;
- ten-poll timeout cancellation and honest error state;
- foreign user/job concealment and current role/context/citation revocation;
- responsive desktop/mobile behavior, keyboard flow, zero console/page errors,
  and unchanged legacy stream behavior with the gate false.

After proof, stop local services, drop only the disposable database, and remove
generated artifacts. Managed Supabase remains last verified at 55/107. Before
any exact-tenant canary, the owner must finish M3.152 backup/PITR proof and an
isolated complete-clone replay. Rollback remains every Cortex rollout flag
false; do not down-migrate.

Do not reconnect Vercel Git, run Vercel/Railway builds or deployments, apply
hosted SQL, mutate hosted Auth/Storage/data, create paid resources, or call
AI/image providers without explicit cost and release approval.

## Exact next action after M3.162 provider-free Cortex generation jobs

Keep these new gates closed and exact-tenant allowlists empty:

```text
ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED=false
ERP_CORTEX_ASSISTANT_GENERATION_JOBS_TENANT_IDS=
ERP_CORTEX_ASSISTANT_GENERATION_WORKER_ENABLED=false
ERP_CORTEX_ASSISTANT_GENERATION_WORKER_TENANT_IDS=
ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_ENABLED=false
ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_TENANT_IDS=
ERP_CORTEX_ASSISTANT_GENERATION_JOBS_VIA_API=false
ERP_CORTEX_ASSISTANT_GENERATION_JOBS_VIA_API_TENANT_IDS=
```

Also keep the M3.160/M3.161 user-turn and assistant-turn gates closed. Managed
Supabase was not refreshed; its last verified ledger is 55 versus 107 source
migrations. The database owner must finish M3.152 backup/PITR proof. Then replay
all 107 migrations on an isolated complete clone and run one exact-tenant,
private-worker canary covering two users and every role: duplicate start,
status concealment, cancel, retry exhaustion, Redis loss/recovery, role/context
revocation, stale fencing, invalid worker output, citation reauthorization,
and exact assistant replay. Rollback is every generation gate false; do not
drop the inert ledger.

Safe source-only continuation: define a separately gated provider-backed worker
attempt contract. Nest must reserve and cap provider quota before dispatch,
record attempt cost/idempotency in PostgreSQL, and own final commit. Python may
invoke the model and return bounded analysis only. Do not enable or call a
provider until an explicit low spend ceiling is approved. Prefer a short-lived
202/status client handoff before canary so Next does not hold long server
invocations.

Do not reconnect Vercel Git, run Vercel/Railway builds or deployments, apply
hosted SQL, mutate hosted Auth/Storage/data, create paid resources, or call
AI/image providers without explicit cost and release approval.

## Exact next action after M3.161 trusted Cortex assistant authority

Keep these flags closed, allowlists empty, and secret unset:

```text
ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_ENABLED=false
ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_TENANT_IDS=
ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API=false
ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API_TENANT_IDS=
ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_ENABLED=false
ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_TENANT_IDS=
ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_VIA_API=false
ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_VIA_API_TENANT_IDS=
ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET=
```

Managed Supabase was not refreshed; its last verified ledger is 55 versus 106
source migrations. The database owner must finish M3.152 backup/PITR proof.
Then replay all 106 migrations on an isolated complete clone and compare
legacy/Core assistant behavior for two users and every role in one exact
tenant: deterministic/model success, active and completed retry, stale lease,
changed command/completion, quota denial, stream failure, context/citation/role
revocation, Core failure, and no direct-write fallback. Configure one newly
generated 32+ character secret only in Web/Core server runtimes. Rollback is
both assistant flags false; do not down-migrate or drop the inert ledger.

Safe source-only continuation: move chat retrieval and model execution behind
a bounded NestJS + BullMQ + Python analysis contract. Nest must own job
authorization, quota reservation, official completion, and audit; Python may
return analysis/evidence only. Preserve streaming/API compatibility and add
explicit retry/cancellation semantics before any canary.

Do not reconnect Vercel Git, deploy/build Vercel or Railway, apply hosted SQL,
mutate hosted Auth/Storage/data, create paid resources, or call AI/image
providers without explicit cost and release approval.

## Exact next action after M3.160 Core Cortex user-turn writes

Keep these flags closed and every allowlist empty:

```text
ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_ENABLED=false
ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_TENANT_IDS=
ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API=false
ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API_TENANT_IDS=
```

Also keep the M3.159 conversation-read flags closed. Managed Supabase was not
refreshed; its last verified ledger is 55 versus 105 source migrations. The
database owner must finish M3.152: approve the Purchase Order mapping and prove
it on a complete backup/PITR restore. Apply/replay all 105 migrations only in an
isolated complete clone, then compare legacy/Core user-turn creation and append
for two users and every role in one exact tenant. Cover exact replay, changed-
command conflict, context revocation, ownership concealment, role revocation,
and Core failure. Rollback is both user-turn flags false; do not down-migrate or
drop the inert ledger.

Safe source-only continuation: specify a trusted service-to-service assistant-
turn command tied idempotently to the accepted user message/provider result, or
move the complete server chat orchestration into NestJS. Never let the browser
select an assistant role. Do not reconnect Vercel Git, deploy/build Vercel or
Railway, apply hosted SQL, mutate hosted Auth/Storage/data, create paid
resources, or call AI/image providers without explicit cost and release
approval.

## Exact next action after M3.159 Core Cortex conversation reads

Keep `ERP_CORTEX_CONVERSATION_READS_ENABLED=false`,
`ERP_CORTEX_CONVERSATION_READS_VIA_API=false`, and both exact-tenant allowlists
empty. Do not configure a wildcard. The source boundary is green, but no
managed legacy/Core comparison or protected tenant canary was run.

Database owner still must finish M3.152: approve the separate Purchase Order
mapping and prove it on a complete managed backup/PITR restore. After that,
compare legacy/Core conversation list/detail responses for two users and every
production role in one exact tenant, including unscoped, authorized, revoked,
foreign, malformed, corrupt-context, citation-revocation, and Core-unavailable
cases. Rollback is both conversation flags false.

Safe source-only continuation: specify and implement an idempotent, audited
NestJS conversation-write command that atomically verifies ownership and
appends a turn. Keep provider streaming separate and keep Python advisory-only.
Do not reconnect Vercel Git, deploy/build Vercel or Railway, apply hosted SQL,
mutate hosted Auth/Storage/data, create a paid branch, or call any AI/image
provider without explicit cost and release approval.

## Exact next action after M3.158 protected Cortex route proof

Keep every Cortex Core/indexing/legacy flag false, every tenant allowlist
empty, and all AI worker/provider credentials absent. The full protected Next
route now has local middleware/profile/PostgreSQL/browser evidence. Do not
mislabel the narrow rejecting Auth/profile contract as complete GoTrue,
PostgREST, managed Auth recovery, or production canary evidence.

Database owner must finish M3.152: approve the separate Purchase Order mapping
and prove it on a complete managed backup/PITR restore. Only if provider-level
Auth parity is specifically required should a complete isolated Auth/REST
stack be added; it must remain loopback-only and must not mint/revoke hosted
users.

Do not reconnect Vercel Git, deploy/build Vercel or Railway, apply hosted
Supabase SQL, mutate hosted Auth/Storage/tenant data, create a paid branch, or
call an AI provider. Any later canary still requires one exact tenant, written
spend ceiling, backup/rollback proof, and named owner approval.

## Exact next action after M3.157 auth-safe Cortex indexing browser proof

Keep every semantic-index intake, worker, recovery, Web, and legacy flag false;
keep tenant allowlists empty and AI worker/provider variables absent. Local
database/Redis proof and real component desktop/mobile proof are complete. Do
not rerun them unless indexing source, migrations, or control behavior changes.

Database owner must now finish M3.152: approve the Purchase Order mapping and
prove it on a complete managed backup/PITR restore. If full authenticated
`/cortex` route evidence is required before canary, run it only against a
complete isolated Auth/REST/database stack; do not mint or revoke hosted users.
Before any real provider call, owner approval must name one exact tenant, a
written spend ceiling, and a rollback owner.

Do not reconnect Vercel Git, build or deploy Vercel/Railway, apply hosted
Supabase SQL, mutate hosted Auth/Storage/tenant data, create a paid branch, or
call an AI provider without explicit cost and release approval.

## Exact next action after M3.156 disposable Cortex indexing proof

Keep every `ERP_CORTEX_SEMANTIC_INDEX_*` flag false, every exact-tenant
allowlist empty, legacy embedding disabled, and AI worker/provider variables
absent. The 104-migration PostgreSQL/Redis runtime proof is complete; do not
rerun it unless indexing source or migrations change.

Next, the database owner must finish M3.152: approve the Purchase Order mapping
and prove it on a complete managed backup/PITR restore. Separately capture
protected desktop/mobile confirmation and status behavior in an isolated,
auth-safe environment that does not mutate hosted Supabase Auth. Before any
real worker call, an owner must approve the exact tenant, written spend ceiling,
and rollback owner.

Do not reconnect Vercel Git, build or deploy Vercel/Railway, apply hosted
Supabase SQL, change hosted Auth/Storage/tenant data, create a paid branch, or
call an AI provider without explicit cost and release approval.

## Exact next action after M3.155 cost-bounded Cortex indexing jobs

Keep intake, worker, recovery, Web cutover, and legacy flags false with empty
exact-UUID allowlists. Do not configure `AI_WORKER_URL`/secret, call a provider,
apply hosted SQL, reconnect Vercel Git, or deploy Railway/Vercel. First obtain
M3.152 owner approval and restore a complete managed backup/PITR clone. Start a
local PostgreSQL 17 and Redis test environment, replay all 104 migrations, and
run the currently skipped database/RLS suites with a fake embedding worker.

Required canary evidence: no browser table write; owner/admin allow and current
role-revocation deny; one active job per tenant; idempotent replay; exactly one
provider reservation/call for 64 or fewer nodes; zero call when backlog is
empty; Redis-loss recovery before reservation; terminal
`provider_call_outcome_unknown` after reservation; atomic vector/job commit;
audit continuity; protected desktop/mobile confirmation and status behavior;
and rollback by closing flags. Only after those pass may an owner approve one
exact tenant and a written provider-spend ceiling.

## Exact next action after M3.154 Core Cortex entity-context read authority

Keep `ERP_CORTEX_ENTITY_READS_ENABLED=false`,
`ERP_CORTEX_ENTITY_READS_VIA_API=false`, and both entity tenant allowlists
empty. Do not deploy to exercise the endpoint. First complete M3.152 owner
review and restore reviewed managed 103/103 parity. Then run a read-only,
one-tenant legacy/Core comparison covering allowed, forbidden, absent,
mismatched, malformed, and Core-unavailable entity references. Verify every
citation/relationship under each production role and capture rollback proof.

No provider spend is required. Do not reconnect Vercel Git, deploy Railway or
Vercel, call an AI provider, apply hosted SQL, change tenant data, or create a
paid branch without explicit release and cost approval.

## Exact next action after M3.153 Core Cortex graph read authority

Keep `ERP_CORTEX_GRAPH_READS_ENABLED=false`,
`ERP_CORTEX_GRAPH_READS_VIA_API=false`, and both graph tenant allowlists empty.
Do not deploy merely to exercise the new endpoint. Database owner must still
complete M3.152: review the external 12-row recommendation, create the separate
approved version-1 mapping, and prove it on a complete managed backup clone.
After managed Supabase reaches reviewed 103/103 parity, run a read-only
one-tenant legacy/Core graph comparison for whole graph and authorized,
unauthorized, absent, and mismatched focus cases; then capture protected
role-by-role browser proof and rollback evidence before enabling a canary.

No provider spend is required for that parity work. Do not reconnect Vercel
Git, run a hosted build, deploy Railway/Vercel, call an AI provider, apply SQL,
or change tenant data without explicit release/cost approval.

## Exact next action after M3.152 Purchase Order owner-review proposal

Keep Supabase, Vercel, Railway, flags, and tenant allowlists unchanged. Database
owner must review the external 12-row recommendation artifact, choose every
canonical/replacement value, record approver and approval time, and create a
separate complete version-1 mapping. Run the read-only mapping preflight against
a fresh managed snapshot until it reports `ready`. Then restore a complete
managed backup/PITR copy with Auth, Storage, vector, roles, grants, and provider
catalog; apply only the approved mapping to that isolated clone and run all
zero-skip M3.151 gates. Proposal status `pending` is not approval. Do not create
the `$0.01344/hour` branch, apply hosted SQL, deploy, or reconnect Vercel Git
without explicit cost and release approval.

## Exact next action after M3.151 free local managed-suffix replay

Keep Supabase, Vercel, Railway, flags, and tenant allowlists unchanged. Export
tooling and the exact 48-file suffix are locally proven; do not repeat either
unless source or managed head changes. Database owner must now supply the
external 12-row Purchase Order mapping. Obtain a fresh, complete managed
backup/PITR restore that includes Auth, Storage metadata, vector, roles,
grants, and provider-owned catalog behavior. Apply only the approved mapping
to that isolated clone, then run zero-skip database/API/Redis, identity, audit,
RLS, Storage-object, financial, schema-diff, and browser gates. Do not create
the `$0.01344/hour` branch, apply hosted SQL, or deploy without explicit cost
and release approval.

## Exact next action after M3.150 managed Supabase parity plan

Remain read-only. Database owner must supply two items: an approved external
mapping covering all 12 records in the duplicate Purchase Order group, and a
supported session-pooler/direct export path with PostgreSQL 17 or Supabase CLI
dump tooling. Run mapping and export preflights until both report `ready`.
Then restore into isolated PostgreSQL 17, apply the approved mapping only to
the clone, and replay the exact 48-file manifest with no skipped database/API,
identity, audit, RLS, Storage, Redis, or browser gates. Do not create the
`$0.01344/hour` managed branch, execute hosted SQL, enable canaries, or deploy
Vercel/Railway without free local evidence plus explicit cost/release approval.

## Exact next action after M3.149 Core user-role assignment authority

Keep `ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_ENABLED=false`,
`ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_VIA_API=false`, and both UUID tenant
allowlists empty. Do not deploy Vercel/Railway or apply hosted SQL. The source
ledger now has 103 migrations; managed Supabase was not refreshed and its
last verified 55 imply a 48-migration gap. First produce an ordered
disposable/branch parity plan covering duplicate Purchase Orders, user-table
privileges/RLS, backup/PITR restore, Auth identity, audit recovery, rollback,
and a strict provider-spend envelope. Obtain explicit approval before one
reviewed managed batch or one-tenant role-assignment canary. Do not create a
deployment merely to re-prove green local source.

## Exact next action after M3.148 tenant identity RPC hardening

Keep Vercel/Railway deployments, Supabase SQL, ERP write flags, and tenant
allowlists closed. Managed Supabase is now 47 source migrations behind. Do
not apply that batch. First produce an ordered disposable/branch parity plan
covering duplicate Purchase Orders, advisor findings, backup/PITR restore,
Auth identity, audit recovery, rollback, and a bounded provider-spend
envelope. Obtain explicit approval before one reviewed managed batch or one
tenant canary. Do not create a deployment merely to re-prove green local
source.

## Exact next action after M3.147 managed Supabase parity audit

Keep all ERP write flags false, tenant allowlists empty, and hosted Vercel/
Railway deploys closed. Do not apply the 46 source migrations to managed
Supabase. First build a disposable/branch replay and ordered parity report
covering duplicate Purchase Orders, RLS/privileges, the missing invoice-draft
ledger, backup/PITR restore, Auth identity, audit recovery, and rollback. Run
the security/performance advisor remediation plan and define a bounded spend
envelope. Only after that evidence and explicit approval may one managed
migration batch or one-tenant canary be proposed.

## Exact next action after M3.146 Core-only customer invoice draft creation

Keep `ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED=false`,
`ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_VIA_API=false`, and both
invoice tenant allowlists empty. Source checkpoint
`473eaf1d6a9ec468165520685e2718eeefea5124` is pushed to
`origin/agent-02/third-code-erp-landing`; remote SHA and clean worktree are
verified. Keep hosted Supabase, Vercel, Railway, provider variables, and ERP
canaries closed. The disposable 101-migration PostgreSQL/Redis replay is
green; repeat only after a migration changes. Next gate: managed
Supabase catalog/RLS/data parity, supported backup/PITR recovery, Auth
identity, audit recovery, duplicate-record/idempotency review, and bounded
spend approval. Only then can a one-tenant invoice-draft canary be proposed;
do not deploy or spend provider credits merely to validate source.

## Exact next action after M3.145 disposable replay hardening

Keep `ERP_COST_ENTRY_DELETE_WRITES_ENABLED=false`,
`ERP_COST_ENTRY_RESTORE_WRITES_ENABLED=false`, and both tenant allowlists
empty. Source checkpoint `3ca2060332fbda01f56b3044a8cde9e0201af71a` is
pushed to `origin/agent-02/third-code-erp-landing`; remote SHA and clean
worktree are verified. Keep hosted Supabase, Vercel, Railway, provider
variables, and ERP canaries closed. The disposable 100-migration
PostgreSQL/Redis replay is green; do not repeat it until a migration changes.
Next gate is managed catalog/RLS and data parity, supported backup/PITR
recovery, Auth identity, audit recovery, bounded spend approval, and explicit
canary authorization.

## Exact next action after M3.140 Core-only Project creation

Keep hosted Supabase, Vercel, Railway, provider variables, and ERP canaries
closed. Obtain managed Supabase catalog/data/RLS parity, supported
backup/PITR restore, Auth identity, audit recovery, duplicate-record, and
spend evidence for the exact Core release. Only after those artifacts and
explicit release approval may a one-tenant Project-create runtime canary be
attempted; repeat the disposable PostgreSQL/Redis lane after any migration
change. The canary must prove allowed create, locked-membership denial,
tenant isolation, idempotent replay/hash conflict, audit actor identity, and
Core-unavailable fail-closed behavior without creating a Vercel build or
redeploying Railway.

## Exact next action after M3.141 Core-only manual Cost Entry creation

M3.141 is pushed as source SHA
`f9770a015e0c8769010cf08cb4f31f7c26b6f656`; remote SHA and clean worktree
verified. Keep hosted Supabase, Vercel, Railway, provider variables, and ERP
canaries closed. Next source slice: design Core Cost Entry deletion with
locked membership, manual-only guard, tenant scope, idempotency, audit, and a
recoverable rollback contract; do not remove legacy delete until that boundary
has tests and local replay evidence. Managed parity/recovery/identity/audit/
spend evidence still blocks hosted canaries.

## Exact next action after M3.142 Core Cost Entry void boundary

M3.142 is pushed as source SHA
`476903d934c3c1b65bf50b6075497707b8841248`; remote SHA and clean worktree
verified. Keep `ERP_COST_ENTRY_DELETE_WRITES_ENABLED=false` and its tenant
allowlist empty; do not apply the new Supabase migration or trigger Vercel or
Railway. The Web Core delete adapter and action migration are now complete;
the next source slice is a Core restore command plus focused restore/read
parity proof. Managed parity/recovery/identity/audit/spend evidence still
blocks hosted canaries.

## Exact next action after M3.143 Core-only Cost Entry deletion action

M3.143 source checkpoint `ad1d8d2f5e902148cf3805d97232f8273afdc88b` is pushed
to `origin/agent-02/third-code-erp-landing`; remote SHA and clean worktree are
verified. Keep
`ERP_COST_ENTRY_DELETE_WRITES_ENABLED=false` and its tenant allowlist empty;
do not apply `20260807110000_cost_entry_delete_workflow.sql`, change hosted
Supabase, trigger Vercel, or deploy Railway. The Core restore command is now
implemented in M3.144. Next source action: run the disposable PostgreSQL/
Redis lane with the new migration and prove void/restore active-read, replay,
snapshot-mismatch, and rollback parity. No production canary is authorized
until disposable replay, managed catalog/RLS, backup/PITR, Auth identity,
audit recovery, spend evidence, and explicit release approval are complete.

## Exact next action after M3.144 Core Cost Entry restore boundary

M3.144 source validation is green. Source checkpoint
`963ae464ac35f9bc388605bcb641b2f42442ac19` is pushed to
`origin/agent-02/third-code-erp-landing`; remote SHA and clean worktree are
verified. Keep
`ERP_COST_ENTRY_DELETE_WRITES_ENABLED=false`,
`ERP_COST_ENTRY_RESTORE_WRITES_ENABLED=false`, and both tenant allowlists
empty. Do not apply the void or restore migrations to hosted Supabase,
change provider variables, trigger Vercel, or deploy Railway. Run the
disposable PostgreSQL/Redis replay with all 100 migrations, exercise void then
restore plus idempotent retries and mismatched snapshot failure, compare
schema hashes, and capture rollback/active-read evidence. Managed parity,
backup/PITR, Auth identity, audit recovery, and spend gates still block any
hosted canary.

## Exact next action after M3.139 self-hosted Core authority evidence

Keep hosted Supabase, Vercel, Railway, and ERP canaries closed. Obtain the
remaining managed parity/catalog/RLS, backup/PITR restore, identity, audit
recovery, and spend evidence. Only after those gates and explicit release
approval may a one-tenant Core runtime canary be attempted; repeat the local
lane after any migration change.

## Exact next action after M3.138 retire Project update flag surface

Push the reviewed source/docs to
`origin/agent-02/third-code-erp-landing`, verify remote SHA and clean
worktree, then stop. Keep Supabase SQL/data, Vercel builds, Railway deploys,
and ERP flags closed to control spend. Next source action: execute only the
approved self-hosted/protected Core read/write canary using the new runbook;
prove membership denial, tenant isolation, stale-token conflict, audit actor,
terminal-state rejection, and Core-unavailable fail-closed behavior before any
hosted canary or deployment.

## Exact next action after M3.137 Project update Core cutover

Push the reviewed source/docs to
`origin/agent-02/third-code-erp-landing`, verify remote SHA and clean
worktree, then stop. Keep Supabase SQL/data, Vercel builds, Railway deploys,
and ERP flags closed to control spend. Next source slice: remove or formally
deprecate the obsolete Project update feature-flag/config surface, then run a
protected self-hosted Core read/write canary proving allowed movement,
terminal rejection, membership denial, tenant isolation, stale-token conflict,
audit identity, and Core-unavailable fail-closed behavior.

## Exact next action after M3.136 legacy Project update fallback guard

Push the reviewed source/docs to
`origin/agent-02/third-code-erp-landing`, verify remote SHA and clean
worktree, then stop. Keep hosted Supabase SQL, Vercel builds, Railway
deploys, and ERP flags closed to control spend. Next source slice: migrate the
legacy Project update fallback to the NestJS Core transaction authority and
prove allowed transitions, terminal rejection, membership denial, tenant
isolation, optimistic concurrency, and audit parity before any canary.

## Exact next action after M3.135 project status state machine

Push the reviewed source/doc milestone to
`origin/agent-02/third-code-erp-landing`, verify remote SHA and clean
worktree, then stop. Keep hosted Supabase SQL, Vercel builds, Railway
deploys, and all ERP flags closed; this slice adds no migration. Next source
slice: make the legacy Web Project update fallback call the same Core
transition authority without changing default behavior, then prove allowed
movement, terminal rejection, optimistic concurrency, tenant isolation, and
audit parity before any canary. Hosted parity, backup/rollback, identity,
duplicate, audit-recovery, and spend gates still block release.

## Exact next action after M3.134 project-update authority hardening

Push the reviewed source/doc milestone to
`origin/agent-02/third-code-erp-landing`, verify remote SHA and clean
worktree, then stop. Keep hosted Supabase SQL, Vercel builds, Railway
deploys, and all ERP flags closed; this slice adds no migration. The next
separately approved canary must exercise allowed update, locked-membership
denial, tenant isolation, stale optimistic-concurrency rejection, rollback,
and audit actor identity only after schema/RLS, managed backup/rollback,
identity, duplicate, audit-recovery, and spend gates clear.

## Exact next action after M3.133 project-create authority hardening

Push the reviewed source/doc milestone to
`origin/agent-02/third-code-erp-landing`, verify the remote branch and clean
worktree, then stop. Keep hosted Supabase SQL, Vercel builds, Railway
deploys, and all ERP flags closed; this slice adds no migration. The next
separately approved canary must exercise locked-membership denial, allowed
create, idempotent replay/hash conflict, tenant scope, and audit actor
identity only after schema/RLS, managed backup/rollback, identity, duplicate,
audit-recovery, and spend gates clear.

## Exact next action after M3.132 asset maintenance due projection

The reviewed code plus milestone docs are pushed to
`origin/agent-02/third-code-erp-landing` using `kurtgav`; the remote branch
was verified. Stop here. Keep hosted Supabase SQL, Vercel builds, Railway
deploys, and all ERP flags closed; this slice adds no migration. The next
separately approved action is a
protected canary only after the pinned Supabase CLI/CI diff, managed backup
and rollback, catalog/security, duplicate-record mapping, audit recovery,
identity, and spend gates clear. The canary must verify latest-record
selection, overdue/due-soon boundaries, pagination, tenant isolation, and
independent Web degradation when maintenance reads are unavailable.

## Exact next action after M3.131 asset maintenance history

Keep hosted migration, flags, and deploys closed. The reviewed feature branch
is pushed; the next release action is a manually approved protected canary
after hosted parity/security/duplicate/audit/rollback/identity/spend gates
clear. Do not apply migration `20260807100000` to hosted Supabase, enable a
maintenance flag, create a Vercel build, or redeploy Railway while those gates
remain open. A canary must exercise read, create, replay, hash conflict,
retired-asset rejection, tenant isolation, and audit evidence.

## Exact next action after M3.130 dashboard fault isolation

Keep the degraded dashboard path source-only until the normal spend-approved
release lane exists. On the next protected browser canary, exercise both a
healthy executive dashboard and a controlled analytics failure, verify the
Today fallback, tenant scope, notice, server log reference, and zero console
errors. Do not create a Vercel build, manually redeploy Railway, apply hosted
SQL, or enable ERP canaries while the database/security/duplicate/audit/
rollback/identity/spend gates remain open.

## Exact next action after M3.129 self-hosted free database lane

Use the approved GitHub self-hosted/Docker CI lane to capture the pinned
Supabase CLI `2.109.1` schema-diff artifact. Keep the CLI gate open when the
Docker Linux engine is unavailable. The last `CI (Self-Hosted Free)` dispatch
returned HTTP 500 with no created run; investigate runner/dispatch health
before a single retry. Then repeat the read-only controlled
planner; do not apply hosted SQL, create a Vercel build, manually redeploy
Railway, or enable an ERP canary while migration parity, catalog security,
duplicate Purchase Orders, audit recovery, rollback, identity, and spend
evidence remain open.

## Exact next action after M3.128 cache-safe runtime test gate

Push the reviewed branch after source gates pass. In the next release lane,
run the pinned Supabase CLI schema diff in self-hosted Docker/CI, then repeat
the controlled planner. Keep hosted SQL, Vercel, Railway, and ERP canaries
closed while security, migration parity, duplicate Purchase Orders, audit
recovery, rollback, identity, and spend gates remain open.

## Exact next action after M3.127 pinned CLI diff boundary

Run Supabase CLI `2.109.1` schema diff in the approved self-hosted CI/Docker
lane and retain the artifact. Do not start Docker Desktop opportunistically or
waive this gate; keep hosted Supabase, Vercel, Railway, and ERP canaries
unchanged while the CLI/backup/catalog/data/rollback/identity/security/spend
evidence is incomplete.

## Exact next action after M3.126 clean disposable PostgreSQL replay

Capture a pinned Supabase CLI schema-diff or self-hosted CI artifact for the
same 97-file replay. Then obtain supported managed backup/catalog/data parity,
owner-approved duplicate Purchase Order mapping, `AUDIT_RECOVERY_TENANT_ID`,
rollback proof, exact `kurtgav` provider identity, and explicit spend approval.
Keep Supabase, Vercel, Railway, and ERP canary flags unchanged; the disposable
replay does not authorize SQL, deploy, or data repair.

## Exact next action after M3.125 capability evidence boundary refresh

Run `git diff --check`, the clean-room/branding test, and the normal serial
source gates. Push only the reviewed feature branch. Do not trigger Vercel or
Railway, apply Supabase SQL, or enable ERP canaries: the hosted planner remains
blocked by 55/97 migration parity, 213 direct `anon` grants, 209 `public`
policies, duplicate Purchase Orders, missing audit recovery, rollback,
identity, and spend evidence. Continue with a clean zero-to-head disposable
PostgreSQL/Supabase replay as the next technical milestone.

## Exact next action after M3.124 bounded landing carousel and image priority

Run focused/full web tests, typecheck, lint, production build, clean-room
branding scan, and Playwright production-equivalent browser checks. Review
the remaining Next development LCP warning before any marketing release. Keep
the source branch separate and do not trigger Vercel/Railway while the
controlled-release planner remains blocked by hosted security, migration
drift, duplicate Purchase Orders, audit recovery, rollback, identity, and
spend gates.

## Exact next action after M3.123 read-only catalog security gate

Run the full local test, typecheck, lint, build, migration-verifier,
Actionlint, Gitleaks, controlled-release, and spend-guard gates. Push only the
reviewed feature branch after they pass. Keep hosted Supabase unchanged: the
read-only planner reports 55/97 migrations, 213 direct anon privilege rows,
209 public-role policies, one tenant-scoped duplicate Purchase Order group,
and missing audit-recovery input. Do not trigger Vercel/Railway or apply SQL;
the source hardening migration still needs a clean zero-to-head replay,
managed backup, owner mapping, rollback, exact provider identity, and explicit
spend approval.

## Exact next action after M3.122 source anonymous-grant and policy hardening

Create a clean disposable PostgreSQL 17/Supabase replay from zero and verify
the 97-file ledger, roles, policies, grants, Storage/auth dependencies, and
public signing/warranty portal routes. The current 97/97 evidence is a suffix
replay on the existing disposable clone, not a fresh zero-to-head proof. Do
not apply `20260806160000_security_role_baseline.sql` to hosted Supabase until
that replay, managed backup, duplicate Purchase Order owner mapping,
`AUDIT_RECOVERY_TENANT_ID`, rollback, exact provider identity, readiness,
security, and spend gates all pass. Keep Vercel Git disabled and do not create
a paid Vercel/Railway build.

## Exact next action after M3.121 hosted Supabase security and parity refresh

Do not deploy or apply hosted SQL. Add the source-only security migration and
replay it on disposable PostgreSQL 17: remove direct `anon` table/sequence
privileges, explicitly target tenant policies to `authenticated` where no
documented public server-mediated edge exists, and verify service-only ledgers
remain forced-RLS/service-role-only. Extend the read-only catalog gate for
anonymous grants and public-role policies. Then obtain the managed backup,
owner-approved mapping for the tenant-scoped 12-record Purchase Order group,
`AUDIT_RECOVERY_TENANT_ID`, rollback proof, and spend approval before one
bounded hosted action. Keep Vercel Git disabled, all Core canaries
false/empty, and no paid build or deploy command.

## Exact next action after M3.120 dashboard incident revalidation

Do not deploy a retest. Keep production spend closed and continue the planned
release blockers: hosted migration parity is 55/96, one tenant Purchase Order
number group has 12 duplicate records requiring owner mapping, and
`AUDIT_RECOVERY_TENANT_ID` is missing. If an authenticated dashboard failure
recurs, capture its deployment SHA and Vercel runtime cluster before editing;
the current anonymous route and runtime evidence are green.

## Exact next action after M3.119 public favicon identity

Run focused branding tests, then the normal serial Turbo test, typecheck,
TS-only lint, production build, Gitleaks, Actionlint, and migration-file
verification. Push only the reviewed feature branch. Keep Vercel Git
deployment disabled, Railway/Vercel builds closed, all ERP canary flags off,
and Supabase unchanged while the controlled release planner remains blocked by
41 missing hosted migrations, owner-approved duplicate Purchase Order mapping,
and missing `AUDIT_RECOVERY_TENANT_ID`.

## Exact next action after M3.118 Won-to-Project authority seam

Validation is green: serial Turbo tests, `pnpm typecheck`, `pnpm lint`,
production build, gitleaks, actionlint, and migration-file verification pass.
The read-only controlled release planner still reports:
source migration count is 96 versus hosted 55, duplicate Purchase Orders need
owner mapping, and audit recovery tenant input is absent. Keep
`ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED=false`, its tenant list empty, the Web
Core selector false/empty, Vercel Git disconnected, and all provider builds
closed. Push only the reviewed feature branch after green gates; do not apply
the migration or enable a tenant canary.

## Exact next action after M3.117 Purchase Order mapping-template preflight

Generate an owner-review skeleton only in an approved secure directory:

```powershell
node --env-file=apps/web/.env.local scripts/plan-purchase-order-mapping-template.mjs `
  --template-file="C:\secure\thirdcode-po-mapping-template.json"
```

The generated replacement values are intentionally blank. The database owner
must fill every row, approve the canonical numbering, and keep the mapping
outside Git/public output. Run `pnpm plan:purchase-order-mapping` against that
file. Keep Supabase, Vercel, Railway, and all ERP canary flags unchanged until
the mapping, managed backup/catalog parity, rollback, readiness, identity,
security, and spend gates are green.

## Exact next action after M3.116 Togal BOM authority seam

Push the reviewed feature branch with the new migration included in the
disposable PostgreSQL 17 replay verifier; do not apply it to hosted Supabase.
Keep
`ERP_BOM_TOGAL_COMMIT_WRITES_ENABLED=false`,
`ERP_BOM_TOGAL_COMMIT_WRITES_TENANT_IDS` empty,
`ERP_BOM_TOGAL_COMMIT_VIA_API` unset/false, and its tenant allowlist empty.
Push only the reviewed feature branch. Before any canary or deployment,
obtain managed Supabase parity/backup, owner-approved duplicate PO mapping,
rollback proof, exact provider identity, readiness, security review, and
spend-cap approval.

## Exact next action after M3.115 provider spend gate

Keep `apps/web/vercel.json` Git deployment disabled and keep repository
automation free of Vercel/Railway deploy commands. Run the controlled
read-only planner before any release; it must include a clear spend component.
Do not create a Vercel preview/production build or manually redeploy Railway.
Obtain the database-owner mapping for the tenant-scoped 12-record Purchase
Order group, supported managed Supabase backup/catalog/data/audit/auth/storage/
grants/vector parity, rollback proof, protected canary evidence, exact
provider identity, and explicit spend approval before one bounded promotion.

## Exact next action after M3.114 mapping preflight

Obtain database-owner mapping JSON outside Git for every row in the
tenant-scoped duplicate `PO-0002` group. Run
`pnpm plan:purchase-order-mapping -- --mapping-file="<external path>"` with
the approved environment. If status is `ready`, repeat managed Supabase
backup/catalog/data/audit/auth/storage/grants/vector parity and ordered clone
replay. Keep hosted SQL, Vercel, and Railway unchanged until rollback,
protected canary, exact identity, readiness, security-advisor, and spend-cap
gates pass.

## Exact next action after M3.113 security-scan cleanup

Keep `.gitleaks.toml` allowlist exact and review all new findings as possible
credentials. Keep Supabase `aqqrtkmtcsfkbyyqxowv` unchanged; obtain the
owner-approved mapping for the one tenant-scoped 12-record `PO-0002` group and
managed backup/catalog/data/audit/auth/storage/grants/vector parity. Do not
trigger Vercel/Railway builds or hosted SQL until rollback, protected canary,
exact identity, readiness, security-advisor, and spend-cap gates pass.

## Exact next action after M3.112 disposable replay

Keep Supabase `aqqrtkmtcsfkbyyqxowv` unchanged. Do not call
`supabase_apply_migration`, edit migration history, repair the duplicate
Purchase Orders, create a paid managed branch, or trigger Vercel/Railway.
Obtain the database owner's canonical mapping for the one tenant-scoped
12-record `PO-0002` group. Obtain a supported Supabase-managed backup/PITR and
managed auth/storage/roles/grants/vector catalog evidence (or explicit owner
approval for the managed branch cost) and repeat the ordered 39-file replay
with zero-skipped database/protected-flow checks. Only after rollback,
readiness, exact SHA/provider identity, security-advisor, and spend-cap gates
pass may one bounded hosted migration and one provider action be scheduled.

The raw PostgreSQL 17.10 public/roles export and synthetic clone replay are
retained only as local safety/dependency evidence outside Git; they do not
prove hosted parity.

## Exact next action after M3.111 read-only Supabase export preflight

Do not run a dump through the current transaction-pooler URL or install a
provider-side branch. Obtain an approved Supabase session-pooler/direct
connection on port 5432 and a local PostgreSQL 17 client or Supabase CLI with
Docker; run `node --env-file=apps/web/.env.local scripts/plan-database-export.mjs`
first, then create encrypted roles/schema/data exports outside Git. Hash and
review the exports, replay them only on a disposable PostgreSQL 17 clone, and
keep all ERP flags/tenant allowlists false/empty. No Vercel/Railway build or
Supabase SQL mutation is authorized by this preflight. Separately remediate
the six existing gitleaks findings in idempotency tests; do not mix that
unrelated cleanup into the database export gate.

## Exact next action after M3.110 public landing UX and SEO smoke audit

Keep the public alias and feature branch separate: the browser audit validates
the currently hosted landing page, while source commit `1de166509223a351f099c702218f789361802e13`
is not a production deployment. Do not trigger Vercel/Railway builds. Continue
supported Supabase backup/catalog/data/audit export, ordered 39-migration
replay, owner-approved duplicate-PO mapping, and security review before any
protected canary or promotion. Preserve the spend guard and keep all ERP Core
flags and tenant allowlists false/empty.

## Exact next action after M3.109 dashboard render recovery boundary

Keep recovery boundary deployed only through a future approved release; do
not trigger Vercel/Railway builds now. Source commit
`6eb0b0a0388d0e9cc00981173c5a40f2ce458116` is pushed to the feature branch by
`kurtgav`; `origin/main` remains unchanged. Continue hosted Supabase
backup/catalog/data/audit export, ordered 39-migration replay, owner-approved
duplicate-PO mapping, and security review before any protected canary or
production promotion. Keep all ERP Core flags and tenant allowlists
false/empty, Vercel Git disconnected, and Railway free of manual builds.

## Exact next action after M3.108 hosted Supabase parity refresh

Do not deploy or apply hosted SQL. Obtain a supported recoverable
backup/catalog/data/audit export for `aqqrtkmtcsfkbyyqxowv`; replay the 39
source migrations after hosted `20260729233017` in order on a protected
disposable PostgreSQL 17 lane; compare relations/RLS/policies/indexes/triggers/
grants/data/audit/financial totals; obtain owner-approved mapping for the
tenant-scoped 12-record Purchase Order duplicate group; and review the 11
security warnings. Keep all ERP Core flags and tenant allowlists false/empty,
Vercel Git disconnected/spend-guarded, and Railway free of manual builds until
rollback, protected canary, readiness, exact identity, and spend gates pass.

## Exact next action after M3.107 inventory UOM maintenance authority

Keep `ERP_INVENTORY_UOM_UPDATE_WRITES_ENABLED=false`,
`ERP_INVENTORY_UOM_UPDATE_WRITES_TENANT_IDS` empty,
`ERP_INVENTORY_UOM_UPDATE_VIA_API=false`, and
`ERP_INVENTORY_UOM_UPDATE_TENANT_IDS` empty. Source is pushed at
`ead54aac876ed6a52f1b693c7fe6fec8f2026f8b` on the feature branch by `kurtgav`;
`origin/main` is unchanged. Do not trigger Vercel or Railway builds. Continue
supported Supabase backup/catalog/data/audit export for
`aqqrtkmtcsfkbyyqxowv`; reconcile the 39 source migrations after hosted
`20260729233017` in order, resolve the owner-approved tenant-scoped Purchase
Order duplicate mapping, and review security warnings before any hosted SQL,
protected canary, or production promotion.

## Exact next action after M3.106 inventory item policy control surface

Source/docs commit `7570cda` is pushed only to the existing feature branch;
`origin/main` remains unchanged. Keep item policy Core selection
compatibility-default and do not trigger
Vercel/Railway builds. Continue supported Supabase backup/catalog/data/audit
export for `aqqrtkmtcsfkbyyqxowv`; reconcile all 39 source migrations after
hosted `20260729233017` in order, resolve the owner-approved tenant-scoped
Purchase Order duplicate mapping, and review security warnings before any
hosted SQL, canary, or production promotion.

## Exact next action after M3.105 inventory warehouse control surface

Keep the Warehouse edit/deactivation form compatibility-default until the
existing Core selector and hosted parity gates clear. The reviewed feature
branch is pushed at `e9ee5adb44e3bc2da5cab54af2828065f117f343`; `origin/main`
remains unchanged. Do not trigger Vercel or Railway builds. Continue with
supported Supabase backup/catalog/data/audit export for
`aqqrtkmtcsfkbyyqxowv`; reconcile the 39 source migrations after hosted
`20260729233017` in order, resolve the owner-approved tenant-scoped Purchase
Order duplicate mapping, and review security warnings. No production canary
or hosted SQL apply is authorized yet.

## Exact next action after M3.104 provider spend guard audit

Keep Vercel Git disconnected and do not create a build. The repository guard
now scans all workspace manifests/workflows and is green (`3/3` tests). Keep
all ERP delivery mutation flags false/empty. Obtain supported Supabase backup,
catalog, data, and audit export for `aqqrtkmtcsfkbyyqxowv`; reconcile the 39
source migrations after hosted `20260729233017` in order, including
`20260806130000_delivery_schedule_create_idempotency.sql`. Resolve the
owner-approved duplicate PO mapping and security warnings before any hosted
apply/canary. Do not trigger Railway manually; only one watched backend
promotion is allowed after parity. No Vercel promotion is authorized.

## Exact next action after M3.103 delivery schedule creation authority slice

Source commit `b3b3bdd935f50ff229d9f2fc8ed8447df6f8cba9` is pushed to the
feature branch and fully validated; `origin/main` remains unchanged. Keep
Vercel Git disconnected, do not create a Vercel build, and do not manually
repeat Railway deployment. Keep
`ERP_DELIVERY_SCHEDULE_CREATE_WRITES_ENABLED=false`,
`ERP_DELIVERY_SCHEDULE_CREATE_WRITES_TENANT_IDS` empty,
`ERP_DELIVERY_SCHEDULE_CREATE_WRITES_VIA_API=false`, and its allowlist empty.

1. Obtain supported Supabase backup/catalog/data/audit export for
   `aqqrtkmtcsfkbyyqxowv`; reconcile all source migrations after hosted
   `20260729233017` in order, including
   `20260806130000_delivery_schedule_create_idempotency.sql`. Verify the
   delivery schedule create ledger,
   composite foreign keys, forced RLS, service-role grants, audit, and
   migration ledger.
2. Resolve the owner-approved tenant-scoped 12-record Purchase Order duplicate
   mapping and review the 11 security warnings before any hosted apply or
   canary.
3. If hosted parity clears, push the exact source commit once to the target
   GitHub refs and allow only the single watched Railway backend promotion;
   do not deploy Vercel. Verify Railway `/ready`, `/health`, deployed SHA,
   protected 401 behavior, and spend guard.
4. Only after readiness, run one protected scheduling browser canary covering
   issued-PO creation, duplicate retry, cross-tenant denial, notifications,
   audit, rollback, and disabled-flag behavior. Python/AI stays advisory-only.

Local evidence is green: API 104/449, Web 87/567, database 94/94 source
reproducibility plus 49/318 tests, full API integration rerun 24/24 executed
tests with 2 conditional skips, and production build 81/81 routes. These are
not hosted authorization.

## Exact next action after M3.102 delivery in-transit authority slice

The single Git-triggered Railway backend deployment for `dcf7b04c` is green;
do not manually repeat it. Keep Vercel disconnected and all delivery flags
closed while hosted Supabase parity is reconciled.

1. Keep `ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_ENABLED=false`,
   `ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_TENANT_IDS` empty,
   `ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_VIA_API=false`, and its allowlist
   empty. Do not trigger Vercel/Railway builds or apply hosted SQL.
2. Obtain supported Supabase backup/catalog/data/audit export for
   `aqqrtkmtcsfkbyyqxowv`; reconcile all source migrations after hosted
   `20260729233017` in order, now including
   `20260806120000_delivery_in_transit_workflow.sql`. Confirm the delivery
   enum, ledger, RLS, grants, indexes, triggers, and audit behavior.
3. Resolve the owner-approved tenant-scoped 12-record Purchase Order
   duplicate mapping and review the 11 security warnings before any hosted
   apply or canary.
4. After parity, run one protected delivery browser canary covering
   `site_ready -> in_transit`, duplicate retry, cross-tenant denial, audit,
   rollback, readiness, and spend. Keep Python/AI advisory-only.
5. Local release gates are now green: broad API 104/445, Web 87/565,
   database reproducibility 93/93, and isolated Nest/Next production build
   2/2 with 81/81 routes. Do not treat this as provider authorization; obtain
   the hosted backup/export and ordered suffix reconciliation first.

## Exact next action after M3.101 hosted Asset Register parity snapshot

1. Keep `ERP_ASSET_READS_ENABLED=false`, `ERP_ASSET_READS_TENANT_IDS` empty,
   `ERP_ASSET_READS_VIA_API=false`, and
   `ERP_ASSET_READS_VIA_API_TENANT_IDS` empty. Do not apply the asset
   migration, create a branch, or trigger a paid deploy.
2. Obtain supported Supabase backup/catalog/data/audit export and reconcile
   the 37 source migrations after `20260729233017` in order. Confirm
   `public.assets` metadata, forced RLS, service-role-only grants, audit
   trigger, indexes, and migration ledger entry after review.
3. Resolve the owner-approved tenant-scoped 12-record Purchase Order
   duplicate mapping and remediate/review the 11 security warnings before
   any hosted canary.
4. Then run one protected Asset Register browser canary with rollback and
   spend evidence. Python/AI remains advisory; Nest owns official writes.

## Exact next action after M3.100 Asset Register replay parity

1. Keep `ERP_ASSET_READS_ENABLED=false`, `ERP_ASSET_READS_TENANT_IDS` empty,
   `ERP_ASSET_READS_VIA_API=false`, and
   `ERP_ASSET_READS_VIA_API_TENANT_IDS` empty. Replay is local evidence only;
   do not create a Vercel preview/production build or Railway rebuild.
2. Obtain supported Supabase backup/catalog/data/audit export for
   `aqqrtkmtcsfkbyyqxowv`; reconcile the 37 source migrations after
   `20260729233017` in order. The asset migration remains unapplied hosted.
3. Resolve the owner-approved tenant-scoped 12-record Purchase Order
   duplicate mapping and review the security warnings before any migration
   apply or tenant canary.
4. After hosted parity, run one protected Asset Register browser canary,
   rollback drill, and spend check. Keep official writes in Nest and Python/
   AI advisory-only.

## Exact next action after M3.99 Web Asset Register slice

1. Keep `ERP_ASSET_READS_ENABLED=false`, `ERP_ASSET_READS_TENANT_IDS` empty,
   `ERP_ASSET_READS_VIA_API=false`, and
   `ERP_ASSET_READS_VIA_API_TENANT_IDS` empty. Do not trigger Vercel or
   Railway builds for this source-only Web change.
2. Replay the source asset migration suffix on disposable PostgreSQL 17;
   compare direct and Core asset rows, project joins, pagination, and
   tenant-isolation behavior. Review RLS/audit behavior and capture schema
   hash before/after.
3. For hosted Supabase `aqqrtkmtcsfkbyyqxowv`, obtain supported backup,
   catalog/data/audit export, reconcile the 37 pending migrations after
   `20260729233017`, resolve the owner-approved 12-record Purchase Order
   duplicate mapping, and review security warnings before any apply/canary.
4. After parity, run one protected browser canary with rollback and spend
   evidence. Keep Python/AI advisory-only and official ERP writes in Nest.

## Exact next action after M3.98 shell rebrand correction

1. Keep Vercel Git disconnected and do not create a preview/production build
   automatically. Source SHA `a719d2321410c09658faca30c20c6c374f502360` is
   pushed to both target refs; live Vercel still runs its prior retained
   revision.
2. If live UI promotion is explicitly approved, use one manual deployment of
   this exact SHA only after spend-limit review, then verify authenticated
   sidebar `TC`, desktop/mobile rendering, console, and rollback target.
3. Continue hosted Supabase parity gate separately: no migration apply, branch,
   Storage write, or tenant canary until backup/export, duplicate PO mapping,
   ordered 37-migration reconciliation, and security review clear.

## Exact next action after M3.97 hosted parity snapshot

1. Keep `ERP_FINANCE_CASH_READS_ENABLED=false`,
   `ERP_FINANCE_CASH_READS_TENANT_IDS` empty,
   `ERP_FINANCE_CASH_READS_VIA_API=false`, and
   `ERP_FINANCE_CASH_READS_VIA_API_TENANT_IDS` empty. Do not create a Vercel
   build or a new Railway build for docs-only work.
2. Obtain a supported Supabase backup/catalog/data/audit export, reconcile the
   37 source migrations after `20260729233017` in order, and obtain an
   owner-approved mapping for the one tenant-scoped 12-record Purchase Order
   duplicate group. Review the 11 security warnings before any apply.
3. Compare hosted RLS/policy/audit behavior against the disposable replay,
   then run a protected browser cash canary and rollback drill. No hosted
   migration or tenant selection is cleared by this snapshot.

## Exact next action after M3.96 replay parity

1. Keep `ERP_FINANCE_CASH_READS_ENABLED=false`,
   `ERP_FINANCE_CASH_READS_TENANT_IDS` empty,
   `ERP_FINANCE_CASH_READS_VIA_API=false`, and
   `ERP_FINANCE_CASH_READS_VIA_API_TENANT_IDS` empty. Local parity does not
   authorize production tenant selection; live cash register remains 401.
2. Source SHA `91ed37570ea57fa456b569d247802cfd996cb9c6` is pushed to
   `Third-Code-Solutions/ERP`; Railway deployment
   `133e14b7-c879-4090-8ce1-26d9b42d93ca` is `SUCCESS`/running with `/ready`
   200, `/health` 200, and cash register 401. Do not trigger another Railway
   build unless runtime source changes; do not create a Vercel preview or
   production build.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at PostgreSQL 17 with 55/92
   migrations applied and 37 missing. Obtain supported backup/catalog/data
   export, dependent/audit export, and owner-approved mapping for its one
   tenant-scoped 12-record Purchase Order duplicate group before any apply or
   canary.
4. Next milestone: compare hosted clone catalog/data/RLS/audit against the
   disposable replay, then run protected browser cash canary and rollback
   drill. Python/AI remain advisory; no official ERP transaction is finalized
   by analysis services.

## Exact next action after M3.96

1. Keep `ERP_FINANCE_CASH_READS_ENABLED=false`,
   `ERP_FINANCE_CASH_READS_TENANT_IDS` empty,
   `ERP_FINANCE_CASH_READS_VIA_API=false`, and
   `ERP_FINANCE_CASH_READS_VIA_API_TENANT_IDS` empty. Production cash reads
   remain an unauthenticated 401 boundary, not a tenant canary.
2. Source SHA `ddadd2fa3f7c2451dcfc97f53529ba9edba1f3ee` is pushed to
   `Third-Code-Solutions/ERP`; Railway deployment
   `fbfc7eb0-4820-4359-a42f-74b3c0351558` is `SUCCESS`/running with API
   Dockerfile, `/ready` 200, `/health` 200, and cash register 401. Do not
   trigger another Railway build unless source changes; do not create a Vercel
   preview or production build.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at PostgreSQL 17 with 55/92
   migrations applied and 37 missing. The duplicate planner still reports
   one tenant-scoped Purchase Order group containing 12 records; obtain the
   supported backup/export, dependent/audit export, and owner-approved mapping
   before any migration apply or canary.
4. Replay cash/account/vendor data on disposable PostgreSQL 17; compare direct
   and Core exact-cent rows and aggregates, review RLS/audit behavior, exercise
   a protected browser tenant canary, and capture rollback/spend evidence
   before enabling Core reads. Python and AI remain advisory only.

## Exact next action after M3.95

1. Keep `ERP_FINANCE_PAYABLES_READS_ENABLED=false`,
   `ERP_FINANCE_PAYABLES_READS_TENANT_IDS` empty,
   `ERP_FINANCE_PAYABLES_READS_VIA_API=false`, and
   `ERP_FINANCE_PAYABLES_READS_VIA_API_TENANT_IDS` empty. Production payables
   remains an unauthenticated 401 boundary, not a tenant canary.
2. Source SHA `de0b7e1909ec127ec94ec044202f78f44ab8bd4a` is pushed to
   `Third-Code-Solutions/ERP`; Railway deployment
   `dcb4579e-5bb5-4661-9896-fc1fd607bd92` is `SUCCESS`/`RUNNING` with API
   Dockerfile, `/ready` 200, `/health` 200, and payables 401. Do not trigger
   another Railway build unless source changes; do not create a Vercel preview
   or production build.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at PostgreSQL 17 with 55/92
   migrations applied and 37 missing. The duplicate planner still reports
   one tenant-scoped Purchase Order group containing 12 records; obtain the
   supported backup/export, dependent/audit export, and owner-approved mapping
   before any migration apply or canary.
4. Replay supplier-bill/allocation data on disposable PostgreSQL 17; compare
   direct and Core exact-cent balances and aging totals, review RLS/audit
   behavior, exercise a protected browser tenant canary, and capture rollback/
   spend evidence before enabling Core reads. Python and AI remain advisory
   only.

## Exact next action after M3.94

1. Keep `ERP_FINANCE_RECEIVABLES_READS_ENABLED=false`,
   `ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS` empty,
   `ERP_FINANCE_RECEIVABLES_READS_VIA_API=false`, and
   `ERP_FINANCE_RECEIVABLES_READS_VIA_API_TENANT_IDS` empty. Production
   receivables remains an unauthenticated 401 boundary, not a tenant canary.
2. Source SHA `f298b61a215ea43753f627010444c488f0c46518` is pushed to
   `Third-Code-Solutions/ERP`; Railway deployment
   `bfec3369-dee7-4ed9-9cb7-37f1e71fe9ab` is `SUCCESS`/`RUNNING` with API
   Dockerfile, `/ready` 200, `/health` 200, and receivables 401. Do not trigger
   another Railway build unless source changes; do not create a Vercel preview
   or production build.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at PostgreSQL 17 with 55/92
   migrations applied and 37 missing. The duplicate planner still reports
   one tenant-scoped Purchase Order group containing 12 records; obtain the
   supported backup/export, dependent/audit export, and owner-approved mapping
   before any migration apply or canary.
4. Replay invoice/allocation data on disposable PostgreSQL 17; compare direct
   and Core exact-cent balances and aging totals, review RLS/audit behavior,
   exercise a protected browser tenant canary, and capture rollback/spend
   evidence before enabling Core reads. Python and AI remain advisory only.

## Exact next action after M3.93

1. Keep `ERP_FINANCE_LEDGER_READS_ENABLED=false`,
   `ERP_FINANCE_LEDGER_READS_TENANT_IDS` empty,
   `ERP_FINANCE_LEDGER_READS_VIA_API=false`, and
   `ERP_FINANCE_LEDGER_READS_VIA_API_TENANT_IDS` empty. The production route
   remains an unauthenticated 401 boundary, not a tenant canary.
2. Source SHA `c279f61555ba772579fb4091dd3d5884b48af273` is pushed to
   `Third-Code-Solutions/ERP`; Railway deployment
   `ac9f3fee-0a54-4bf7-91db-2b6815a3638e` is `SUCCESS`/`RUNNING` with API
   Dockerfile, `/ready` 200, `/health` 200, and Finance Ledger 401. Do not
   trigger another Railway build unless source changes; do not create a
   Vercel preview or production build.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at PostgreSQL 17 with 55/92
   migrations applied and 37 missing. The duplicate planner still reports
   one tenant-scoped Purchase Order group containing 12 records; obtain the
   supported backup/export, dependent/audit export, and owner-approved mapping
   before any migration apply or canary.
4. Replay the ordered suffix on disposable PostgreSQL 17, review ledger
   parity/RLS/audit behavior, exercise a protected browser tenant canary, and
   capture rollback and spend evidence before enabling Core reads. Python and
   AI remain advisory only.

## Exact next action after M3.92

1. Keep `ERP_CORTEX_SEARCH_ENABLED=false`,
   `ERP_CORTEX_SEARCH_TENANT_IDS` empty, and the two Next Cortex adapter flags
   false/empty. The API endpoint is a source seam, not a tenant canary.
2. Source SHA `cd94e274a6a5cb19f715c73fa96fc717879644cc` is pushed to
   `Third-Code-Solutions/ERP`; the watched Railway deployment
   `e9e90045-f907-4f6c-ae49-5fa3dcff3cd9` is `SUCCESS` and verified at
   `/ready` 200, `/health` 200, and unauthenticated `/v1/cortex/search` 401.
   Do not manually redeploy or create any Vercel build.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at PostgreSQL 17 with 55/92
   migrations applied and 37 missing. The duplicate planner still reports one
   tenant-scoped Purchase Order group containing 12 records; obtain supported
   backup/export, dependent/audit export, and owner-approved mapping before
   any migration apply or canary.
4. Replay the ordered suffix on disposable PostgreSQL 17, review role scope,
   protected browser behavior, rollback, and spend gates. Only then consider a
   named-tenant Cortex read canary; semantic/AI work remains separately gated.

## Exact next action after M3.91

1. Keep `ERP_ASSET_READS_ENABLED=false` and `ERP_ASSET_READS_TENANT_IDS`
   empty. Do not add a Web adapter, browser table access, write command, or
   maintenance/accounting behavior; the 401 boundary is not a canary.
2. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at PostgreSQL 17 with 55/92
   migrations applied and 37 missing. The duplicate planner still reports
   one tenant-scoped Purchase Order group containing 12 records; obtain the
   supported backup/export, dependent/audit export, and owner-approved mapping
   first.
3. Replay the ordered suffix, including
   `20260806110000_asset_register_foundation.sql`, on disposable PostgreSQL 17;
   reconcile data/catalog/RLS/audit and rollback evidence; then run a protected
   tenant asset-read canary before any Web cutover. Do not apply hosted SQL.
4. Railway deployment `f0358fdd-f927-465c-b930-ec68b0baf240` is the approved
   API release for this SHA; do not trigger another manual Railway build. Keep Vercel Git deployment
   disabled and create no preview or production build while spend controls are
   closed.

## Exact next action after M3.90

1. Keep the asset register source-only: no API route, browser table access,
   feature flag, hosted SQL, or data mutation. The source contract is not a
   production canary.
2. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at PostgreSQL 17 with 55/92
   migrations applied and 37 missing. The duplicate planner still reports one
   tenant-scoped Purchase Order group containing 12 records; obtain supported
   backup/export, dependent/audit export, and owner-approved mapping first.
3. Replay the ordered suffix, including the asset migration, on disposable
   PostgreSQL 17. Reconcile the duplicate records and prove tenant RLS,
   composite-FK, audit, rollback, exact idempotency, and spend-cap gates before
   defining a closed Nest read projection or any write authority.
4. Preserve Vercel Git deployment disabled and the retained production
   revision; do not create preview or production builds while the spend guard
   and provider approval gate remain closed.

## Exact next action after M3.89

1. Keep `ERP_PO_CREATE_WRITES_ENABLED=false`, BOM/grouped PO flags false, and
   every Core tenant allowlist empty. Source SHA `354401d` and docs are pushed;
   Railway deployment `b6149479-1856-4ba5-baac-3e8df22bd262` is `SUCCESS`, with
   live readiness/health 200 and unauthenticated PO creation 401.
2. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at PostgreSQL 17, 55/91
   migrations applied. The duplicate planner found one tenant-scoped group
   containing 12 records; obtain supported backup/export, dependent/audit
   export, and owner-approved record mapping before any apply or cleanup.
3. Run the ordered suffix on a disposable PostgreSQL 17 replay, prove the
   unique-index migration, protected role/cross-tenant, redaction, exact
   replay, rollback, and spend-cap gates, then request an explicitly scoped
   hosted canary. Do not use the source guard as permission to mutate data.
4. Preserve Vercel Git deployment disabled and retained revision
   `31c04942a93d`; create no preview or production build.

## Exact next action after M3.88

1. Keep `ERP_PO_CREATE_WRITES_ENABLED=false`, BOM/grouped PO flags false, and
   all Core tenant allowlists empty. Source SHA `e4db66a` and docs are pushed;
   Railway deployment `a7fb39dc-94c9-4cf0-8ad4-b0c3b7f32aa3` is `SUCCESS`, with
   live readiness/health 200 and unauthenticated PO creation 401.
2. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/91 with 36 pending
   migrations. Obtain supported backup/export, dependent/audit export, and
   owner-approved tenant mapping before any ordered apply.
3. Run disposable PostgreSQL 17 replay, duplicate PO-number reconciliation,
   protected role/cross-tenant/rollback/audit/idempotency evidence, then set an
   explicit provider spend cap before a named tenant canary.
4. Preserve Vercel Git deployment disabled and retained revision `31c04942a93d`;
   create no preview or production build.

## Exact next action after M3.87

1. Keep `ERP_COST_ENTRY_CREATE_WRITES_ENABLED=false` and both Core tenant
   allowlists empty. Source SHA `8be8630` and docs are pushed; Railway
   deployment `61680ed6-7a13-4dc1-9bfb-d3c9c8b29352` is `SUCCESS`, with live
   readiness/health 200 and unauthenticated command 401.
2. Obtain supported Supabase backup/export, dependent/audit export, and owner
   tenant mapping. Keep project `aqqrtkmtcsfkbyyqxowv` read-only at 55/91 with
   36 pending migrations; do not apply source migration yet.
3. Run disposable PostgreSQL 17 replay including migration 91, then protected
   role denial, cross-tenant denial, audit redaction, idempotent replay, and
   rollback evidence. Set explicit provider spend cap before any tenant canary.
4. Preserve Vercel Git deployment disabled and retained revision `31c04942a93d`;
   create no preview or production build.

## Exact next action after M3.86

1. Completed: source SHA `bcee984` and the reviewed documentation are pushed
   to both GitHub refs. Controlled Railway deployment
   `76c27b43-47cd-4912-bca0-19a597190318` is `SUCCESS` for SHA
   `f2457fd13bc7d7d1911e9f3bbb231cddb4de571b`; `/ready` and `/health` are 200.
   No Vercel CLI, preview, or manual Railway redeploy was used.
2. Keep API flags
   `ERP_COST_ENTRY_CREATE_WRITES_ENABLED=false` and
   `ERP_COST_ENTRY_CREATE_WRITES_TENANT_IDS` empty. Keep matching Web Core
   flags false/empty. The route is not a production canary.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/91 with 36 pending
   migrations. Obtain supported backup/export, dependent/audit export, owner
   tenant mapping, and isolated PostgreSQL 17 replay evidence before any
   migration apply.
4. Next: probe role denial, cross-tenant denial, redaction, and idempotent
   replay in a protected disposable/browser lane. Capture rollback evidence
   and an explicit spend cap before a named tenant canary; the unauthenticated
   401 boundary is already observed.
5. Preserve Vercel Git deployment disabled and the retained production
   revision `31c04942a93d`; new source is not live on Vercel until a separately
   approved, spend-capped release.

## Exact next action after M3.85 Vercel spend guard

1. Push source SHA `9cfee695f75e66375c2578235d0f1544a987e3ab` and reviewed docs
   to both GitHub refs. Do not run Vercel CLI or manually redeploy Railway.
2. Keep `apps/web/vercel.json` Git deployment disabled; CI must keep the guard
   green. Retained Vercel revision remains `31c04942a93d`.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/90 with 35 pending
   migrations; no SQL, data, Storage, or provider writes.
4. Continue with protected role/cross-tenant/redaction browser proof, owner
   tenant mapping, clone reconciliation, rollback evidence, and an explicit
   spend cap before any Core canary.

## Exact next action after M3.84 audit summary count polish

1. Push source SHA `5b1cc83ae387deeb83ca98c2ae96782d471dc46c` and the reviewed
   docs commit to both target refs; do not manually redeploy Railway.
2. Keep Vercel Git deployment disabled and create no preview/production build;
   the retained revision remains `31c04942a93d` until an explicitly approved,
   spend-capped release.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/90 with 35 pending
   source migrations. No SQL, migration, data, storage, or provider writes.
4. Next functional gate remains protected role/cross-tenant/redaction browser
   proof, owner tenant mapping, clone reconciliation, rollback evidence, and
   explicit spend cap before any Core canary.

## Exact next action after M3.83 clean-room branding hardening

1. Keep the expanded clean-room guard in every release lane; runtime scan must
   remain zero for ERPNext/Frappe/ABI Ops/Rework/BuildOps outside classified
   historical provenance.
2. Preserve source SHA `1c5b8de` and Railway deployment
   `2e4c80f9-e243-46c3-acfa-6af417a448ee`; no manual redeploy. File manifest is
   API Dockerfile; stale provider metadata remains read-only review only.
3. Do not rename/replay the timestamped historical migration without a
   ledger-compatible plan. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at
   55/90 with 35 pending migrations.
4. Keep Vercel Git disconnected and do not create builds. Retained revision is
   `31c04942a93d`; new source is not live on Vercel.
5. Next functional gate: protected role/cross-tenant/redaction browser proof,
   owner-approved tenant mapping, clone reconciliation, rollback evidence,
   and explicit spend cap before any canary.

## Exact next action after M3.82 project audit filters and pagination

1. Keep `ERP_AUDIT_ACTIVITY_READS_VIA_API=false` and
   `ERP_AUDIT_ACTIVITY_READS_VIA_API_TENANT_IDS` empty. Filter/pagination
   source proof is not protected browser or production-canary evidence.
2. Preserve source SHA `e98a03b` and do not manually redeploy Railway; API
   watched paths were unchanged. Keep Vercel Git disconnected and do not
   create a preview or production build. Retained Vercel revision is
   `31c04942a93d`; new source is not live there.
3. Exercise filter, pagination, role denial, cross-tenant denial, and Core
   redaction in a protected disposable/browser lane before naming a canary.
4. Keep Supabase project `aqqrtkmtcsfkbyyqxowv` read-only at 55/90. Obtain
   supported backup/export, dependent/audit export, owner mapping, clone
   reconciliation, rollback proof, and spend cap before hosted action.
5. Resolve stale Railway provider metadata only through a reviewed,
   non-billing provider action. Python remains advisory.

## Exact next action after M3.81 Core-gated project audit read

1. Keep `ERP_AUDIT_ACTIVITY_READS_VIA_API=false` and
   `ERP_AUDIT_ACTIVITY_READS_VIA_API_TENANT_IDS` empty. The adapter is a
   source seam, not protected production-canary evidence.
2. Preserve source SHA
   `e8d993d5d23e34b1690781f083b7a0c1c5a0603a`, Railway deployment
   `5a562db0-d682-4d99-adba-0adb20436bc8`, and live `/ready`/`/health` 200.
   Do not manually redeploy or trigger another paid backend build.
3. Before a named-tenant canary, obtain protected browser proof for every
   allowed role, verify redaction and cross-tenant denial, capture rollback
   evidence, and reconcile the hosted clone with the clean PostgreSQL 17
   replay.
4. Keep Supabase project `aqqrtkmtcsfkbyyqxowv` read-only at 55/90. Do not
   apply the 35 pending migrations or perform any hosted repair without a
   supported backup/export, dependent/audit export, owner mapping, and an
   explicit spend cap.
5. Keep Vercel Git disconnected; do not create previews or production builds.
   Inspect the stale Railway `@buildops/web` metadata only through a reviewed
   non-billing provider action. Python remains advisory.

## Exact next action after M3.80 audit activity read

1. Keep every workflow flag false and every tenant allowlist empty. The new
   activity route is read-only and redacted; do not add a browser cutover until
   role-specific protected-flow and data-redaction evidence exists.
2. Preserve source SHA
   `1170b55d73b87ac3c932a3c85f267201564cd7bc`, Railway deployment
   `e62e25b9-7e26-4b59-bb32-35ba524c6ae2`, and live `/ready`/`/health` 200.
   Do not manually redeploy or trigger another paid backend build.
3. Inspect the Railway service's stale `@buildops/web` metadata versus the
   `fileServiceManifest` API Dockerfile evidence. Resolve only with an explicit,
   reviewed provider change; no blind setting mutation.
4. Keep Supabase project `aqqrtkmtcsfkbyyqxowv` read-only at 55/90. Obtain
   supported backup/export, dependent/audit export, owner-approved mapping,
   isolated PostgreSQL 17 clone reconciliation, rollback proof, and a spend
   cap before any hosted write or protected canary.
5. Keep Vercel Git disconnected and do not create previews or production builds.
   The next source milestone may add a permissioned activity browser view only
   after the above gates; Python remains advisory.

## Exact next action after M3.79 read-only clone reconciliation

1. Keep every ERP workflow flag false and every tenant allowlist empty. The
   reconciliation report is evidence, not approval for a hosted write or
   protected browser canary.
2. Run the report only with separate hosted `DATABASE_URL` and disposable
   PostgreSQL 17 `REPLAY_DATABASE_URL`; retain the nonzero
   `reconcile_required` result and never pass a hosted URL as the replay URL.
3. Obtain supported backup/export plus dependent/audit export, restore an
   isolated clone, and have the owner map the 35-version ledger gap, missing
   catalog objects, tenant rows, financial totals, and audit differences.
4. Record rollback proof and an explicit spend cap. Do not apply, delete,
   repair, or hand-edit Supabase state; do not trigger Vercel builds.
5. After reconciliation and owner approval, review one named-tenant protected
   Stock Movement canary. Keep docs/scripts-only follow-ups outside Railway
   watch patterns so they remain `SKIPPED`.

## Exact next action after M3.78 disposable replay gate

1. Keep all ERP workflow API flags false and all tenant allowlists empty. The
   disposable replay proves source correctness only; it is not protected
   browser, hosted-data, rollback, or production-canary evidence.
2. Preserve source correction commit
   `a13b2e21cb8c37b099b3c057764a132d8b8f8cc2` and the single successful
   Railway auto-deployment `a7371ef0-0b16-45c6-b4fd-323f33ddf634` for
   `303f266`. Keep later docs-only follow-ups outside watched paths so they
   remain `SKIPPED`; never manually redeploy. Keep Vercel Git disabled and do
   not create previews or production builds.
3. Keep Supabase project `aqqrtkmtcsfkbyyqxowv` read-only at 55/90. The
   read-only verifier's three failures are expected: the 35-entry ordered
   suffix, two source-only command ledgers, and six source-only indexes.
4. Obtain a supported backup/export and dependent/audit export; restore an
   isolated clone and compare catalog, row/data, RLS, tenant, audit, and
   financial totals against the clean replay. Record owner-approved mappings,
   rollback proof, and an explicit spend cap.
5. Only after those gates pass may a named-tenant protected-browser canary for
   Stock Movement post/reverse be reviewed. Do not apply the pending suffix or
   enable its flags from local replay evidence alone.

## Exact next action after M3.77 Stock Movement post/reverse seam

1. Keep `ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_VIA_API=false`,
   `ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_TENANT_IDS` empty,
   `ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_ENABLED=false`, and
   `ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_TENANT_IDS` empty. The live
   401 boundary and local transaction tests are not protected-tenant browser,
   rollback, or hosted-schema proof.
2. Preserve release identity: source SHA
   `7f19315b967f81e120fa64bebc95ed338c4ad2cb`, Railway deployment
   `5320235d-c242-4b3c-8b24-c8de9e1cd8cd`, and live `/ready`/`/health` 200.
   Keep the next docs/verifier follow-up outside Railway API watch patterns;
   do not manually redeploy or trigger a second paid backend build.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/90 (35 pending
   migrations). The hosted verifier currently reports the expected ledger
   gap plus missing source-only server ledgers/indexes. Before any hosted
   apply: obtain supported backup/export, dependent/audit export,
   owner-approved mapping, disposable PostgreSQL 17 replay with Redis,
   catalog/data/RLS diff, rollback proof, and an explicit spend cap.
4. Do not trigger Vercel previews or production builds. Keep the Git-disabled
   project untouched to cap billing.
5. Next source-only candidate: run the disposable PostgreSQL 17 replay and
   reconcile catalog/data/RLS/tenant/audit/financial totals; only then review a
   named-tenant protected browser canary for post/reverse parity.

## Exact next action after M3.75 Stock Movement draft creation

1. Keep `ERP_INVENTORY_STOCK_MOVEMENT_CREATE_VIA_API=false`,
   `ERP_INVENTORY_STOCK_MOVEMENT_CREATE_TENANT_IDS` empty,
   `ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_ENABLED=false`, and
   `ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_TENANT_IDS` empty. Local
   transaction tests and an unauthenticated 401 are not protected-tenant
   browser, rollback, or hosted-schema proof.
2. Preserve release identity: source SHA
   `3b920185fdc438dfc5dd5972f738ea9e0a1d7e30`, Railway deployment
   `e231fe1f-bd37-4e68-bef9-a2d26e0c1061`, and live `/ready`/`/health` 200.
   Documentation follow-ups must stay outside Railway API watch patterns and
   must not trigger another paid backend rebuild.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/89 (34 pending source
   migrations). Before any hosted apply: obtain supported backup/export,
   dependent/audit export, owner-approved mapping, disposable PostgreSQL 17
   replay, catalog/data/RLS diff, and an explicit spend cap. Do not apply the
   pending suffix or the new idempotency migration yet.
4. Do not trigger Vercel previews or production builds. Keep its Git-disabled
   project untouched to cap billing.
5. Next source-only candidate: disposable PostgreSQL replay and ordered
   migration/catalog/RLS reconciliation; then review a named-tenant create
   canary against the legacy action with protected browser evidence before
   enabling either flag.

## Exact next action after M3.76 hosted catalog verifier hardening

1. Keep the four Stock Movement create flags/tenant lists false/empty. The
   hosted verifier now proves the baseline catalog/security boundary but
   intentionally fails the 55/89 ledger and missing source-only idempotency
   catalog; this is not hosted-apply or canary approval.
2. Start Docker or use an approved disposable PostgreSQL 17 environment, then
   replay all 89 migrations from zero with Redis and run the full database
   suite without skips. Capture hashes, catalog/RLS/grant results,
   row/tenant/audit/financial totals, and restore evidence outside Git.
3. Restore an approved Supabase backup into an isolated clone and compare the
   actual catalog/data/RLS/Storage metadata against the clean replay. Obtain
   owner-approved mapping for drifted records and an explicit spend cap before
   any hosted action.
4. Do not apply the pending suffix, repair history, trigger Vercel, or
   manually redeploy Railway. The verified API release remains
   `3b920185fdc438dfc5dd5972f738ea9e0a1d7e30`.

## Exact next action after M3.74 Stock Movement detail read

1. Keep `ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_VIA_API=false` and
   `ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_TENANT_IDS` empty. The 401
   route evidence and local tests are not protected-tenant browser,
   rollback, or hosted-schema proof.
2. Preserve verified release identity: source SHA
   `a693e15fafc4b4b5d2df4f3fd6bef6f72015d702`, Railway deployment
   `a62a237e-2a82-4a40-88ca-2354011d3c9d`, and live `/ready`/`/health` 200.
   Push this documentation follow-up only; it is outside Railway API watch
   patterns and must not trigger another paid backend rebuild.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/88 (33 pending source
   migrations). Before any hosted apply: obtain supported backup/export,
   dependent/audit export, owner-approved mapping, disposable PostgreSQL 17
   replay, and an explicit spend cap. Do not apply the pending suffix yet.
4. Do not trigger Vercel previews or production builds. Keep the Git-disabled
   project untouched to cap billing.
5. Next source-only candidate: reconcile the ordered hosted ledger and run
   the disposable migration replay; only then review a named-tenant detail
   canary against the legacy read and protected browser evidence.

## Exact next action after M3.73 inventory Stock Movement register read

1. Keep `ERP_INVENTORY_STOCK_MOVEMENT_READS_VIA_API=false` and
   `ERP_INVENTORY_STOCK_MOVEMENT_READS_TENANT_IDS` empty. The 401 route
   canary and local tests are not protected-tenant browser, rollback, or
   hosted-schema proof.
2. Preserve verified release identity: source SHA
   `9d3cf5ed179f24c0382ecd7b53b9b94f87812578`, Railway deployment
   `4cbaefcf-82a4-4549-83f4-2bfa094fcebb`, and live `/ready`/`/health` 200.
   Push this documentation follow-up only; it is outside Railway API watch
   patterns and must not trigger another paid backend rebuild.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/88 (33 pending source
   migrations). Before any hosted apply: obtain supported backup/export,
   dependent/audit export, owner-approved mapping, disposable PostgreSQL 17
   replay, and an explicit spend cap. Do not apply the pending suffix yet.
4. Do not trigger Vercel previews or production builds. Keep the Git-disabled
   project untouched to cap billing.
5. Next source-only candidate: reconcile the ordered hosted ledger and run
   the disposable migration replay; only then review a named-tenant Stock
   Movement read canary and verify protected browser data against the legacy
   path.

## Exact next action after M3.72 inventory Warehouse deactivation integrity

1. Keep `ERP_INVENTORY_WAREHOUSE_UPDATE_VIA_API=false`,
   `ERP_INVENTORY_WAREHOUSE_UPDATE_TENANT_IDS` empty,
   `ERP_INVENTORY_WAREHOUSE_UPDATE_WRITES_ENABLED=false`,
   `ERP_INVENTORY_WAREHOUSE_UPDATE_WRITES_TENANT_IDS` empty, and all closeout
   read/write flags false/empty. No protected tenant canary is approved.
2. Preserve release identity: source SHA
   `f391f49d0aa002101649afa79dfc75872120df72`, Railway deployment
   `48cc2b18-1c5d-45eb-b59d-b54571fe673c`, and live `/ready`/`/health` 200.
   Push this docs-only follow-up; it must stay outside API watch patterns and
   must not trigger another paid backend rebuild.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/88 (33 pending source
   migrations). Before any hosted apply: obtain supported backup/export,
   dependent/audit export, owner-approved mapping, disposable PostgreSQL 17
   replay, and explicit spend cap. Do not apply the new deactivation guard yet.
4. Do not trigger Vercel previews or production builds. Keep the Git-disabled
   project untouched to cap billing.
5. Next source-only candidate: reconcile the ordered hosted ledger and run the
   disposable migration replay; only then review a named-tenant canary for the
   deactivation conflict and reversal workflow.

## Exact next action after M3.71 inventory Warehouse closeout/readiness read

1. Keep `ERP_INVENTORY_WAREHOUSE_CLOSEOUT_READS_VIA_API=false` and
   `ERP_INVENTORY_WAREHOUSE_CLOSEOUT_READS_TENANT_IDS` empty. Keep
   `ERP_INVENTORY_WAREHOUSE_UPDATE_VIA_API=false`, its tenant allowlist empty,
   and all Warehouse write flags false/empty. The read route is not a
   protected tenant browser canary, reconciliation approval, rollback proof,
   or hosted-schema proof.
2. Preserve verified release identity: source SHA
   `425c66a757ffa66cd4dfefca2079ebfd61fb3bbf`, Railway deployment
   `1ee3706a-5ef3-4004-9708-ac3efcad5483`, and live `/ready`/`/health` 200.
   Push only this docs follow-up; it must stay outside API watch patterns and
   must not trigger a second paid backend rebuild.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain supported
   backup/export, dependent/audit export, owner-approved mapping, disposable
   PostgreSQL 17 replay, and explicit spend cap before any hosted action.
4. Do not trigger Vercel previews or production builds. Keep the Git-disabled
   project untouched to cap billing.
5. Next source-only candidate: review ledger reconciliation and protected
   Warehouse canary evidence before enabling any closeout read or deactivation
   write for a named tenant.

## Exact next action after M3.70 inventory Warehouse update/deactivation command

1. Keep `ERP_INVENTORY_WAREHOUSE_UPDATE_VIA_API=false`,
   `ERP_INVENTORY_WAREHOUSE_UPDATE_TENANT_IDS` empty,
   `ERP_INVENTORY_WAREHOUSE_UPDATE_WRITES_ENABLED=false`, and
   `ERP_INVENTORY_WAREHOUSE_UPDATE_WRITES_TENANT_IDS` empty. Source and basic
   Railway readiness/401 evidence are not protected tenant browser,
   rollback, or hosted-schema proof.
2. Preserve verified release identity: source SHA
   `4737fec37f97360f8c3ffe6bc98f0bdc78a4cdf5`, Railway deployment
   `382d281a-b022-4296-8b9d-ee84a07c80b1`, and live `/ready`/`/health` 200.
   Docs-only follow-ups must stay outside API watch patterns; do not trigger a
   second paid backend rebuild.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain supported
   backup/export, dependent/audit export, owner-approved mapping, disposable
   PostgreSQL 17 replay, and explicit spend cap before hosted action.
4. Do not trigger Vercel previews or production builds. Keep the Git-disabled
   project untouched to cap billing.
5. Next source-only candidate: define a tenant-scoped Warehouse balance
   closeout/readiness check before considering any protected canary.

## Exact next action after M3.69 inventory Warehouse creation command

1. Keep `ERP_INVENTORY_WAREHOUSE_CREATE_VIA_API=false`,
   `ERP_INVENTORY_WAREHOUSE_CREATE_TENANT_IDS` empty,
   `ERP_INVENTORY_WAREHOUSE_CREATE_WRITES_ENABLED=false`, and
   `ERP_INVENTORY_WAREHOUSE_CREATE_WRITES_TENANT_IDS` empty. Source and basic
   Railway readiness/401 evidence are not protected tenant browser,
   rollback, or hosted-schema proof.
2. Preserve verified release identity: source SHA
   `7b0ccf1d9dda19a61d8f2c26ead42b562b6f2534`, Railway deployment
   `fbbda042-9b51-4c21-a518-a6e4c2fb2752`, and live `/ready`/`/health` 200.
   Docs-only follow-ups must stay outside API watch patterns; do not trigger a
   second paid backend rebuild.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain supported
   backup/export, dependent/audit export, owner-approved mapping, disposable
   PostgreSQL 17 replay, and explicit spend cap before hosted action.
4. Do not trigger Vercel previews or production builds. Keep the Git-disabled
   project untouched to cap billing.
5. Next source-only candidate: define Warehouse update/deactivation authority
   and its compatibility adapter only after the same tenant, audit, rollback,
   and canary gates are reviewed.

## Exact next action after M3.68 inventory UOM creation command

1. Keep `ERP_INVENTORY_UOM_CREATE_VIA_API=false` and its tenant allowlist
   empty. Source, tests, and basic Railway readiness/401 evidence are not
   protected tenant browser, rollback, or hosted-schema proof.
2. Preserve verified release identity: source SHA
   `ae6d7992ebdfcb0439f181ecdcd72b9cb8673c2b`, Railway deployment
   `5ffd0087-7951-4111-92b6-72293cadef14`, and live `/ready`/`/health` 200.
   Docs-only follow-ups must stay outside API watch patterns; do not trigger a
   second paid backend rebuild for documentation.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain supported
   backup/export, dependent/audit export, owner-approved mapping, disposable
   PostgreSQL 17 replay, and explicit spend cap before hosted action.
4. Do not trigger Vercel previews or production builds. Keep Git-disabled
   project untouched to cap billing.

## Exact next action after M3.67 inventory item policy command

1. Keep `ERP_INVENTORY_ITEM_CONFIG_VIA_API=false` and its tenant allowlist
   empty. The source contract and tests plus Railway readiness/401 evidence
   are not protected tenant browser, rollback, or hosted-schema proof.
2. Preserve the verified release identity: source SHA
   `8a0c059826aabf3b0711277c68f1b182db46aa25`, Railway deployment
   `19b808c7-f07c-40f3-a268-df35aaf86071`, and live `/ready`/`/health` 200.
   Push only the reviewed docs follow-up; it must stay outside API watch
   patterns and must not trigger another paid rebuild.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain supported
   backup/export, dependent/audit export, owner-approved mapping, disposable
   PostgreSQL 17 replay, and an explicit spend cap before hosted action.
4. Do not trigger Vercel previews or production builds. Keep the Git-disabled
   project untouched to cap billing.

## Exact next action after M3.66 inventory seam and ledger refresh

1. Keep `ERP_INVENTORY_SUMMARY_READS_VIA_API=false` and its tenant allowlist
   empty; source, Railway readiness/401, and route-log evidence are not a
   protected tenant browser canary or rollback proof.
2. Preserve the Railway release identity: deployment
   `6ba50aba-0f58-4f02-b7b4-655b3e71a70f` and source SHA
   `4da9772516f80255a2cb4adbe376d4ca733513e4`. Docs-only changes must stay
   outside the API watch patterns; do not trigger another paid rebuild.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain supported
   backup/export, dependent/audit export, owner-approved mapping, disposable
   PostgreSQL 17 replay, and an explicit spend cap before any hosted action.
4. Do not trigger Vercel previews or production builds. Keep the Git-disabled
   project untouched to cap billing; no frontend provider release is needed
   for this disabled adapter.

## Exact next action after M3.65 Nest CRM opportunity detail read handoff

1. Keep `ERP_OPPORTUNITY_READS_VIA_API=false` and
   `ERP_OPPORTUNITY_READS_VIA_API_TENANT_IDS` empty; source and Railway
   readiness/401 evidence are not a protected tenant browser canary.
2. Preserve the spend guard: keep Vercel Git deployment disabled and trigger
   no preview or production build. The docs-only push must remain outside the
   Railway API watch patterns.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain the
   supported backup/export, dependent/audit export, owner-approved duplicate-PO
   mapping, and disposable PostgreSQL 17 replay before reconciling the 32-entry
   migration suffix or performing any hosted data action.
4. Only after those gates, run protected browser proof, exact rollback proof,
   and an explicit spend cap for a single-tenant opportunity-read canary.

## Exact next action after M3.64 Nest CRM KYC queue read handoff

1. Keep `ERP_ACCOUNT_KYC_QUEUE_READS_VIA_API=false` and
   `ERP_ACCOUNT_KYC_QUEUE_READS_VIA_API_TENANT_IDS` empty; source tests,
   readiness, and unauthenticated 401 evidence are not a protected tenant
   browser canary.
2. Preserve the spend guard: keep Vercel Git deployment disabled and trigger
   no preview or production build. This slice has no frontend provider
   release.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain the
   supported backup/export, dependent/audit export, owner mapping for the
   duplicate `PO-0002` group, and disposable PostgreSQL 17 replay before any
   protected KYC canary or hosted data action.

## Exact next action after M3.63 Nest CRM account detail read handoff

1. Keep `ERP_ACCOUNT_READS_VIA_API=false` and
   `ERP_ACCOUNT_READS_VIA_API_TENANT_IDS` empty; source and Railway evidence
   are not a protected tenant browser canary.
2. Preserve the spend guard: keep Vercel Git deployment disabled and trigger
   no preview or production build. This slice has no frontend provider release.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain the
   supported backup/export, dependent/audit export, owner mapping for the
   duplicate `PO-0002` group, and disposable PostgreSQL 17 replay before any
   protected account-detail canary or hosted data action.

## Exact next action after M3.62 Nest CRM account collection read handoff

1. Keep `ERP_ACCOUNT_READS_VIA_API=false` and
   `ERP_ACCOUNT_READS_VIA_API_TENANT_IDS` empty; source tests/builds are not a
   tenant browser canary.
2. Preserve the spend guard: keep Vercel Git deployment disabled and trigger no
   preview or production build. This slice has no frontend provider release.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain the
   supported backup/export, dependent/audit export, owner mapping for the
   duplicate `PO-0002` group, and disposable PostgreSQL 17 replay before any
   protected account-read canary or hosted data action.

## Exact next action after M3.61 Nest project update audit hardening

1. Keep `ERP_PROJECT_WRITES_VIA_API=false` and
   `ERP_PROJECT_WRITES_VIA_API_TENANT_IDS` empty; source tests are not a tenant
   write canary.
2. Preserve the spend guard: do not trigger a Vercel build or reconnect Vercel
   Git. Current audit window has zero deployments.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain the
   supported backup/export, dependent/audit export, owner mapping for the
   duplicate `PO-0002` group, and disposable PostgreSQL 17 replay before any
   protected write canary or hosted migration/data action.

## Exact next action after M3.60 Nest project collection read contract (Railway verified)

1. Keep `ERP_PROJECT_LISTS_VIA_API=false` and
   `ERP_PROJECT_LISTS_VIA_API_TENANT_IDS` empty; this is not a tenant canary or
   browser release.
2. Preserve the spend guard: do not trigger a Vercel build or reconnect Vercel
   Git. Current Vercel audit window has zero deployments.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain the
   supported backup/export, dependent/audit export, owner mapping for the
   duplicate `PO-0002` group, and disposable PostgreSQL 17 replay before any
   hosted migration or protected read canary.

## Exact next action after M3.59 Railway Nest Redis module wiring

1. Keep Vercel Git deployment disabled; create no preview or production build
   while the user's billing guard is active.
2. Keep `ERP_PROJECT_READS_VIA_API`, `ERP_PROVIDER_QUOTA_VIA_API`, and all
   tenant allowlists false/empty until protected browser and canary evidence.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain the
   supported recoverable backup plus dependent/audit export and owner-approved
   canonical mapping for the 12 duplicate `PO-0002` records.
4. Re-run the read-only planners and disposable PostgreSQL 17 replay before
   any hosted migration/data action or paid frontend promotion.

## Exact next action after M3.58 Nest project detail read contract

1. Keep `ERP_PROJECT_READS_VIA_API=false` and
   `ERP_PROJECT_READS_VIA_API_TENANT_IDS` empty. Do not enable a tenant canary
   from local build evidence alone.
2. Keep Vercel Git deployment disabled; create no preview or production build.
   The source push and local 80/80 build are not frontend release evidence.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain the
   supported recoverable backup plus dependent-row/audit export and
   owner-approved canonical mapping for the 12 duplicate Purchase Orders.
4. Re-run the read-only planners and disposable PostgreSQL 17 replay. Only
   after that gate, exact Railway identity/readiness, protected browser proof,
   rollback evidence, and an explicit spend cap may one tenant read canary run.

Completed M3.58 gates: focused API 26/26, shared types 4/4, Web core/project
reads 77/77, full Web 75/479, shared types 15/164, API/Web typecheck/build,
workspace lint, and `git diff --check`. No hosted mutation or Vercel build.

## Exact next action after M3.57 stale Supabase refresh-token recovery

1. Keep Vercel Git deployment disabled and create no preview/production build;
   the source fix is not frontend release evidence.
2. Keep Supabase aqqrtkmtcsfkbyyqxowv read-only at 55/87. Obtain the
   supported recoverable backup plus dependent-row/audit export and
   owner-approved canonical mapping for the 12 duplicate Purchase Orders.
3. Rerun the read-only planners and disposable PostgreSQL 17 replay before
   applying any ordered migration suffix or enabling a canary.
4. On the next spend-approved frontend release, verify stale-cookie recovery,
   protected redirects, auth behavior, console output, and exact deployment
   identity.

Completed M3.57 gates: Web 75/476, focused recovery 5/5, typecheck,
git diff --check, and 80/80 build. No Vercel build or hosted mutation
occurred.

## Exact next action after M3.54 Cortex sources in the command palette

1. Keep Vercel Git deployment disabled. Do not create a preview or production
   build for this source-only slice; the read-only inventory is zero since
   `1785840000000`, and the user's on-demand billing risk remains active.
2. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Do not apply the
   suffix, edit migration history, repair/rename/delete duplicate Purchase
   Orders, or run direct DDL.
3. Obtain the supported recoverable backup plus dependent-row/audit export and
   owner-approved canonical mapping for the 12-record duplicate group. Rerun
   the read-only planners and a disposable PostgreSQL 17 replay.
4. Require rollback, audit-chain, provider identity, protected-flow, and spend
   evidence before any hosted apply or frontend promotion. The palette source
   rows remain read-only and cannot approve or finalize ERP transactions.

Completed source/provider gates for `6c975261`: focused 14/14, Web 72/465,
workspace lint/typecheck, 80/80 build, GitHub/Railway `success`, live Railway
readiness healthy, and zero Vercel deployments since the recorded timestamp.
No hosted mutation occurred.

## Exact next action after M3.55 provider-backed burst cost guard

1. Keep Vercel Git deployment disabled and create no preview/production build;
   source push is not frontend release evidence and spend risk remains active.
2. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Do not apply the
   suffix, edit migration history, repair/rename/delete duplicate Purchase
   Orders, or run direct DDL.
3. Obtain supported recoverable backup plus dependent-row/audit export and
   owner-approved canonical mapping for the 12-record duplicate group. Rerun
   planners and disposable PostgreSQL 17 replay.
4. Treat edge provider limits as burst protection only. Plan shared Redis
   quota/lock accounting in NestJS as a separate tested milestone; do not claim
   global quota from current per-instance map.

Completed gates for `4d190dfd`: focused 5/5, Web 72/468, workspace
lint/typecheck, 80/80 build, clean diff, and source push under `kurtgav`. No
Vercel build or hosted DB/provider mutation occurred.

## Exact next action after M3.56 shared Redis provider quota gateway

1. Keep `ERP_PROVIDER_QUOTA_VIA_API=false` and
   `ERP_PROVIDER_QUOTA_VIA_API_TENANT_IDS` empty. Do not activate a real tenant
   until exact Railway source identity, Redis behavior, bearer authorization,
   and replay evidence are recorded.
2. Keep Vercel Git deployment disabled. Do not create preview/production builds;
   local Web build is validation only and source push is not frontend release.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Obtain supported
   recoverable backup plus dependent-row/audit export and owner-approved
   canonical mapping for the 12 duplicate Purchase Orders. Rerun planners and
   disposable PostgreSQL 17 replay.
4. After database gate, run a separately approved single-tenant quota canary:
   verify 20/6 Redis decisions, 429 headers, auth scope, fail-closed outage,
   and no provider call after block. Keep Redis free of business payloads.

Completed M3.56 gates: API 60/308, Web 73/471, focused API quota 7/7, Web
quota 3/3, workspace lint/typecheck, API build, Web 80/80 build, and clean
diff. No Vercel build, hosted DB/provider setting, or quota canary occurred.

## Exact next action after M3.53 clean-room runtime branding audit

1. Keep the verified source `0c911f8` on both target Git branches. Do not
   create a Vercel preview or production build; deployment inventory is already
   unchanged and the spend gate remains closed.
2. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Do not rename
   migration files, edit history, apply the suffix, or repair/delete duplicate
   Purchase Orders without owner approval.
3. Retain the clean-room scan in the Web suite and repeat the live marker,
   metadata, responsive, and console sweep before any spend-approved frontend
   release.
4. Obtain the supported recoverable backup plus dependent-row/audit export and
   owner-approved canonical mapping for the duplicate group; rerun planners
   and disposable PostgreSQL 17 replay before the ordered suffix.

Source/provider gates for `0c911f8` pass: focused clean-room/landing 6/6, Web
71/463, workspace lint/typecheck, 80/80 build, GitHub/Railway `success`, live
readiness healthy, and zero Vercel deployments. No hosted mutation occurred.

## Exact next action after M3.52 Cortex operational brief presentation

1. Keep Vercel Git deployment disabled. Do not create preview or production
   builds; source pushes are not frontend release evidence and the user's
   on-demand billing concern remains active.
2. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87. Do not apply the
   suffix, repair/rename/delete duplicate Purchase Orders, edit migration
   history, or run direct DDL.
3. Obtain the supported recoverable backup plus dependent-row/audit export and
   owner-approved canonical mapping for the 12-record duplicate group. Rerun
   the read-only planners and a disposable PostgreSQL 17 replay.
4. Require rollback, audit-chain, provider identity, protected-flow, and
   spend evidence before any hosted apply or frontend promotion. The Cortex
   panel remains read-only and cannot approve or finalize ERP transactions.

Completed source/provider gates for `1e5aa4d`: focused/full Web tests,
workspace lint/typecheck, 80/80 build, and bounded local browser checks pass;
GitHub/Railway is `success` with live readiness healthy; Vercel created zero
deployments; Supabase is unchanged. Authenticated Cortex browser proof is
deferred because no real tenant credential was used.

## Exact next action after M3.51 Cortex operational brief

1. Keep Vercel Git deployment disabled and create no preview or production
   build. Confirm the deployment inventory remains unchanged after the push.
2. Keep Supabase read-only at 55/87. Do not apply the suffix, repair duplicate
   Purchase Orders, edit migration history, or run direct DDL without the
   supported backup/export and owner-approved mapping gates.
3. Obtain the supported backup plus dependent-row/audit export and owner-
   approved canonical mapping for the duplicate group; rerun the read-only
   planners and disposable replay.
4. Only after those gates clear, schedule a separate, spend-approved browser
   and frontend release check. The Cortex brief remains read-only and cannot
   approve or finalize ERP transactions.

Source gates already completed: lint/typecheck and 80/80-route build pass;
Turbo-parallel tests had one API resource-contention timeout, while isolated
package reruns passed API 58/300, Web 69/458, Database 41/166, and Shared Types
15/163. The 140 database integration tests requiring `DATABASE_URL` remain
skipped.

Provider gates completed for `cfffa7a756609c49fa84b293ec71611c892182dd`: both
branches match, GitHub/Railway is `success`, live API readiness is healthy,
Vercel created zero deployments, and Supabase remains unchanged at 55/87.
Next action returns to the migration gate: obtain the supported backup and
dependent-row/audit export plus owner-approved duplicate mapping; keep Vercel
and hosted SQL closed until disposable replay and rollback evidence pass.

## Exact next action after M3.50 cost-capped provider and migration audit

1. Keep Vercel Git deployment disabled and create no preview or production
   build. Source pushes do not authorize a paid frontend action. Use the
   existing retained deployment only as rollback until explicit spend approval.
2. Keep all supplier read/write/session/link flags closed. Do not apply the
   Supabase suffix, call `supabase_apply_migration`, reset the branch, edit
   migration history, or run direct DDL.
3. Obtain a supported recoverable backup plus dependent-row/audit export for
   the duplicate Purchase Order group. Get an owner-approved canonical mapping
   for the 12 records, then rerun both read-only planners.
4. Require a clean PostgreSQL 17 disposable replay, schema/catalog diff,
   migration risk review, rollback plan, and exact provider identity before
   any hosted apply. Python remains advisory and cannot finalize ERP writes.
5. After the DB gate clears, perform one bounded Railway/API or Vercel
   production action at a time, verify exact SHA, readiness, protected flows,
   logs, browser/data evidence, and spend impact. Stop on any failed gate.

The prior M3.49 action list is retained below as historical evidence.

## Exact next action after M3.49 supplier confirmation review

1. Commit and push the reviewed source/docs once to `main` and
   `agent-02/third-code-erp-landing` as `kurtgav`; verify the exact SHA,
   GitHub check, Railway deployment/readiness, and the unchanged Vercel query.
2. Keep `ERP_PUBLIC_VENDOR_CONFIRMATION_READ_ENABLED` and its tenant list
   false/empty, and keep the existing supplier write, session-minting, and
   link-delivery controls closed. Do not apply the source migration suffix.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` read-only at 55/87 until a supported
   recoverable backup, dependent-row/audit export, and owner-approved repair
   for duplicate tenant `PO-0002` rows exist. Never reset history, rename or
   delete rows, or auto-repair the duplicate group.
4. Keep Vercel Git/deployments disconnected and spend-protected; do not create
   a paid production or preview build. The source portal is not live until a
   spend-approved frontend release path and authenticated browser proof exist.
5. After the hosted gates clear, run disposable invalid/expired/revoked,
   cross-tenant, replay/idempotency, and already-answered checks before
   enabling one tenant canary. Python remains advisory and cannot approve the
   supplier decision.

Completed source/provider verification: `386fd2a` is on both branches;
GitHub/Railway is `success` with Railway deployment
`430e835a-c2bc-4dfb-8994-a5b7e5a0e1ce` `SUCCESS`, `/ready` and `/health` are
healthy, the closed read probe is `503`, and Vercel has zero deployments after
the push. Supabase is unchanged at 55 migrations and its latest branch-action
log still fails the duplicate `PO-0002` preflight. The next action is the
recoverable backup/owner-approved repair and ordered hosted replay, not another
deployment attempt.

## Exact next action after M3.48 landing GEO structured data

1. Preserve source/docs SHA `d8520f4` on `main` and
   `agent-02/third-code-erp-landing`; no additional push is needed for this
   milestone.
2. Keep Vercel read-only; do not reconnect Git or trigger a paid build.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` unchanged at 55/87 until a supported
   recoverable backup, dependent-row/audit export, and owner-approved repair
   for duplicate tenant `PO-0002` exist. Do not reset, edit history, rename,
   delete, or replay the failed suffix.
4. Authenticated landing/product browser proof remains a provider-runtime gate
   if local Supabase DNS cannot resolve; local production HTML evidence does
   not replace it.
5. Before claiming the GEO graph live, obtain an explicitly spend-approved
   Vercel release path or use a bounded alternative host; the current public
   deployment predates `ce1ae6e` and no Vercel build was triggered.

## Exact next action after M3.47 proposal read tenant scope

1. Push the reviewed source/docs once to `main` and
   `agent-02/third-code-erp-landing`; verify the exact GitHub status, Railway
   skip/deploy identity, and live `/ready`/`/health`. Do not trigger Vercel.
2. Keep Supabase `aqqrtkmtcsfkbyyqxowv` unchanged at 55/87 until supported
   backup, dependent-row/audit export, and owner-approved duplicate `PO-0002`
   repair are available. Keep Vercel Git/deployments disconnected and
   spend-protected.
3. Authenticated proposal desktop/mobile proof remains open if local Supabase
DNS cannot resolve; do not infer it from unauthenticated redirects.
4. Treat Supabase `MIGRATIONS_FAILED` plus the repeated `P0001` log as
   non-ready, not success. A logs API `INVALID_ARGUMENT` is also not proof of
   recovery. Do not reset the branch, edit migration history, rename/delete PO
   rows, or replay the suffix without backup and owner approval.

## Exact next action after M3.46 command palette accessibility

1. Push the reviewed source/docs once to `main` and
   `agent-02/third-code-erp-landing` as `kurtgav`; verify the exact GitHub
   status and linked Railway service readiness. Do not trigger Vercel.
2. Keep Supabase `aqqrtkmtcsfkbyyqxowv` unchanged at the 55/87 boundary until
   supported backup, dependent-row/audit export, and owner-approved duplicate
   `PO-0002` repair are available. Keep Vercel Git/deployments disconnected
   and spend-protected.
3. Current evidence: `0a085b7` is on both target branches, GitHub's Railway
   check is `success`, Railway skipped the frontend/docs-only commit, live API
   readiness is 200, Supabase is unchanged at 55/87, and Vercel has no new
   deployment. Do not infer production frontend rollout from the source push.

## Exact next action after M3.45 Cortex search accessibility

1. Re-run authenticated Cortex desktop/mobile browser proof from a runtime
   that can resolve `aqqrtkmtcsfkbyyqxowv.supabase.co`; verify graph/search
   network responses, keyboard selection, ARIA state, zero console errors, and
   zero horizontal overflow. Do not treat the unauthenticated redirect as a
   Cortex pass.
2. Keep Vercel Git/deployments disconnected and spend-protected; do not trigger
   a preview/build for this frontend-only slice. Railway remains the linked
   API service and should only auto-deploy source changes that affect it.
3. Preserve the Supabase 55/87 migration boundary. Obtain a supported,
   recoverable backup, export dependent rows/audit evidence, and get an
   owner-approved canonical decision for the 12 duplicate `PO-0002` rows
   before any ordered suffix replay. Never auto-repair records or hand-edit
   migration history.

## Exact next action after M3.44 admin data-quality review

1. Obtain a supported recoverable Supabase backup/restore point and export the
   12-row duplicate `PO-0002` group with dependent lines, documents, and audit
   evidence. Get an owner-approved canonical decision before any repair.
2. Execute one audited, reversible repair through the supported provider path,
   replay the ordered suffix from
   `20260801090000_purchase_order_create_idempotency.sql`, and verify the
   migration ledger, catalog, RLS/policies, Storage, and audit continuity.
3. Keep all mutation flags closed, Vercel Git disconnected, and review a
   Nest-owned tenant canary only
   after provider, rollback, audit, tenant-isolation, and spend gates clear.

## Exact next action after M3.43 Supabase reconciliation

1. Obtain a supported recoverable Supabase backup/restore point and export the
   12-row duplicate `PO-0002` group with dependent lines, documents, and audit
   evidence; do not mutate it yet.
2. Get an owner-approved canonical-number/data-repair decision. Execute only
   one audited, reversible repair through the supported provider path.
3. Resume the ordered source suffix from
   `20260801090000_purchase_order_create_idempotency.sql`; stop at the first
   new failure and verify the migration ledger, catalog, RLS/policies, Storage,
   and audit continuity.
4. Keep all mutation flags false, Vercel Git disconnected, and no raw SQL or
   hand-edited migration history. Review one Nest-owned tenant canary only
   after the provider and rollback gates clear.

## Exact next action after M3.42 Project Command Center

1. Push source `a225340` plus the milestone documentation once to `main` and
   `agent-02/third-code-erp-landing` as `kurtgav`; do not reconnect Vercel Git
   or trigger a preview/build.
2. Verify GitHub's exact-SHA status, Railway deployment identity, and live
   `/ready`/`/health`. Record any provider failure separately from the local
   green source gates.
3. Keep Supabase `aqqrtkmtcsfkbyyqxowv` at the verified 55-row prefix. Obtain
   the supported backup/catalog/data/RLS/Storage reconciliation path before
   applying any SQL; do not hand-edit migration history or bypass ordered
   migrations.
4. Keep all mutation flags closed. After the provider/rollback/audit/
   tenant-isolation/spend gates clear, implement one small Nest-owned
   mutation canary and verify it end to end.

# Exact next action after M3.41 read-only Today Command Center

1. Push source checkpoint `ab905091ada2f7db927e6cf4c2de687ee2010194` plus
   this milestone documentation once to `main` and
   `agent-02/third-code-erp-landing` under `kurtgav`; do not reconnect Vercel
   Git or create a preview/build.
2. Verify GitHub's exact-SHA check, Railway deployment identity, and live
   `/ready`/`/health`; record any provider failure without treating local
   compilation as production proof.
3. Keep Supabase at the verified 55-row prefix. Resolve its supported
   migration-reconciliation/backup/catalog/data/RLS/Storage path before any
   SQL, and keep every mutation flag false/empty.
4. After that gate, add one small Nest-owned mutation canary with replay,
   audit, tenant isolation, rollback, and spend-bounded provider evidence.

# Exact next action after M3.40 governing BuildOps product contract

1. Source checkpoint `a66b43bd9c1694f19de69ad3f0a49808fc41b8fd` is pushed to
   both target branches under `kurtgav`; Railway's GitHub check and live
   readiness are green. Do not trigger Vercel or change its spend-protection
   boundary.
2. Obtain an approved, recoverable Supabase backup/restore point and complete
   the 55/87 catalog, data/duplicate, constraints/functions/triggers,
   RLS/policy, Storage, and migration-history diff. Resolve the connector's
   `INVALID_ARGUMENT` and `MIGRATIONS_FAILED` state through the supported
   provider path; never hand-insert migration history or bypass ordered SQL.
3. After that gate, add the smallest read-only Today/Project Command Center
   slice from existing authorized reads. Prove tenant/RBAC scope, citations,
   browser responsiveness, cache privacy, and zero mutation. Keep both
   project-create flags false until a later, reviewed Nest canary.

# Exact next action after M3.39 durable project-create idempotency

1. Keep `ERP_PROJECT_CREATE_WRITES_ENABLED=false`, its tenant allowlist empty,
   `ERP_PROJECT_CREATE_WRITES_VIA_API=false`, and its frontend allowlist empty;
   the legacy Server Action remains the active path. Do not trigger Vercel or
   apply hosted SQL from clone evidence alone.
2. Under approved owner/provider authority, take a recoverable Supabase
   backup/restore point and diff the hosted 55-row prefix against all 87
   source migrations: tables, columns, constraints, functions, triggers,
   RLS/policies, data/duplicates, Storage inventory, and migration history.
3. Resolve the Supabase connector's `INVALID_ARGUMENT` for the real migration
   SQL and the reported `MIGRATIONS_FAILED` branch state through the supported
   provider path. Do not hand-insert migration history or bypass the ordered
   suffix with raw DDL.
4. Re-run the disposable two-tenant PostgreSQL/Redis replay and audit-chain
   recovery check against the exact release SHA, document rollback, and then
   review one tenant canary. Enable only the smallest approved allowlist after
   provider identity and spend gates pass; verify `/ready`, `/health`, API
   replay/conflict, audit, and browser behavior immediately.

## Exact next action after M3.38 project-create authority seam

1. Add a forward-only `project_create_requests` migration/table with tenant
   scope, idempotency key, canonical request hash, explicit state, result
   reference, timestamps, and unique constraints. Keep both project-create
   flags false while implementing it.
2. Add Nest transaction tests and disposable PostgreSQL 17 + Redis replay for
   first request, safe retry, same-key/different-payload conflict, rollback,
   audit entry, and cross-tenant denial. Then exercise the Next adapter through
   one authenticated tenant and one denied tenant.
3. Only after zero-skip evidence, catalog/data/RLS diff, backup/restore,
   provider identity, rollback, and spend approval: enable one canary tenant.
   Do not apply SQL to the hosted 55/86 Supabase target or trigger Vercel now.

## Exact next action after M3.37 read-only provider incident audit

1. Keep Vercel Git/deployments disconnected and spend-protected. Do not use a
   blind rebuild or promotion. If a frontend release is later approved, use
   one prebuilt artifact from a verified source SHA and verify the live domain,
   session redirect, dashboard render, and runtime logs immediately.
2. Preserve Supabase at the exact 55/86 prefix. Obtain approved PITR/logical
   backup and clone authority; replay all 86 source migrations in PostgreSQL
   17; diff the 111-table clone against the 88-table target, including data,
   constraints, functions, RLS, Storage inventory, and migration history.
3. Run the zero-skipped PostgreSQL/Redis lane, Cortex two-tenant authorization
   replay, duplicate/rollback/audit recovery checks, and provider/spend gates.
   Only then prepare a reviewed forward-only hosted reconciliation and a
   single canary promotion.

## Exact next action after M3.36 supplier-issued outbox replay

1. Source push is complete at commit
   `11c8168248edc02eed93aff9be0204c12559152b` on both target branches;
   Railway deployment `52dca77c-5bec-442f-85cd-f1cd81bde478` is healthy. Do
   not trigger a Vercel build or apply hosted SQL from this milestone.
2. Reconcile the now 86-file source ledger against the 55-row Supabase target
   in an approved PostgreSQL 17 clone: backup/restore, catalog/data/RLS diff,
   duplicate-record mapping, audit recovery, rollback, and zero-skipped
   integration evidence remain required.
3. Keep all supplier-confirmation flags false/empty, Vercel Git/deployments
   paused, and Railway variables unchanged until owner/provider identity and a
   spend-bounded canary are explicitly approved.

## Exact next action after M3.35 authenticated Cortex browser proof

1. Build/replay isolated PostgreSQL 17 + Redis fixtures with two tenants and
   two roles; rerun Cortex graph/search/chat/conversation flows with one tenant
   authenticated at a time.
2. Assert cross-tenant denial, role-filtered citations, direct-identifier
   redaction before model/embedding calls, audit-chain entries, idempotent
   replay, and rollback. Keep all ERP mutation flags closed.
3. Only after zero-skipped disposable evidence, migration catalog/RLS diff,
   backup/restore, owner approval, and spend gates pass, plan hosted migration
   reconciliation. Keep Vercel Git/deployments paused.

## Exact next action after M3.34 authenticated browser route boundary

1. Verify one disposable authenticated tenant in a real browser: allowed
   Cortex/finance/inventory routes render; missing session redirects to login;
   API calls return 401 JSON/text, not login HTML.
2. Run denied-role, cross-tenant, redaction, citation-navigation, and private
   response-header checks through the authenticated Cortex UI. Keep all ERP
   mutation controls closed during this audit.
3. Keep Supabase at 55 hosted migrations until clone/replay, catalog/data/RLS,
   backup/recovery, owner, provider, and spend gates clear. Keep Vercel Git and
   deployments paused until one authorized, spend-bounded promotion exists.

## Exact next action after M3.33 Cortex transport hardening

1. Commit `36a37e9` is the verified source checkpoint on `main` and
   `agent-02/third-code-erp-landing` under `kurtgav`; do not create another
   provider deployment for this transport-only slice.
2. With disposable authenticated tenant fixtures, verify Cortex allowed,
   denied, cross-tenant, redacted, and citation-bearing browser flows. Confirm
   the `private, no-store`/`Vary: Cookie` contract in the browser network log.
3. Keep Supabase at the 55-row hosted ledger until the M3.31 clone/replay,
   catalog/data/RLS, backup/recovery, owner, provider, and spend gates clear.
   Keep Vercel Git/deployments paused until team authorization and one
   spend-bounded prebuilt promotion are explicitly approved.

## Exact next action after M3.32 landing Cortex preview

1. Keep Cortex preview sample-only and read-only; do not connect it to tenant
   data, enable anonymous retrieval, or add ERP mutation handlers.
2. Preserve Vercel spend protection. Verify exact GitHub commit and local
   desktop/mobile browser evidence before any controlled promotion; Railway
   should remain unchanged because this slice is frontend-only.
3. Resolve the Vercel team authorization blocker, then perform one controlled
   prebuilt promotion only after the preview artifact is browser-verified; do
   not use blind retry or re-enable automatic Git deployments.
4. Next product slice: audit authenticated Cortex command/search surfaces and
   define a permission/citation contract before wiring any new landing CTA to
   live retrieval.

See `docs/research/BEHAVIORS.md`, `PAGE_TOPOLOGY.md`, and
`docs/research/components/` for measured live UI evidence.

## Exact next action after M3.31 Supabase reconciliation audit

1. Keep all supplier-confirmation controls false/empty; do not apply the 30
   pending migrations, edit `supabase_migrations.schema_migrations`, trigger
   Vercel, or change hosted provider settings.
2. Obtain approved PITR/backup, logical-dump, and Storage inventory evidence;
   restore Supabase into an isolated PostgreSQL 17 clone; replay all 85 source
   migrations; and diff schema, constraints, functions, RLS, and business data.
3. Run zero-skipped database/Nest integration tests, duplicate-PO mapping,
   audit recovery, idempotency/replay, rollback, provider identity, and
   spend-bounded canary gates. Only then author/apply a reviewed forward-only
   reconciliation migration and verify Railway/Vercel release identity.

See [`DATABASE_RECONCILIATION_M3.31.md`](../architecture/DATABASE_RECONCILIATION_M3.31.md)
for the exact 30-file suffix, manifest, and read-only evidence.

## Exact next action after M3.30 source link-delivery slice

1. Keep `ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_ENABLED` and
   `ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_TENANT_IDS` false/empty;
   keep `ERP_PUBLIC_VENDOR_CONFIRMATION_BASE_URL` unset. The link service also
   requires the existing public-write gate and tenant allowlist, so no dead
   supplier URL can be sent while the route is closed.
2. Do not apply Supabase migrations or trigger Vercel. Reconcile the complete
   30-migration hosted suffix, then run disposable pending/unexpired,
   expired/revoked, replay, cross-tenant, provider retry, rollback, and
   spend-bounded email proofs before enabling one tenant.
3. Preserve the existing supplier outbox and email retry contract. The next
   source milestone after provider evidence is a hosted canary and runtime
   verification, not a UI rewrite.

## Exact next action after M3.29 Railway source deployment

1. Keep `ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_ENABLED` and
   `ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_TENANT_IDS` false/empty;
   keep `ERP_PUBLIC_VENDOR_CONFIRMATION_TOKEN_SECRET` unset. Do not apply
   `20260803160000_vendor_confirmation_session_minting.sql` alone; reconcile
   the complete ordered 30-migration suffix only after disposable session
   insert/replay/expiry/cross-tenant proof, duplicate-PO mapping,
   owner-approved `AUDIT_RECOVERY_TENANT_ID`, rollback, provider identity, and
   spend gates clear.
2. Source `e81087e` is published under `kurtgav`; Railway deployment
   `dacccb49-9bca-4754-8a48-17feded185bf` is `SUCCESS`, `/ready` is database
   and Redis `ok`, and the valid-format public-command probe returned `503`.
   Keep Supabase read-only at 55 applied migrations and do not trigger Vercel.
3. Keep public link delivery separate. It may consume the redacted session
   UUID only after email-provider, token reconstruction, expiry/revocation,
   retry, rollback, and spend-bounded canary evidence passes.

The landing page remains protected by the existing desktop/mobile screenshots,
behavior sweep, SEO metadata, and no-reference-brand scan. No UI rewrite is
authorized by this backend milestone.

## Exact next action after M3.28 Railway source deployment (2026-08-03)

1. Keep `ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_ENABLED` and
   `ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_TENANT_IDS` false/empty. Do not apply
   `20260803150000_vendor_confirmation_workflow.sql` alone; reconcile the
   complete ordered 29-migration suffix only after duplicate-PO mapping,
   owner-approved `AUDIT_RECOVERY_TENANT_ID`, guarded Postgres/Redis
   integration, disposable response replay/expiry/revocation/cross-tenant
   proof, rollback, provider identity, and spend gates clear.
2. Implement the follow-on protected session-minting seam at `scm_issue` with
   deterministic session replay and redacted supplier-link payload. Preserve
   the current supplier email retry and Purchase Order status behavior; do not
   expose a public link until the email and rollback proof pass.
3. Keep the deployed Railway SHA `850eee5` as the only M3.28 runtime; do not
   trigger Vercel or apply Supabase. The next source action is the protected
   session-minting seam only after the gates above clear.

The landing page remains protected by the existing desktop/mobile screenshots,
behavior sweep, SEO metadata, and no-reference-brand scan. No UI rewrite is
authorized by this checkpoint.

## Exact next action after local M3.27 public client-signing slice

1. Keep `ERP_PUBLIC_SIGNING_WRITES_ENABLED`,
   `ERP_PUBLIC_SIGNING_WRITES_TENANT_IDS`, `ERP_PUBLIC_SIGNING_VIA_API`, and
   `ERP_PUBLIC_SIGNING_VIA_API_TENANT_IDS` false/empty. Do not apply
   `20260803140000_public_signing_workflow.sql` alone; reconcile the complete
   ordered 28-migration suffix only after duplicate-PO mapping,
   owner-approved `AUDIT_RECOVERY_TENANT_ID`, guarded Postgres/Redis
   integration, disposable signing replay/expiry/revocation/source-stamp and
   Storage-cleanup proof, rollback, provider identity, and spend gates clear.
2. Source `af8690d` is published under `kurtgav`; Railway deployment
   `d4afe970-6958-4f38-a17a-fa8c01ca13d4` is `SUCCESS` at that SHA, Docker
   build and `/ready` are green, and a no-write signing probe returned `503`.
   Keep Vercel Git disconnected: production remains on revision
   `31c04942a93d` and no `af8690d` preview or production build exists.
3. After owner inputs and exact provider identity, rerun the read-only
   Supabase planner, execute one disposable public-signing transaction and
   replay/rollback proof, then review one spend-bounded canary. The serialized
   full API runner timed out before returning a result and must be rerun in a
   bounded CI environment before broad promotion.

Source now has 83 migrations versus 55 hosted. No hosted mutation, feature
flag change, Vercel deployment, or paid build is authorized by the current
evidence.

## Exact next action after local M3.26 document deletion slice

1. Keep `ERP_DOCUMENT_DELETE_WRITES_ENABLED`,
   `ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS`,
   `ERP_DOCUMENT_DELETE_WRITES_VIA_API`, and
   `ERP_DOCUMENT_DELETE_WRITES_VIA_API_TENANT_IDS` false/empty. Do not apply
   `20260803130000_document_delete_workflow.sql` alone; reconcile the complete
   ordered 27-migration suffix only after duplicate-PO mapping,
   owner-approved `AUDIT_RECOVERY_TENANT_ID`, guarded Postgres/Redis
   integration, rollback, provider identity, and spend gates clear.
2. Railway project/service/environment linkage, source `5ad72ec`, deployment
   success, and `/ready` database/Redis readiness are verified under `kurtgav`.
   Still read-only verify variables, protected flows, logs, and rollback target
   before another release. Keep Vercel Git disconnected and avoid preview
   builds.
3. After owner inputs and exact provider identity, rerun the read-only
   Supabase planner, execute one disposable document delete/replay/
   processing-history refusal/rollback proof, then review one spend-bounded
   source publication and provider action.

Source now has 82 migrations versus 55 hosted. No hosted mutation, feature
flag change, Railway release, Vercel deployment, or paid build is authorized
by the current evidence. Source checkpoint `5ad72ec` is published to both
target branches. The serialized full API runner timed out before
returning a result; focused API and all Web gates are recorded in the work
log.

## Exact next action after local M3.25 cash draft mutation slice

1. Keep
   `ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED`,
   `ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS`,
   `ERP_FINANCE_CASH_DRAFT_WRITES_VIA_API`, and
   `ERP_FINANCE_CASH_DRAFT_WRITES_VIA_API_TENANT_IDS` false/empty. Do not
   apply `20260803120000_cash_transaction_draft_workflow.sql` alone;
   reconcile the complete ordered 26-migration suffix only after duplicate-PO
   mapping, canonical `AUDIT_RECOVERY_TENANT_ID`, guarded Postgres/Redis
   integration, rollback, and provider-identity gates clear.
2. The isolated Next production build now passes with 78/78 generated routes
   under `NEXT_TELEMETRY_DISABLED=1` and `CI=1`; keep hosted release held by
   the DB, data, identity, rollback, and spend gates.
3. Re-authenticate Railway as `kurtgav`; keep Vercel Git disconnected and
   avoid preview builds. Source publication remains separate from hosted
   migration and deployment.
4. After owner inputs and exact provider identity, rerun the read-only
   Supabase planner, execute one disposable cash-draft save/update/delete/
   replay/rollback proof, then review one spend-bounded source publication and
   provider action.

Source now has 81 migrations versus 55 hosted. No hosted mutation, feature
flag change, Railway release, Vercel deployment, or paid build is authorized
by the current evidence.

GitHub source checkpoint: `main` and
`agent-02/third-code-erp-landing` both include `46035fa` under the verified
`kurtgav <kurtgavin.design@gmail.com>` identity.

## Exact next action after local M3.24 customer-invoice cancellation slice

1. Keep
   `ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED`,
   `ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS`,
   `ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_VIA_API`, and
   `ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_VIA_API_TENANT_IDS`
   false/empty. Do not apply
   `20260803110000_customer_invoice_cancel_workflow.sql` alone; reconcile the
   complete ordered 25-migration suffix only after the duplicate PO mapping,
   canonical `AUDIT_RECOVERY_TENANT_ID`, guarded Postgres/Redis integration,
   rollback, and provider-identity gates clear.
2. Re-authenticate Railway as `kurtgav`; do not substitute a fork/account or
   reconnect Vercel Git. GitHub source publication remains a separate action.
3. After owner inputs and exact provider identity, rerun the read-only
   Supabase planner, execute one disposable invoice cancellation/replay/
   rollback proof, then review one spend-bounded source publication and
   provider action.

Source now has 80 migrations versus 55 hosted. No hosted mutation, feature
flag change, Railway release, Vercel deployment, or paid build is authorized by
the current evidence.

## Exact next action after local M3.23 customer-invoice reversal slice

1. Keep
   `ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED`,
   `ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS`,
   `ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_VIA_API`, and
   `ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_VIA_API_TENANT_IDS`
   false/empty. Do not apply
   `20260803100000_customer_invoice_reverse_workflow.sql` alone; reconcile
   the complete ordered 24-migration suffix only after the duplicate PO
   mapping, canonical `AUDIT_RECOVERY_TENANT_ID`, guarded Postgres/Redis
   integration, rollback, and provider-identity gates clear.
2. Re-authenticate Railway as `kurtgav`; do not substitute a fork/account or
   reconnect Vercel Git. GitHub source publication remains a separate action.
3. After owner inputs and exact provider identity, rerun the read-only
   Supabase planner, execute one disposable invoice reversal/replay/rollback
   proof, then review one spend-bounded source publication and provider action.

Source now has 79 migrations versus 55 hosted. No hosted mutation, feature
flag change, Railway release, Vercel deployment, or paid build is authorized by
the current evidence.

## Immediate hosted release gate

Do not apply the twenty-six pending Supabase migrations or deploy Railway/Vercel
until the owner supplies:

1. The canonical `AUDIT_RECOVERY_TENANT_ID` UUID for the audit-chain planner.
2. A record-level decision for the one duplicate Purchase Order-number group
   (`12` demo records, one tenant, one project). Do not auto-renumber issued
   records; preserve a reviewable mapping and rollback plan.

Then run the read-only planners again. Only when migration ledger, duplicate
review, audit recovery, Railway readiness, and Vercel readiness are all clear:

- apply all twenty-six pending migrations in timestamp order with a captured ledger;
- run the disposable and hosted verification gates;
- deploy exactly one reviewed source SHA to Railway and one controlled Vercel
  production build, after confirming the billing impact;
- verify live revision identity, readiness, protected flows, browser behavior,
  database state, logs, and rollback before calling production green.

Both `main` and `agent-02/third-code-erp-landing` contain the reviewed M3.22
customer-invoice issuance implementation `33089abe` plus the publication
checkpoint docs, published by `kurtgav <kurtgavin.design@gmail.com>` with
fast-forward pushes. The prior M3.20 implementation is
`806860e49479a085f762fabaab25696cb9b854a1`; the prior M3.19
implementation is in `f50c8bc5c540b97134764b56a297c41e8578f9f2`; the prior
M3.18 implementation is in
`140f4e8cb518445ab0903d7d885b68cebc7ce8f0`; the prior M3.17 implementation is in
`0b7cb532b0b3a32f687f58437f2756259ba68c27`. CI run
`30755868510` failed before any job step and all other jobs were skipped;
the external GitHub account payment/spending-limit gate remains unresolved.
Local gates are recorded in the work log. Source now has 78 migrations versus
55 hosted. No hosted mutation is authorized by this evidence.

Read-only recheck 2026-08-03: the duplicate group is still 12 records, the
populated demo tenant has 661 audit rows, Railway is healthy but not authorized
under `kurtgav`, and Vercel still serves `31c04942a93d`. GitHub publication is
confirmed at `33089ab`. No deployment, hosted migration, or paid build is
authorized by this evidence.

## Exact next action after local M3.22 customer-invoice issuance slice

1. Keep `ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED`,
   `ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS`,
   `ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_VIA_API`, and
   `ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_VIA_API_TENANT_IDS` false/empty.
   Do not apply `20260803090000_customer_invoice_issue_workflow.sql` alone;
   reconcile the complete ordered 23-migration suffix only after the duplicate
   PO mapping, canonical `AUDIT_RECOVERY_TENANT_ID`, guarded Postgres/Redis
   integration, rollback, and provider-identity gates clear.
2. Re-authenticate Railway as `kurtgav`; do not substitute a fork/account or
   reconnect Vercel Git. GitHub source publication is complete; Railway CLI
   still resolves to `joeseffdy@gmail.com`.
3. After owner inputs and exact provider identity, rerun the read-only
   Supabase planner, execute one disposable invoice issue/replay/rollback
   proof, then review one spend-bounded source publication and provider action.
   Invoice reversal and cancel remain separate legacy authority work.

## Exact next action after local M3.21 cash workflow slice

1. Grant `kurtgav` access to `Third-Code-Solutions/ERP` (or reconnect the
   GitHub plugin to an explicitly authorized account) and verify the target
   repository before retrying the exact source push. Do not push to a fork or
   substitute account.
2. Keep all four cash controls false/empty. Do not apply
   `20260802230000_cash_transaction_workflow_idempotency.sql` alone; reconcile
   the complete 23-migration suffix only after the duplicate PO mapping,
   canonical `AUDIT_RECOVERY_TENANT_ID`, guarded Postgres/Redis integration,
   and rollback evidence are supplied.
3. Re-authenticate Railway as `kurtgav`; keep Vercel Git disconnected and avoid
   previews. Only after exact provider identity, migration parity, production
   build, live protected-flow checks, rollback, and spend-bounded authorization
   may one Railway/Vercel production action occur.

## Exact next action after M3.20 supplier-bill-reversal source slice

1. Treat source `806860e` as the reviewed pushed candidate. Keep production
   held: the guarded supplier-bill reversal integration skipped without its
   explicit Postgres environment, hosted Supabase remains 55/76 migrations,
   and the duplicate PO plus audit-recovery inputs are unresolved.
2. Keep these four controls false/empty:
   `ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_ENABLED`,
   `ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS`,
   `ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API`, and
   `ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API_TENANT_IDS`. Do not
   apply `20260802220000_supplier_bill_reverse_workflow.sql` independently;
   reconcile the complete ordered 21-migration suffix.
3. Obtain the owner-approved reversible mapping for the 12-record duplicate
   PO group and canonical `AUDIT_RECOVERY_TENANT_ID`; provide guarded
   Postgres/Redis integration credentials; rerun the hosted planner and
   supplier-bill reversal integration before any canary.
4. Only after a clear planner, exact-SHA readiness, rollback evidence, and
   spend-bounded provider authorization may one hosted migration and one
   Railway/Vercel production action occur. Keep Vercel Git disconnected and
   avoid previews.

## Exact next action after M3.19 supplier-bill-posting source slice

1. Treat `f50c8bc5c540b97134764b56a297c41e8578f9f2` as the reviewed pushed
   source candidate. Keep production held: the guarded supplier-bill database
   integration skipped without its explicit Postgres environment, and hosted
   Supabase remains 55/75 migrations with unresolved duplicate PO and
   audit-recovery inputs.
2. Keep these four controls false/empty:
   `ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED`,
   `ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS`,
   `ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API`, and
   `ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API_TENANT_IDS`. Do not apply
   `20260802210000_supplier_bill_post_workflow.sql` independently; reconcile
   the complete ordered 20-migration suffix.
3. Obtain the owner-approved reversible mapping for the 12-record duplicate
   PO group and canonical `AUDIT_RECOVERY_TENANT_ID`; provide guarded
   Postgres/Redis integration credentials; rerun the hosted planner and
   supplier-bill integration before any canary.
4. The definitive local production gates are green serially. Only after a
   clear planner, exact-SHA readiness, rollback evidence, and spend-bounded
   provider authorization may one hosted migration and one Railway/Vercel
   production action occur. Keep Vercel Git disconnected and avoid previews.

## Exact next action after M3.18 site-preparation-completion source slice

1. Treat the M3.18 source head as source-complete. Keep production held: the
   guarded PostgreSQL/Redis integration was skipped without its explicit
   environment, and hosted Supabase remains 55/74 migrations with unresolved
   duplicate Purchase Order and audit-recovery inputs.
2. Keep these four controls false/empty:
   `ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_ENABLED`,
   `ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS`,
   `ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API`, and
   `ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API_TENANT_IDS`. Do not
   apply `20260802200000_delivery_site_preparation_complete_workflow.sql`
   independently; reconcile the complete ordered suffix.
3. Obtain the owner-approved duplicate PO mapping and canonical
   `AUDIT_RECOVERY_TENANT_ID`; provide guarded Postgres/Redis integration
   credentials; rerun the hosted planner and disposable lane.
4. The definitive local production build is green; only after a clear planner,
   exact-SHA readiness, rollback evidence, and spend-bounded provider
   authorization may one hosted migration and one Railway/Vercel production
   action occur.

## Exact next action after M3.17 site-preparation-start source slice

1. Treat source `0b7cb532b0b3a32f687f58437f2756259ba68c27` as the reviewed
   pushed candidate. The Nest site-preparation-start authority is source-
   complete, but production remains held: the guarded database integration
   has no configured Postgres/Redis environment, API full suite exceeded the
   local ten-minute ceiling, the local Next worker did not return a definitive
   exit within the bounded run, and CI `30755868510` has no executable job
   evidence because the account billing gate blocked Actionlint.
2. Keep these four controls false/empty:
   `ERP_DELIVERY_SITE_PREPARATION_START_WRITES_ENABLED`,
   `ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS`,
   `ERP_DELIVERY_SITE_PREPARATION_START_WRITES_VIA_API`, and
   `ERP_DELIVERY_SITE_PREPARATION_START_WRITES_VIA_API_TENANT_IDS`. Do not
   apply `20260802190000_delivery_site_preparation_start_workflow.sql` alone;
   reconcile the complete 18-migration suffix in timestamp order.
3. Obtain the owner-approved canonical mapping for the one 12-record duplicate
   Purchase Order group and a valid `AUDIT_RECOVERY_TENANT_ID`; restore CI
   billing authorization; provide the guarded Postgres/Redis integration
   environment; rerun the read-only hosted planner and disposable database
   lane.
4. Only after a clear planner, exact-SHA readiness, rollback evidence, a
   definitive production build, and explicit spend-bounded Supabase/Railway/
   Vercel authorization may one hosted migration and one production action
   occur. Keep Vercel Git disconnected; avoid previews and duplicate builds.

Source now has 73 migrations versus 55 hosted.

Documentation-only follow-up commits are the source memory update for this
milestone. The non-skipped documentation run `30756121059` also stopped before
executable steps on the same account billing gate; future documentation-only
updates use `[skip ci]` to avoid unnecessary runner attempts.

## Exact next action after M3.16 delivery-cancellation source slice

1. Treat source `e8d4a6c181358756879435a76e8bd5a9317cc751` as the reviewed
   pushed candidate. Local executable gates pass; the guarded database
   integration remains unexecuted because its explicit Postgres/Redis
   environment was not supplied, and CI run `30749461755` has no executable
   job evidence because the external account gate blocked Actionlint.
2. Keep all delivery write selectors false/empty, including
   `ERP_DELIVERY_CANCEL_WRITES_ENABLED`,
   `ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS`,
   `ERP_DELIVERY_CANCEL_WRITES_VIA_API`, and
   `ERP_DELIVERY_CANCEL_WRITES_VIA_API_TENANT_IDS`. Do not apply
   `20260802180000_delivery_cancel_workflow.sql` or the earlier receipt,
   inspection-start, and inspection-completion migrations independently.
3. Obtain owner-approved canonical mapping for the one 12-record duplicate
   Purchase Order group and a valid `AUDIT_RECOVERY_TENANT_ID`; restore CI
   billing authorization; provide the guarded Postgres/Redis integration
   environment; rerun the read-only hosted planner and disposable database
   lane.
4. Only after a clear planner, exact-SHA readiness, rollback evidence, and
   explicit spend-bounded Supabase/Railway/Vercel authorization may one
   timestamp-ordered hosted migration and one production action occur. Keep
   Vercel Git disconnected; avoid previews and duplicate builds.

Source now has 72 migrations versus 55 hosted.

## Exact next action after M3.15 delivery inspection-completion source slice

1. Treat source `67beedab53680238f785e0947d90588eedd71e3e` as the reviewed
   pushed candidate. Local executable gates pass; the guarded database
   integration remains unexecuted because its explicit Postgres/Redis
   environment was not supplied, and GitHub run `30748096044` has no
   executable job evidence due the external account gate.
2. Keep
   `ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED`,
   `ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS`,
   `ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API`,
   `ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API_TENANT_IDS`,
   `ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_ENABLED`,
   `ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS`,
   `ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API`, and
   `ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API_TENANT_IDS` false/empty.
   Do not apply migrations `20260802160000_delivery_inspection_start_workflow.sql`
   or `20260802170000_delivery_inspection_complete_workflow.sql`.
3. Obtain owner-approved canonical mapping for the one 12-record duplicate
   Purchase Order group and a valid `AUDIT_RECOVERY_TENANT_ID`; restore CI
   billing authorization; provide the guarded Postgres/Redis integration
   environment; rerun the read-only hosted planner and disposable database
   lane.
4. Only after a clear planner, exact-SHA readiness, rollback evidence, and
   explicit spend-bounded Supabase/Railway/Vercel authorization may one hosted
   migration and one production action occur. Keep Vercel Git disconnected;
   avoid previews and duplicate builds.

Source now has 71 migrations versus 55 hosted.

## Exact next action after M3.14 delivery inspection-start source slice

1. Treat source `08567b8b4b529f43126925ff67df132e15f71818` as the reviewed
   pushed candidate. Local executable gates pass; the guarded database
   integration remains unexecuted because its explicit Postgres environment
   was not supplied, and GitHub run `30746647147` has no executable job
   evidence due the external account gate.
2. Keep
   `ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED`,
   `ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS`,
   `ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API`, and
   `ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API_TENANT_IDS` false/empty. Do
   not apply migration `20260802160000_delivery_inspection_start_workflow.sql`.
3. Obtain owner-approved canonical mapping for the one 12-record duplicate
   Purchase Order group and a valid `AUDIT_RECOVERY_TENANT_ID`; restore CI
   billing authorization; rerun the read-only hosted planner and disposable
   database lane.
4. Only after a clear planner, exact-SHA readiness, rollback evidence, and
   explicit spend-bounded Supabase/Railway/Vercel authorization may one hosted
   migration and one production action occur. Keep Vercel Git disconnected;
   avoid previews and duplicate builds.

## Historical product action (completed RFQ outbox slice)

Add idempotent automatic-RFQ notification delivery to NestJS/BullMQ without
enabling production cutover:

1. Write the original notification outbox, delivery, retry, dead-letter,
   observability, and rollback contract before code.
2. Store notification intent in PostgreSQL in the same transaction as a newly
   created automatic RFQ. Exact RFQ replay must create no second intent.
3. Keep recipient resolution tenant-scoped and server-derived. Do not put
   unrestricted business content or credentials in Redis.
4. Deliver through BullMQ with bounded retry and one durable terminal-failure
   record. Notification failure must never roll back or repeat the official RFQ
   transaction.
5. Preserve Inngest as the only production producer while the automatic Nest
   gate is absent/false.
6. Prove creation, replay, tenant denial, delivery retry, dead-letter, Redis
   restart, one RFQ, one RFQ audit, and one notification intent against
   disposable PostgreSQL 17 and Redis 7.4.9.
7. Leave `ERP_RFQ_AUTO_DISPATCH_VIA_API` and its tenant allowlist unset.
8. Do not reconnect Vercel Git or trigger a frontend build.

## Exact next product action

Migrate grouped-by-supplier BOM-to-Purchase Order creation as a separate,
small source slice. Do not enable the single-BOM or grouped canary yet:

1. Specify the grouped command/result contract, supplier grouping rules,
   cost-code mapping, partial-failure behavior, and rollback before coding.
2. Reuse or extend tenant-scoped idempotency only if one retry key can replay
   the complete group without creating a partial second set of POs.
3. Move all number allocation, PO/line inserts, BOM locking, and audit into a
   Nest transaction; browser actions must remain adapters only.
4. Add disposable PostgreSQL 17/Redis integration coverage for replay,
   tenant denial, supplier validation, exact cents, and audit evidence.
5. Keep `ERP_PO_BOM_CREATE_WRITES_VIA_API`,
   `ERP_PO_BOM_CREATE_WRITES_ENABLED`, and every tenant allowlist false/empty.
6. Do not apply hosted SQL, reconnect Vercel Git, or trigger Railway/Vercel
   builds while the hosted release planner is `review_required`.

## Frontend deployment remains approval-gated

- Keep Vercel Git disconnected. Do not create a preview.
- Retain production deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
- Reconfirm zero newer deployments before any future action.
- Recheck billing and disclose the exact expected charge.
- Obtain explicit user approval for one queued Standard production build.
- Never duplicate a queued or running build.

## Standing M1 controls

Complete remaining M1 controls without enabling production writes:

1. Treat hosted Supabase migration `20260729162944` as the current 54/54
   baseline. Do not replay it or edit applied migration history.
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
10. Keep transient runner registration, processes, credentials, and work
    directories at zero after every disposable verification run.
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

## Next unblocked integrity slice

RFQ quote and terminal NestJS adapters are source-complete and disabled.
Next safe work:

1. Keep `ERP_RFQ_QUOTE_WRITES_VIA_API` and
   `ERP_RFQ_TERMINAL_WRITES_VIA_API` absent/false everywhere.
2. Do not enable either allowlist without an approved clean canary tenant,
   exact baseline capture, monitoring, reconciliation, and tested rollback.
3. Continue a different bounded backend authority slice that needs no
   provider write, frontend deployment, or governance bypass.
4. Preserve compatibility behavior and add real PostgreSQL evidence before
   removing any Next.js transaction service.
5. Do not begin broad finance migration, Python write removal, or M2 until
   their standing approval and canary gates are satisfied.

## Do not start yet

- No finance migration before M1 integration evidence.
- No broad Server Action replacement.
- No production feature-flag enablement.
- No new microservices.
- No external ERP source, schema, UI, or wording reuse.

## Exact next action after RFQ adapters

1. Keep `ERP_RFQ_QUOTE_WRITES_VIA_API` unset/false everywhere.
2. Keep `ERP_RFQ_TERMINAL_WRITES_VIA_API` unset/false everywhere.
3. Verify M1 Railway/Supabase readiness and a real tenant/auth canary account.
4. Present the exact tenant UUID, environment changes, monitoring, and
   rollback for approval.
5. If approved, canary quote and terminal adapters independently. Verify quote
   create/retry/conflict, covered completion, repeat conflict, cancellation
   reason evidence, logs, and reconciliation after each gate.
6. Do not enable wildcard routing or deploy Vercel without explicit approval.

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

## Exact next action after RFQ notification outbox

1. Keep `ERP_RFQ_AUTO_DISPATCH_VIA_API`,
   `ERP_RFQ_AUTO_DISPATCH_VIA_API_TENANT_IDS`, and
   `ERP_NOTIFICATION_SWEEP_ENABLED` absent/false.
2. Do not add `RESEND_API_KEY`, `EMAIL_FROM`, or `ERP_WEB_BASE_URL` for this
   disabled path until a controlled canary is approved.
3. Prepare a read-only purchase-order creation authority audit: current
   Server Actions, direct writes, approval states, money types, tenant
   constraints, audit behavior, notification side effects, tests, and rollback.
4. Specify the smallest disabled NestJS purchase-order adapter. Preserve
   current API/UI behavior and prohibit browser writes to sensitive tables.
5. Require a clean PostgreSQL 17/Redis lane, full repository gates, and exact
   provider evidence before deployment.
6. Keep Vercel Git disconnected. Create no preview or production frontend
   deployment.

## Exact next action after the controlled production release

1. Keep Vercel Git disconnected. Do not reconnect automatic deploys.
2. Create no Vercel deployment for documentation-only commits. The next
   frontend release requires changed application source, full green gates, and
   explicit production authorization.
3. Keep `ERP_RFQ_AUTO_DISPATCH_VIA_API`,
   `ERP_RFQ_AUTO_DISPATCH_VIA_API_TENANT_IDS`, and
   `ERP_NOTIFICATION_SWEEP_ENABLED` absent/false.
4. Begin the read-only purchase-order transaction-authority audit: Server
   Actions, direct writes, approval state machine, exact money types, tenant
   constraints, audit, notifications, idempotency, tests, and rollback.
5. Specify only the smallest disabled NestJS purchase-order adapter after the
   audit. Preserve current UI and API behavior.
6. Continue using Supabase project `aqqrtkmtcsfkbyyqxowv` as the source of
   truth. Apply only migrations proven missing from its ledger.
7. Retain Vercel deployment `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt` and Railway
   deployment `50fad0aa-8506-457a-a405-152dc31d2340` as rollback evidence.

## Exact next action after 2026-08-01 PO authority milestone

1. Keep Vercel Git disconnected. Create no Vercel preview or production
   deployment; this milestone hardened server-only PO actions and added a
   disabled backend contract, with no release authorization.
2. Keep `ERP_PO_CREATE_WRITES_ENABLED` absent/false. Do not allow any tenant
   to call provisional Nest PO route until it has durable idempotency and a
   committed transaction implementation.
3. Design one tenant-composite idempotency migration for standalone PO create;
   replay full 56-migration candidate set in disposable PostgreSQL 17 and
   prove duplicate-request, rollback, tenant-isolation, audit, and budget
   assertions before applying hosted SQL.
4. Implement Nest standalone PO transaction with row locks, exact money
   calculation, same-tenant references, line inserts, audit, and original
   result replay. Python remains advisory only.
5. Add server-only tenant allowlist and Next fail-closed client for standalone
   create command. Canary one approved demo tenant only after Railway
   readiness, logs, reconciliation, and rollback evidence pass.
6. Migrate PO approval, issuance, receiving, and BOM/grouped generation as
   separate bounded slices. Do not combine them with frontend redesign or a
   Vercel deployment.

## Exact next action after standalone PO transaction seam (2026-08-01)

1. Keep both PO write flags false and keep Vercel Git disconnected; create no
   Vercel preview/production deployment and no Railway release.
2. Start disposable PostgreSQL 17 and Redis when Docker is available, replay
   all 56 repository migrations, and run real API probes for first commit,
   exact retry replay, conflicting key, rollback, cross-tenant rejection,
   audit, concurrent number allocation, and centavo bounds.
3. Compare the disposable schema and migration ledger with Supabase project
   aqqrtkmtcsfkbyyqxowv without applying SQL. Resolve any preflight duplicate
   PO numbers before considering a hosted migration.
4. After review and readiness/log/reconciliation/rollback evidence, enable the
   Nest and Next gates for one approved demo tenant only. Keep the legacy path
   available and revert flags immediately on any mismatch.

## Exact next action after landing regression milestone (2026-08-01)

1. Keep Vercel Git disconnected and do not create a preview or production
   deployment while this source-only milestone is being reviewed.
2. Keep both PO write flags false; do not apply the candidate migration to
   hosted Supabase project `aqqrtkmtcsfkbyyqxowv`.
3. Use an already available owned Linux or CI runner (no new paid service) to
   replay all 56 migrations against PostgreSQL 17 with Redis and run the real
   PO commit/replay/conflict/rollback/cross-tenant/audit/number-concurrency/
   centavo probes.
4. Reconcile the disposable schema with Supabase's 55/55 ledger, review the
   migration preflight warnings, then request explicit release approval for a
   one-tenant canary only after Railway readiness, logs, reconciliation, and
   rollback evidence are green.

## Exact next action after disposable authority proof (2026-08-01)

1. Keep `ERP_PO_CREATE_WRITES_ENABLED` and the matching Next gate false; do not
   apply migration 20260801090000 to hosted Supabase yet.
2. Obtain a read-only hosted Supabase migration/catalog comparison and resolve
   the known 55/56 ledger difference plus defensive-constraint review.
3. Re-authenticate Railway as `kurtgavin.design@gmail.com` and Vercel with the
   `kurtgav` account; verify exact project/service identity, current rollback
   deployment, readiness, logs, and spend controls.
4. Only after those checks, request an explicit one-tenant canary approval;
   deploy one controlled release, verify protected HTTP/browser/data flows,
   then enable flags for that tenant. Keep legacy Server Actions as rollback.

## Exact next action after PO approval workflow slice (2026-08-01)

1. Keep `ERP_PO_CREATE_WRITES_ENABLED` and
   `ERP_PO_WORKFLOW_WRITES_ENABLED` absent/false; keep both tenant allowlists
   empty. Existing Server Actions remain the rollback path.
2. Reconcile Supabase project `aqqrtkmtcsfkbyyqxowv` read-only against all 57
   repository migrations. Apply no SQL until the ledger, duplicate checks,
   constraint review, and RLS/grant evidence are recorded.
3. Authenticate Vercel and Railway with `kurtgav`
   (`kurtgavin.design@gmail.com`), verify exact project/service identity,
   current revision, readiness, runtime logs, and spend controls.
4. Run the full local gates again on the reviewed SHA. If a canary is approved,
   deploy once, verify protected HTTP/browser/data/audit behavior, then enable
   only the selected tenant workflow flag. Roll back flags first on mismatch.
5. Keep SCM issuance/email, receiving, BOM/grouped creation, and UI cutover as
   separate milestones; do not bundle them into this release.

Hosted read-only evidence now exists: Supabase is PostgreSQL 17 at 55 applied
migrations, while this branch is 57/57. Only the two reviewed candidate
suffixes are missing; no hosted migration was executed. Provider identity and
canary approval remain the next external gates.

The client seam is ready but intentionally unused. Before enabling it, add
transactional notification intent/recipient parity in Nest, replay that lane,
then canary only the first four workflow transitions for one tenant. Keep SCM
issuance and supplier email on the legacy path until separately migrated.

## Exact next action after PO workflow notification parity (2026-08-01)

1. Keep `ERP_PO_CREATE_WRITES_ENABLED`, `ERP_PO_WORKFLOW_WRITES_ENABLED`,
   `ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED`, and
   `ERP_NOTIFICATION_SWEEP_ENABLED` absent/false; keep all matching
   tenant allowlists empty. Existing Server Actions remain rollback authority.
2. Reconcile Supabase project `aqqrtkmtcsfkbyyqxowv` read-only against all 58
   repository migrations. Review the three linear candidates, hashes, duplicate
   PO numbers, constraint behavior, RLS, and service grants; execute no SQL.
3. Authenticate Vercel and Railway as `kurtgav` /
   `kurtgavin.design@gmail.com`. Verify exact project/service identity,
   current revision, readiness, runtime logs, rollback identity, and spend
   controls before any release.
4. If explicitly approved, deploy one controlled SHA once, verify protected
   HTTP/browser/data/audit/notification flows, then enable only one tenant's
   workflow and notification flags. Roll back flags first on mismatch.
5. Keep SCM issuance, supplier-side email, receiving, BOM/grouped creation,
   and UI delegation as separate milestones.

## Exact next action after read-only project canary audit (2026-08-01)

1. Keep every PO/project/notification write gate and tenant allowlist
   absent/false; keep Vercel Git disconnected and create no deployment.
2. Open a separate, read-only audit-recovery review for the 2 predecessor-link
   and 151 hash mismatches. Do not rewrite audit history or add permissions in
   this milestone; establish provenance and a reviewed repair procedure first.
3. Authenticate Railway and Vercel as `kurtgav` /
   `kurtgavin.design@gmail.com`, then verify identity, readiness, logs,
   rollback, and spend controls. Provider auth remains unresolved.
4. Re-run the canary planner with an explicitly approved actor that has the
   required capability only after audit integrity is resolved. Do not deploy
   or enable flags while the planner is blocked.

## Exact next action after audit hash parity hardening (2026-08-01)

1. Keep all PO/project/notification write gates and tenant allowlists
   absent/false. The parity code prevents new divergence but does not repair
   historical rows.
2. Prepare a read-only audit recovery report explaining the 2 link mismatches,
   151 historical hash mismatches, affected writer eras, and an immutable
   verification/repair strategy. Do not rewrite `audit_log` in this milestone.
3. Authenticate Railway and Vercel as `kurtgav` /
   `kurtgavin.design@gmail.com`; verify identity, readiness, logs, rollback,
   and spend controls before any release.
4. Re-run the canary planner with a capability-appropriate actor only after
   audit recovery review passes. Keep provider deployment and flag enablement
separate and explicitly approved.

## Exact next action after read-only audit recovery planner (2026-08-01)

1. Keep all PO/project/notification write gates and tenant allowlists
   absent/false. Treat the hosted planner's `review_required` status as a hard
   release blocker.
2. Use the sanitized day/system-label buckets to identify which historical
   writers produced the 151 hash mismatches and 2 link mismatches. Produce a
   reviewed, immutable recovery procedure; do not rewrite `audit_log` yet.
3. Authenticate Railway and Vercel as `kurtgav` /
   `kurtgavin.design@gmail.com`; verify exact project/service, readiness, logs,
   rollback, and spend controls. No deploy while either session is unresolved.
4. Only after audit recovery approval and provider evidence, re-run the planner
   with a capability-appropriate actor and request one controlled canary.

## Exact next action after audit hash profile verification (2026-08-01)

1. Keep all PO/project/notification write gates and tenant allowlists
   absent/false. The 111 unknown rows and 2 link breaks are hard blockers.
2. Trace the 40 legacy-JSON rows and 111 unknown rows to reviewed writer
   versions and provenance using read-only evidence. Do not infer or rewrite
   immutable history from counts alone.
3. Authenticate Railway and Vercel as `kurtgav` /
   `kurtgavin.design@gmail.com`; verify exact project/service, readiness, logs,
   rollback, and spend controls. No deploy while sessions are unresolved.
4. Only after a reviewed recovery decision and provider gates pass, rerun the
   profile verifier and canary planner with an authorized actor, then request
   one controlled release.

## Exact next action after controlled hosted release gate (2026-08-01)

1. Keep `ERP_PO_CREATE_WRITES_ENABLED`, `ERP_PO_WORKFLOW_WRITES_ENABLED`,
   `ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED`, and
   `ERP_NOTIFICATION_SWEEP_ENABLED` absent/false; keep all tenant allowlists
   empty. Do not promote the Vercel preview or redeploy Railway production.
2. Obtain an owner-approved, reversible remediation for the one duplicate
   tenant/PO-number group (12 demo records). Do not rename/delete records or
   weaken the uniqueness guard by inference.
3. After remediation approval, rerun the read-only planner and preflight, then
   apply the unchanged three migrations atomically with ledger recording and
   verify schema, RLS, grants, and readiness. Roll back the transaction on any
   mismatch.
4. Resolve the independent audit recovery blockers (111 unknown historical
   hash rows and 2 predecessor-link breaks), rerun the canary planner with a
   capability-appropriate actor, and only then request one controlled SHA
   promotion under spend limits.

## Exact next action after duplicate-remediation planner (2026-08-01)

1. Give the owner the opaque duplicate report and obtain an explicit,
   reversible decision for the 12 demo records. Do not infer a canonical row,
   rename records, delete records, or weaken the uniqueness guard.
2. Design one forward data-remediation migration from that approved decision;
   replay it in disposable PostgreSQL 17 and verify audit/tenant references.
3. Re-run `plan:purchase-order-duplicates --require-clear` and the hosted
   migration planner. Only when both are clear, apply the unchanged three PO
   migrations atomically and verify ledger, schema, RLS, grants, and readiness.
4. Keep all PO/notification flags false and do not promote Vercel or redeploy
   Railway until the independent audit recovery and canary gates clear.

## Exact next action after clean-room branding guard (2026-08-01)

1. Keep the runtime branding test in the normal web test suite. Any future
   clean-room capability or UI slice must pass it before release review.
2. Continue the owner-approved duplicate remediation path and independent
   audit recovery path; do not use branding evidence as a production-release
   substitute.

## Exact next action after controlled release gate aggregator (2026-08-01)

1. Keep all PO/project/notification write gates and tenant allowlists absent or
   false; do not create a Vercel preview, promote production, or redeploy
   Railway.
2. Obtain an owner-approved, reversible decision for the one duplicate
   tenant/PO-number group containing 12 demo records. Do not infer a canonical
   record or rename/delete data.
3. Set `AUDIT_RECOVERY_TENANT_ID` only to the explicitly approved tenant UUID,
   rerun `plan:controlled-release --require-clear`, and review the sanitized
   audit findings. Do not rewrite immutable audit rows from counts alone.
4. When the gate is clear, apply the unchanged three candidate migrations in
   one transaction, verify ledger/RLS/grants/readiness, and request one
   controlled SHA promotion. Record rollback identity and spend evidence.

## Exact next action after Stock Receipt draft authority (2026-08-01)

1. Keep `ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED` absent/false and its
   tenant allowlist empty. Keep all PO/workflow/notification/project flags
   false; existing Server Actions remain the rollback path.
2. Do not apply `20260801120000_stock_receipt_create_idempotency.sql` (or the
   three earlier PO candidates) to Supabase until the owner-approved duplicate
   remediation and independent audit recovery are complete. Current hosted
   ledger is 55/59; candidate migrations are not a production release.
3. Re-run `node --env-file=apps/web/.env.local scripts/plan-controlled-release.mjs
   --json` with an explicitly approved `AUDIT_RECOVERY_TENANT_ID`; require a
   clear result before any provider action. Readiness 200 alone is not enough.
4. Keep Vercel Git disconnected and create no preview/production deployment;
   keep Railway production on its current healthy rollback deployment. A
   future release must be one reviewed SHA, one provider action, and a
   browser/API/data/logs verification under the spend limit.
5. After hosted gates clear, apply the unchanged migrations atomically,
   verify RLS/grants/ledger/readiness, then request a separate one-tenant
   receiving canary. Do not remove the Server Action until parity and rollback
   evidence are recorded.

## Exact next action after CAD parser authority boundary (2026-08-01)

1. Keep the worker evidence-only in every environment; do not restore
   `DATABASE_URL`, `psycopg`, or a Python ERP write helper.
2. Add a NestJS CAD evidence-commit adapter that reuses the shared response
   contract and transaction invariants. Prove tenant isolation, replacement,
   exact totals, audit evidence, malformed response rejection, and rollback in
   disposable PostgreSQL before enabling any flag.
3. Keep the current Next transaction path as the compatibility/rollback path;
   no UI change, hosted SQL, Railway deploy, Vercel deploy, or worker promotion
   is authorized by this source milestone.
4. Independently resolve the existing hosted migration, duplicate Purchase
   Order, and audit recovery blockers before any production promotion.

## Exact next action after NestJS CAD evidence-commit adapter (2026-08-01)

1. Keep `ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED` absent/false and its tenant
   allowlist empty. Keep Python evidence-only and do not grant it database
   credentials.
2. Keep the Next CAD transaction as the compatibility/rollback path. Build a
   separate parity/canary test before routing any tenant to Nest authority.
3. Do not apply `20260801130000_cad_evidence_commit_idempotency.sql` (or the
   earlier candidate migrations) to Supabase until the owner-approved
   duplicate PO remediation and audit recovery clear the controlled gate.
4. Do not create Vercel previews, promote production, or redeploy Railway.
   The next hosted action is one read-only controlled-release plan using an
   explicitly approved `AUDIT_RECOVERY_TENANT_ID`; readiness 200 alone is not
   release evidence.

## Exact next action after NestJS CAD processing-job intake (2026-08-01)

1. Keep `ERP_DOCUMENT_PROCESSING_JOBS_ENABLED` absent/false and its tenant
   allowlist empty. Do not enqueue production jobs; the queue has no worker
   bridge yet by design.
2. Implement the private Nest-to-Python evidence adapter with short-lived
   Storage URLs, signed request context, schema validation, and explicit
   queued/processing/succeeded/failed transitions. Add retry, stalled-job,
   duplicate-delivery, and restart integration proof before enabling a flag.
3. Keep the current Next CAD transaction as compatibility/rollback path and
   do not apply `20260801140000_document_processing_jobs.sql` (or earlier
   candidates) to Supabase until duplicate-PO and audit recovery gates clear
   the controlled release planner.
4. Do not create a Vercel preview, promote production, redeploy Railway, or
   reconnect Vercel Git. A future hosted release must be one reviewed SHA,
   one controlled provider action, and browser/API/data/log evidence within
   the spend limit.

## Exact next action after signed CAD evidence bridge (2026-08-01)

1. Keep `ERP_DOCUMENT_PROCESSING_JOBS_ENABLED`,
   `ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED`, and
   `ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED`, and
   `ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED` absent/false; keep every
   matching tenant allowlist empty. Do not enqueue production processing jobs.
2. Implement durable source/evidence persistence and the separate idempotent
   Nest draft-BOM command before enabling the bridge or accepting
   `createDraftBom=true`; never mark a partial scope-only result complete for a
   request that asked for a BOM. Keep Next CAD parsing as rollback authority.
3. Re-run the read-only controlled-release planner. The current hosted ledger,
   duplicate PO group, and audit recovery blockers still prohibit Supabase SQL,
   Railway deployment, Vercel deployment, or any flag enablement.
4. After owner-approved duplicate remediation, explicit audit selector/recovery
   review, and provider identity/spend confirmation under `kurtgav`, apply one
   reviewed SHA only. Verify database/RLS/readiness/API/browser/log evidence;
   roll flags back first on any mismatch.

## Exact next action after durable CAD evidence and atomic draft BOM (2026-08-01)

1. Keep `ERP_DOCUMENT_PROCESSING_JOBS_ENABLED`,
   `ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED`,
   `ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED`, and
   `ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED` absent/false; keep all matching
   tenant allowlists empty. Do not enqueue production processing jobs.
2. Keep the Next CAD transaction as compatibility/rollback authority. The
   source candidate now persists immutable attempt evidence first, then joins
   scope and requested BOM writes atomically in Nest; run a dedicated canary
   only after hosted schema parity and provider gates clear.
3. Re-run the read-only controlled-release planner with an explicitly approved
   `AUDIT_RECOVERY_TENANT_ID`. Current hosted migration drift, duplicate PO
   numbers, and missing audit recovery selector still prohibit Supabase SQL,
   Railway deployment, Vercel deployment, or flag enablement.
4. Once the planner is clear, apply one reviewed migration/SHA release, verify
   RLS/grants/ledger/readiness plus protected API/browser/log evidence, and use
   one reversible provider action under the `kurtgav` spend limit.

## Exact next action after CI run 30707238189 (2026-08-01)

1. Obtain the canonical owner-approved `AUDIT_RECOVERY_TENANT_ID` UUID.
2. Obtain explicit record-level remediation for the one 12-record tenant/PO
   duplicate group; do not renumber issued records automatically.
3. Re-run `node --env-file=apps/web/.env.local scripts/plan-controlled-release.mjs --json`.
4. Only if status is `clear`, apply one reviewed SHA to Supabase, then deploy
   Railway and one Vercel production build with spend limits; verify live
   readiness, protected API/browser flows, logs, and exact release identity.

## Exact next action after M2.5 processor canary (2026-08-02)

1. Keep all document-processing, evidence-commit, and draft-BOM flags absent or
   false; keep tenant allowlists empty.
2. Keep the new recovery entry point dormant. Design a periodic recovery
   scheduler with explicit flag/tenant gates and observability before enabling
   it; keep the Next compatibility path authoritative.
3. Obtain the owner-approved audit tenant UUID and record-level PO duplicate
   remediation, then rerun the controlled-release planner.
4. Only a `clear` planner result authorizes one reviewed Supabase migration
   release followed by one spend-bounded Railway/Vercel production action.

## Exact next action after final branch push and release audit (2026-08-02)

1. Keep the pushed SHA `39f6a62c2bf0463ac0fdcf4fe2788cb876f65510` as the
   reviewed candidate; do not apply hosted SQL or deploy providers.
2. Obtain owner-approved `AUDIT_RECOVERY_TENANT_ID` and record-level
   remediation for the 12-record tenant Purchase Order duplicate group.
3. Re-run `node --env-file=apps/web/.env.local scripts/plan-controlled-release.mjs --json`.
4. Only a `clear` planner result authorizes one reviewed Supabase migration,
   one Railway deployment, and one spend-bounded Vercel production action;
   verify database/RLS, readiness, protected API/browser flows, logs, and exact
   release identity after each action.

## Exact next action after M2.6 recovery scheduler source slice (2026-08-02)

1. Keep `ERP_DOCUMENT_PROCESSING_RECOVERY_ENABLED` false/absent and its tenant
   allowlist empty. Keep processing intake, worker bridge, commit, and all
   matching tenant gates closed in hosted environments.
2. Run the disposable CI database/Redis integration lane for the scheduler,
   stale-claim recovery, retry/final-failure, Redis-loss re-enqueue, and
   cross-tenant exclusion proof.
3. Obtain the owner-approved `AUDIT_RECOVERY_TENANT_ID` and record-level
   remediation for the 12-record tenant Purchase Order duplicate group; rerun
   the controlled-release planner.
4. Only after a `clear` planner plus a reviewed canary may one tenant-scoped
   recovery schedule be enabled. Apply no hosted SQL or provider deploy before
   that gate.

## Exact next action after M2.6 CI evidence (2026-08-02)

1. Treat `0ff4ece8449c882436f90c0dcb45edfc67765da4` as the reviewed M2.6
   candidate; keep every recovery and processing gate closed in hosted envs.
2. Obtain the owner-approved `AUDIT_RECOVERY_TENANT_ID` and record-level
   remediation for the 12-record tenant Purchase Order duplicate group.
3. Re-run the read-only controlled-release planner. Only `clear` authorizes a
   tenant-scoped canary, one reviewed Supabase migration, and one spend-bounded
   Railway/Vercel production action with browser/API/data/log evidence.

## Exact next action after M2.7 Cortex source-grounded search (2026-08-02)

1. Treat pushed SHA `6d55248110e630ed01c16f903972c8d52ff70af2` and CI run
   `30712546507` as the reviewed M2.7 source candidate; executable gates pass,
   E2E remains explicitly skipped by hosted-credential gating.
2. Rerun `node --env-file=apps/web/.env.local scripts/plan-controlled-release.mjs --json`.
   Current 55/62 ledger, duplicate Purchase Order group, and missing approved
   `AUDIT_RECOVERY_TENANT_ID` still prohibit hosted SQL or deploys.
3. Only a `clear` planner plus approved canary authorizes one reviewed Supabase
   migration release, one Railway deployment, and one spend-bounded Vercel
   production action. Verify readiness, protected API/browser behavior, logs,
   data invariants, and exact release identity after each action.

## Exact next action after M2.8 RAG suggestion hardening (2026-08-02)

1. Run full workspace validation and CI for the RAG route candidate; keep the
   existing Next compatibility path and all AI/provider feature flags closed or
   absent in hosted environments unless already approved.
2. Rerun the read-only controlled-release planner. Do not apply the seven
   pending Supabase migrations or deploy Railway/Vercel while it reports the
   duplicate Purchase Order group or missing `AUDIT_RECOVERY_TENANT_ID`.
3. After a `clear` planner and canary, choose either one controlled hosted
   promotion or a separately reviewed Nest read adapter; verify tenant/RBAC,
   readiness, source provenance, provider spend, logs, and exact release SHA.

## Exact next action after M2.8 CI evidence (2026-08-02)

1. Treat `fa283f94376aacd8f7febd9324b162697571efa1` and CI run
   `30713863937` as the reviewed source candidate; all executable gates passed.
2. Rerun the read-only controlled-release planner and resolve its three
   current blockers: seven hosted migrations, the 12-record tenant Purchase
   Order duplicate group, and owner approval for `AUDIT_RECOVERY_TENANT_ID`.
3. Until the planner is `clear`, perform no hosted SQL, Railway deploy,
   Vercel deploy, feature-flag enablement, or business-data mutation. After a
   clear planner, use one reviewed canary and one spend-bounded provider action
   with readiness, protected-flow, data, log, and exact-SHA evidence.

## Exact next action after M2.9 Python AI boundary (2026-08-02)

1. Keep `AI_WORKER_URL` absent in hosted web environments until the Python
   worker is separately deployed, authenticated, health-checked, and cost
   bounded. Keep TypeScript compatibility provider behavior unchanged.
2. Resolve the existing controlled-release blockers: seven hosted migrations,
   the 12-record tenant Purchase Order duplicate group, and owner approval for
   `AUDIT_RECOVERY_TENANT_ID`; rerun the read-only planner.
3. After a `clear` planner, deploy one reviewed Python worker service and run
   authenticated `/health` plus `/v1/embeddings` contract, provider timeout,
   tenant/RBAC, spend, logs, and exact-SHA checks before setting the worker URL.
4. Migrate chat completions separately; Python output remains advisory and can
   never approve or finalize ERP transactions.

## Exact next action after M2.9 CI evidence (2026-08-02)

1. Keep `56bb76eb2dc7f4f7f00fbe4690e06323696b0618` as the reviewed source
   candidate; CI run `30715179369` is green and E2E remains credential-gated.
2. Rerun the read-only controlled-release planner. Do not apply hosted SQL or
   deploy Railway/Vercel/AI worker while it reports the seven pending
   migrations, duplicate Purchase Orders, or missing approved recovery tenant.
3. After `clear`, perform one reviewed worker/service canary and one
   spend-bounded provider action with readiness, protected-flow, data, logs,
   tenant isolation, and exact release-SHA evidence.

## Exact next action after M3.0 Change Request boundary (2026-08-02)

1. Keep the reviewed source commit `765285a57d37885980f01774bffdb27676a203e0`
   and green CI run `30717165544`; keep both Change Request gates false/empty.
2. Rerun the read-only controlled-release planner and capture its current
   blocker JSON before any hosted mutation.
3. Do not apply `20260802090000_change_request_create_idempotency.sql`, deploy
   Railway/Vercel, or enable the compatibility seam while the planner reports
   eight pending hosted migrations, the 12-record duplicate Purchase Order
   group, or missing approved `AUDIT_RECOVERY_TENANT_ID`.
4. After a `clear` planner, use one tenant-scoped canary proving idempotency,
   tenant/RBAC isolation, notification intent, audit chain, readiness, logs,
   and exact release identity before any UI cutover.

## Exact next action after M3.0 database evidence (2026-08-02)

1. Run `apps/api/integration/change-request.database.integration.spec.ts` in
   the disposable PostgreSQL 17 CI lane and retain the no-skips result.
2. Keep `ERP_CHANGE_REQUEST_WRITES_ENABLED` false/empty and do not apply
   `20260802090000_change_request_create_idempotency.sql` to hosted Supabase.
3. Re-run `node --env-file=apps/web/.env.local scripts/plan-controlled-release.mjs --json`.
   Current blockers remain the eight hosted migrations, the 12-record tenant
   Purchase Order duplicate group, and missing owner-approved
   `AUDIT_RECOVERY_TENANT_ID`.
4. Only a `clear` planner plus canary approval authorizes one reviewed
   Supabase migration and one spend-bounded Railway/Vercel action. Keep Vercel
Git disconnected and do not create preview or duplicate production builds.

## Exact next action after M3.0 CI evidence (2026-08-02)

1. Treat `77b6e04206a48ff47ffeee5567b56bf3e3195e65` and CI run
   `30718464238` as the reviewed source candidate; keep the Change Request
   flags false/empty.
2. Re-run the read-only controlled-release planner. It still reports eight
   hosted migrations, one tenant Purchase Order duplicate group with 12 demo
   records, and missing owner-approved `AUDIT_RECOVERY_TENANT_ID`.
3. Do not apply hosted SQL, deploy Railway/Vercel, reconnect Vercel Git, or
   enable the compatibility seam while the planner is `review_required`.
4. After a `clear` planner and approved canary, perform one migration and one
   spend-bounded provider action with protected-flow, data, log, readiness,
   exact-SHA, and rollback evidence.

## Exact next action after M3.1 web seam (2026-08-02)

1. Treat commit `d5ee498` as source-only evidence; keep the Change Request
   tenant allowlist and `ERP_CHANGE_REQUEST_WRITES_ENABLED` false/empty.
2. Push the reviewed source candidate and wait for CI, including the disposable
   Postgres lane; do not trigger a hosted deployment from this branch.
3. Re-run the read-only controlled-release planner. It must first clear the
   eight hosted migrations, the 12-record tenant Purchase Order duplicate
   group, and missing owner-approved `AUDIT_RECOVERY_TENANT_ID`.
4. Only after a clear planner and canary approval may one reviewed Supabase
   migration and one spend-bounded Railway/Vercel action occur. Keep Vercel
   Git disconnected and avoid preview or duplicate production builds.

## Exact next action after M3.1 CI evidence (2026-08-02)

1. Keep `ERP_CHANGE_REQUEST_WRITES_ENABLED` and the tenant allowlist
   false/empty; CI green does not authorize a hosted cutover.
2. Obtain owner-approved canonical record mapping for the 12-record Purchase
   Order duplicate group and a valid `AUDIT_RECOVERY_TENANT_ID`.
3. Re-run the read-only planner until the eight hosted migrations, duplicate
   group, and audit-recovery blocker are all cleared.
4. Only then execute one reviewed Supabase migration and one spend-bounded
   Railway/Vercel deployment with readiness, protected-flow, data, logs,
   exact-SHA, and rollback evidence. Keep Vercel Git disconnected.

## Exact next action after M3.2 source implementation (2026-08-02)

1. Keep `ERP_PO_WORKFLOW_WRITES_VIA_API` and its tenant allowlist false/empty;
   keep SCM issuance/rejection on legacy paths.
2. Push commit `fa3c20a`, wait for CI disposable Postgres evidence, and rerun
   the read-only controlled-release planner.
3. Do not apply hosted migrations or deploy while Supabase remains 55/63,
   Purchase Order duplicates remain 12 records, or audit recovery lacks an
   owner-approved `AUDIT_RECOVERY_TENANT_ID`.
4. After those blockers clear, canary only the three supported workflow states;
   prove idempotent replay, RBAC, notification intent, audit chain, readiness,
   exact SHA, and rollback before enabling any production flag.

## Exact next action after M3.2 CI evidence (2026-08-02)

1. Keep PO workflow flag and tenant allowlist false/empty; do not deploy this
   source branch to hosted providers.
2. Obtain owner-approved canonical mapping for 12 duplicate Purchase Orders and
   valid `AUDIT_RECOVERY_TENANT_ID`.
3. Re-run planner until all eight migrations, duplicate data, and audit tenant
   blockers clear; only then apply one reviewed migration.
4. Canary three supported PO states with replay/RBAC/notification/audit,
   readiness, exact-SHA, and rollback evidence. Keep Vercel Git disconnected.

## Exact next action after M3.3 Purchase Order rejection seam (2026-08-02)

1. Keep `ERP_PO_WORKFLOW_WRITES_VIA_API` and its tenant allowlist false/empty;
   keep SCM supplier issuance on the legacy path. Do not apply
   `20260802100000_purchase_order_workflow_scm_rejection.sql` to hosted
   Supabase yet.
2. Treat source commit `16904f0` and CI run `30733959058` as the reviewed
   candidate. E2E remains credential-gated; CI green is not a hosted release
   authorization.
3. Obtain owner-approved canonical mapping for the 12 duplicate Purchase
   Orders and a valid `AUDIT_RECOVERY_TENANT_ID`; re-run the read-only planner
   until all nine pending migrations, duplicate data, and audit recovery are
   clear.
4. Build and prove the server-owned SCM issuance outbox contract (supplier
   email idempotency, evidence stamp, retry/dead-letter, audit, and tenant
   authorization) before routing the issuance button through Nest.
5. After a clear planner and explicit canary approval, apply one reviewed
   migration and one spend-bounded provider action with readiness, protected
   workflow, data, logs, exact release SHA, and rollback evidence. Keep Vercel
   Git disconnected and avoid preview/duplicate builds.

## Exact next action after M3.4 SCM issuance source/CI evidence (2026-08-02)

1. Keep `ERP_PO_WORKFLOW_WRITES_VIA_API`, `ERP_PO_WORKFLOW_WRITES_ENABLED`,
   notification flags, and all tenant allowlists false/empty. Do not apply
   `20260802110000_purchase_order_supplier_issuance.sql` or any pending hosted
   migration; do not deploy Vercel/Railway.
2. Treat commits `21a152d` / `52b6288` and CI run `30735228348` as the reviewed
   source candidate. E2E remains credential-gated.
3. Obtain owner-approved canonical mapping for the 12 duplicate Purchase
   Orders and a valid `AUDIT_RECOVERY_TENANT_ID`; re-run the read-only planner
   until all ten pending migrations and data/audit blockers clear.
4. Review the complete forward migration set and, only after a clear planner,
   apply one controlled Supabase release with backup/PITR evidence, readiness,
   protected workflow, delivery queue/retry/dead-letter, audit/hash evidence,
   exact SHA, and rollback plan.
5. Keep Vercel Git disconnected; if approved, use one spend-bounded Railway
   deploy and one Vercel production promotion/build only—no preview/duplicate
   builds; verify live browser/API/logs before declaring production green.

## Exact next action after M3.5 finance journal authority (2026-08-02)

1. Keep `ERP_FINANCE_JOURNAL_POST_WRITES_VIA_API`,
   `ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED`, and both tenant allowlists
   false/empty. Do not apply `20260802120000_finance_journal_post_idempotency.sql`
   or any other pending hosted migration; do not deploy Railway/Vercel.
2. Treat source commit `97106ba` and CI run `30736271967` as the reviewed
   candidate. E2E is credential-gated; CI green is not hosted authorization.
3. Obtain owner-approved canonical mapping for the 12 duplicate Purchase
   Orders and a valid `AUDIT_RECOVERY_TENANT_ID`; re-run the read-only planner
   until all 11 pending migrations and data/audit blockers clear.
4. After a clear planner, review/apply one controlled Supabase release with
   backup/PITR, migration ledger, RLS/function, journal-post idempotency/RBAC/
   audit/tenant checks, readiness, exact SHA, and rollback evidence.
5. Only after those checks, perform one spend-bounded Railway action and one
   Vercel production action. Keep Vercel Git disconnected; avoid previews and
   duplicate builds; verify live protected flow, data, logs, and exact release
   identity before declaring production green.

## Exact next action after M3.6 Cortex privacy boundary (2026-08-02)

1. Treat source commit `08f1315` and green CI run `30736912185` as the reviewed
   source candidate. E2E is credential-gated; keep all finance/PO write flags
   and tenant allowlists false/empty.
2. Do not apply hosted migrations or deploy Railway/Vercel while the planner
   remains `review_required` (55/66, 12 duplicate Purchase Orders, zero audit
   rows, and missing `AUDIT_RECOVERY_TENANT_ID`).
3. Obtain owner-approved duplicate-PO mapping and audit-recovery tenant;
   re-run the read-only planner and review the complete forward migration set.
4. After the planner clears, validate the Cortex redaction behavior in a
   designated demo tenant with protected browser/API checks, prompt/audit
   hashes, role-negative retrieval, readiness, exact SHA, and rollback proof.
5. Only then perform one spend-bounded Railway/Vercel production action; keep
   Vercel Git disconnected and avoid preview/duplicate builds.

## Exact next action after M3.7 CAD processing authority handoff (2026-08-02)

1. Treat source commit `0cfb72a` and CI run `30738075103` as the reviewed
   candidate. Keep `ERP_DOCUMENT_PROCESSING_VIA_API`,
   `ERP_DOCUMENT_PROCESSING_TENANT_IDS`, and every API-side processing,
   evidence, worker-bridge, and draft-BOM gate false/empty.
2. Do not apply hosted migrations or deploy Railway/Vercel while the planner
   remains `review_required` (55/66, eleven pending, duplicate Purchase
   Orders, zero audit rows, missing `AUDIT_RECOVERY_TENANT_ID`).
3. Obtain the owner-approved canonical mapping for the 12 duplicate POs and a
   valid audit-recovery tenant; re-run the read-only planner and review the
   complete forward migration set.
4. After a clear planner, validate one designated demo tenant with binary DWG
   queue/status polling, signed Python evidence, scope-item commit, draft-BOM
   off/on isolation, RBAC-negative, idempotent retry, audit, readiness,
   exact-SHA, and rollback evidence.
5. Only after those checks perform one spend-bounded Railway action and one
   Vercel production action. Keep Vercel Git disconnected; avoid previews and
   duplicate builds; verify live browser/API/logs before declaring green.

## Exact next action after M3.12 delivery receipt authority source slice (2026-08-02)

1. Keep `ERP_DELIVERY_RECEIPT_WRITES_VIA_API`,
   `ERP_DELIVERY_RECEIPT_WRITES_VIA_API_TENANT_IDS`,
   `ERP_DELIVERY_RECEIPT_WRITES_ENABLED`, and
   `ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS` false/empty. Do not apply
   `20260802140000_delivery_receipt_workflow_idempotency.sql` or any pending
   hosted migration; do not deploy Railway/Vercel.
2. Treat the M3.12 source/docs SHA and its CI run as a source candidate only.
   Confirm the disposable PostgreSQL 17/Redis lane executes the new delivery
   integration without skips; E2E remains credential-gated.
3. Re-run the read-only Supabase planner after CI. It must still account for
   the 13 pending migrations, the 12-record duplicate Purchase Order group,
   and the missing owner-approved `AUDIT_RECOVERY_TENANT_ID`.
4. After owner-approved data/audit remediation and a clear planner, validate
   one disposable/demo tenant receipt replay, status conflict, cross-tenant
   denial, RBAC-negative, audit evidence, readiness, exact SHA, and rollback.
5. Only then request one spend-bounded Supabase migration release and one
   Railway/Vercel production action. Keep Vercel Git disconnected; never create
   a preview or duplicate build, and verify live protected flow, data, logs,
   billing impact, exact release identity, and rollback before calling green.

## Exact next action after M3.11 CI evidence (2026-08-02)

1. Keep `ERP_PO_BOM_GROUPED_CREATE_WRITES_VIA_API`,
   `ERP_PO_BOM_GROUPED_CREATE_WRITES_ENABLED`, and both grouped UUID
   allowlists false/empty. The grouped Nest authority is source-complete but
   not canaried.
2. Re-run the read-only Supabase migration/data/audit planner and retain the
   owner-approved duplicate Purchase Order mapping plus
   `AUDIT_RECOVERY_TENANT_ID`; do not apply SQL while the planner is blocked.
3. Confirm Railway `/ready`, Vercel `/api/ready`, exact source SHA, and a
   rollback snapshot without triggering a provider build or reconnecting
   Vercel Git.
4. Review one disposable/demo-tenant grouped replay, tenant denial, supplier
   validation, exact cents, audit, readiness, exact SHA, and rollback before
   requesting an explicitly spend-bounded canary.
5. Only after all gates clear may one reviewed Supabase migration release and
   one Railway/Vercel production action be considered. Never create a preview
   or duplicate a queued build.

## Exact next action after M3.10 BOM-to-PO source/CI evidence (2026-08-02)

1. Treat commit `82d9d5092d8aeebf2e803b2937914b7356ff2f21` and CI run
   `30741816314` as the reviewed source candidate. All executable CI jobs pass;
   E2E remains credential-gated.
2. Keep both BOM-to-PO selectors, both API write gates, and all UUID tenant
   lists false/empty. The grouped-by-supplier path is not covered by this
   command and must not be routed through it.
3. Re-run the read-only Supabase ledger, duplicate-PO, audit-recovery,
   Railway-readiness, and Vercel-readiness checks before any hosted action.
4. Obtain owner-approved duplicate mapping and `AUDIT_RECOVERY_TENANT_ID`,
   then require explicit spend-bounded approval for one migration release and
   one production provider action. No provider deployment is authorized now.

## Exact next action after M3.9 Stock Receipt post/reversal source slice (2026-08-02)

1. Keep `ERP_INVENTORY_RECEIPT_POST_VIA_API`,
   `ERP_INVENTORY_RECEIPT_POST_TENANT_IDS`,
   `ERP_INVENTORY_RECEIPT_REVERSE_VIA_API`,
   `ERP_INVENTORY_RECEIPT_REVERSE_TENANT_IDS`, and both API-side write gates
   false/empty. Do not apply `20260802130000_stock_receipt_workflow_idempotency.sql`
   or any other pending hosted migration.
2. Source/docs candidate `6121740ea2a3db189e7cc1c5e83f970db73f6b74` is pushed
   under `kurtgav`; CI run `30740581304` passed every executable job. E2E stays
   credential-gated; do not reconnect Vercel Git.
3. Re-run the read-only Supabase ledger, duplicate-PO, audit-recovery, Railway
   readiness, and Vercel readiness checks. Current hosted evidence is 55/67
   migrations, 1 duplicate group / 12 records, and missing
   `AUDIT_RECOVERY_TENANT_ID`; these are release blockers, not errors to waive.
4. Only after owner-approved duplicate mapping and audit-recovery tenant input,
   a clear planner, and explicit provider/spend approval may one reviewed
   Supabase migration release and one Railway/Vercel production action occur.
   Capture migration ledger, RLS/function checks, post/reverse RBAC and replay
   evidence, readiness, logs, exact SHA, billing impact, and rollback.
5. If the planner remains blocked, continue source-only incremental Nest
   authority work. Never enable a canary or create a paid/duplicate Vercel
   deployment to bypass the gate.

## Exact next action after M3.12 CI integration correction (2026-08-02)

1. Push the delivery receipt correction under `kurtgav` and wait for the
   disposable PostgreSQL 17/Redis integration to pass on the exact SHA.
2. Keep `ERP_DELIVERY_RECEIPT_WRITES_ENABLED`,
   `ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS`,
   `ERP_DELIVERY_RECEIPT_WRITES_VIA_API`, and
   `ERP_DELIVERY_RECEIPT_WRITES_VIA_API_TENANT_IDS` false/empty. Do not apply
   migration `20260802140000_delivery_receipt_workflow_idempotency.sql` to
   hosted Supabase yet.
3. Re-run read-only Supabase ledger/duplicate/audit checks, Railway readiness,
   and Vercel readiness. Existing 55/68 migration drift, the 12-record
   duplicate PO group, missing `AUDIT_RECOVERY_TENANT_ID`, and spend controls
   remain release blockers. Do not deploy or reconnect Vercel Git.

## Exact next action after M3.12 corrected CI/provider recheck (2026-08-02)

1. Treat source HEAD `29c59b5cf08db3a5004856c60c295f528a936509` and CI
   `30744414270` as the corrected source candidate. The delivery integration,
   full disposable database lane, container smoke, lint, typecheck, unit, and
   secret gates passed. Build was externally blocked by GitHub account
   payments/spending-limit state; E2E remains unexecuted.
2. Keep `ERP_DELIVERY_RECEIPT_WRITES_ENABLED`,
   `ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS`,
   `ERP_DELIVERY_RECEIPT_WRITES_VIA_API`, and
   `ERP_DELIVERY_RECEIPT_WRITES_VIA_API_TENANT_IDS` false/empty. Do not apply
   migration `20260802140000_delivery_receipt_workflow_idempotency.sql`.
3. Obtain owner-approved canonical mapping for the one 12-record duplicate
   Purchase Order group and an explicit `AUDIT_RECOVERY_TENANT_ID`; then rerun
   the read-only hosted planner. Only a clear planner plus explicit
   spend-bounded Supabase/Railway/Vercel authorization can permit one hosted
   migration and one production action. Keep Vercel Git disconnected and do
   not create previews or duplicate builds.

## Exact next action after M3.9 CI evidence (2026-08-02)

1. Treat `6121740ea2a3db189e7cc1c5e83f970db73f6b74` and CI run
   `30740581304` as the reviewed source candidate. Actionlint, secret scan,
   typecheck, lint, unit tests, PostgreSQL 17/Redis reproducibility, database
   assertions, Nest integration, and production build passed; E2E remains
   credential-gated.
2. Re-run the read-only Supabase ledger, duplicate-PO, audit-recovery,
   Railway-readiness, and Vercel-readiness checks. Do not apply the new
   migration or deploy while the twelve pending migrations, 12-record
   duplicate group, or missing `AUDIT_RECOVERY_TENANT_ID` remain.
3. Keep every Stock Receipt post/reverse selector and API write gate
   false/empty. Only an owner-approved planner result plus explicit,
   spend-bounded provider approval can authorize one hosted migration release
   and one Railway/Vercel production action.

## Exact next action after M3.8 Stock Receipt source/CI candidate (2026-08-02)

1. Keep `ERP_INVENTORY_RECEIPT_CREATE_VIA_API` and
   `ERP_INVENTORY_RECEIPT_CREATE_TENANT_IDS` false/empty. Do not apply hosted
   migrations or deploy Railway/Vercel while the planner is `review_required`.
2. Source/docs candidate `3f4bca7` is pushed under `kurtgav`; CI run
   `30739156350` passed all executable jobs on the exact SHA. E2E remains
   credential-gated.
3. Obtain owner-approved canonical mapping for the 12 duplicate Purchase
   Orders and a valid `AUDIT_RECOVERY_TENANT_ID`; re-run the read-only planner
   until all eleven pending migrations and data/audit blockers clear.
4. After a clear planner, validate one designated demo tenant end to end:
   RBAC-negative, PO/warehouse/delivery binding, exact micros/cents, stable
   idempotent retry, audit evidence, readiness, exact SHA, and rollback.
5. Only after those checks perform one spend-bounded Railway action and one
   Vercel production action. Keep Vercel Git disconnected; avoid previews and
   duplicate builds; verify live browser/API/logs before declaring green.
