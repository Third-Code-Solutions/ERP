# Architecture Decisions

## D-328 - Scope composite delete nulling to nullable evidence targets (2026-08-10)

Decision: preserve `tenant_id` when deleting project comments whose creation or
deletion ledger must remain as evidence. Replace composite `ON DELETE SET NULL`
with PostgreSQL column-scoped `ON DELETE SET NULL (comment_id)` for both
ledger foreign keys through a forward migration. Keep tenant scope required;
do not delete or rewrite evidence rows.

Rationale: PostgreSQL nulls every referencing column for an unrestricted
composite SET NULL action. Nulling tenant identity violates the ledger's
not-null invariant and can cross the audit boundary. Column-scoped nulling
preserves tenant isolation and deterministic replay while allowing the
requested comment deletion.

Validation: focused migration contract 2/2; disposable PostgreSQL 17/Redis
7.4.9 replay 116/116 migrations, database 370/370 with no skips, API
integration passed, and schema hash matched before/after. Root tests, lint,
typecheck, 82-route build, boundary, workflow, spend, and diff checks pass.
No hosted DB/provider/deployment action; hosted release remains unapproved.

## D-327 - Separate CAD evidence production from official commit (2026-08-10)

Decision: make Web CAD parsing return a strict shared worker response with no
database or BOM side effect. An exact-tenant upload can send that response to
Nest `POST /v1/documents/:documentId/cad-evidence`; selected-Core failure is
terminal. Keep the old writer plus auto-BOM only for compatibility tenants.

Rationale: parsing and AI/OCR are evidence producers; official scope rows,
idempotency, audit, and approval-sensitive state belong in Nest Core. This
split allows parity and rollback proof without a big-bang rewrite or hidden
double write.

Validation: parser 2/2, upload route 10/10, adapter 4/4; root tests (shared
315, API 736, Web 749), lint, typecheck, production build (82/82 routes),
boundary, migration, workflow-reference, provider-spend, and diff checks
pass. Disposable/hosted release evidence remains open; selectors false/empty.

## D-326 - Web CAD evidence calls Nest authority (2026-08-10)

Decision: add a closed exact-tenant Web adapter for
`POST /v1/documents/:documentId/cad-evidence`. The adapter validates the
document-bound worker payload before sending it, uses the server session and a
stable idempotency key supplied by its caller, validates the strict Core
result, and never falls back after a selected-Core failure. Do not connect the
legacy upload/parser path until parser, auto-BOM, response, replay, and
rollback parity are proven.

Rationale: Web currently owns a compatibility transaction that can replace
document-derived scope rows. Nest already owns the safer transaction, but an
unconnected client boundary is required before moving authority incrementally.
Exact tenant selection limits blast radius while preserving rollback.

Validation: focused adapter 4/4; root tests (shared 315, API 736, Web 745),
lint, typecheck, production build (82/82 routes), Web DB-boundary, migration
files-only, workflow-reference, provider-spend, and diff checks pass.
Disposable replay, protected browser, hosted, and provider release evidence
remain open. Selector is false/empty.

## D-325 - Core owns the DocuSeal completion transaction (2026-08-10)

Decision: add `POST /v1/webhooks/docuseal` as a public-but-secret-authenticated
Nest boundary. Core resolves the external submission to a tenant-owned portal
token, locks the token and BOM, persists signed document evidence, and audits
the lock in one transaction. A consumed token produces a duplicate result with
no side effects. Web selects Core only for an exact UUID allowlist and never
falls back after selection; Web notification delivery remains ancillary until
outbox parity is a separate slice.

Rationale: the legacy callback directly mutates several official ERP records
and is retried by an external provider. A single Core transaction gives the
callback tenant isolation, lock ordering, retry safety, and audit continuity
without requiring a provider call or a big-bang signing rewrite. A distinct
server-only internal token is used because external callbacks have no
Supabase user principal.

Validation: focused contract/API/Web tests and typechecks pass. Root tests,
lint, production build, boundary, migration, workflow, provider-spend, and
diff checks pass. Disposable replay, protected webhook, hosted, and rollback
release evidence remain open; all selectors are closed.

## D-324 - Core owns authenticated notification read state (2026-08-10)

Decision: expose `GET/POST /v1/notifications` behind `notification.read`.
Nest derives tenant and recipient user from the verified principal, filters
both predicates on every query/update, and writes a semantic audit event in
the same transaction for mark-read operations. Web may select this authority
only for an exact UUID tenant; selected-Core failure is terminal; defaults are
closed.

Rationale: notification rows are user-directed operational evidence and the
legacy Next route directly updates them. Moving only the read-state boundary
reduces trust in the Web database path without changing notification creation,
delivery queues, or public contracts. The strict shared contract prevents
malformed links/identifiers from crossing the Core seam.

Validation: focused shared/API/Web tests and typechecks passed; root and
disposable replay/hosted evidence remain pending. No hosted or paid action.

## D-323 - Core owns the bank reconciliation read projection (2026-08-10)

Decision: expose `GET /v1/finance/reconciliation` from Nest Core with
`finance.read`, verified principal, exact UUID tenant allowlist, strict shared
contract validation, and tenant-matched statement/account/line queries. The
Web page may select this authority only for an exact server-side tenant; Core
failure is terminal, and both selectors default closed.

Rationale: bank statements and match progress are sensitive financial evidence.
The incremental seam moves authority without a big-bang rewrite, preserves the
working Web contract, prevents direct browser writes, and bounds integer cents,
dates, statuses, and aggregate counts before presentation. No hosted canary is
safe until disposable replay, RLS/row parity, protected browser proof,
readiness, rollback, and spend controls are recorded.

Validation: shared 3/3, Core 4/4, Web client 156/156, root tests/typechecks,
lint/build, boundary, migration, workflow-reference, and spend guards passed.
Docker/provider/hosted evidence remains unverified.

## D-322 - Never feed raw derived rows into Cortex chat (2026-08-10)

Decision: every Cortex chat retrieval authority and deterministic fallback must
drop rows unless the reference table is registered and matches the canonical
node type. The shared contract validates serialized items; Core, Web, and the
database keyword-answer helper apply defensive filtering before prompt,
answer-text, or citation assembly.

Rationale: `cortex_nodes` is a derived mirror and the application database role
bypasses RLS. Tenant predicates alone do not prove source identity. A malformed
or mismatched row must not become AI context, a user-visible grounded answer,
or durable citation evidence. Runtime shared-types ownership avoids a second
source registry and preserves the clean-room implementation.

Validation: Web chat 17/17, shared retrieval 5/5, database retrieval 1/1,
Core retrieval/controller 9/9, typechecks, frozen lockfile install, root lint,
and production build passed. PostgreSQL/RLS replay and hosted evidence remain
unverified.

## D-321 - Keep Web/Core Cortex graph degradation identical (2026-08-10)

Decision: the Web compatibility graph route must call the shared graph
sanitizers before returning direct-path results. Core and Web therefore retain
the same valid nodes/links and conceal invalid focused graphs identically.

Rationale: an incremental authority migration cannot create different trust or
failure semantics for the same tenant. Raw Web fallback data would bypass the
source-contract hardening already required of Core.

## D-320 - Sanitize Cortex graph rows before response assembly (2026-08-10)

Decision: graph authorities use a shared sanitizer that drops malformed nodes,
unregistered/mismatched sources, invalid links, and links to dropped nodes;
focused reads return not-found when the focus cannot survive validation.

Rationale: a derived graph is not the ERP source of truth, and one bad mirror
row must not either leak unsafe data or make the entire operator graph fail.
The sanitizer preserves valid evidence, enforces bounded output, and keeps the
tenant/role/capability boundary intact.

Validation: shared graph tests 5/5, Core graph tests 7/7, typechecks, and static
migration check passed. Full database replay is unavailable while Docker hangs.

## D-319 - Enforce Cortex source identity in shared contracts (2026-08-10)

Decision: graph nodes, Cortex search hits, and citation records must validate a
registered `refTable` together with its matching canonical node type. The
shared contract owns this invariant; Core retains defensive filtering before
serialization.

Rationale: source identity is a security and trust boundary for deep links,
tenant-scoped evidence, and AI context. Enforcing it only in one route leaves
other consumers able to accept malformed or mismatched derived data. A shared
refinement prevents drift without copying ERPNext/Frappe structures or
weakening the existing tenant/role/capability gates.

Validation: shared Cortex tests 11/11 and typecheck, Core focused tests 7/7 and
typecheck passed. Full database replay is still unavailable.

## D-318 - Validate Cortex source identity inside Core (2026-08-10)

Decision: Core Cortex search must reject graph rows whose source table is not in
the reviewed registry or whose `ref_table` does not map to the returned
`node_type`. Candidate hits are parsed by the shared contract; malformed rows
are omitted. This validation is independent of Web filtering.

Rationale: the Core database client bypasses Postgres RLS and therefore cannot
trust a graph projection merely because the query was tenant-scoped. The
authority boundary must prevent unknown or mismatched derived data from
crossing into downstream navigation/AI consumers while preserving fail-closed
behavior. Tenant, role, capability, canary, and no-fallback rules remain in
force.

Validation: focused Core search/controller tests 7/7, API typecheck/build, and
root lint passed. The full serial API suite exceeded a 240-second command
limit without completing; database/RLS replay is not yet available.

## D-317 - Gate Core universal-search reads by exact tenant and never fall back (2026-08-10)

Decision: implement the first Nest Core universal-search seam as a disabled,
tenant-scoped read adapter over the existing Cortex graph projection. Require
the verified `cortex.search` capability and derive tenant, role, user, and task
assignee scope from the authenticated principal. Share one canonical
role/entity policy and bounded query/result schemas with Web. Enable Core only
for exact UUID tenant selectors; if selected Core fails, return a terminal
error rather than re-entering direct Web database reads.

Rationale: authority selection must be auditable and fail closed during the
incremental modular-monolith migration. The graph is the only existing Core
read projection in this slice, so direct-table parity and backfill are explicit
preconditions instead of hidden fallback behavior. Wildcards, client-supplied
tenant/role scope, external hrefs, SQL diagnostics, and malformed sources are
rejected or omitted.

Validation: API search specs 5/5, Web route/client regressions, full serial
Turbo suite, typechecks, lint, and production build passed; database/RLS
integration remains unverified without `DATABASE_URL`. No hosted or paid
action.

## D-316 - Make universal search completeness explicit (2026-08-10)

Decision: share a strict, navigation-safe universal-search result contract
between the current Web compatibility route and the future Nest Core read
authority. Preserve `hits` and `hint` for current clients, add bounded
`status` and `failedTypes`, and expose no SQL, query-plan, tenant, role, or
provider diagnostics. Label each role-authorized query before parallel fan-out;
the UI shows a generic incomplete-results warning and rejects malformed
responses.

Rationale: `Promise.allSettled` prevents one failed record family from taking
down the palette, but silently returning fewer hits misleads operators. A
bounded partial signal improves trust without revealing sensitive internals or
changing tenant authorization. This is a compatibility step; Core remains the
future read authority and selection must be exact, canaried, and no-fallback.

Validation: shared contract 2/2, Web route 12/12, root lint, full test suite,
production build, Web DB-boundary verification, managed-parity verification,
clean-room tests 7/7, and spend-guard tests 4/4. No hosted, provider,
migration, or paid action.

## D-315 - Keep managed parity manifest source-accurate and hosted-read-only (2026-08-10)

Decision: refresh the machine-checked parity manifest whenever source
migrations advance, while preserving the last verified managed applied prefix
and `review_required` status. M3.204 project-comment create/delete migrations
are recorded as an ordered source suffix, not treated as hosted state.

Rationale: stale counts/head make release tooling fail open or mislead review;
claiming source migrations are hosted would be worse. A linear 55/115 boundary
with 60 explicit pending files makes the missing evidence visible and keeps
costly or irreversible actions behind backup, replay, rollback, and spend gates.

Validation: parity verifier 55/115, 60 pending, nine ordered batches; four
manifest tests; spend-guard tests. No database/provider/deployment action.

## D-314 - Make Core authoritative for project comment deletion (2026-08-10)

Decision: project-comment deletion is a strict Nest command with verified
membership, `project.update`, tenant/project/comment predicates, bounded
idempotency, and same-transaction semantic audit. The Web action selects Core
only for an exact enabled tenant; selected-Core failure is terminal with no
direct-write fallback. Hard deletion is retained for compatibility, while a
service-only ledger keeps the command result replayable after the comment row
is gone. Creation/deletion ledger target references use `ON DELETE SET NULL`.
Browser mutation privileges remain revoked and all rollout flags default to
false with empty allowlists.

Rationale: discussion is construction traceability. A durable result prevents
duplicate or misleading retries while preserving current API behavior during
the incremental migration. The post-lock ledger reread handles a retry that
waited behind a concurrent delete without weakening tenant isolation.

Validation: focused API 84/84, shared 5/5, Web 16/16, full tests, typecheck,
lint, build, boundary, and migration filename verification passed. Disposable
PostgreSQL replay and hosted evidence are still required; WSL/Docker were
unavailable this turn, and no hosted/provider/paid action occurred.

## D-313 - Make Core authoritative for project comment creation (2026-08-10)

Decision: project discussion creation is a strict Nest command with verified
membership, `project.update` capability, tenant/project predicates, a durable
tenant-scoped idempotency ledger, mention resolution, and same-transaction
semantic audit. The Web action selects Core only for an exact enabled tenant;
after selection, Core failure is terminal and no direct-write fallback is
allowed. Browser insert/update/delete privileges on `project_comments` are
revoked by the migration; the legacy server credential path remains closed-
canary compatibility only.

Rationale: comments are construction traceability and Cortex context, not
incidental UI state. Two browser writes could cross tenant/project boundaries,
lose audit linkage, or duplicate a retry. Core transaction plus replay ledger
provides one authority while preserving current API behavior until local
replay, hosted release identity, rollback, and protected browser evidence are
available.

Validation: focused shared/API/Web suites; full tests, typecheck, lint, and
production build passed; disposable PostgreSQL replay reached 114/114
migrations and the real comment transaction/replay/rollback integration
passed. Hosted SQL, deployment, provider, and paid actions were intentionally
not performed.

## D-312 - Canonicalize optional upload descriptions (2026-08-10)

Decision: the guarded Web-to-Core document command sends `description: null`
when the legacy request omits a description. The idempotency hash already
normalizes the same value; the route test asserts the exact payload.

Rationale: JSON omission and explicit null must not create two replay shapes
for one business command. Canonical serialization keeps Core, retries, and
audit/idempotency reasoning stable without changing the closed-by-default
legacy path.

Validation: upload route 8/8; full tests, typecheck, lint, and production build
passed. No hosted/provider/deployment/paid action.

## D-311 - Select Core before legacy upload mutation (2026-08-10)

Decision: `/api/upload/complete` may select Core only when both the exact tenant
allowlist and non-extractor format selector match. Selection happens before
the legacy insert. Core errors are terminal; no direct Web fallback occurs.
The closed default preserves current API behavior, and extractor formats stay
legacy-authoritative until processing parity exists.

Rationale: authority must be decided before a transaction opens. A post-write
handoff could create duplicate documents or split audit authority. Deterministic
command hashing gives retries stable idempotency without requiring a new client
protocol in the closed-by-default rollout.

Validation: route 8/8; Core client 152/152; Web typecheck. No hosted/provider/
deployment/paid action.

## D-309 - Freeze legacy upload response before any Core canary (2026-08-10)

Decision: define the existing `/api/upload/complete` response as a strict
shared contract and parse the legacy route output. A disposable Core adapter
may map only non-extractor uploads under the exact tenant gate; CAD, visual,
spreadsheet, CSV, and document extraction stays on the legacy path. Core
errors are terminal with no direct-write fallback, and the route remains
unconnected until hosted identity, replay, rollback, and spend gates pass.

Rationale: API compatibility is observable beyond the document row. Freezing
the response first makes a future authority switch measurable and prevents a
partial migration from dropping extraction status or changing client behavior.

Validation: local zero-to-current replay 113/113; real database integration
1/1; schema hash equal; shared contract 3/3; Web upload/Core 158/158. No
hosted/provider/deployment/paid action.

## D-310 - Validate document scope before idempotency claim (2026-08-10)

Decision: Nest checks verified membership, project existence, and storage prefix
before inserting the idempotency ledger row.

Rationale: a foreign project must produce concealed 404/403 semantics, never a
raw composite-FK database error. Valid retries still use the durable ledger.

Validation: local PostgreSQL transaction integration covers foreign project,
foreign prefix, replay/conflict, and rollback; 1/1.

## D-308 - Make document intake Nest-authoritative before Web cutover (2026-08-10)

Decision: document recording is a strict Nest command. Core derives tenant,
user, and role from verified membership; requires a tenant/project storage
prefix; records a durable idempotency result and semantic audit in one
transaction; and remains disabled behind an exact tenant allowlist. The Web
adapter is server-only, single-call, no-store, and has no direct fallback, but
the upload route remains unconnected.

Rationale: uploading an object is not equivalent to committing an ERP document.
Moving the canonical row and audit together prevents split authority, retries,
cross-tenant paths, and AI/CAD processing from silently finalizing records.
Keeping the adapter unconnected preserves current API behavior while parity and
rollback evidence are built.

Validation: API 77/77; Web 148/148; shared 4/4; local builds/typechecks green;
no hosted/provider/deployment action. The migration must still be replayed from
zero before any canary.

## D-307 - Guard Next API direct database authority (2026-08-10)

Decision: keep existing Next API behavior, but require every direct write to be
explicitly allowlisted with operations, migration owner, and a reason. Treat
raw `db.execute` as read-only only when separately classified. Fail CI for new
or mismatched access; do not silently rewrite routes in this milestone.

Rationale: a big-bang move would risk tenant predicates and API compatibility,
while an unguarded Web surface would let split authority grow. A static,
read-only guard creates a measurable boundary and leaves reversible seams for
Nest to assume authority incrementally.

Validation: boundary tests 4/4 and report `clear`; no runtime, database,
provider, hosted, or deployment action. Server Actions/internal services are
not yet claimed migrated.

## D-306 - Make release identity and rollback evidence machine-checked (2026-08-10)

Decision: require a clean candidate SHA, matching API/Web deployed source
SHAs, explicit hosted release IDs, explicit rollback IDs, closed Vercel Git,
and clear spend guard before any canary. Enforce through a read-only local
planner; missing hosted evidence remains `review_required`.

Rationale: source commits, readiness URLs, and local builds cannot prove which
artifact serves production or whether rollback is reversible. A planner makes
that gap explicit without creating another billable build or hosted mutation.

Validation: planner tests 5/5; current report review-required for missing
external IDs. No SQL, provider call, browser session, deployment, or paid
resource.

## D-305 - Derive owner/context scope only from verified membership (2026-08-10)

Decision: exercise the real JWT membership guard and capability guard around
the owner/context controller before any Web cutover. Reject missing bearer,
missing ERP membership, and caller-selected tenant input before the resolver;
forward only the verified principal.

Rationale: a route-level controller test with an injected principal can pass
while the production guard chain is absent or a caller can influence tenant
scope. The disposable harness proves the boundary without managed data or
provider spend.

Validation: protected harness 3/3; shared-types 286 tests, API 153 files/682
tests, Web 102 files/697 tests; typechecks/lint; Nest webpack; Next 82-page
build; spend/release/security guards. No SQL, hosted action, browser session,
provider call, or paid resource. Hosted release identity, replay, and rollback
remain unresolved; canaries stay false/empty.

## D-304 - Keep selected Core HTTP failures fail-closed (2026-08-09)

Decision: preserve owner/context 404/409/503 status/message semantics at the
Nest HTTP boundary, and map selected Web Core timeout/5xx/invalid results to a
single 503 failure with no retry or direct database fallback.

Rationale: a Core cutover that changes concealment or silently re-enters direct
reads can leak ownership or create split authority. Explicit status coverage
keeps rollback reversible while protected deployed identity remains unproven.

Validation: Nest HTTP 7/7; Web seam 4/4; full API 152 files/679 tests and Web
102 files/697 tests; typechecks/lint green. No SQL, hosted action, provider,
browser session, or paid resource. All canaries remain false/empty.

## D-303 - Require deterministic owner/context parity before HTTP cutover (2026-08-09)

Decision: add a frozen 12-case legacy/Core owner/context fixture and review
packet before wiring the Web chat route. Compare normalized success data plus
observable 404/409 semantics; keep Core/Web gates closed.

Rationale: service-level tests can prove individual branches while missing
legacy contract drift across ownership, revoked focus, role scope, and source
mapping. A deterministic fixture exposes that drift without touching managed
data, browser state, or provider spend.

Validation: parity 12/12; principal-derived tenant/user read assertion. No SQL,
hosted action, provider call, browser session, or paid resource. Next gate is
protected HTTP parity and selected-Core no-fallback evidence.

## D-302 - Keep chat owner/context separate from retrieval (2026-08-09)

Decision: add a dedicated, read-only owner/context Core contract and an
unconnected Web seam. Do not reuse retrieval, entity, conversation detail, or
write canaries as chat bootstrap authority; do not wire the chat route yet.

Rationale: chat must preserve owner lookup, immutable focus, current-role
authorization, and 404/409 behavior independently from evidence retrieval.
Combining these paths would make a retrieval cutover capable of changing
conversation isolation or silently restoring direct database authority after a
Core failure.

Validation: shared 5/5; API service 9/9, controller 3/3, environment 66/66;
Web client 145/145 and seam 3/3; typechecks passed. No SQL, hosted action,
provider call, or paid resource. Both exact-tenant gates remain false/empty.

## D-301 - Keep the Web chat Core retrieval seam unconnected (2026-08-09)

Decision: add a server-only, exact-tenant Core retrieval adapter with strict
result parsing and no direct fallback, but do not import it from the chat POST
route until conversation owner/context parity is separately proven.

Rationale: retrieval projection parity does not prove that a conversation or
focused record is still owned and visible to the current session. Connecting
both authorities in one change would make a Core failure or context mismatch
hard to roll back and could alter existing 404/409 behavior.

Validation: Web Core client 142/142, seam 3/3, API focus transport 3/3, shared
contract 4/4, shared/Web typecheck. No SQL, hosted action, provider call, or
paid resource; exact tenant gate remains false/empty.

## D-300 - Require fixture parity before a Web chat read seam (2026-08-09)

Decision: record deterministic equality between the existing direct retrieval
shape and the Core projection before adding a Web adapter. The fixture covers
bounded items, stats, focused citations, keyword answer, and semantic status;
it does not authorize conversation-owner/context migration or a tenant
canary.

Rationale: a Core endpoint can serialize correctly while the chat route still
authorizes a different conversation or focus. Separating projection parity
from ownership/context parity prevents a write or read canary from silently
changing the assistant's evidence source.

Validation: chat service 5/5, shared contract 4/4, full root test/typecheck,
lint, 82-page build, and spend/security gates. No SQL, hosted action, provider
call, or paid resource. Rollback is documentation-only and flags remain
closed.

## D-299 - Make Cortex chat retrieval a separate bounded Core contract (2026-08-09)

Decision: add a read-only `GET /v1/cortex/chat-retrieval` contract instead of
reusing search, graph, conversation, or write endpoints. Bound recent/match
windows, derive tenant/RBAC scope from the Nest principal, validate canonical
focus refs, return citations/freshness, and report semantic retrieval as
`not_migrated` until separately implemented. Keep the API gate false/empty and
do not wire the Web chat route yet.

Rationale: the chat prompt currently combines multiple direct reads with
different limits and citation semantics. Reusing a narrower endpoint could
silently change evidence or leak a forbidden focused record. A separate
projection enables deterministic parity and fail-closed cutover while keeping
provider spend out of this milestone.

Validation: shared 4/4, API 71/71 focused tests, shared/API typecheck. No SQL,
hosted write/deploy, provider call, or paid resource. Rollback is clearing the
new flag/allowlist; no hosted artifact was changed.

## D-298 - Keep chat retrieval separate from Cortex write canaries (2026-08-09)

Decision: do not widen Core user-turn, assistant-turn, generation, search,
graph, entity, or conversation canaries into chat retrieval authority. Define a
new bounded projection for recent, keyword, focused, citation, freshness, and
optional semantic context first.

Rationale: chat currently combines several direct reads and prompt assembly;
existing endpoints do not prove context/citation parity. A write success or a
generic search result cannot authorize the assistant's evidence source.

Validation: source audit and authority table added; no SQL, hosted
write/deploy, provider call, or paid resource. Rollback is documentation-only;
keep every retrieval and write canary closed.

## D-297 - Do not infer hosted rollback identity from local source (2026-08-09)

Decision: record the exact local application candidate and documented Web
rollback target, but leave Railway/API rollback identity unresolved until a
provider read supplies it. Local Git state cannot certify hosted release or
rollback identity.

Rationale: claiming a hosted artifact from a source SHA could cause an invalid
rollback or an accidental rebuild. Explicit unknown status keeps the canary
review honest and spend-safe.

Validation: packet metadata reconciled; no SQL, hosted write/deploy, provider
call, or paid resource. Rollback remains closed flags/allowlists plus retained
artifacts.

## D-296 - Reject wildcard selection for the Cortex brief Web canary (2026-08-09)

Decision: the Web brief canary accepts only an exact UUID allowlist. It uses a
strict helper that rejects `*`; other legacy Core seams keep their existing
generic helper until separately reviewed.

Rationale: the packet promises one-tenant scope, and wildcard selection would
make a future operator mistake widen every dashboard request. Local rejection
is cheap, deterministic, and independent of hosted state.

Validation: Core client 139/139, brief-read 4/4, Web typecheck/build; no SQL,
hosted write/deploy, provider call, or paid resource. Rollback is unchanged:
clear flags and allowlists.

## D-295 - Keep the Cortex brief canary packet review-only (2026-08-09)

Decision: record candidate identity, independent flags, tenant/RBAC proof,
bounded request/spend controls, rollback, and hosted blockers in a review-only
packet. Do not enable either allowlist or infer deployment readiness from local
tests.

Rationale: read-only behavior still exposes tenant-scoped ERP facts. A source
SHA and parity fixture cannot prove hosted identity, Supabase parity, live
authorization, rollback, or spend ceilings. Keeping the packet closed avoids
an accidental production or billing change.

Validation: packet added; no SQL, hosted write/deploy, provider call, or paid
resource. Rollback remains clearing both flags/allowlists and retaining the
last-known-good artifacts.

## D-294 - Require deterministic dashboard brief parity before canary review (2026-08-09)

Decision: compare the role-scoped legacy fixture with the normalized Core
projection through the same server seam before any tenant canary review. Exact
structural equality is evidence, not activation authority.

Rationale: serialization and Date conversion can silently drop or change
tenant-visible facts even when API schemas pass. A deterministic fixture makes
the parity claim repeatable without network, database, provider, or hosted
spend.

Validation: brief-read parity 4/4, sequential Web typecheck/build, prior full
M3.184 gates; no SQL, hosted write/deploy, provider call, or paid resource.
Rollback is unchanged: closed flags and the last reviewed source commit.

## D-293 - Route the Cortex dashboard brief through one server seam (2026-08-09)

Decision: the dashboard calls `readCortexBrief()` only. An exact-tenant Core
selection normalizes the validated Nest projection; a Core error is shown and
does not regain direct database authority. Unselected tenants retain the
existing role-scoped database path.

Rationale: page-level branching was an authority leak and made parity/rollback
hard to test. A single server seam keeps tenant selection, fail-closed
behavior, and source normalization outside React rendering.

Validation: brief-read 3/3, presentation/panel 8/8, full test/typecheck/lint/
build and release/security gates recorded in `CURRENT_STATE`; no SQL, hosted
write/deploy, provider call, or paid resource. Rollback is the source commit
plus closed canary flags.

## D-292 - Give Cortex brief an independent, fail-closed read canary (2026-08-09)

Decision: use a strict shared brief contract plus Nest `GET /v1/cortex/brief`
authority with its own exact-tenant environment pair. The Web route returns
503 on Core failure and never silently falls back; the flag stays false and the
allowlist empty.

Rationale: the projection carries role scope, freshness, and provenance; graph
or write canaries do not prove brief parity. Strict serialization prevents
process fields from crossing the ERP boundary.

Validation: focused and full gates recorded in `CURRENT_STATE`; no SQL,
hosted write/deploy, provider call, or paid resource. Rollback is the flag plus
the last reviewed source commit.

## D-291 - Do not widen Cortex write canaries into read authority (2026-08-09)

Decision: keep the current Core read canaries separate from Cortex writes and
provider generation. Search, graph, entity, and saved-conversation reads may
cut over only through their own shared contracts and exact-tenant gates. The
brief has no Core parity yet; chat conversation bootstrap and graph retrieval
remain direct reads until a separate parity design is approved.

Rationale: write idempotency and provider-budget correctness do not prove read
projection parity, role scope, freshness, citations, or rollback. Treating a
write canary as read authority could silently change the dashboard or assistant
evidence source and make failures fall back inconsistently.

Validation and release boundary: repository audit of Cortex routes, dashboard
consumers, Core adapters, and Nest modules; no code, SQL, flag, route,
provider, hosted write, deployment, or paid resource. M3.181 API 636/636,
shared 274/274, Web 676/676, typecheck/lint/build, spend/controlled-release,
Actionlint, pinned refs, Gitleaks, diff, and clean-room evidence remains
current. Rollback is documentation-only; preserve all forward database
ledgers and keep canaries closed.

## D-290 - Keep process observability out of user-facing Cortex search (2026-08-09)

Decision: keep Cortex search, command-palette results, graph, brief, and chat
consumers limited to authenticated tenant- and role-scoped product records.
The strict result contract rejects process snapshot fields; the Next projection
maps only registered entity sources and safe deep links. No consumer may read
`readOperationalSnapshot()`.

Rationale: process-wide enqueue counters have no tenant attribution. Allowing
them into a user-facing search or assistant response would disclose unrelated
runtime activity and blur operational versus ERP data boundaries.

Validation and release boundary: focused shared search 4/4 and Web Cortex search
route 7/7; API 636/636; shared 274/274; Web 676/676; root typecheck/lint/build
with 82 pages; spend/controlled-release guards, Actionlint, pinned refs,
Gitleaks, diff checks, and clean-room scan pass. No SQL changed, so the
preceding disposable replay remains current: 112/112 migrations, 367/367
zero-skip database tests, 26 API integration files/40 tests, and equal schema
hash. No process-metric access, route, exporter, hosted write, credential,
deployment, or paid resource. Rollback removes only the regression tests and
documentation; preserve the alert ledger and never down-migrate.

## D-289 - Keep the operational adapter consumer unregistered by default (2026-08-09)

Decision: record `consumer: none_registered` in the snapshot policy and permit
only a future separately reviewed operational adapter as a consumer. The
ownership metadata cannot enable routing, exporting, sinks, or deployment.

Rationale: process-wide counters must not leak through a tenant-facing Cortex
or ERP search consumer. Explicitly naming the absent consumer makes ownership
auditable and prevents a helper or browser path from becoming an accidental
telemetry adapter.

Validation and release boundary: repository reference audit; API 636/636;
shared 273/273; Web full unit lane; focused five-test evaluator/policy
contract; root typecheck/lint/build with 82 pages; spend/controlled-release
guards, Actionlint, pinned refs, Gitleaks, diff checks, and clean-room scan
pass. No SQL changed, so the preceding disposable replay remains current:
112/112 migrations, 367/367 zero-skip database tests, 26 API integration
files/40 tests, and equal schema hash. No route, exporter, hosted write,
credential, deployment, or paid resource. Rollback removes metadata only;
never down-migrate the alert ledger.

## D-288 - Fail closed on incomplete operational adapter evidence (2026-08-09)

Decision: evaluate any future operational snapshot adapter against nine explicit
reviews—caller authorization, process-versus-tenant scope, redaction,
retention, bounded rate, provider/network cost, backend owner, exact Git SHA,
and last-known-good rollback artifact. Missing evidence returns stable blockers;
complete evidence returns `eligible` only as a non-authoritative result.

Rationale: a policy record alone can drift or be mistaken for activation
authority. A pure evaluator makes omission visible and keeps the route,
exporter, sink, deployment, and provider gates closed until separate review.

Validation and release boundary: API 636/636; shared 273/273; Web full unit
lane; focused five-test evaluator/policy contract; root typecheck/lint/build
with 82 pages; spend/controlled-release guards, Actionlint, pinned refs,
Gitleaks, diff checks, and clean-room scan pass. No SQL changed, so the
preceding disposable replay remains current: 112/112 migrations, 367/367
zero-skip database tests, 26 API integration files/40 tests, and equal schema
hash. No route, exporter, hosted write, credential, deployment, or paid
resource. Rollback removes the evaluator only; preserve the alert ledger and
never down-migrate.

## D-287 - Require owner, exact SHA, and artifact rollback evidence (2026-08-09)

Decision: the closed operational snapshot policy records abstract ownership as
the ERP backend owner, exact Git commit SHA as release identity, and rollback to
the last known-good artifact without rebuilding. These fields do not authorize
a deployment or exporter.

Rationale: observability changes can expose cross-tenant process activity or
create spend through an external sink. A future adapter needs an accountable
owner and reproducible release/rollback identity before it can be considered;
metadata alone must never be treated as approval.

Validation and release boundary: API 634/634; shared 273/273; Web full unit
lane; focused policy contract covers all ownership, release, and rollback
fields; root typecheck/lint/build with 82 pages; spend/controlled-release
guards, Actionlint, pinned refs, Gitleaks, diff checks, and clean-room scan
pass. No SQL changed, so the preceding disposable replay remains current:
112/112 migrations, 367/367 zero-skip database tests, 26 API integration
files/40 tests, and equal schema hash. No route, exporter, hosted write,
credential, deployment, or paid resource was added. Rollback removes the
metadata only; preserve the alert ledger and never down-migrate.

## D-286 - Encode deployment observability boundaries before any adapter (2026-08-09)

Decision: keep the Cortex process snapshot behind a frozen source policy and
prove the module registers it as a provider, not an HTTP controller. The
policy requires internal Nest-only authorization, process scope, no tenant
attribution, fixed-cardinality redaction, process-lifetime retention, no route
rate limit until an exporter exists, disabled external sinks, zero external
spend, and separate deployment review.

Rationale: health/readiness and tenant-facing provider-health routes have
different audiences and authorization contracts. A process-wide counter cannot
be safely exposed as tenant data, and an exporter would add network, retention,
and cost obligations. Making the boundary executable prevents accidental route
registration while leaving a future adapter reviewable.

Validation and release boundary: API 634/634 across 145 files; shared 273/273;
Web full unit lane; focused policy/module-boundary contracts; root
typecheck/lint/build with 82 pages; spend/controlled-release guards, Actionlint,
pinned refs, Gitleaks, diff checks, and clean-room scan pass. No SQL changed,
so the preceding disposable replay remains current: 112/112 migrations,
367/367 zero-skip database tests, 26 API integration files/40 tests, and equal
schema hash. Global JWT and explicit capability guards remain unchanged; no
route, exporter, hosted write, credential, deployment, or paid resource was
added. The adapter gate stays closed and rollback removes only the policy/test
seam; never down-migrate.

## D-285 - Keep operational metric snapshots backend-only and immutable (2026-08-09)

Decision: expose a schema-versioned `readOperationalSnapshot()` method on the
Nest observability service, scoped to the current process and returning frozen
counter values. Do not bind it to a controller, browser route, tenant-facing
response, or exporter in this milestone.

Rationale: process-wide enqueue counters cannot be safely attributed to one
tenant. A typed read seam supports future operational tooling while preventing
cross-tenant activity disclosure, accidental mutation, and premature telemetry
cost. Any exporter or route needs its own authentication, authorization,
redaction, retention, and spend review.

Validation and release boundary: focused snapshot contract 2/2; API 632/632;
shared 273/273; Web full unit lane; database 367/367 zero-skip; 112/112
disposable migrations; 26 API integration files/40 tests; equal schema hash;
root typecheck/lint/build with 82 pages; spend/controlled-release guards,
Actionlint, pinned refs, Gitleaks, diff checks, and clean-room scan pass.
Queue, worker, recovery, route, provider, and budget gates remain closed; no
database migration, hosted write, external network, credential, deployment,
or paid resource is allowed. Rollback removes the snapshot method only;
preserve the forward-only alert ledger and never down-migrate.

## D-284 - Keep circuit-alert enqueue metrics local and fixed-cardinality (2026-08-09)

Decision: count post-commit and recovery-fallback enqueue outcomes in a
process-local Nest observability service with the fixed dimensions
`phase={post_commit,recovery_fallback}` and
`outcome={enqueued,skipped,failed}`. Emit sanitized structured metric records;
never include tenant IDs, event keys, alert payloads, credentials, or raw
transport errors. Post-commit failure remains swallowed; recovery failure is
recorded then rethrown for bounded retry.

Rationale: the transactional outbox needs evidence that the non-authoritative
transport handoff succeeded or fell back, but adding an exporter, hosted
telemetry write, or public endpoint would expand rollout and cost risk. Fixed
cardinality prevents unbounded labels and the local seam can later be adapted
to an approved metrics sink without changing ERP transaction ownership.

Validation and release boundary: focused Cortex tests 13/13; API 631/631;
shared/database full lanes; 112/112 disposable migrations; 26 API integration
files/40 tests; equal schema hash; root typecheck/lint/build; spend/release,
Actionlint, pinned refs, Gitleaks, and clean-room checks pass. No migration,
credential, external network, provider/pager call, deployment, or paid resource
is allowed. Rollback removes metrics wiring and preserves the forward-only
alert ledger; never down-migrate.

## D-283 - Enqueue circuit alerts only after transaction commit (2026-08-09)

Decision: transaction owners collect only newly-created aggregate circuit-alert
events and call the BullMQ queue seam after PostgreSQL commit. The durable
`cortex_assistant_provider_circuit_alerts` ledger is the transactional outbox;
queue failure is swallowed at this non-authoritative boundary and recovery
re-enqueues by opaque `eventKey`.

Rationale: enqueueing from inside a transaction can publish an event whose ERP
write later rolls back. Deferring the call preserves PostgreSQL authority,
tenant scope, event-key idempotency, and bounded recovery while allowing
settlement, reconciliation, and generation recovery to share one seam. No
prompt, response, attempt/user identity, credential, or raw transport error is
passed to the queue.

Validation and release boundary: local fake conformance; shared/API/Web full
unit suites; database replay; 112/112 migrations; schema hash equality; lint;
typecheck; serial build; spend/release guards; Actionlint; pinned refs;
Gitleaks; and diff checks passed. No migration, hosted mutation, credential,
provider/pager call, deployment, or paid resource occurred. All queue/worker/
recovery/route gates remain closed; rollback disables them and never
down-migrates.

## D-282 - Keep alert BullMQ transport opaque and bounded (2026-08-09)

Decision: BullMQ alert jobs carry only the durable circuit `eventKey`, with a
deterministic job ID, three attempts, bounded exponential backoff, and a
60-second recovery scheduler. Nest reloads tenant scope from PostgreSQL,
rechecks exact queue/worker/route gates, claims the row transactionally, and
routes through the existing protocol-v1 adapter. Terminal Redis jobs may be
replaced only for database-recoverable state; stale claims past the durable
ceiling become `stale_attempt_limit`.

Rationale: queue payloads containing tenant or alert data can become a second,
stale authority and make cross-tenant routing or retry storms possible. An
opaque event key keeps PostgreSQL authoritative, while bounded attempts and
closed-by-default gates protect spend and operational load. The route adapter
token remains unbound; the local-disabled fallback cannot make a network call.

Validation and release boundary: shared/API/full tests, disposable database
and Redis replay, serial build, lint, typecheck, and clean-room review passed.
No credential, external network, hosted mutation, provider call, pager, or
deployment occurred. Rollback closes all queue/worker/recovery/route gates;
never down-migrate.

## D-281 - Persist route outcomes through durable alert claims (2026-08-08)

Decision: durable alert claims call the provider-neutral router through one
Nest-owned orchestration seam. A route acceptance marks the claimed row
delivered; a route failure stores only its bounded failure code in `last_error`
and leaves the row retryable. Replays use the original event key, stale
processing claims remain claimable, and one failure stops the current drain.
The existing generic sink interface remains compatible. No queue worker or
external adapter is enabled.

Rationale: routing directly from a transient health observation loses evidence
and makes retry behavior ambiguous. Claim-first delivery keeps PostgreSQL as
authority, makes failure/recovery visible, and prevents raw adapter messages or
credentials from entering durable state.

Validation and release boundary: local database replay, full unit suites,
serial build, lint, typecheck, spend/release guards, workflow checks, secret
scan, and diff checks passed. No credential, external network, hosted mutation,
provider call, or deployment occurred. Rollback disables route/dispatch gates;
never down-migrate.

## D-280 - Keep alert routing credential-free at Nest boundary (2026-08-08)

Decision: Nest constructs a protocol-v1 route envelope from a validated,
aggregate-only circuit event. It checks an independent exact-tenant gate and
passes only event key, tenant/policy scope, provider/model, bounded counts and
timestamps, and runbook identity to an adapter. Adapter credentials and
destinations belong exclusively inside a future adapter implementation. The
adapter key is a stable non-secret identifier and `eventKey` is its required
idempotency key.

Known adapter failures map to a bounded route taxonomy; unknown failures become
`route_unknown`. Raw error text, URLs, secrets, prompts, responses, and user
identity cannot enter the route result or audit path. Local fakes prove duplicate
delivery, tenant isolation, bounded payloads, and failure redaction. The route
gate defaults closed and no external adapter is activated.

Rationale: passing provider credentials or free-form payloads through generic
alert code creates accidental secret persistence, cross-tenant routing, and
unbounded retry leakage. A strict envelope plus adapter-owned credentials lets
PostgreSQL remain the event authority while Nest controls activation and
rollback.

Validation and release boundary: shared/API full suites, serial build, lint,
typecheck, spend/release guards, workflow checks, secret scan, and diff checks
passed. No credential, external network, hosted mutation, provider call, or
deployment occurred. Rollback closes route and dispatch gates; never
down-migrate.

## D-279 - Make circuit alerts durable, scoped, and idempotent (2026-08-08)

Decision: Nest observes the tenant/policy circuit snapshot and records one
aggregate-only `opened` event for each deterministic trip and one `recovered`
event linked to that opening. PostgreSQL enforces tenant-composite scope,
source/recovery uniqueness, immutable event identity, and service-only RLS.
Delivery claims are transactional; processing claims can expire, failed rows
are bounded and retryable, and a sink receives only the strict event contract.
The local sink is injectable and external paging is not activated.

Rationale: an in-memory or cache-only alert path loses outages during process
restarts, duplicates pages during retries, and can leak sensitive provider
payloads. Durable event keys and source linkage make replay safe while keeping
PostgreSQL the authority and Redis/Python/browser outside approval paths.

Validation and release boundary: focused and full local suites, clean replay,
schema-hash equality, lint, typecheck, production build, spend/release guards,
workflow checks, secret scan, and diff checks passed. No credential, external
network, hosted mutation, provider call, or deployment occurred. Rollback
closes dispatch and preserves forward-only circuit/alert evidence; never
down-migrate.

## D-278 - Persist a tripped provider circuit until proven recovery (2026-08-08)

Decision: provider health is computed from immutable tenant/policy attempt
evidence. A configured number of consecutive failures must occur within the
failure window to trip. Once tripped, the circuit remains open through cooldown
and then half-open until a provider success; elapsed quiet time does not erase
the trip. The locked provider-policy row serializes reservations, and only the
first post-cooldown reservation may be the probe. Dispatch rechecks the circuit
and accepts only that exact probe. A failed probe restarts cooldown.

Nest exposes only aggregate UTC-day spend, outcome counts, unknown outcomes,
latency percentiles, and circuit metadata to tenant owners, administrators, and
finance users. Tenant scope comes from the verified principal. Prompts,
responses, credentials, attempt/user identity, and provider receipts remain
absent. Stable outcome codes preserve operational evidence without payloads.

Rationale: a rolling recent-failure count can forget an outage before cooldown
or admit multiple calls after a quiet period. Durable failure-burst evidence
plus policy-row serialization bounds spend and concurrency without a mutable
cache or a browser/Python reset path. PostgreSQL remains the authority; Redis
remains transport/cache only.

Validation and release boundary: all local suites, clean replay, schema-hash
equality, build, spend/release guards, workflow checks, secret scan, and diff
checks passed. External alerts, credentials, real provider calls, hosted SQL,
and deployments remain prohibited. Rollback closes gates and preserves the
forward-only ledger/configuration.

## D-277 - Bind provider I/O to one durable protocol attempt (2026-08-08)

Decision: Nest alone constructs protocol-v1 provider requests after a durable
reservation. It re-redacts and bounds content, removes internal identity,
derives dispatch idempotency from the reservation, and records request identity
before dispatch. A response is accepted only when its protocol, model, cost,
content, and citations match the reserved authority. Only hashes of the opaque
receipt and request/response evidence are persisted. The response fingerprint
must equal the exact official completion hash.

PostgreSQL freezes dispatch identity and repeats the response-to-completion
match. Any error after dispatch is terminal and conservatively consumes the
reserved maximum because an external provider may already have billed it. A
second dispatch is forbidden; only failure to reconcile the durable attempt is
retryable. Legacy null-protocol rows remain readable during rolling migration.

Rationale: budget reservation and completion provenance do not prevent payload
drift, replay with a changed prompt, forged provider receipts, model mismatch,
or double billing after a timeout. A versioned identity-minimized envelope and
exact durable fingerprints make those boundaries testable without copying any
external ERP implementation or activating a paid provider.

Validation and release boundary: all local suites, migration replay, schema
hash equality, build, spend/release guards, workflow checks, secret scan, and
diff checks passed. Production dispatch remains unavailable. Rollback closes
gates, reconciles open attempts, and preserves forward-only evidence.

## D-276 - Bind official provider completion to settled spend (2026-08-08)

Decision: a `provider_grounded` assistant completion must carry the exact
provider-attempt UUID returned after settlement. Nest verifies that the attempt
belongs to the same tenant and generation job, matches the current job attempt
and policy model, is settled with `provider_succeeded`, and consumed no more
than reserved. It then commits message, request, job, provenance, and audit in
one transaction. PostgreSQL repeats the invariant through a tenant-composite
foreign key, one-completion-per-attempt index, state constraint, and
service-only insert/update trigger. Linked completion identity and provenance
cannot later change. External completion input cannot select this outcome.

Rationale: successful orchestration and settled spend are insufficient if the
official answer can be committed without proving which attempt created it, or
if a direct database writer can relink provenance later. The explicit internal
variant makes authority visible in TypeScript; the database is the final
integrity boundary. Keeping deterministic completions unlinked preserves
existing behavior and allows an incremental rollout.

Validation and release boundary: all focused/full suites, clean migration
replay, schema-hash equality, lint, typecheck, production build, spend/release
guards, workflow validation, secret scan, and diff checks passed locally. No
real provider, credential, hosted mutation, provider call, build, or deploy was
used. Rollback closes gates and preserves the forward-only ledger/link; a
linked completion is never deleted or repointed.

## D-275 - Reconcile cost before retrying or closing provider work (2026-08-08)

Decision: Nest owns provider orchestration and recovery. It must reserve the
current claimed attempt before dispatch, refuse a second dispatch after a
replayed dispatched state, validate citations against the evidence selected by
Core, settle cost, and then use the existing fenced completion authority. The
production adapter remains unavailable until a separately approved milestone.

Every cancellation, retry, failure, and stale recovery reconciles open attempts
inside the same PostgreSQL transaction as the job mutation. A reserved attempt
is released with zero consumption. A dispatched attempt with an unprovable
external outcome is settled at its reserved maximum. Recovery uses an
independent false-by-default exact-tenant gate so operators can drain work after
intake/execution close without granting new dispatch authority.

Rationale: provider failures and process crashes occur between reservation,
dispatch, settlement, and official commit. Retrying without durable
reconciliation can double-spend; releasing dispatched work can undercount;
requiring intake to stay open prevents safe shutdown. Conservative terminal
accounting and one-dispatch replay behavior bound cost while preserving a
fail-closed operational drain path.

Evidence: fake-only orchestration tests prove gate intersection, no reservation
when the adapter is absent, reserve-before-dispatch ordering, actual settlement,
replay refusal, citation rejection, stale completion fencing, and failure
reconciliation. PostgreSQL integration proves cancellation release, terminal
failure release, recovery settlement at maximum, superseded attempt cleanup,
and schema stability. All release, build, test, and security gates passed. No
provider or hosted action occurred.

## D-274 - Reserve provider money before dispatch (2026-08-08)

Decision: Nest must durably reserve bounded integer micros against an enabled
exact-tenant provider/model policy before dispatch. PostgreSQL serializes the
daily budget on the policy row and owns one immutable reservation for each
generation job attempt. Allowed transitions are only
`reserved -> dispatched -> settled` and `reserved -> released`; settlement
cannot exceed the reservation. Open reservations count at maximum cost.

Closing the global gate, tenant allowlist, or policy stops new reservations and
dispatches. It does not remove Nest's authority to settle or release existing
reservations. Redis remains transport/cache only. Python and any future model
adapter cannot grant budget or commit ERP state. No default policy is seeded.

Rationale: rate limits bound request frequency but do not prevent monetary
overspend, concurrent budget races, retry double-spend, or orphaned holds. A
durable reservation before external work makes the spend ceiling enforceable
and auditable while preserving a safe shutdown path.

Evidence: unit and rollback-local integration tests prove exact replay,
request/daily caps, policy-row locking, actual-cost release,
policy/gate closure, tenant isolation, transition guards, and audit. The full
108-migration PostgreSQL replay, 354 database tests, API integration, source,
build, security, spend, and release gates passed. No provider or hosted action
occurred.

## D-273 - Cancel Cortex jobs before browser teardown (2026-08-08)

Decision: omit an absent new-chat `conversationId` rather than serializing
`null`. For accepted asynchronous jobs, create one once-only cancellation
closure and share it across polling failure/timeout, explicit new chat, React
unmount, and `pagehide`. `pagehide` starts the same keepalive DELETE before a
hard document replacement; duplicate cancellation triggers reuse the original
promise. PostgreSQL terminal state, not visibility of the unloading page's
response object, proves completion.

Rationale: strict optional UUID contracts correctly reject `null`. React
cleanup alone is also not guaranteed to finish before a browser destroys the
old document, which can leave paid or CPU work running after the user leaves.
A pre-teardown signal plus one idempotent canceller closes that cost leak
without adding global state, weakening Core authorization, or duplicating a
cancellation request.

Evidence: the local browser path first reproduced `400 Invalid chat request`
with `conversationId: null`, then reproduced a hard-navigation job left in
`processing`. The corrected five-case suite passed accepted/pending/final,
current revocation, foreign concealment, new-chat/unmount exactly-once DELETE,
ten-poll timeout, responsive/accessibility, and zero-console assertions through
real local Next/Nest/Redis/Python/PostgreSQL. Full source, build, database,
security, release, and spend gates passed. No hosted/provider action occurred.

## D-272 - Return Cortex jobs early and reauthorize final reads (2026-08-08)

Decision: selected provider-free chat returns `202 Accepted` immediately.
Browser polling is same-origin, private, rate-limited, abortable, and capped at
ten attempts. A dedicated Nest result endpoint releases official content only
after current PostgreSQL principal, owner, context, source-turn, and citation
authorization. Abort or timeout requests Core cancellation. Legacy tenants
retain the existing stream and every rollout flag remains closed.

Rationale: sleeping inside a Next request charges function duration and can
still end in an ambiguous `409`. Returning an opaque job identity separates
Web request lifetime from durable work. Status authorization is insufficient
for content release because roles and record visibility may change while the
job runs; final-result authorization must be current. A strict poll cap limits
invocation count and runaway retry behavior. This addresses runtime duration,
not build CPU; disconnected Vercel Git and guarded releases remain mandatory.

Evidence: shared consistency contracts; Nest controller and rollback-only
PostgreSQL tests; current-role/context revocation; rollback-local citation
hydration; Core-client and Next proxy tests; same-origin substitution denial;
ten-attempt timeout and abort cancellation tests; 107/107 disposable replay;
349/349 zero-skip DB tests; full API integration; 256 shared, 586 API, and 676
Web tests; local production builds; spend/release/security gates. No hosted or
provider action occurred.

## D-271 - Keep Cortex generation authority in Core (2026-08-08)

Decision: move deterministic grounded assistant execution through a
PostgreSQL-authoritative NestJS/BullMQ/Python workflow. Redis receives only an
opaque job ID. Nest authorizes and redacts evidence, owns retry/cancel/recovery
state, reauthorizes returned citations, and atomically commits official memory
and audit. Python receives no tenant credential or database authority and may
return analysis only. All independently scoped flags default closed.

Rationale: running retrieval and inference in the Next request couples Vercel
duration, provider spend, and transaction authority. A durable Core job avoids
duplicate work, survives Redis loss, gives cancellation/recovery explicit
states, and prevents Python or the browser from finalizing an ERP record. The
provider-free first slice proves the boundary without creating AI cost.

Evidence: strict wire-contract and closed-gate tests; BullMQ identity-only and
retry tests; Python authentication, bounds, no-echo, and deterministic-grounding
tests; Web no-provider compatibility tests; forced-RLS migration assertions;
and rollback-only PostgreSQL integration proving scoped/redacted evidence,
fencing, one commit, duplicate denial, cancellation, terminal-failure reclaim,
and schema stability. A fresh 107-migration replay, zero-skip 349-test database
lane, full Nest integration, package suites, production builds, spend guard,
and secret scan passed. No hosted or provider action occurred.

## D-270 - Fence provider work before trusted assistant completion (2026-08-08)

Decision: split assistant authority into a signed durable claim and a fenced
completion tied to one official user turn. Persist the lease in PostgreSQL,
store only the claim-token hash, authorize and audit each lease mutation in
NestJS, and hard-code the completed message role. Claim must precede any
provider quota, retrieval, embedding, or model call. Quota denial completes a
free grounded answer. Selected traffic cannot fall back to direct Next
assistant or audit writes.

Rationale: user authentication alone cannot prove that an assistant message
came from trusted server orchestration. Retried streams can also duplicate
provider cost. A principal-bound HMAC blocks browser impersonation; a durable
lease/fencing token blocks concurrent or stale workers; exact replay returns
the first committed answer without spending again. PostgreSQL remains truth,
while the future Python inference boundary stays advisory and unable to commit.

Evidence: strict shared parsers and signature vector tests; controller/service
tests for closed gates, operation binding, stale/tampered signatures, and
current-role replay; Web tests for dependency gates, active/completed replay,
claim-before-quota, free fallback, and no direct-write fallback; migration/RLS
tests; and a rollback-only PostgreSQL test covering official provenance,
reclaim, stale fencing, exact/changed completion, tenant isolation, role
revocation, citation IDs, composite FKs, and raw-secret-free audit. Local
106-migration replay and all production builds passed. No provider or hosted
operation occurred.

## D-269 - Separate human and assistant Cortex write authority (2026-08-07)

Decision: migrate only authenticated human user-turn persistence to the NestJS
browser-facing command. Core hard-codes role `user`, derives all authority from
the principal, and commits the message, durable idempotency result, conversation
timestamp, and chained audit in one PostgreSQL transaction. Assistant/provider
turns remain in the existing server compatibility path until a separate trusted
service-to-service command exists.

Rationale: allowing a browser request to select `assistant` would let a caller
fabricate authoritative AI memory. Moving chat generation and streaming at the
same time would also couple provider cost/failure behavior to the first write
migration. Separating the authorities preserves the public chat contract,
creates a small rollback seam, and proves tenant/RBAC/idempotency integrity
without expanding AI spend or Python authority.

Evidence: strict shared parsing; controller/service tests for missing keys,
closed gates, replay, changed payloads, role revocation, ownership and context;
Next compatibility/no-fallback tests; real rollback-only PostgreSQL integration
for cross-tenant concealment, composite foreign keys, redacted titles, user-only
roles, ledger state, and raw-content-free audit; 105/105 disposable migration
replay and zero-skip database suite. No hosted mutation or provider call
occurred.

## D-268 - Move Cortex conversation reads before chat writes (2026-08-07)

Decision: give saved conversation list/detail reads a separately canaried
NestJS boundary before migrating streaming chat or memory mutations. Core owns
tenant/user scope, current-role context authorization, and citation
rehydration. Next remains a compatibility facade; exact-tenant Core selection
fails closed and all gates default disabled.

Rationale: conversation history is the durable AI-brain memory surface, but
streaming/provider work has a wider failure and cost boundary. Moving the
read-only slice first proves the identity, ownership, RBAC, response-contract,
and rollback seams without changing data or spending a provider budget. Stored
citation labels cannot be trusted because permissions and source records may
change after a message is saved.

Evidence: strict shared contracts; Nest/Supertest list/detail tests; service
tests for disabled gates, tenant/user arguments, revoked context, foreign
threads, and current citation projection; Next tests for compatibility and no
fallback; full package tests and local production builds. No database or
hosted runtime change occurred, so exact-tenant parity remains a release gate.

## D-267 - Bound root test package concurrency at two (2026-08-07)

Decision: run the canonical root test command as
`turbo test --concurrency=2`. Preserve existing per-test timeouts and assertions.

Rationale: unrestricted package parallelism saturated the workstation while
four Vitest suites ran, causing six unrelated Nest controller setup tests to
cross their fixed 5-second timeout. The API suite passed 546/546 in isolation.
A forced cache-bypass run with two package tasks passed every test-bearing
package, so bounding peak work removes false failures without hiding hangs or
lengthening assertion timeouts.

Evidence: unrestricted root run had 121/127 API files green and six timeout-
only failures; isolated API passed 127/127 files and 546/546 tests; forced
two-package root execution passed with zero failures. This changes local/CI
test scheduling only.

## D-266 - Prove protected route wiring with a rejecting loopback Auth contract (2026-08-07)

Decision: use a test-only loopback server for the exact Supabase `getUser` and
single-row server profile contracts consumed by `/cortex`, backed by the full
local PostgreSQL migration/seed replay. Reject every unexpected Auth/REST
endpoint, mock only local Realtime transport, block foreign browser egress,
and keep the harness outside production routes and builds.

Rationale: the prior protected E2E mints and globally revokes a hosted magic-
link identity. That is unnecessary and violates the no-hosted-mutation cost
boundary. A narrow rejecting contract proves middleware, session cookie,
server profile authority, route RBAC, RSC rendering, direct tenant-scoped ERP
reads, and client APIs without pretending to be a full Supabase installation.

Evidence: 104/104 local migrations, signed-cookie route `200`, unauthenticated
redirect/API denial, tenant graph and conversation responses, desktop/mobile
fit, zero console/page errors, zero semantic-index requests, and no provider
egress. Production CSP remains closed; the loopback HTTP/WS exception exists
only in development. Full GoTrue/PostgREST and managed Auth parity remain a
separate release gate.

## D-265 - Prove spend UX without hosted authentication (2026-08-07)

Decision: test provider-spending Cortex interactions in a localhost-only Vite
gallery that imports the real production component and styles. Keep role and
tenant-canary selection in a separate server-owned projection. Bind the gallery
to loopback, use installed Chrome, intercept only local API requests, and keep
it outside the Next.js route tree.

Rationale: the existing protected browser helper creates and globally revokes
a hosted Supabase magic-link session. That side effect violates the no-hosted-
mutation cost boundary and is unnecessary for proving confirmation, request
shape, polling, failure, and responsive behavior. A component gallery provides
real DOM, layout, dialog, timer, network, and console evidence while production
auth and routing remain untouched.

Evidence: role/canary tests 4/4, disclosure tests 2/2, Playwright desktop/mobile
5/5, Web 637/637, workspace lint/typecheck/build, spend/release guards,
Actionlint, Gitleaks, pinned actions, diff and clean-room checks. This does not
claim a full authenticated `/cortex` route canary. No hosted or provider action
occurred.

## D-264 - Require disposable proof before semantic-index spend (2026-08-07)

Decision: require a zero-skip disposable PostgreSQL/Redis integration lane and
deterministic fake worker before any semantic-index tenant or provider is
enabled. Treat PostgreSQL provider-call reservation as the irreversible spend
boundary: Redis loss before reservation may reconstruct delivery; stale or
uncertain execution after reservation must terminate as
`provider_call_outcome_unknown`, never retry automatically.

Rationale: compilation and mocked unit tests cannot prove RLS denial,
transaction rollback, queue reconstruction, tenant concealment, or one-call
behavior. The fake-worker lane exercises those production boundaries without
creating cloud cost or provider side effects. It separates correctness proof
from release authorization and keeps the real spend decision human-owned.

Evidence: 104/104 migrations; database 341/341 and API integration 31/31 with
zero skips/pending; exact one-call and 64-node assertions; empty-backlog zero
call; Redis-loss and post-reservation terminal paths; atomic rollback; audit
hash linkage; disposable cleanup. Hosted auth browser proof and managed parity
remain unresolved. No provider or hosted action occurred.

## D-263 - Reserve one semantic-index provider call in PostgreSQL (2026-08-07)

Decision: replace the client-owned 80-request embedding loop with one explicit,
idempotent NestJS job capped at 64 nodes and one provider call. Store official
state, attempt count, provider-call reservation, active-tenant lock, and
terminal result in PostgreSQL. Use BullMQ for identity-only delivery/recovery
and the Python worker for text-to-vector analysis only. If execution becomes
uncertain after reserving the provider call, fail terminally instead of
retrying. Keep all rollout seams closed and require a confirmation naming cost.

Rationale: the previous control could request up to 5,120 embeddings per click
and had no durable state, idempotency, recovery rule, or single-call ceiling.
PostgreSQL reservation prevents retries and Redis loss from silently multiplying
spend. Separating Python analysis from Nest transaction authority preserves the
approved modular-monolith architecture and keeps the derived graph rebuildable.

Evidence: live control reconnaissance without clicking; focused spend,
contract, route, capability, worker, and migration tests; full shared/API/Web
suites; database static suite; workspace lint/typecheck; local production build.
Docker was stopped, so disposable migration/RLS runtime evidence remains a hard
gate. No hosted mutation, provider call, or deployment occurred.

## D-262 - Make Cortex entity context a separately canaried Core read (2026-08-07)

Decision: expose `GET /v1/cortex/entity/:refTable/:refId` through a dedicated
NestJS boundary with its own Core/Web exact-tenant gates. Share one strict
public contract for registered sources, citations, relationships, and redacted
evidence. Keep the existing Next route as default; once selected, never regain
direct database authority after Core failure. Preserve a concealed 404.

Rationale: record context feeds project, finance, procurement, and Cortex
surfaces. Central authority prevents each Web caller from independently
deciding tenant, role, source ownership, or provenance disclosure. A separate
gate keeps rollback smaller than coupling entity context to whole-graph or
keyword-search rollout. Deterministic retrieval avoids provider spend.

Evidence: read-only live Cortex audit; focused 199/199; full API/Web/shared
single-worker suites; workspace lint/typecheck; 81-route production build;
secret, workflow, release, and spend guards. Flags remain closed. No hosted
state changed.

## D-261 - Separate Cortex graph authority from search authority (2026-08-07)

Decision: expose `GET /v1/cortex/graph` through a dedicated NestJS service and
independent Core/Web tenant gates. Keep keyword search and graph browsing on
separate switches. Accept no tenant or role input. For focused retrieval,
require a registered source table plus UUID, verify that the derived node type
owns that source and is visible to the principal's server-owned role scope,
then return only a bounded one-hop neighborhood. Keep the existing Next path as
the default and fail closed if a selected Core canary is unavailable.

Rationale: graph browsing is a deterministic ERP read, not an AI-provider
operation. Independent gates give it a small rollback boundary and prevent a
search canary from silently widening graph access. A shared 45-source contract
and exact UI-registry equality test prevent the Core and frontend permission
models from drifting.

Evidence: focused contract/Core/Web suites passed; API 523/523 passed in a
single-worker lane; lint, typecheck, 81-route production build, release/spend,
workflow, secret, and clean-room gates passed. All new flags remain false and
allowlists empty. No database or hosted provider state changed.

## D-260 - Separate duplicate recommendations from owner approval (2026-08-07)

Decision: generate deterministic Purchase Order duplicate recommendations in
one repeatable-read, read-only transaction and write them only to an explicit
non-repository artifact. Recommend the earliest-created row, then lexical UUID,
as canonical and allocate collision-free `-Rnn` numbers within the existing
50-character limit. Keep the proposal structurally incompatible with the
version-1 owner mapping and mark owner approval `pending`.

Rationale: the managed demo dataset has one 12-record duplicate group, but a
blank template leaves the database owner to perform repetitive allocation and
collision checks. Recommendations reduce review work without turning an
algorithm into business authority. A separate mapping, existing preflight,
backup clone, and explicit approval remain mandatory before any repair.

Evidence: four fresh pure tests plus existing mapping/template tests passed.
The live read-only run produced one group, 12 recommendations, one canonical
keep, and 11 renumbers. The 4,220-byte external proposal has SHA-256
`803a25ec80b501ff86154e42777af0ea7ca2ed90d4e21bde4dcf2b749db99510`;
overwrite was refused and the mapping validator rejected it. No SQL write,
provider action, or deployment occurred.

## D-259 - Separate suffix replay proof from full managed parity (2026-08-07)

Decision: support a zero-cost export lane using an explicit session/direct
database URL and approved PostgreSQL 17 client tools. Verify restored suffixes
only against localhost. Label synthetic duplicate remediation, missing managed
schemas, and owner approval explicitly; never let a current migration ledger
alone imply release readiness.

Rationale: the existing public snapshot can prove that all 48 source
migrations apply in order, but it cannot reproduce managed Auth, Storage,
pgvector, provider grants, or owner-approved business data. Conflating those
claims would turn partial evidence into a dangerous release signal. Local-only
verification removes paid-branch pressure while preserving hard production
gates.

Evidence: session-port and PostgreSQL 17.10 tool preflight reported `ready`;
the hash-valid public snapshot clone advanced from 94 to 103 migrations and
the verifier confirmed the exact 55-to-103 suffix. Injected database tests
also exposed the expected managed-surface/catalog gaps. No hosted dump, SQL,
branch, deployment, or provider-variable change occurred.

## D-258 - Make managed parity plans machine-checkable and cost-bounded (2026-08-07)

Decision: record the current managed migration boundary in a machine-readable
manifest and fail verification when source count/head, applied boundary,
pending count, batch uniqueness, or strict order drifts. Treat manifest
batches as review checkpoints only. Use free local PostgreSQL 17 restore/replay
before considering a managed branch, and require explicit hourly-cost
confirmation before branch creation.

Rationale: a 48-file suffix is too large for an unverified prose checklist.
The target is a linear prefix, but duplicate business data, broad browser
authority, backup/export gaps, Auth/Storage recovery, and a failed branch
status still make blind application unsafe. Machine coverage prevents silent
omission or reorder; cost policy prevents another speculative provider build.

Evidence: live read-only project/ledger/branch/table/log/advisor/cost checks;
read-only database and duplicate planners; exact 55/103 manifest verification;
and focused 4/4, 9/9, and 4/4 planner tests. No hosted state changed.

## D-257 - Make user-role assignment a Core transaction (2026-08-07)

Decision: expose user-role assignment through the typed NestJS endpoint
`PATCH /v1/admin/users/:userId/role`, backed by a service-only tenant-scoped
idempotency ledger. Core locks and rechecks actor membership and target,
enforces `admin.users` plus owner/admin hierarchy, requires the expected prior
role, and commits the role and semantic audit atomically. Revoke authenticated
direct mutations of `public.users`; preserve tenant-scoped reads and the
closed-by-default Web compatibility adapter.

Rationale: a role update changes future authorization. Browser table writes
or component-owned logic cannot safely bind membership, hierarchy, stale
state, retry, and audit into one official decision. A small command seam
preserves current callers while moving the critical transaction into Core.
The actor/target user identifiers are intentionally not foreign-keyed from
the replay ledger so deletion cannot erase or invalidate decision evidence.

Evidence: static privilege tests, Core unit/controller/RBAC tests, Web adapter
and action tests, 103-migration disposable replay, database 337/337, API
integration 21/21 files, workspace/build/security/release/spend gates, and
local production protected-route browser proof passed. Hosted state and
deployments are unchanged; all canary flags remain false/empty.

## D-256 - Remove anonymous execution of the tenant identity helper (2026-08-07)

Decision: revoke implicit `public` and explicit `anon` EXECUTE on
`public.auth_tenant_id()`. Preserve EXECUTE for `authenticated` because tenant
RLS policies call the helper, and for `service_role` because trusted Core
operations require it. Do not move or rename the helper in this small slice.

Rationale: anonymous ERP table access is already denied and public portal
flows are server-mediated, so anonymous RPC execution adds attack surface
without a supported use case. Preserving the current authenticated helper
avoids a broad RLS rewrite and keeps the migration independently reversible.

Evidence: source privilege assertions, runtime PostgreSQL privilege checks,
fresh 102-migration replay, no-skip database/API integration, identical
schema hashes, workspace/build/security/release/spend gates, and local
desktop/mobile landing QA passed. Source checkpoint
`9c2b64b81b64b91de013d470e3147c3817dab27b` is pushed; hosted state is
unchanged.

## D-255 - Treat managed Supabase parity as a hard release gate (2026-08-07)

Decision: do not apply the repository's 46 unapplied migrations to the
managed ERP project from this audit. Keep Core write flags and provider
deployments closed until the managed ledger, catalog, RLS/privileges, data
duplicates, backup/PITR, identity, audit, and spend envelope are reviewed.

Rationale: the project is healthy but materially behind source, the new
customer-invoice replay table is absent, and recent logs show repeated
Purchase Order uniqueness failures plus SQL inspection errors. Blindly
applying a large ordered set could create irreversible data/availability
risk and unnecessary provider spend. Branch/disposable replay and an
explicit rollback plan are cheaper and safer.

Evidence: read-only project, migration, table, advisor, and log checks on
`aqqrtkmtcsfkbyyqxowv`; no SQL, variables, deployment, or tenant data changed.

## D-254 - Make customer invoice draft creation Core-only (2026-08-07)

Decision: route the existing Billing and Procurement invoice-draft commands
through one NestJS Core endpoint and revoke authenticated direct mutation of
`public.invoices`. Preserve the current Web caller surfaces, but move BOM
selection, exact-money calculation, invoice numbering, transaction commit,
tenant-scoped idempotency, authorization, and audit into Core. Use a separate
service-only replay ledger for the draft command.

Rationale: two browser-side invoice writers could diverge in retention,
taxes, numbering, audit, and retry behavior. A single transaction-bound Core
authority preserves compatibility while preventing sensitive direct writes.
The migration is source-only until managed parity, recovery, identity, audit,
and spend gates are approved.

Evidence: focused boundary tests, serial workspace gates, production build,
security/release/spend gates, and disposable 101-migration PostgreSQL/Redis
replay passed with identical schema hashes. Source checkpoint
`473eaf1d6a9ec468165520685e2718eeefea5124` is pushed; hosted state is
unchanged.

## D-253 - Keep Cost Entry browser writes closed in replay/verifier (2026-08-07)

Decision: align reproducibility expectations and runtime tests with the
Core-only Cost Entry authority introduced by M3.142. Remove obsolete
authenticated INSERT/UPDATE/DELETE requirements from the verifier, add an
explicit no-write invariant, and assert that a permitted business role is
denied direct Cost Entry writes. Do not restore browser grants to make the
legacy test pass.

Rationale: the source migration correctly revokes direct client writes;
reintroducing them would bypass NestJS transaction-bound authorization,
idempotency, exact-money validation, and audit. The failure was in the
verification fixture, not the database design.

Evidence: corrected disposable lane passed 100/100 migrations, database
53/53 files and 329/329 tests, API integration 20/20 files and 27/27 tests,
Redis recovery checks, and identical before/after schema hash
`18D2840CE47084F159BDF5037F74AE51BD24418EF8F63943096F996509BB6FFC`.
Workspace, build, security, release, and spend gates pass; no hosted state
changed. Source checkpoint:
`3ca2060332fbda01f56b3044a8cde9e0201af71a`, pushed to
`origin/agent-02/third-code-erp-landing`; remote SHA and clean worktree
verified.

## D-252 - Separate the Core Cost Entry restore ledger (2026-08-07)

Decision: implement restoration as a distinct NestJS command and
tenant-scoped idempotency table, not as a reuse of the void request ledger.
The command requires `cost.record`, locks membership and the voided manual
entry, validates the matching prior void snapshot, clears only void metadata,
writes an `update` audit event with bounded evidence, and returns a terminal
`restored` result. Keep restore flags disabled and unscoped.

Rationale: restore retries and void retries are different state transitions.
Separate replay records prevent key collisions, preserve a clear recovery
trail, and make a missing or mismatched snapshot a hard failure instead of an
implicit data repair. A single transaction keeps authorization, mutation,
audit, and replay atomic.

Evidence: focused restore service/controller, shared contract, environment,
and database tests pass; full serial workspace tests, typecheck/lint,
production build, migration/security, controlled-release, and spend gates
pass. No hosted state changed. Source checkpoint:
`963ae464ac35f9bc388605bcb641b2f42442ac19`, pushed to
`origin/agent-02/third-code-erp-landing`; remote SHA and clean worktree
verified.

## D-251 - Remove the legacy Web Cost Entry delete writer (2026-08-07)

Decision: migrate the existing Cost Entry delete Server Action to the typed
NestJS Core DELETE command. Preserve the two-argument UI caller, add bounded
reason/idempotency inputs with safe defaults, verify tenant/Project/entry and
the manual-void result, and revalidate only after a valid Core response. Do
not retain a direct database delete or duplicate Web audit fallback. Keep the
server-side Core delete gate disabled and unscoped until restore, managed
parity, identity, audit, and spend evidence pass.

Rationale: leaving a second writer after the reversible void boundary would
allow physical deletion, bypass transaction-bound authorization, and make
recovery/audit semantics diverge. A command-only adapter keeps the current UI
stable while making Core the sole authority and failing closed when it is not
available.

Evidence: focused Web deletion action/client 14/14; full serial workspace
tests, typecheck/lint, production build, migration/security, controlled
release, and spend gates passed. No hosted provider state changed. Source
checkpoint: `ad1d8d2f5e902148cf3805d97232f8273afdc88b`, remote SHA verified.

## D-248 - Make NestJS the only Project creation writer (2026-08-07)

Decision: remove the Web Server Action's direct `projects` insert and its
frontend Project-create selector. The action may parse form data, require
`project.create`, and call the typed Core POST boundary with an idempotency
key. It must verify the returned tenant before redirecting and must fail
closed on Core/API errors. NestJS remains responsible for membership
recheck/lock, tenant-scoped idempotency, transaction commit, and audit.

Rationale: a browser-side fallback could bypass the transaction-bound
authorization and replay contract already implemented in Core, while a
dormant frontend flag could be mistaken for a safe rollback. A single
authority makes tenant scope and billing-safe release review explicit. The
temporary availability loss when Core is disabled is intentional; rollback
is a reviewed source/API release, not a second writer.

Evidence: focused Web action 5/5, Core client 114/114 plus the action suite,
Web typecheck passed, and no hosted provider state changed. The API-side
Project creation gate remains closed pending managed parity/recovery,
identity, audit, and spend evidence.
Source checkpoint: `c702bd9edec41cb3a9efd8b490ae5e82a3a04ceb`, remote SHA verified
on `origin/agent-02/third-code-erp-landing`.

## D-249 - Make NestJS the only manual Cost Entry creation writer (2026-08-07)

Decision: remove the Web Server Action's direct Cost Entry insert and its
frontend selector. The action may require `cost.record`, parse money into
integer cents, send a typed Core command with an idempotency key, verify
tenant/Project scope, and fail closed on Core errors. NestJS remains the
authority for locked membership, active Cost Code/category validation,
transaction, idempotency, and audit. Do not claim Cost Entry delete parity;
track it as a separate command migration.

Rationale: browser-side validation and owner-connection writes could diverge
from Core's exact-money, tenant, replay, and audit guarantees. Splitting
create from delete keeps this slice small while making its remaining direct
writer visible instead of masking it.

Evidence: focused Web action 5/5, Core client 113/113, Web 91/591,
typecheck/lint, production build, migration/security, controlled-release, and
provider-spend gates passed; hosted state unchanged. Source checkpoint:
`f9770a015e0c8769010cf08cb4f31f7c26b6f656`, remote SHA verified.

## D-250 - Void Cost Entries instead of physical deletion (2026-08-07)

Decision: implement the Core deletion boundary as a reversible void. Add
tenant-scoped void metadata and a service-only idempotency ledger that stores
the pre-void state; require a locked `cost.record` membership check, manual
source, tenant/project identity, one transaction, and one audit event. Keep
the canary disabled and leave the Web delete action on its compatibility path
until the Web adapter, restore operation, read parity, and recovery evidence
are complete.

Rationale: the existing create-idempotency FK makes physical deletion of
Core-created rows unsafe, while hard deletion would destroy audit/recovery
context. A soft void keeps the official record and supports rollback without
changing money or source fields.

Evidence: focused deletion service/controller 8/8; shared cost contract 3/3;
database migration/schema 3/3; Web/API/full package gates green; no hosted
state changed. Source checkpoint: `476903d934c3c1b65bf50b6075497707b8841248`,
remote SHA verified.

## D-247 - Require disposable replay before hosted Core canary (2026-08-07)

Decision: retain the self-hosted PostgreSQL/Redis replay, no-skip database
gate, Nest integration, and schema-before/after hash as mandatory source
evidence for every Core write slice. Do not promote that evidence to hosted
readiness or apply provider changes without managed parity, recovery, identity,
audit, and spend proof.

Rationale: a local transaction pass catches source drift without consuming
Vercel/Railway/Supabase budget, but cannot reveal hosted catalog, RLS, data,
backup, or identity differences. Separating the evidence classes keeps the
release decision honest.

Evidence: 98-migration PostgreSQL 17/Redis 7.4.9 replay, database no-skip,
Nest integration, and identical schema SHA256. Provider state unchanged.

## D-246 - Retire the Project update feature flag (2026-08-07)

Decision: delete the unused Web Project update selector and its env-example
surface after Core-only cutover. Do not retain a dormant flag that suggests a
direct-writer rollback. Operator rollback uses the exact known-good Web/API
release; Core outage remains fail-closed.

Rationale: a stale flag creates unsafe operational ambiguity and can be
mistaken for an approved canary control. One authority and one configuration
vocabulary make authorization, audit, and spend review auditable. Historical
records may retain the flag name as evidence of the earlier migration.

Evidence: focused/full Web tests, serial workspace suite, production build,
typecheck/lint, security, release-plan, and spend gates pass. No provider state
changed.

## D-245 - Make NestJS the only Project update writer (2026-08-07)

Decision: remove the Web Server Action's direct Project update and Web-audit
fallback. The action may parse fields, request a tenant-scoped Core read, and
submit a complete command with the Core `updatedAt` token. NestJS remains the
sole authority for capability recheck, membership/Project locks, status
transitions, mutation, optimistic concurrency, and semantic audit. Core
failure returns an error and never retries through direct SQL.

Rationale: two writers could diverge in authorization, state transitions,
concurrency, and audit. A thin Core client makes the official transaction
boundary explicit and prevents a failed canary from silently regaining a
legacy write path. The temporary loss of updates when Core is unavailable is
intentional fail-closed behavior; rollback is a source rollback, not a second
writer.

Evidence: focused Web/Core client tests, serial workspace suite, production
build, typecheck/lint, migration/security, controlled-release, and spend gates
pass. No hosted state changed.

## D-244 - Guard the legacy Project update fallback (2026-08-07)

Decision: use `requireUserProfile` and `project.update` as the Web action's
fail-closed boundary, derive all tenant predicates from that profile, and
apply the shared Project transition table before either Core or compatibility
mutation. Keep the fallback direct write closed to canaries until it is
migrated to the NestJS transaction authority.

Rationale: the old action re-derived tenant state ad hoc and could accept a
status assignment that Core would reject. Matching identity, capability, and
workflow policy now prevents obvious divergence without changing the default
legacy rollout or introducing provider cost. It does not pretend to solve the
fallback's remaining transaction/audit parity gap.

Evidence: focused Web action regressions, serial workspace tests, production
build, typecheck/lint, security, release-plan, and spend gates pass. No hosted
state changed.

## D-243 - Make Project status transitions explicit (2026-08-07)

Decision: define a shared Project transition table. `lead` advances to
`active`, `on_hold`, or `cancelled`; `active` advances to `on_hold`,
`completed`, or `cancelled`; `on_hold` resumes to `active` or cancels;
`completed` and `cancelled` remain terminal while same-state edits stay
allowed. Reject other Core transitions with a 409 before update.

Rationale: Project status drives operational reporting and downstream finance/
procurement expectations. Arbitrary enum assignment can silently reopen
closed work or skip review. A small shared table makes workflow behavior
auditable without adding schema/provider cost; legacy fallback convergence is
tracked separately.

Evidence: shared transition tests, terminal-state service regression, WSL
PostgreSQL/Redis replay, API suite, serial workspace suite, and production
build pass. Core and hosted canaries remain closed.

## D-242 - Lock project-update membership before mutation (2026-08-07)

Decision: in `ProjectsService.update`, lock the caller's tenant membership
with `FOR UPDATE`, re-evaluate `project.update` from the stored role, and use
that result for the Project tenant predicates, actor context, mutation, and
semantic audit. Reject missing or insufficient membership before locking or
updating the Project row.

Rationale: the route guard is useful transport defense but cannot be the only
authority boundary for internal callers or stale claims. Keeping membership,
optimistic concurrency, mutation, and audit in one transaction closes the
same-tenant authorization race without a schema/provider change.

Evidence: focused regression coverage rejects an admin-shaped principal when
the locked membership is a viewer; WSL PostgreSQL/Redis replay and full serial
workspace gates pass. Core and hosted canaries remain closed.

## D-241 - Lock project-create membership before authorization (2026-08-07)

Decision: in `ProjectsService.create`, lock the caller's tenant membership
with `FOR UPDATE` before the idempotency claim, re-evaluate `project.create`
from the stored role, and use that result for actor context, tenant scope,
mutation, and semantic audit. Reject missing or insufficient membership with
a transaction rollback.

Rationale: a request principal is an input claim, not an authority boundary.
Deriving authorization only from the request would allow stale or forged role
data to cross the critical write path. The row lock keeps the membership check
and commit in one transaction without adding a migration or provider cost.

Evidence: focused regression coverage rejects an admin-shaped principal when
the locked membership is a viewer; WSL PostgreSQL/Redis replay and full serial
workspace gates pass. Core and hosted canaries remain closed.

## D-240 - Resolve maintenance due dates from the latest record (2026-08-07)

Decision: keep the due projection in `AssetMaintenanceService`, choose the
latest maintenance record per tenant asset inside a lateral query, then apply
the bounded due window. Return a window count and explicit `overdue` or
`due_soon` state; do not materialize a new table or add a scheduler in this
slice.

Rationale: a prior service event must not remain actionable after a newer
event changes the next due date. A single tenant-scoped read preserves current
source-of-truth semantics, avoids migration/provider cost, and gives field
teams a useful queue before a full work-order scheduler is designed.

Evidence: asset maintenance unit/HTTP contracts, self-hosted PostgreSQL
integration, and serial Web/API tests pass. The route remains closed by the
existing maintenance-read gate; no hosted/provider state changed.

## D-239 - Model asset maintenance as append-only evidence (2026-08-07)

Decision: represent service history as append-only `asset_maintenance_records`
plus a separate server-only idempotency ledger. Do not introduce work orders,
automatic scheduling, mutable status, or accounting fixed-asset behavior in
this slice. New events lock tenant membership and the asset, reject retired
assets, and remain closed by default behind exact tenant flags.

Rationale: construction teams need a searchable continuity trail before a full
maintenance/work-order lifecycle is safe. Append-only records preserve audit
truth, exact-cent cost, and clean migration boundaries while avoiding a
premature state machine that would touch inventory or finance authority.

Evidence: source replay applied migration `20260807100000`, API contracts and
integration coverage pass, and no hosted/provider state changed.

## D-238 - Preserve a truthful Today view when executive analytics fail (2026-08-07)

Decision: executive dashboard queries may fall back only to the existing
tenant/assignee-scoped Today view. The UI must disclose degraded analytics and
must not manufacture zero-valued KPIs or broaden access.

Rationale: the dashboard currently aggregates several tables during an
incremental migration. A stale optional table should not make authorized work
unavailable, but silently showing incomplete portfolio metrics would be worse
than a clear degraded state.

Evidence: `dashboard-access` fallback tests pass; Web production build emits
81/81 routes. No transaction, schema, provider, or tenant-data path changed.

## D-237 - Keep the free self-hosted replay lane separate from CLI diff proof (2026-08-07)

Decision: use the WSL PostgreSQL/Redis lane for repeatable source replay and
transaction evidence, while retaining the pinned Supabase CLI shadow-database
diff as a separate Docker/CI gate.

Rationale: the replay can run without a paid provider or Docker Desktop and
proves source behavior, but it cannot prove the CLI's migration diff semantics.
Conflating the two would make a bill-safe local pass look like managed release
approval.

Evidence: 97/97 migrations, 51/51 database files, 324/324 tests, zero skips,
Nest integration, and identical schema dump hashes in the self-hosted lane;
CLI `2.109.1` still reports the unavailable `dockerDesktopLinuxEngine`.

## D-236 - Hash runtime test inputs in Turbo (2026-08-06)

Decision: the Turbo `test` task must include database, Redis, and integration
expectation environment inputs in its cache key, with a source-level contract
checked in CI.

Rationale: a green cached test task is invalid if the previous run had no
database and skipped runtime suites. Explicit inputs preserve fast caching
without confusing a compatibility-only run with release evidence.

Evidence: filtered database Turbo task cache-missed under the disposable
PostgreSQL replay and passed 324/324 tests with zero skips.

## D-235 - Do not waive the CLI schema-diff gate when Docker is unavailable (2026-08-06)

Decision: a failed pinned Supabase CLI schema-diff remains `review_required`;
direct PostgreSQL replay and tests cannot silently replace the requested
shadow-database/CI artifact.

Rationale: the CLI diff verifies the migration representation used by the
project tooling. Treating a missing Docker engine as green would hide a release
environment defect and could allow an unreviewed schema mismatch.

Evidence: Supabase CLI `2.109.1` failed before inspection with
`dockerDesktopLinuxEngine` unavailable; no SQL or provider mutation.

## D-234 - Treat disposable replay as source evidence, not hosted approval (2026-08-06)

Decision: accept a fresh PostgreSQL 17.10 ordered replay and zero-skip database
tests as source correctness evidence, while keeping hosted promotion blocked
until supported Supabase CLI/backup/catalog/data/rollback evidence is complete.

Rationale: the replay validates migrations, RLS, grants, triggers, constraints,
and runtime workflows without touching paid or production services. It cannot
prove managed Supabase history, existing tenant data, provider identity, or
rollback safety.

Evidence: disposable `erp_clean_head_20260806_m3125`; verifier pass; database
51/51 files and 324/324 tests; no hosted/provider mutation.

## D-233 - Keep capability evidence source- and provider-scoped (2026-08-06)

Decision: the capability matrix must identify the exact source checkpoint and
label hosted readiness separately. Local implementation, a successful build,
or an HTTP readiness response cannot authorize SQL, deployment, or canary
promotion while release blockers remain.

Rationale: the repository is incrementally migrating authority into NestJS,
while the configured Supabase project is behind the source ledger and exposes
catalog security findings. Explicit evidence scope prevents a docs refresh or
local proof from being mistaken for production parity.

Evidence: M3.125 matrix refresh at source SHA
`86db0e4935ff7f655e6443d19834fe3e1e9bc013`; hosted state unchanged.

## D-232 - Clamp public carousel navigation (2026-08-06)

Decision: team-priority navigation must clamp at first/last item and use native
disabled buttons instead of wrapping from first to last or last to first.
Preserve manual navigation, 44px controls, accessible names, and local state.

Rationale: wraparound hides state boundaries and creates an unexpected focus
loop for keyboard and assistive-technology users. Native disabled semantics
communicate the workflow bound without adding product logic or a dependency.

Evidence: local Playwright at 390px reports previous disabled at `1 / 4`; after
three next clicks it reports next disabled at `4 / 4`. No hosted mutation.

## D-231 - Make hosted catalog security explicit in the release planner (2026-08-06)

Decision: the read-only database planner must count direct `anon` privileges on
every public table and every policy whose role array contains `public`. Any
positive count becomes a release blocker. Keep the query observational; it
must not repair grants, alter policies, or execute migration SQL.

Rationale: a successful connection, RLS flag, readiness response, or empty
advisor response cannot establish least privilege. Counting the complete role
surface gives the release operator one deterministic, bill-safe reason to stop
before a hosted migration or provider build.

Evidence: planner query against the configured Supabase target reports 213
direct anon privilege rows and 209 public-role policies. No hosted mutation
occurred.

## D-230 - Remove anonymous table authority at the database boundary (2026-08-06)

Decision: add one source migration that revokes `anon` table and sequence
privileges across the public ERP schema, sets the same default-privilege
baseline for future objects, and changes only policies whose role set is
exactly `public` to `authenticated`. Preserve explicit authenticated and
service-role grants and keep public signing server-mediated.

Rationale: RLS predicates are defense in depth, not a reason to leave direct
anonymous grants on 54 hosted tables. A small catalog migration closes the
unnecessary authority surface without moving business logic or changing the
Nest/API contract.

Evidence: migration `20260806160000_security_role_baseline.sql`; disposable
PostgreSQL 17.10 suffix replay and verifier pass at 97/97; database tests
51/51 files, 324/324 tests; no hosted/provider mutation.

## D-229 - Hosted anonymous grants block promotion (2026-08-06)

Decision: treat any direct `anon` table/sequence privilege on a tenant ERP
surface as a release blocker. Keep hosted SQL, Vercel builds, and Railway
deploys closed until the source hardening migration has passed disposable
PostgreSQL 17 replay and the managed catalog shows no anonymous authority.
Keep explicit authenticated grants and server-only service-role ledgers
separate; do not remove working authenticated reads or invent public portal
exceptions.

Rationale: hosted Supabase currently reports RLS on all 88 public tables, but
the catalog also reports 54 tables with anonymous write privileges. RLS is a
policy check, not a reason to retain unnecessary database authority. A
readiness response or empty advisor result cannot prove this baseline safe.

Evidence: read-only Supabase MCP project/migration/table/advisor calls and
catalog SQL on 2026-08-06; no hosted or provider mutation. Spend guard remains
clear and Vercel Git deployment remains disabled.

## D-228 - Togal BOM commits use an idempotent Nest authority seam (2026-08-06)

Decision: add a tenant-allowlisted NestJS command for Togal BOM line commits.
Keep the existing Next route as a compatibility adapter; when Core is enabled
for a tenant, Core failure is terminal and direct database fallback is
forbidden. Store replay state in a forced-RLS, service-only ledger keyed by
tenant and idempotency key. Validate optional material/vendor references in the
same tenant before the atomic line/total update, and write audit evidence in
the transaction.

Rationale: Togal commit was a sensitive Next direct-write path with no retry
ledger and non-transactional audit. A small authority seam removes browser
write authority without a big-bang rewrite, preserves current API behavior,
and keeps rollback immediate while hosted parity is incomplete.

Evidence: migration/schema static tests 3/3, API authority/controller tests
7/7, shared contracts 3/3, Web adapter/route tests 115/115, lint/typecheck
passing at slice review; no hosted or provider mutation.

## D-227 - Spend guard is a required release component (2026-08-06)

Decision: make the static provider spend guard a mandatory component of the
read-only controlled release plan. Keep Vercel Git deployment disabled and
reject Vercel or Railway deploy commands in repository automation. A readiness
response cannot override a missing or failed spend report.

Rationale: the current Vercel account has already incurred on-demand usage.
The cheapest safe default is no automatic build/deploy path, with one explicit
reviewed provider action only after database, data, security, rollback, and
spend evidence clear. The guard is a source control, not a billing API or a
numeric budget claim.

Evidence: provider spend guard tests 4/4, controlled release tests 5/5, live
readiness 200 for Railway/Vercel, spend status clear, and no provider mutation.

## D-226 - Validate duplicate mapping before any repair (2026-08-06)

Decision: require a versioned mapping outside Git and a read-only,
repeatable-read validator before any Purchase Order uniqueness repair or
migration replay. Emit only counts, SHA-256, and opaque conflict references.

Rationale: duplicate Purchase Orders are business records, not disposable
fixtures. Snapshot freshness, tenant ownership, complete coverage, and target
availability must be proven without leaking numbers or enabling an accidental
hosted write.

Evidence: pure validator tests 4/4; no mapping supplied; Supabase remains
unchanged at the existing review-required ledger.

## D-225 - Allowlist only proven test idempotency values (2026-08-06)

Decision: close the six historical Gitleaks findings with one exact
path-scoped/value-scoped allowlist for deterministic delivery idempotency
values used in unit tests. Do not rewrite history or weaken generic secret
detection globally.

Rationale: the findings are fixed test fixtures, not credentials, and current
history cannot be safely rewritten on a shared remote. Exact scope preserves
secret detection for all other files and values while restoring a green
security gate.

Evidence: pinned Gitleaks 8.30.1 scanned 474 commits and reported no leaks;
no runtime, database, Storage, provider, build, or deployment mutation.

## D-224 - Synthetic replay cannot authorize a hosted data repair (2026-08-06)

Decision: use the exact clone failure on the duplicate Purchase Order guard as
the hosted stop condition. A synthetic duplicate-number rename is allowed
only inside the disposable replay to prove the 39-migration suffix applies;
never repair, rename, delete, or reorder the 12 hosted rows without an owner
mapping. Treat the raw public PostgreSQL export as supplemental safety
evidence, not as a replacement for a Supabase-managed auth/storage/roles
backup.

Rationale: all pending SQL can be dependency-checked without risking tenant
data, while the first migration correctly refuses to create a uniqueness
index over ambiguous business records. Provider grants, auth triggers, and
vector indexes also require a managed clone before a release claim.

Evidence: exact clone failed at `20260801090000`; clone-only sanitized replay
passed 39/39; no hosted/provider mutation; Vercel spend guard remains clear.

## D-223 - Fail closed before hosted database export (2026-08-06)

Decision: require a read-only export preflight before any Supabase backup or
parity rehearsal. Reject transaction-pooler port 6543, absent supported dump
tooling, and any destination inside Git/public build output. Use session
pooler/direct port 5432 with Supabase CLI plus Docker or PostgreSQL 17 client
tools, then replay only on an isolated clone.

Rationale: the current application connection is suitable for transactional
queries but not a supported logical dump path. A blind export risks incomplete
or unusable recovery evidence and would not justify a production migration.

Evidence: `plan-database-export` tests 4/4; read-only metadata PostgreSQL 17.6,
25 MB, 88 public tables, 55 migrations; no dump or provider/hosted mutation.

## D-222 - Treat hosted landing QA as evidence, not release identity (2026-08-06)

Decision: use a read-only browser smoke pass to verify public landing UX and
SEO/GEO metadata at desktop and mobile widths, but keep that evidence separate
from source-branch deployment identity. Do not trigger a provider build merely
to refresh the landing page while database parity and spend gates remain open.

Rationale: the public alias is healthy and discoverable, but the current
feature branch is not deployed. Conflating those facts would create a false
production claim and unnecessary Vercel cost.

Evidence: title, canonical, description, OG image, JSON-LD, H1, no console
errors at 1440px/390px, and 375px mobile document width; no provider or hosted
mutation.

## D-221 - Recover dashboard render failures without leaking details (2026-08-06)

Decision: add one route-group Next error boundary for protected dashboard
pages. Show a branded recovery panel, retry action, safe dashboard link, and
opaque digest only; never render `error.message` or stack details. Keep data
and transaction claims explicit: a render failure does not imply a rollback or
data change.

Rationale: the reported production screen exposed only a generic framework
failure. A calm boundary improves operator recovery and support correlation
without masking the underlying server logs, changing authorization, or adding
provider cost.

Evidence: Web 88/570, Next build 81/81, typecheck/lint, and source contract
test 1/1. Source commit `6eb0b0a0388d0e9cc00981173c5a40f2ce458116` is pushed to
the feature branch by `kurtgav`; no hosted/provider mutation occurred.

## D-220 - Hosted parity is a release gate, not a deploy guess (2026-08-06)

Decision: treat the hosted Supabase snapshot as evidence only. Do not apply
the 39-migration source suffix, repair duplicate Purchase Orders, change RLS,
or promote Vercel/Railway until supported backup/export, ordered replay and
catalog/data/audit diff, owner mapping, security review, protected canary,
rollback, readiness, exact identity, and spend gates pass.

Rationale: the hosted database is healthy but materially behind source and
has an unresolved tenant-scoped duplicate group. Readiness and empty Vercel
runtime-error results prove liveness, not schema/data parity. Keeping the
boundary closed protects tenant data and the user's billing budget.

Evidence: read-only PostgreSQL 17.6 snapshot 55/94 migrations, 88 RLS tables,
22 forced-RLS tables, 303 policies, 2 tenants, 13 users, 13 Purchase Orders,
4 invoices, 662 audit rows, 385 Cortex nodes, 454 Cortex edges; one 12-record
duplicate group; 14 security notices/11 warnings; no hosted/provider write.

## D-219 - Closed authority seam for UOM maintenance (2026-08-06)

Decision: expose UOM display-name and active-state edits through the existing
authenticated Web action and exact Core tenant selector, with Nest owning the
official transaction. Recheck membership/capability inside the transaction,
lock the tenant and UOM rows, preserve immutable code/decimal precision, and
write semantic audit evidence. Leave all selectors fail-closed by default.

Rationale: operators need safe catalog maintenance without browser-direct
sensitive writes or schema drift. A narrow mutable-field command preserves
current API behavior and supports a protected per-tenant rollout after hosted
parity and spend gates clear.

Evidence: shared focused 29/29, API 452 passed with 26 skipped, Web 569/569,
Next 81/81, and repository lint/type checks. Source commit
`ead54aac876ed6a52f1b693c7fe6fec8f2026f8b` is pushed to the feature branch by
`kurtgav`; `origin/main` remains unchanged. No Supabase, Vercel, Railway,
Storage, or tenant-data mutation occurred.

## D-218 - Reuse guarded item-policy authority for catalog maintenance (2026-08-06)

Decision: expose base-UOM and perpetual-tracking edits per active catalog item
through the existing authenticated Web action and exact Core tenant selector.
Keep item identity immutable in the UI, make inactive UOMs non-selectable for
new assignments, and retain database posting invariants as final authority.

Rationale: operators need to correct policy without rebuilding a catalog or
using an opaque setup form. Reusing the existing command preserves tenant and
capability checks, current API behavior, and compatibility-default rollout
while avoiding a schema change or browser-direct sensitive write.

Evidence: focused inventory/Core tests 125/125, Web suite 87/567, typecheck,
and production build 81/81 routes. Source commit `7570cda` is pushed to the
feature branch; `origin/main` remains unchanged. No Supabase, Vercel, Railway,
Storage, or tenant-data mutation occurred.

## D-217 - Reuse guarded Warehouse authority for the first edit surface (2026-08-06)

Decision: expose Warehouse name and active-state maintenance through the
existing authenticated Web server action and Core selector. Keep warehouse
code and project scope immutable in the form, and retain the Nest
zero-net-stock deactivation guard. Leave the selector compatibility-default
until hosted parity and protected canary gates clear.

Rationale: this delivers a usable inventory control surface without putting
sensitive database writes in React, adding schema drift, or starting a
big-bang migration. The server action preserves current API behavior while the
existing authority seam can be enabled per tenant later.

Evidence: focused inventory/Core tests 125/125, Web suite 87/567, typecheck,
and production build 81/81 routes. Source commit
`e9ee5adb44e3bc2da5cab54af2828065f117f343` is pushed to the feature branch;
`origin/main` is unchanged. No Supabase, Vercel, Railway, Storage, or
tenant-data mutation occurred.

## D-216 - Fail closed on hidden Vercel deploy automation (2026-08-06)

Decision: make the Vercel spend guard discover every workspace `package.json`
and GitHub workflow YAML, while retaining the hard requirement that
`apps/web/vercel.json` has `git.deploymentEnabled=false`. Keep Vercel Git
disconnected and do not create preview/build artifacts by default.

Rationale: the prior guard listed only known manifests/workflows and could miss
a later automation file that starts a paid build. Static repository evidence
cannot enforce provider billing caps, so every provider promotion still needs
an explicit operator approval, exact deployment identity, and spend evidence.

Evidence: guard tests 3/3; `Vercel spend guard: clear`; no deployment for the
current feature SHA; Supabase/Railway/Vercel/Storage/tenant data unchanged.

## D-215 - Route delivery schedule creation through Nest (2026-08-06)

Decision: add a dedicated `delivery_schedule_create_requests` server-only
ledger and expose `POST /v1/procurement/deliveries` for scheduling against an
issued Purchase Order. Nest derives tenant and actor membership, rechecks
`delivery.receive`, locks the PO, claims/replays the tenant/idempotency key,
creates the schedule, inserts the existing in-app role notifications, records
the strict result, and writes semantic audit in one transaction. Next selects
this authority only for exact-`true` plus UUID allowlist and never falls back
after a selected Core failure. Keep selectors closed until hosted parity,
protected canary, rollback, and spend evidence.

Rationale: the legacy schedule action directly mutated a sensitive delivery
table and notified recipients in separate calls. This increment moves the
official transaction into the modular Nest monolith without a big-bang rewrite,
preserves the default compatibility path, and makes retries safe. Python/AI
has no transaction authority.

Evidence: source `b3b3bdd935f50ff229d9f2fc8ed8447df6f8cba9` on the feature
branch; `origin/main` remains unchanged. Shared/API/Web
focused tests, rollback-only PostgreSQL integration, 94/94 disposable schema
verification, API/Web full suites, and 81/81 production routes all pass. No
Supabase, Vercel, Railway, Storage, or tenant-canary mutation occurred.

## D-214 - Release gates rerun in an isolated local lane (2026-08-06)

Decision: count the M3.102 source slice as locally build/test green only after
the full serial API suite, Web suite, database reproducibility verifier, and
Nest/Next production build complete in a clean single-worker lane. Raise the
inventory UOM HTTP contract test-app startup budget from 5 to 15 seconds to
avoid a resource-pressure false negative; no production code or HTTP contract
changed. This evidence still cannot authorize a hosted migration or paid
provider promotion while Supabase parity and operational gates are open.

Evidence: broad API 104 files/445 tests, Web 87 files/565 tests, database
93/93 migrations with 32 protected and 3 service-only tables, Turbo build 2/2
(Nest webpack, Next 81/81 routes), and Railway deployment
`27591050-3977-4755-92ae-941a6894ac77` `SUCCESS` on the exact commit. No
Supabase, Vercel, Storage, or tenant-canary mutation; the Railway promotion
was the single Git-triggered backend deploy and was not manually repeated.

## D-213 - Route delivery in-transit through the existing Nest ledger (2026-08-06)

Decision: add a dedicated `mark_in_transit` value to the existing
`delivery_workflow_action` enum and expose
`POST /v1/procurement/deliveries/:deliveryScheduleId/in-transit`. Nest
rechecks the verified tenant membership and `delivery.receive`, preflights and
locks the same-tenant schedule, permits only `site_ready`, claims the durable
tenant/idempotency-key request, commits `in_transit` with an optimistic status
predicate, stores a strict replay result, and audits the transition. Next
selects this authority only for exact-`true` plus UUID tenant allowlist and
never falls back after a selected Core error. Keep every selector closed until
hosted suffix reconciliation, protected canary, rollback, and spend gates.

Rationale: the legacy `markInTransit` Server Action directly mutates a
sensitive delivery table. This slice removes one official state transition
from the browser authority boundary without rewriting scheduling, receipt,
inspection, or cancellation behavior. Python/AI has no transaction authority.

Evidence: source `db786f2`; focused API 43/43, Web 131/131, rollback-only
delivery integration 2/2, full reproducibility 93/93 migrations. Supabase,
Vercel, Railway, Storage, and tenant canaries were not mutated.

## D-212 - Hosted Asset Register remains unapplied (2026-08-06)

Decision: do not apply the source asset migration to Supabase from this
snapshot. Hosted ledger/catalog evidence shows 55/92 migrations and no
`public.assets`; applying before backup, ordered reconciliation, duplicate
Purchase Order mapping, and security review would bypass the production data
gate. Keep Web/Core selectors closed and use the disposable replay as the
only current asset proof.

Evidence: read-only project/migration/table/SQL metadata inspection; no
Supabase, Vercel, Railway, Storage, branch, or tenant-canary mutation.

## D-211 - Asset Register replay is required before hosted read selection (2026-08-06)

Decision: require a rollback-only disposable PostgreSQL replay before any
tenant is selected for the Web/Core Asset Register seam. The proof must compare
direct and Core rows, same-tenant Project context, bounded pagination/search,
tenant exclusion, audit output, forced RLS, and client-role privileges. Local
parity cannot authorize applying the missing hosted migration, enabling a
tenant, or creating a paid deployment.

Evidence: `8586beb9e53d5fafd2289451eda576ea5b1a1726`; schema hash unchanged;
API 17/24 and database 49/318 with zero skips; verifier 92/92, 32 protected,
3 service-only. Supabase/Vercel/Railway remained unchanged.

## D-210 - Asset Register Web reads remain closed and Core-only (2026-08-06)

Decision: expose the existing operational asset projection in Next only as a
typed adapter/page over Nest `GET /v1/assets`. Require `asset.read`, exact
lowercase boolean plus tenant UUID allowlist, strict result parsing, and
fail-closed errors. The page may not query Supabase directly and has no write
controls. Keep both Web and API selectors disabled until disposable replay,
hosted migration/RLS/audit parity, protected browser proof, rollback, and
spend gates clear.

Evidence: source SHA
`b7f274ad078965239a9138545a96bd6468b4dcda`; Web 87/561, typecheck, lint,
build 81/81, focused adapter/navigation 2/122, and spend guard pass. No
provider/database mutation or production tenant selection.

## D-209 - Shell rebrand fixes remain source-only until spend approval (2026-08-06)

Decision: correct visible legacy shell identity in source, test it, and keep
the Vercel Git/build boundary closed. A source pass is not a live UI claim;
promotion requires the exact SHA, approved manual deployment, browser proof,
and budget check. No database, API, tenant, or auth behavior changes for this
fix.

Evidence: `a719d2321410c09658faca30c20c6c374f502360`; web 87/559, typecheck,
lint, build 80/80, clean-room test; no Vercel or Railway mutation.

## D-208 - Hosted Supabase remains read-only during parity reconciliation (2026-08-06)

Decision: treat the connected Supabase project as a read-only evidence source
until backup/catalog/data/audit export, ordered migration reconciliation,
duplicate Purchase Order mapping, and security review are complete. Hosted
state is 55/92 migrations, 88 RLS-enabled public tables, 303 policies, zero
cash/supplier-bill rows, and one 12-record tenant-scoped PO duplicate group.
Security advisors include 11 warnings, including security-definer grants and
disabled leaked-password protection. Do not apply migrations, enable cash
tenants, create branches, or trigger paid frontend builds from this snapshot.

Evidence: read-only Supabase project/catalog/table/advisor queries on
2026-08-06; no SQL, Storage, branch, Vercel, or Railway mutation.

## D-207 - Cash read canary requires disposable parity (2026-08-06)

Decision: require rollback-only PostgreSQL 17 replay before selecting any
tenant for `GET /v1/finance/cash-transactions`. The parity fixture compares the
direct compatibility query with the Nest result across receipt/disbursement,
draft/posted/reversed, exact-cent aggregates, filters, same-tenant joins, and
an unrelated tenant. Local evidence cannot authorize hosted Supabase writes or
a production canary; hosted catalog/data/RLS/audit, protected browser,
rollback, and spend gates remain mandatory.

Evidence: database 112/112 suites and 318/318 tests, API integration 32/32
suites and 23/23 tests, zero skips; source SHA
`91ed37570ea57fa456b569d247802cfd996cb9c6` is Railway deployment
`133e14b7-c879-4090-8ce1-26d9b42d93ca` (`SUCCESS`/running); live readiness and
health are 200 and unauthenticated cash register is 401. Supabase was not
written and Vercel remained unchanged.

## D-206 - Cash register reads use a closed Nest contract (2026-08-06)

Decision: expose cash transactions through `GET /v1/finance/cash-transactions`
with strict bounded filters, verified-principal tenant scope, same-tenant cash
account and optional business/vendor joins, exact-cent amounts, and
server-computed receipt/disbursement aggregates. The existing Next Cash page
keeps its direct-read compatibility path; an exact boolean plus tenant
allowlist selects the typed Core adapter and Core errors fail closed. Nest
remains the authority for cash writes and workflow transitions; Python cannot
approve or finalize state.

Evidence: shared 25 files/214 tests; API 104 files/440 tests; Web 87 files/558
tests; database active/skipped lanes, package-serial tests, typecheck, serial
lint, production build 80/80, Vercel spend guard, and diff check. Source SHA
`ddadd2fa3f7c2451dcfc97f53529ba9edba1f3ee` is Railway deployment
`fbfc7eb0-4820-4359-a42f-74b3c0351558` (`SUCCESS`/running); live readiness and
health are 200 and unauthenticated cash register is 401. Supabase was not
written and Vercel remained unchanged.

## D-205 - Supplier payables reads use a closed Nest contract (2026-08-06)

Decision: expose supplier payables through `GET /v1/finance/payables` with
strict bounded filters, verified-principal tenant scope, same-tenant
Supplier Bill/Vendor/Purchase Order/Project joins, posted disbursement
allocation math, integer-cent balances, and server-computed aging totals. The
existing Next page keeps its direct-read compatibility path; an exact boolean
plus tenant allowlist selects the typed Core adapter and Core errors fail
closed. Nest remains the authority for supplier-bill/cash writes; Python
cannot approve or finalize state.

Evidence: shared 24 files/211 tests; API 102 files/435 tests; Web 87 files/556
tests; database active/skipped lanes, package-serial tests, typecheck, serial
lint, production build 80/80, Vercel spend guard, and diff check. Source SHA
`de0b7e1909ec127ec94ec044202f78f44ab8bd4a` is Railway deployment
`dcb4579e-5bb5-4661-9896-fc1fd607bd92` (`SUCCESS`/`RUNNING`); live readiness and
health are 200 and unauthenticated payables is 401. Supabase was not written
and Vercel remained unchanged.

## D-204 - Receivables reads use a closed Nest contract (2026-08-06)

Decision: expose customer receivables through `GET /v1/finance/receivables`
with strict bounded filters, verified-principal tenant scope, posted invoice
status and issuance evidence, same-tenant context joins, integer-cent
allocation math, and server-computed aging totals. The existing Next page keeps
its direct-read compatibility path; an exact boolean plus tenant allowlist
selects the typed Core adapter and Core errors fail closed. Nest remains the
authority for invoice/cash writes; Python cannot approve or finalize state.

Evidence: shared 23 files/208 tests; API 100 files/430 tests; Web 87 files/554
tests; database active/skipped lanes, package-serial tests, typecheck, serial
lint, production build 80/80, Vercel spend guard, and diff check. Source SHA
`f298b61a215ea43753f627010444c488f0c46518` is Railway deployment
`bfec3369-dee7-4ed9-9cb7-37f1e71fe9ab` (`SUCCESS`/`RUNNING`); live readiness and
health are 200 and unauthenticated receivables is 401. Supabase was not
written and Vercel remained unchanged.

## D-203 - Finance ledger reads use a closed Nest contract (2026-08-06)

Decision: expose the general ledger through `GET /v1/finance/ledger` with
strict bounded filters, integer-cent money, verified-principal tenant scope,
posted-entry visibility, and `finance.read` authorization. The current Next
page keeps its direct-read compatibility path; an exact boolean plus tenant
allowlist selects the typed Core adapter and Core errors fail closed. This is
read-only: Nest remains the authority for official ERP writes and Python does
not approve or finalize transactions.

Evidence: shared 22 files/206 tests; API 98 files/425 tests; Web 87 files/552
tests; package-serial tests; typecheck; serial lint; production build 80/80;
Vercel spend guard; and diff check. Source SHA
`c279f61555ba772579fb4091dd3d5884b48af273` is live on Railway deployment
`ac9f3fee-0a54-4bf7-91db-2b6815a3638e` (`SUCCESS`/`RUNNING`) with live
readiness/health 200 and unauthenticated Finance Ledger 401. Supabase was not
written and Vercel remained unchanged.

## D-202 - Cortex keyword reads use a closed Nest contract (2026-08-06)

Decision: move Cortex keyword retrieval behind `GET /v1/cortex/search` without
rewriting the current UI. The API owns strict query/limit validation, derives
tenant and role scope from the verified principal, requires `cortex.search`,
and returns only typed source references. The Next route remains the default
compatibility path; a separate exact-boolean plus tenant-allowlist canary
selects the authenticated adapter and fails closed on Core errors. Keep all
flags false/empty until replay, protected browser, rollback, role-scope, and
spend gates clear. Search never invokes external AI or finalizes ERP state.

Evidence: shared 21 files/203 tests; API 96 files/419 tests; Web 87 files/550
tests; package-serial tests; typecheck; serial lint; production build 80/80;
and diff check. The parallel root turbo test had five cross-package timeout
failures, while the isolated API and package-serial runs passed. Source SHA
`cd94e274a6a5cb19f715c73fa96fc717879644cc` is Railway deployment
`e9e90045-f907-4f6c-ae49-5fa3dcff3cd9` (`SUCCESS`); live readiness/health are
200 and unauthenticated Cortex search is 401. Supabase was not written and
Vercel stayed unchanged for spend control.

## D-201 - Asset reads use a closed, tenant-derived Nest contract (2026-08-06)

Decision: expose the operational asset register only through the typed plural
`GET /v1/assets` route. Parse a strict bounded query, require `asset.read`,
derive tenant scope from the verified principal, and allow only same-tenant
Project context. Keep the route fail-closed behind an exact API boolean and
UUID tenant allowlist. Do not add browser direct-table access, a write command,
or a UI adapter until migration parity and a protected canary are proven.

Evidence: focused API asset/config/auth suite 60/60; shared contract 2/2;
root tests, typecheck, serial lint, production build, and diff check. Source
SHA `f11b1467b5d3def986b73411a54a6f501339c803` is Railway deployment
`f0358fdd-f927-465c-b930-ec68b0baf240` (`SUCCESS`); live readiness/health are
200 and unauthenticated asset reads are 401. Supabase was not written and
Vercel stayed unchanged.

## D-200 - Keep the first asset slice operational, not accounting (2026-08-06)

The register names and tracks durable tenant-owned items without pretending to
be a fixed-asset ledger. `Operational Asset` is distinct from an `asset` Ledger
Account and an inventory Item. Controlled kind/status, tenant-safe assignment,
forced RLS, service-only privileges, and the existing audit trigger are enough
for the first source slice. Capitalization, depreciation, disposal,
maintenance, and assignment history require separate authority and accounting
contracts, so they remain deferred. This prevents a plausible-looking schema
from silently creating financial or lifecycle semantics the product has not
approved.

## D-199 - Map only the Purchase Order number constraint to a safe conflict (2026-08-06)

Decision: catch PostgreSQL `23505` only when the named
`ux_purchase_orders_tenant_po_number` constraint rejects a direct or grouped
header insert, and return a fixed Nest conflict message. Re-throw all other
errors so integrity failures are not hidden. Do not surface raw database text,
PO numbers, tenant IDs, or other business values. This guard does not authorize
the pending hosted migration or a tenant canary.

Evidence: focused PO service 11/11; full API 90/402; root `pnpm test`;
typecheck, serial lint, production build, and diff check. Source SHA
`354401d434f3556d39bed2600748822b755c6c69` is Railway deployment
`b6149479-1856-4ba5-baac-3e8df22bd262` (`SUCCESS`); live readiness/health are
200 and unauthenticated PO creation is 401. Supabase was not written; its
read-only planner reports one duplicate group with 12 records. Vercel stayed
on `31c04942a93d` without a build.

## D-198 - Purchase Order creation requires exact transactional boundary proof (2026-08-06)

Decision: require Purchase Order creation to derive tenant and actor from locked
membership, authorize `po.create`, claim idempotency only after membership
proof, calculate all monetary values as exact integer centavos, commit header
and lines atomically, and audit only bounded evidence. Replays return the exact
stored result without a second ERP insert or audit row. Keep PO Core flags
false/empty until hosted and disposable integration gates pass.

Evidence: focused PO service 10/10; full API 90/401; typecheck, serial lint,
production build, and diff check. Source SHA
`e4db66a8eb4eed15a68ced1b76d9cf26f7ce6462` is Railway deployment
`a7fb39dc-94c9-4cf0-8ad4-b0c3b7f32aa3` (`SUCCESS`); live readiness/health are
200 and unauthenticated PO creation is 401. Supabase was not written; Vercel
stayed on `31c04942a93d` without a build.

## D-197 - Cost-entry authority requires executable protected-boundary proof (2026-08-06)

Decision: treat disabled defaults, capability denial, tenant membership scope,
idempotent replay, and audit redaction as release invariants for manual cost
entry. Unit/service tests must prove rejected requests do not claim idempotency
or write ERP records; replay must return the exact stored result without a
second audit event. Keep Core flags false/empty until hosted and disposable
integration evidence exists.

Evidence: focused cost-entry service 5/5; full API 90/397; typecheck, serial
lint, production build, and diff check. Source SHA
`8be86304cf892fe645a3e3722d60275cdb01192a` is Railway deployment
`61680ed6-7a13-4dc1-9bfb-d3c9c8b29352` (`SUCCESS`); live readiness/health are
200 and unauthenticated command is 401. Supabase was not written; Vercel
stayed on `31c04942a93d` without a build.

## D-196 - Manual cost recording uses a fail-closed Nest command boundary (2026-08-06)

Decision: move manual project cost-entry creation into a tenant-scoped NestJS
transaction incrementally. Require `cost.record` and a membership recheck;
derive tenant/project/actor server-side; validate an active Cost Code; store
integer centavos; complete a forced-RLS idempotency ledger and semantic audit
row in the same transaction; and replay the exact result for the same key.
Keep the current Next direct action as the default compatibility path until
hosted schema and protected-canary gates pass. Keep all new flags false/empty.

Evidence: API route/controller/service contracts, 3 route tests plus a
fail-closed service test, database migration contract 3/3, shared contracts
2/2, Web Core flag suite 97/97, full API 90/393, database 44/173 active,
shared 19/198, Web 87/546, typecheck/lint/build/actionlint/spend guard/diff
check. Source SHA `bcee984` is included in Railway deployment
`76c27b43-47cd-4912-bca0-19a597190318` (`SUCCESS`, SHA
`f2457fd13bc7d7d1911e9f3bbb231cddb4de571b`); live readiness/health are 200
and the unauthenticated command is 401. Hosted Supabase was not written;
Vercel stayed on `31c04942a93d` without a build/deploy.

## D-195 - Vercel deployment automation fails closed for spend control (2026-08-06)

Decision: enforce the existing Vercel Git-disable setting in repository CI and
reject deploy commands in package/workflow automation. This prevents an
accidental push or script from creating billable builds. The guard is static,
read-only, and does not replace the required human/provider review for an
approved release.

Evidence: spend-guard 3/3, actionlint 1.7.12, Web 87/545, typecheck, serial
lint, 80-route production build, and diff check. Source SHA
`9cfee695f75e66375c2578235d0f1544a987e3ab`; no provider or hosted data state
changed.

## D-194 - Audit totals must be authoritative and singular (2026-08-06)

Decision: show the filtered audit total in the single summary line and remove
the duplicate count/page helper. Page length is an implementation detail, not
the result count. Keep the change presentation-only: no query, tenant scope,
Core gate, official transaction authority, migration, or provider state may
change for this slice.

Evidence: source SHA `5b1cc83ae387deeb83ca98c2ae96782d471dc46c` passed focused
helper 3/3, Web 87/545, typecheck, serial lint, 80-route production build,
and diff check. No Railway build, Supabase write, or Vercel build occurred.

## D-193 - Runtime branding must be clean without rewriting migration identity (2026-08-05)

Decision: remove legacy product/source labels from runtime Web/API/package text
and enforce both former-product/vendor families and `BuildOps` through the
branding regression test. Keep historical migration filenames as internal
version identity; do not rename or replay them solely to alter provenance.
This separates user-facing clean-room requirements from safe database
migration bookkeeping.

Evidence: clean-room 1/1, Web 87/545, typecheck, serial lint, 80-route build,
diff check, and zero-match runtime scan outside the historical migration path.
SHA `1c5b8de` is Railway deployment
`2e4c80f9-e243-46c3-acfa-6af417a448ee`, live ready/health 200, audit 401.
Supabase and Vercel remain unchanged.

## D-192 - Audit filters stay bounded and authority-neutral (2026-08-05)

Decision: add only allowlisted action/entity filters and URL pagination to the
project Audit page. Use 25 rows per page, apply identical tenant predicates to
legacy SQL and Core requests, and expose Core totals without exposing `diff`.
Filter parsing rejects unsupported values and clamps page numbers. Keep the
existing direct read as default; Core remains behind its exact flag/tenant
allowlist. This improves retrieval without changing official transaction
authority or requiring a migration.

Source SHA `e98a03b` passed 87 Web test files/545 tests, typecheck, serial lint,
80-route build, and diff check. No hosted state changed. Vercel's retained
revision `31c04942a93d` was read-only checked; no build was triggered.

## D-191 - Project audit reads cut over only through an explicit Core gate (2026-08-05)

Decision: add a closed-by-default adapter in the existing project Audit page
for the Nest redacted `GET /v1/audit/activity` projection. Selection requires
the exact `ERP_AUDIT_ACTIVITY_READS_VIA_API` flag, tenant allowlist, and an
`owner`/`admin`/`pm`/`finance` role; the adapter sends at most 500 related IDs,
parses strict shared results, and never falls back to direct SQL after
selection. Keep direct reads as the default compatibility behavior until
protected browser, tenant-isolation, redaction, rollback, and hosted-data
gates pass. This preserves current UI behavior while making Nest the future
read authority; no migration or provider change is required.

Source SHA `e8d993d5d23e34b1690781f083b7a0c1c5a0603a` is Railway deployment
`5a562db0-d682-4d99-adba-0adb20436bc8` with live readiness/health 200 and an
unauthenticated activity boundary of 401. Supabase remains read-only at
55/90; Vercel remains disconnected/untouched for spend control. The Railway
file manifest is the API Dockerfile, despite a stale `@buildops/web` metadata
string; do not alter provider settings from that discrepancy alone.

## D-190 - Audit activity is a redacted, tenant-scoped read seam (2026-08-05)

Decision: expose the existing append-only `audit_log` through Nest as
`GET /v1/audit/activity`, with strict shared contracts, bounded pagination,
tenant predicates from the verified principal, and a dedicated `audit.read`
capability limited to owner/admin/pm/finance. Return IDs, action/entity
metadata, timestamps, and hash-chain values; never return stored `diff` JSON
from this activity projection. This gives the future Cortex/Obsidian-style
brain a searchable event spine without moving transaction authority into the
browser or Python.

Source SHA `1170b55d73b87ac3c932a3c85f267201564cd7bc` is live on Railway as
`e62e25b9-7e26-4b59-bb32-35ba524c6ae2`; readiness/health are 200 and the
unauthenticated route is 401. No migration or hosted write is required.
Railway's file manifest used `apps/api/Dockerfile`, but its metadata retains a
stale `@buildops/web` build-command string. Treat that as an operator review
item; do not alter provider settings or trigger an extra build from this
observation alone. Supabase and Vercel remain closed.

## D-189 - Clone reconciliation is read-only and fail-closed (2026-08-05)

Decision: compare the clean replay and hosted target before any migration or
canary decision, using separate PostgreSQL `READ ONLY` transactions. Compare
history, schema/security catalog, tenant counts, exact financial measures,
and audit endpoints; report drift for owner review. Refuse identical target
and replay identities. The tool may never repair, apply migrations, or infer
tenant mappings from row counts.

The current evidence is `reconcile_required`: both sides are PostgreSQL 17,
but hosted remains 55/90 with catalog, grants, data, financial, and audit
differences. This preserves billing and data safety while making the next
owner-approved reconciliation concrete. The docs/scripts push produced only
Railway `SKIPPED` deployment `8812b0dd-a1bd-4040-925d-c83389447dc6`; no paid
build occurred. Vercel and hosted SQL remain closed.

## D-188 - Clean replay is a prerequisite to hosted migration (2026-08-05)

Decision: treat the disposable PostgreSQL 17 + Redis lane as a hard release
gate, not as a substitute for hosted reconciliation. A zero-state replay must
apply every source migration, run the database/API integration suites with no
skips, and prove schema-before/schema-after equality. Runtime fixtures must
assert both sides of the Warehouse closeout contract: nonzero balances cannot
be deactivated, while explicit reversal events remain valid for legacy
inactive evidence.

The gate passed locally at 90/90, 108 suites, 311 tests, and identical schema
hashes. The watched-path GitHub push caused one Railway auto-deployment
`a7371ef0-0b16-45c6-b4fd-323f33ddf634` for `303f266`, which is healthy; no
manual redeploy was made. Supabase remains read-only at 55/90; clone restore,
catalog/data/RLS comparison, owner mapping, rollback, browser canary, and
spend approval are still separate decisions. This does not authorize SQL,
provider changes, or a Vercel build.

## D-187 - Stock Movement post/reverse remains opt-in and idempotent (2026-08-05)

Decision: expose post and reverse only through strict Nest command endpoints
that derive tenant/actor from the verified principal, require the narrow
`inventory.post_movement` role map, lock tenant membership and movement scope,
claim a request-hash idempotency key, invoke the existing database function,
complete the result, and audit the state transition in one transaction. The
request ledger is forced-RLS and service-role-only; authenticated browser
clients cannot write it. Shared result schemas reject malformed movement or
journal identities.

Next adopts the seam only when
`ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_VIA_API=true` and the tenant UUID is in
`ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_TENANT_IDS`; the API independently
requires the matching `...WORKFLOW_WRITES_ENABLED=true` and allowlist. Both
remain disabled/empty; direct Server Action SQL remains the compatibility
path, and the client retains a stable retry key without fallback. Source SHA
`7f19315b967f81e120fa64bebc95ed338c4ad2cb` is Railway deployment
`5320235d-c242-4b3c-8b24-c8de9e1cd8cd` with readiness/health 200 and both
unauthenticated command boundaries 401. Supabase remains read-only at 55/90;
Vercel is untouched. Rollback is the disabled flags or prior API deployment.

## D-185 - Stock Movement draft creation is idempotent and canary-gated (2026-08-05)

Decision: expose only draft creation through Nest
`POST /v1/inventory/stock-movements`. Derive tenant and actor from the
verified principal; recheck `inventory.manage` under a membership lock;
validate the existing database Warehouse/Project/Item/Cost Code invariants;
use exact integer conversions; claim a tenant/key/request-hash idempotency
record; create the draft and lines in one transaction; and write semantic
audit evidence. Posting, reversal, and deletion remain database workflows.

Next may select the adapter only when
`ERP_INVENTORY_STOCK_MOVEMENT_CREATE_VIA_API=true` and the tenant UUID is in
`ERP_INVENTORY_STOCK_MOVEMENT_CREATE_TENANT_IDS`; the API additionally
requires the write flag and matching allowlist. All remain disabled/empty.
Source SHA `3b920185fdc438dfc5dd5972f738ea9e0a1d7e30` is Railway deployment
`e231fe1f-bd37-4e68-bef9-a2d26e0c1061` with healthy readiness and an
unauthenticated 401 boundary. The idempotency migration is source-only;
Supabase remains read-only and Vercel untouched. Rollback is the disabled
adapter/command flags or prior API deployment.

## D-186 - Server-only idempotency ledgers are catalog evidence (2026-08-05)

Decision: command ledgers are verified separately from authenticated RLS
policy tables. The reproducibility verifier checks
`stock_movement_create_requests` for forced RLS, no anon/authenticated table
privileges, service-role authority, and valid tenant/key/state indexes. A
hosted read-only failure for this source-only table is expected while the
ordered ledger remains 55/89; it is not permission to apply SQL.

Source SHA `7c3f6c8e204f208cea43de2e1630c6f653005df8` is pushed to both refs.
Docker replay, backup/restore, and catalog/data/RLS equivalence remain open;
Vercel and hosted Supabase remain untouched.

## D-184 - Stock Movement detail reads are exact and independently canary-gated (2026-08-05)

Decision: expose Stock Movement detail discovery through Nest only. The route
derives tenant scope from the verified principal, requires `inventory.read`,
repeats tenant predicates on header/line/ledger joins, bounds evidence, and
returns UTC ISO timestamps plus exact integer strings for micro-units and cent
values. It cannot post, reverse, delete, or approve a movement.

Next adopts it only when
`ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_VIA_API=true` and the tenant UUID
is in `ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_TENANT_IDS`; both remain
disabled. Source SHA `a693e15fafc4b4b5d2df4f3fd6bef6f72015d702` is Railway
deployment `a62a237e-2a82-4a40-88ca-2354011d3c9d` with healthy readiness and
unauthenticated 401 evidence. No hosted migration/data or Vercel action is
implied. Rollback is the disabled adapter flag or prior API deployment.

## D-183 - Stock Movement register reads are bounded and canary-gated (2026-08-05)

Decision: expose only Stock Movement discovery through Nest
`GET /v1/inventory/stock-movements`. The API derives tenant scope and actor
from the verified principal, requires `inventory.read`, validates explicit
movement/status filters, caps pages at 500, and returns posted value as an
exact integer string. The browser cannot approve, post, reverse, or write a
movement through this read.

Next adopts the adapter only when
`ERP_INVENTORY_STOCK_MOVEMENT_READS_VIA_API=true` and the tenant UUID appears
in `ERP_INVENTORY_STOCK_MOVEMENT_READS_TENANT_IDS`; both remain disabled.
The direct server-side compatibility read is retained. Source SHA
`9d3cf5ed179f24c0382ecd7b53b9b94f87812578` is Railway deployment
`4cbaefcf-82a4-4549-83f4-2bfa094fcebb` with healthy readiness and an
unauthenticated 401 canary. No hosted migration/data or Vercel action is
implied. Rollback is the disabled adapter flag or prior API deployment.

## D-182 - Warehouse deactivation requires zero balance (2026-08-05)

Decision: an active Warehouse cannot be deactivated while its tenant-scoped
stock ledger has nonzero net quantity or value. Nest checks the aggregate after
locking the tenant Warehouse and returns a conflict before update/audit. The
database contract repeats the invariant and serializes ledger inserts with a
compatible Warehouse share lock; only `receipt_reversal` and
`movement_reversal` events may write to an inactive Warehouse. This protects
inventory integrity without blocking legitimate reversal workflows.

Boundary: source and basic Railway release are verified at SHA
`f391f49d0aa002101649afa79dfc75872120df72`, deployment
`48cc2b18-1c5d-45eb-b59d-b54571fe673c`; readiness/health are 200 and
unauthenticated protected routes are 401. The migration is forward-only and
source-only pending hosted ledger reconciliation at 55/88 (33 pending).
Warehouse/API adoption flags remain false/empty. No Supabase migration/data
action, Vercel build, or provider setting is implied. Rollback is the disabled
canary/compatibility path or prior successful API deployment.

## D-181 - Inventory Warehouse closeout is read-only and canary-gated (2026-08-05)

Decision: expose Warehouse closeout readiness through
`GET /v1/inventory/warehouses/:warehouseId/closeout`. Return exact signed
quantity/value strings and `ready`, `already_inactive`, or
`nonzero_balance`; derive tenant and actor from the verified principal;
recheck `inventory.manage` inside one transaction; lock membership and
Warehouse rows; and aggregate ledger entries with repeated tenant and
Warehouse predicates. Do not approve or mutate deactivation in this read.
Next adopts only through an exact flag and tenant allowlist, both disabled;
the current Server Action and UI remain unchanged.

Boundary: source and basic Railway API release are verified, but no protected
tenant canary is approved. Source SHA
`425c66a757ffa66cd4dfefca2079ebfd61fb3bbf` is deployment
`1ee3706a-5ef3-4004-9708-ac3efcad5483` with readiness/health 200 and an
unauthenticated 401 route boundary. No Supabase migration/data action,
Vercel build, or provider setting is implied. Rollback is the disabled
adapter flag and prior API deployment.

## D-180 - Inventory Warehouse state updates are tenant-scoped and canary-gated (2026-08-05)

Decision: expose Warehouse state changes through
`PATCH /v1/inventory/warehouses/:warehouseId`. Accept only a trimmed name and
explicit active boolean; do not expose code or project scope because the
database guard makes Warehouse identity immutable after receipt or movement
evidence. Derive tenant and actor from the verified principal; recheck
`inventory.manage` inside the transaction; lock the tenant row; make repeated
state submissions idempotent; and write a semantic before/after audit record.
Next adopts only through an exact flag and tenant allowlist; direct Server
Action behavior remains default.

Boundary: source and basic Railway API release are verified, but no protected
tenant canary is approved. Source SHA
`4737fec37f97360f8c3ffe6bc98f0bdc78a4cdf5` is deployment
`382d281a-b022-4296-8b9d-ee84a07c80b1`; readiness/health are 200 and both
unauthenticated route boundaries are 401. No Supabase migration/data action,
Vercel build, or provider setting is implied. Rollback is the disabled adapter
flag and prior API deployment.

## D-179 - Inventory Warehouse creation is tenant-scoped and canary-gated (2026-08-05)

Decision: expose Warehouse setup through `POST /v1/inventory/warehouses`.
Accept only code, name, and nullable project scope; derive tenant and actor
from the verified principal; recheck `inventory.manage` inside the
transaction; verify the project is owned by that tenant; enforce the
tenant/code unique constraint; and write a semantic audit record. Next adopts
only through an exact flag and tenant allowlist; direct Server Action behavior
remains default.

Boundary: source and basic Railway API release are verified, but no protected
tenant canary is approved. Source SHA
`7b0ccf1d9dda19a61d8f2c26ead42b562b6f2534` is deployment
`fbbda042-9b51-4c21-a518-a6e4c2fb2752`; readiness/health are 200 and the
unauthenticated route boundary is 401. No Supabase migration/data action,
Vercel build, or provider setting is implied. Rollback is the disabled adapter
flag and prior API deployment.

## D-178 - Inventory UOM creation is tenant-scoped and canary-gated (2026-08-05)

Decision: expose UOM setup through `POST /v1/inventory/uoms`. Accept only
code, name, and decimal precision; derive tenant and actor from the verified
principal; recheck `inventory.manage` inside the transaction; enforce the
tenant/code unique constraint; and write a semantic audit record. Next adopts
only through an exact flag and tenant allowlist; direct Server Action behavior
remains default.

Boundary: source and basic Railway API release are verified, but no protected
tenant canary is approved. Source SHA
`ae6d7992ebdfcb0439f181ecdcd72b9cb8673c2b` is deployment
`5ffd0087-7951-4111-92b6-72293cadef14`; readiness/health are 200 and the
unauthenticated route boundary is 401. No Supabase migration/data action,
Vercel build, or provider setting is implied. Rollback is the disabled adapter
flag and prior API deployment.

## D-177 - Inventory item policy writes are transactional and canary-gated (2026-08-05)

Decision: expose item policy changes through Nest
`PATCH /v1/inventory/items/:materialItemId/configuration`. Accept only the
base UOM and tracked state; derive tenant and actor from the verified
principal; recheck `inventory.manage` inside the transaction; lock the
tenant-scoped active UOM and item; preserve database stock-identity guards;
and write a semantic audit diff. Repeated same state is a no-op, making the
command idempotent without a new request table. Next adopts only through the
exact flag and tenant allowlist; direct server-action behavior remains the
default.

Boundary: the source release is production-ready at the basic API boundary but
not canary-approved. Source SHA
`8a0c059826aabf3b0711277c68f1b182db46aa25` is Railway deployment
`19b808c7-f07c-40f3-a268-df35aaf86071` with healthy database/Redis readiness,
route mapping, and unauthenticated 401 evidence. No Supabase migration/data
action, Vercel build, or provider setting is implied. Rollback is the disabled
adapter flag and the prior API deployment.

## D-176 - Inventory summary reads are bounded and canary-gated (2026-08-05)

Decision: expose inventory control-center reads through Nest
`GET /v1/inventory/summary` using a strict shared envelope, verified tenant
principal, explicit `inventory.read`, repeated tenant predicates on every
table/join, bounded balances, and decimal-safe bigint strings. Adopt from Next
only through an exact flag plus tenant UUID allowlist; reject tenant identity
drift or truncated results instead of silently falling back.

Reason: inventory combines stock quantities, money values, warehouses, items,
projects, and receipt state. A bounded read seam moves business logic toward
the core authority without a big-bang rewrite, browser-side sensitive reads,
cross-tenant leakage, or loss of exact numeric integrity.

Boundary: direct server-side inventory reads remain default. The adapter
rejects tenant drift, truncation, and unsafe display numbers. Source SHA
`4da9772516f80255a2cb4adbe376d4ca733513e4` is deployed successfully on
Railway with readiness, route, and unauthenticated 401 evidence. No Supabase
schema/hosted migration or Vercel build/provider action is implied; the
55/87 migration ledger remains read-only pending supported recovery and replay,
and the canary flag remains disabled.

## D-175 - CRM opportunity detail reads are bounded and canary-gated (2026-08-05)

Decision: expose opportunity detail graphs through Nest
`GET /v1/crm/opportunities/:opportunityId` using strict shared schemas, a
verified tenant principal, explicit `opportunity.read`, repeated tenant
predicates on account/project joins and all progress subqueries, and bounded
aggregates for PPRF, inspections, designs, and change requests. Adopt from
Next only through an exact flag plus tenant UUID allowlist; reject identity
drift instead of falling back silently.

Reason: opportunity detail combines financial, project, design, inspection,
and change-request state. Moving it incrementally toward the core authority
reduces browser-side business logic without a big-bang rewrite, cross-tenant
leakage, or unbounded graph reads.

Boundary: direct server-side DB reads remain default. Source commit `3eb9e69e`
is live on Railway with Docker, readiness, route, and 401 boundary evidence.
No Supabase schema/data, Railway setting, or Vercel build changed; protected
browser, rollback, migration-reconciliation, and spend gates remain open.

## D-174 - CRM KYC queue reads are bounded and canary-gated (2026-08-04)

Decision: expose pending-KYC account queues through Nest
`GET /v1/crm/accounts/kyc-queue` using a strict shared envelope, verified
tenant principal, explicit `account.kyc_review`, repeated tenant predicates on
account and artifact joins, deterministic ordering, a 200-row cap, and a
separate scoped total. Adopt from Next only through an exact flag plus tenant
UUID allowlist; reject wrong-tenant rows instead of falling back silently.

Reason: KYC queues combine sensitive account and document metadata. A bounded
read seam moves authority incrementally without cross-tenant leakage,
unbounded queries, or a second hidden source of truth.

Boundary: direct server-side DB reads remain default. Source commit
`5a5a35a3` is live on Railway with readiness and 401 boundary evidence. No
Supabase schema/data, Railway setting, or Vercel build changed; protected
browser, rollback, supported data-recovery, and spend gates remain open.

## D-173 - CRM account detail graphs are bounded and canary-gated (2026-08-04)

Decision: expose CRM account details through Nest
`GET /v1/crm/accounts/:accountId` using strict shared schemas, verified
tenant principal, explicit `account.read`, repeated tenant predicates on the
account and every child relation, capped child collections, and a separate
scoped opportunity count. Adopt from Next only through the existing exact flag
and tenant UUID allowlist; reject nested identity drift instead of falling back
silently.

Reason: detail pages aggregate multiple ERP relations and are a high-risk
cross-tenant read surface. A bounded graph moves authority incrementally toward
Nest without a big-bang rewrite, unbounded queries, document leakage, or hidden
fallback to a second authority.

Boundary: direct server-side DB reads remain default. Source commit `c4fb282f`
is live on Railway with readiness, route, and 401 boundary evidence. No
Supabase schema/data, Railway setting, or Vercel build changed; protected
browser, rollback, and supported data-recovery gates remain open.

## D-172 - CRM account collection reads are bounded and canary-gated (2026-08-04)

Decision: expose CRM account collections through Nest `GET /v1/crm/accounts`
using a shared schema, verified tenant principal, explicit `account.read`,
bounded search/industry/KYC filters, allowlisted sorting, deterministic
pagination, and opportunity counts. Adopt from Next only through an exact flag
plus tenant UUID allowlist; reject mismatched tenant or pagination identity.

Reason: Accounts is a high-volume ERP surface. Moving it incrementally toward
the core authority reduces browser-side business logic without a big-bang
rewrite, cross-tenant leakage, unbounded queries, or hidden authority fallback.

Boundary: direct server-side DB reads remain default. Source gates pass full
shared/API/Web tests, typechecks, builds, and lint. No Supabase schema/data,
Railway setting, or Vercel build changed; protected browser, rollback, and
supported data-recovery gates remain open.

## D-171 - Project update audit is transactionally coupled (2026-08-04)

Decision: every Nest project update writes a semantic before/after diff through
`AuditService.writeSemantic` before the transaction commits, and validates the
shared update result schema. Tenant and actor identity come from the verified
Nest principal; no browser-supplied audit identity is accepted.

Reason: project updates are official ERP mutations. A successful update without
an append-only audit record violates the auditability boundary and would make a
future canary weaker than the existing Next compatibility path.

Boundary: source is deployed at `7332902e` with Railway readiness and 401
boundary evidence, but the project-write canary remains closed. No Supabase or
Vercel action is part of this decision.

## D-170 - Project collection reads are bounded and canary-gated (2026-08-04)

Decision: expose project collection reads through Nest `GET /v1/projects`
using a shared schema, verified tenant principal, explicit `project.read`,
bounded query filters, allowlisted sorting, and deterministic pagination.
Adopt from Next only through an exact flag plus tenant UUID allowlist; fail
closed if returned tenant/page/limit identity differs.

Reason: list reads are a high-volume ERP surface and must move toward the core
authority without a big-bang rewrite, cross-tenant leakage, unbounded search,
or hidden fallback to a second authority.

Boundary: direct server-side DB reads remain default. Source commit
`78ad5f63` is live on Railway with `/ready`, `/health`, and 401 boundary
evidence; no Supabase schema/data, Storage, Railway setting, or Vercel build
changed.

## D-169 - Redis is a shared exported Nest module (2026-08-04)

Decision: move the existing Redis client factory and shutdown lifecycle out of
`AppModule` into a global `RedisModule` that exports `REDIS_CLIENT`; import it
from the root application and every module that directly injects the token.

Reason: Nest child modules cannot resolve providers declared only on their
parent. Railway proved the defect at startup when `ProviderQuotaService` could
not inject Redis. One module preserves the existing client semantics and
avoids silently creating duplicate Redis connections.

Boundary: Redis remains transport/accounting only. PostgreSQL transactions,
constraints, and audit records remain ERP authority. The source fix requires
exact Railway build/start/readiness evidence before production is called green;
that evidence is now green for `d7f62faf` without any Vercel or Supabase
mutation. Keep all canary flags closed until the separate data and protected
browser gates pass.

## D-168 - Project detail reads use a gated Nest contract (2026-08-04)

Decision: add a tenant- and role-authorized `GET /v1/projects/:id` to the Nest
modular monolith and expose it to the Next project detail page only through
`ERP_PROJECT_READS_VIA_API` plus a strict tenant UUID allowlist. Use a shared
camelCase read schema; verify returned project and tenant identity in the Next
adapter; fail closed when the enabled authority is unavailable or inconsistent.

Reason: business reads should migrate incrementally toward the Nest authority
without a big-bang rewrite or a hidden cross-tenant fallback. The existing
direct server-side query remains the compatibility path while protected
browser, deployment, rollback, and spend evidence are collected.

Boundary: this is read-only; it grants no ERP write authority, does not change
Supabase schema/data, and the default flag/allowlist remain disabled. Source
gates pass focused/full tests, typechecks, builds, and lint; no hosted provider
mutation occurred.

## D-167 - Recover stale Supabase sessions at the middleware boundary (2026-08-04)

Decision: recognize only Supabase's refresh_token_not_found failure (or its
equivalent exact message), delete chunked sb-*-auth-token cookies, continue as
anonymous, and reuse the existing protected-route redirect. Rethrow unrelated
errors.

Reason: Vercel's read-only runtime error inventory showed stale refresh tokens
failing in /middleware; clearing only the revoked auth material prevents
repeat 500s without making any protected ERP route public or adding provider
work.

Validation/release boundary: middleware/helper recovery tests 5/5, full Web
75/476, typecheck, and 80/80 build pass. No Vercel deployment, Supabase
mutation, Storage change, or provider setting changed.

## D-164 - Cortex source lookup is explicit and cost-bounded (2026-08-04)

Decision: keep the global palette's Search records mode on its existing API
path. Add Cortex graph lookup only inside the explicitly selected Ask Cortex
mode, after two or more characters, with debounce, abort/stale-response
guards, the existing server hit cap, tenant/role scope, and canonical-href
filtering. Keep source navigation read-only and keep the final Ask Cortex row
as the only draft-handoff action.

Reason: operators need to find the evidence behind the AI brain, but every
keystroke must not become an LLM/provider bill or an ERP authority path. A
separate source result stack improves discoverability while preserving the
existing low-cost search behavior and explicit user intent.

Validation/release boundary: source `6c975261` passes focused/full Web tests,
workspace gates, and the 80/80 build. GitHub/Railway is green; no Vercel
deployment, Supabase SQL/data, Storage, or Railway setting changed.

## D-165 - Provider routes get explicit edge burst limits (2026-08-04)

Decision: classify Cortex chat, AI chat, similar-item retrieval, and Cortex
embedding as provider-backed buckets in the existing edge limiter. Keep
general traffic policy unchanged. Enforce 20/minute authenticated (10
anonymous) for chat/similar-item routes and 6/2 for embedding. Include limit
and bucket headers on 429 responses.

Reason: authenticated traffic currently allowed 1,000 requests/minute, which
could create avoidable provider and function spend. Route-specific protection
reduces burst risk without changing API contracts or silently disabling the
AI brain.

Boundary: map is per edge instance and not authoritative global quota. Shared
Redis accounting, tenant budgets, and operator controls remain future NestJS
work. Source `4d190dfd` passes focused/full tests, workspace gates, and the
80/80 build; no hosted/provider mutation occurred.

## D-166 - Shared provider quota is Nest-authorized and canary-gated (2026-08-04)

Decision: add authenticated `POST /v1/provider-quotas/consume` to the Nest
modular monolith. Accept only `provider-chat` and `provider-embedding`; derive
tenant/user scope from the verified Supabase principal; enforce fixed server
limits with atomic Redis Lua accounting and expiry. Keep Next adoption behind
`ERP_PROVIDER_QUOTA_VIA_API` plus an explicit tenant UUID allowlist.

Reason: per-instance edge maps cannot protect spend across Vercel instances.
Central accounting reduces duplicate provider bursts while preserving route
payloads and keeping AI advisory behavior separate from ERP authority.

Boundary: Redis stores only hashed identity/counter state and is not business
authority. Missing/unhealthy shared quota fails closed only for enabled canary
tenants; default flag/allowlist are off. Source gates pass API 60/308, Web
73/471, lint/typecheck, API build, and Web 80/80 build. No Vercel or Supabase
mutation occurred.

## D-163 - Product clean-room scan excludes research provenance (2026-08-04)

Decision: enforce forbidden legacy/vendor markers across product-facing web,
API, and package text roots, while allowing explicit competitor/repository
references in research and immutable migration provenance. Report exact files
when a product marker appears.

Reason: the product must ship as Third Code ERP without copied branding or
repository identifiers, but removing provenance from migration history or
clean-room notes would make the release auditable and could break the ordered
database ledger.

Validation/release boundary: source `0c911f8` passes focused/full Web tests,
workspace gates, and 80/80 build; live landing is clean at three widths. No
Supabase, Railway setting, Storage, or Vercel deployment mutation occurred.

## D-162 - Cortex presentation remains a bounded evidence surface (2026-08-04)

Decision: render the server-provided operational brief as a small responsive
panel on the authenticated Cortex page. Use the entity registry as the final
allow-list, keep links canonical and read-only, cap the visible list at six,
and use GSAP only for a bounded entrance animation with reduced-motion escape.

Reason: operators need an immediately searchable pulse without a second
browser fetch, a new provider bill, or a path that could be mistaken for ERP
authority. The server brief already repeats tenant and role scope; the client
receives presentation data only.

Validation/release boundary: focused/full Web tests, workspace gates, and the
80/80-route build pass. Source `1e5aa4d` is pushed to both target branches;
Railway is healthy, Vercel created no deployment, and Supabase was not
mutated. No authenticated tenant credential was used for browser QA.

## D-161 - Cortex brief is bounded evidence, not authority (2026-08-04)

Decision: expose a small `GET /api/cortex/brief` read model backed by current,
tenant-scoped graph nodes and the caller's Cortex node-type scope. Cap the
requested item count at 24, omit unregistered graph sources, and return private
no-store headers. Keep the route free of mutations, LLM calls, Python
finalization, and direct browser database writes.

Reason: operators need a calm, searchable pulse across the ERP while the
hosted migration ledger and provider spend gates remain closed. A bounded
source-backed surface advances the AI-brain workflow without inventing business
state or increasing billable usage.

Validation/release boundary: focused route tests and typechecks pass; hosted
Supabase, Railway settings, Storage, and Vercel were not mutated. This is not a
production rollout until the ordinary release evidence is complete.

## D-160 - Cost-capped frontend promotion is closed by default (2026-08-04)

Decision: keep Vercel Git deployment disabled and do not create preview or
production builds during migration work. Source publication to GitHub is not
frontend rollout evidence. A later frontend release requires explicit spend
approval, one green exact-SHA build, runtime/browser proof, and a retained
rollback deployment.

Reason: the project has exhausted included Vercel credit and incurred
on-demand build charges. Avoiding duplicate or speculative builds is an
operational safety requirement, not an optional optimization.

Evidence: `apps/web/vercel.json` has `git.deploymentEnabled: false`; the
read-only Vercel inventory returned zero new deployments after `bbd0e39`. No
Vercel mutation occurred.

## D-159 - Hosted migration remains blocked by duplicate demo records (2026-08-04)

Decision: do not apply the 32-migration suffix while the target contains one
tenant-scoped Purchase Order number group with 12 records. Keep the duplicate
planner read-only and require a supported recoverable backup, dependent-row /
audit export, and owner-approved canonical mapping before any repair or
replay. Never reset migration history or silently rename/delete records.

Reason: the first pending migration intentionally refuses to create a global
tenant Purchase Order uniqueness index when duplicates exist. Bypassing that
guard would make idempotent commands and audit evidence unreliable.

Evidence: Supabase target is PostgreSQL 17, 55/87 migrations, linear prefix;
the read-only planner exits `review_required` with one group and 12 records.
No hosted SQL, data, or migration-history mutation occurred.

## D-158 - Supplier review is a separate closed read seam (2026-08-04)

Decision: expose the supplier Purchase Order review as a strict, token-scoped
read model with its own feature flag and tenant allowlist. Keep the existing
Nest POST command as the only authority for accepting, declining, or requesting
changes; Next server actions may submit a command but never write ERP tables.

Reason: a public review page needs enough order context to support a decision,
but it must not widen the mutation or tenant boundary. Separating the read
gate allows UI and contract validation without enabling supplier access before
the hosted session/line-item schema, token threat model, replay, rollback, and
provider evidence are ready.

Validation/release boundary: source tests and full workspace gates pass (API
58/300, Web 68/454, shared types 15/163, 79/79-route build); local closed-gate
request is HTTP 200. No hosted SQL/data, Railway setting, Vercel deployment,
or provider mutation is authorized by this decision.

Post-push evidence: source `386fd2a` is on both target branches; GitHub's
Railway check is `success`, Railway deployment
`430e835a-c2bc-4dfb-8994-a5b7e5a0e1ce` is `SUCCESS`, and live readiness is
healthy. Vercel reports zero deployments after the push. Supabase remains at
55 migrations with the latest branch-action log blocked by duplicate `PO-0002`
rows (`SQLSTATE P0001`); no hosted mutation occurred.

## D-157 - Landing GEO graph is public-copy-only (2026-08-04)

Decision: emit one pure, linked Schema.org graph for the public landing page:
organization, website, page, software product, and FAQ. Root IDs at the
canonical origin and declare en-PH/Philippines construction-business context.
Do not emit `SearchAction` until a genuinely public search endpoint exists.

Reason: search and AI answer systems need stable product relationships, but the
ERP's search surface is authenticated and tenant/permission-scoped. A graph
built from public copy improves discoverability without leaking private records
or promising an unauthorised URL. Keeping it pure makes output deterministic
and testable.

Validation/release boundary: focused 5/5, Web 67/451, workspace lint/typecheck,
diff check, and 79/79-route build pass; local production HTML is HTTP 200 with
expected markers and no legacy-brand identifiers. No hosted DB/data, Railway,
or Vercel mutation; Supabase and Vercel gates remain closed.
Post-push source evidence: `ce1ae6e` is on both target branches, GitHub's
Railway check is `success`, Railway skipped the unchanged-API commit, and
live readiness is 200. Vercel produced no deployment and the public URL is
still the prior release, so no live GEO claim is made. Supabase remains
blocked at the duplicate Purchase Order `P0001` preflight.

## D-156 - Proposal reads repeat tenant scope (2026-08-04)

Decision: constrain the proposal overview and change-request log by both the
requested opportunity and `profile.tenantId` on every related table. Account
and nullable design-file joins carry the tenant predicate too.

Reason: UUID possession and an already-authorized parent lookup are not a
sufficient defense-in-depth boundary in a multi-tenant ERP. Repeating tenant
scope makes the query intent auditable and protects against future changes to
foreign-key assumptions or cross-tenant fixture data.

Validation/release boundary: focused proposal actions 2/2, Web 66/450,
workspace lint/typecheck, diff check, and production build pass. No hosted
schema/data, Railway setting, or Vercel deployment changed.
Post-push evidence: `5a5e525` is on both target branches, GitHub's Railway
check is successful, Railway skipped the unchanged-API commit, and live
readiness is 200. Vercel has no new deployment. Supabase is still not a green
release target: 55 migrations, `MIGRATIONS_FAILED` branch status, and the
duplicate-PO `P0001` failure in the last successful branch-action log read. A
later logs request returned `INVALID_ARGUMENT` and does not clear the gate.

## D-155 - Command palette owns one accessible result relationship (2026-08-04)

Decision: make the input the single `combobox`, keep Search and Ask Cortex
actions in one labelled `listbox`, and navigate with a pure wrapping index
helper. Clear stale results before a new debounce cycle and sequence-check
responses so abort races cannot reopen records from an earlier term.

Reason: the palette is the ERP's fastest cross-module path. Stable ARIA IDs
help keyboard and assistive-technology users understand the active choice,
while deterministic navigation and late-response rejection protect the
permissioned search contract without adding a new authority seam.

Validation/release boundary: focused 7/7 and Web 66/450 pass; Web typecheck
passes. Full workspace/build and authenticated browser gates remain open. No
hosted data, schema, Railway setting, or Vercel deployment changed.
Post-push evidence: source/docs `0a085b7` is on both target branches; GitHub's
Railway check is `success`, Railway skipped the unchanged-API commit, and
live readiness is 200. Supabase and Vercel remain unchanged by design.

## D-154 - Cortex search selection is pure, actionable, and read-only (2026-08-04)

Decision: keep keyboard navigation in a pure helper and let the Cortex graph
component open only results with an authorized `href`. Arrow navigation wraps
and skips unavailable records; Enter uses the active result or the first
actionable result; Escape closes the list while preserving the query. The UI
must announce loading, empty, and failure states and expose explicit ARIA
relationships.

Reason: Cortex is the ERP's calm knowledge/navigation layer, not a second
transaction authority. A pure selection function is deterministic and easy to
test, while skipping null destinations avoids presenting dead or unauthorized
links as usable. Clearing stale results prevents a changed query from opening
an old record.

Validation/release boundary: source `71c5cba`; focused 3/3, Web 447/447,
workspace lint/typecheck, diff check, and production build pass. Unauthenticated
redirect proof is clean; authenticated browser proof remains blocked by local
Supabase DNS resolution. No hosted data, schema, Railway setting, or Vercel
deployment changed.

## D-153 - Data-quality review is read-only and tenant-repeated (2026-08-04)

Decision: add `/admin/data-quality` as a server-rendered review surface for
duplicate Purchase Order identifiers, gated by `admin.system_config` and
backed by repeated authenticated tenant predicates. It may expose counts,
status buckets, chronological candidates, and links to existing authorized
records, but it may not rename, delete, canonicalize, approve, or finalize
anything.

Reason: the supported Supabase migration is correctly stopped by 12 duplicate
`PO-0002` rows. Giving an owner transparent evidence is useful now; inventing
a repair control would create an unreviewed authority path and risk issued
document history. Group/detail caps and explicit omission counts keep bounded
read performance honest.

Validation/release boundary: source `63bbf22`, evidence `eab1719` pushed to
both target branches; focused/full tests, lint, typecheck, production build,
and authenticated 390px/1440px browser proof pass. GitHub's Railway check is
successful and live `/ready`/`/health` are 200. No database, Storage, provider
variable, or Vercel deployment changed. The next mutation remains the
supported backup + owner-approved repair gate.

## D-152 - Hosted migration reconciliation is a release gate (2026-08-04)

Decision: treat the configured Supabase target as a data-repair and migration
reconciliation gate, not as a place to retry blindly. The first pending source
migration is deliberately stopped by its uniqueness preflight because one
tenant has 12 duplicate `PO-0002` purchase orders. No record may be renamed,
deleted, or made canonical by automation without a recoverable backup, linked
row/audit review, and owner-approved policy. Migration history must remain
provider-managed and ordered.

Reason: applying the 32-file suffix on ambiguous demo records could create a
partial schema, break issued-document references, or make a false production
green signal. The read-only catalog still proves RLS is enabled on all 88
public tables, Storage has one private bucket and 37 objects, and advisor
findings require separate security/performance review.

Validation/release boundary: branch-action logs, migration ledger, table/RLS
catalog, Storage counts, duplicate query, and advisors were read only on
2026-08-04. No hosted SQL, data, Storage, Railway variable, or Vercel setting
changed. Keep mutation flags closed until the ordered gates pass.

## D-151 - Project overview signals stay read-only and tenant-repeated (2026-08-04)

Decision: add the Project Command Center as a server-rendered read surface
over existing construction records. Each signal query repeats both tenant
and project ownership; delivery counts join only tenant/project-owned
purchase orders. The component may link to Checklist, Documents, VOs,
Progress, Deliveries, Audit, Comments, and an explicit Cortex project
context, but it cannot approve, finalize, or mutate an ERP transaction.
Progress dates cross the render boundary as ISO strings and dynamic SQL time
cutoffs are bound as ISO strings. The project tab strip is wrapped in a
width-constrained frame so narrow browsers scroll the strip rather than the
document.

Rationale: construction users need one calm next-move surface without adding
another authority path or hiding tenant boundaries in React. Existing tables
provide enough evidence for a valuable slice; a new schema or direct browser
write would expand risk without measurable value.

Validation and release boundary: source `a225340`; focused 4/4 and full
workspace tests, lint, typecheck, diff check, production build, and
authenticated 390px/1440px browser proof pass. A real local server exception
caused by a Date SQL parameter was fixed and rechecked; final server logs show
HTTP 200 and no runtime error. No hosted SQL, Storage, Railway variable, or
Vercel deployment changed. Keep the hosted reconciliation and spend gates
closed.

## D-150 - Keep Today read-only and policy-gated (2026-08-04)

Decision: build the first BuildOps operating surface from existing authorized
reads. `getTodayCommandCenter` binds task rows to the authenticated tenant and
assignee, and only returns project rows when the existing `/projects` route
policy permits them. The Today component owns presentation and navigation;
Nest/PostgreSQL remain the only future mutation authority, and Cortex links
must pass their own record authorization.

Reason: users need a calmer entry point before more transaction seams move,
but a dashboard must not become a tenant or role bypass. This vertical slice
delivers visible value while preserving the incremental migration boundary.

Validation and release boundary: source
`ab905091ada2f7db927e6cf4c2de687ee2010194`; Web 440/440, lint, typecheck,
build, diff check, and authenticated mobile/desktop browser evidence pass.
CLI E2E is skipped only for the missing local Chromium executable. No hosted
SQL, Storage, Railway variable, or Vercel build changed; keep Vercel
disconnected and all mutation flags closed.

## D-149 - Govern incremental delivery with the BuildOps PRD (2026-08-04)

Decision: adopt `docs/BuildOps_PRD_v1.md` as the active Third-Code-authored
product contract. It consolidates product outcomes, actors, information
architecture, clean-room boundaries, authority/integrity rules, capability
scope, UX/SEO requirements, and the release definition of done. Each future
vertical slice must reference the contract and record its state, evidence,
rollback, and unresolved decision.

Reason: the product goal spans construction depth, multi-business ERP breadth,
AI assistance, and a live migration. A single governing contract keeps the
implementation incremental, prevents ERPNext/Frappe/Rework imitation, and
keeps polished UX from outrunning tenant-safe transaction authority.

Validation: documentation-only M3.40 audit; runtime source scan under
`apps`, `packages`, and `supabase` found no vendor marker; existing landing
browser evidence and M3.39 disposable/provider gates remain unchanged. No
hosted database, Storage, Railway variable, or Vercel deployment changed.

## D-148 - Project creation requires tenant-scoped idempotency (2026-08-04)

Decision: every Nest project-create command must carry a bounded
`Idempotency-Key`. Hash the normalized shared command with SHA-256 and claim a
tenant/key row in `project_create_requests` inside the same PostgreSQL
transaction as the official project insert. A completed row replays its
validated result; a different hash conflicts; an incomplete transaction
rolls back the ledger and project together. Composite tenant foreign keys,
forced RLS, service-only grants, and semantic audit evidence are part of the
contract. The Next adapter generates a stable key but remains disabled by
default; Python cannot approve or finalize the transaction.

Reason: retries, browser refreshes, queue re-delivery, and provider timeouts
must not create duplicate ERP records or allow cross-tenant replay. A durable
database record is stronger than an in-memory or browser-only token.

Validation: source migration clone 87/87; database 306/306 zero-skip lane;
API integration 15 files / 22 tests; focused API 13/13; web adapter 72/72;
lint, typecheck, full serial tests, and production build pass. No hosted
Supabase SQL/data/Storage, Railway variables, or Vercel build changed. Keep
both feature flags closed pending hosted reconciliation and a spend-bounded
canary.

## D-147 - Project creation uses a closed Nest authority seam (2026-08-04)

Decision: introduce `POST /v1/projects` as the future official creation
boundary, with strict shared schemas, `project.create` capability checks,
tenant-scoped transaction context, actor stamping, and audit context. Keep the
Next Server Action as the default path behind an independent adapter flag.
When selected, the adapter must not fall back to a direct browser/server-action
write; the Nest service fails closed unless its server flag and explicit tenant
allowlist are enabled.

Reason: this is the smallest behavior-preserving vertical slice that moves
authority into the modular monolith without a big-bang rewrite. Idempotency,
replay/conflict handling, and two-tenant evidence are not yet present, so
production enablement would be unsafe. Both flags remain false. Supabase and
Vercel were not mutated; the GitHub-connected Railway main push performed the
normal API deployment check (`36530493-b9a9-4c1e-9c7a-dd0671a198ed`, success)
without changing variables.

## D-146 - Diagnose live Vercel incidents before a spend-bounded promotion (2026-08-04)

Decision: treat the live Vercel project as read-only after a billing-limit
incident. Use connector runtime/build evidence and a direct unauthenticated
probe to identify the deployed SHA and failure provenance before any new
build, promotion, or Git reconnection. Keep the source release and Railway
API independently verifiable.

Reason: the reported digest maps to an older Purchase Order enum failure, while
the current hosted enum already contains the missing value. A blind rebuild
could spend more without proving the current failure and could publish a
source/schema combination whose hosted migration ledger is still 55/86.

## D-145 - Fix supplier-issued payload drift with a forward-only constraint migration (2026-08-04)

Decision: preserve the strict supplier-issued outbox contract and add
`20260803170000_purchase_order_supplier_session_payload.sql` after the
session-minting migration. Allow only the required keys plus the optional
`vendor_confirmation_session_id`, whose JSON value must be absent, null, or a
UUID. Do not edit the earlier migration or weaken the check.

Reason: the disposable replay caught a production-relevant mismatch between
the Nest payload schema and PostgreSQL constraint. A forward-only replacement
is replay-safe for fresh clones and existing targets, keeps unknown data out of
durable notification intent, and makes the failure visible before hosted
mutation.

## D-144 - Treat authenticated demo-browser proof as non-production evidence (2026-08-04)

Decision: retain browser E2E coverage for session redirects, API 401 JSON,
private headers, role filtering, graph scope, citation navigation, and
responsive behavior, but classify runs against configured demo Supabase tenant
as evidence only. Promotion still requires isolated two-tenant PostgreSQL/Redis
replay and explicit cross-tenant/citation/redaction/rollback proof.

Reason: one-time auth link proves runtime wiring without proving clean-schema
parity or tenant isolation. Separating evidence classes prevents successful
demo click-through from authorizing pending hosted migration suffix.

## D-143 - Gate browser ERP modules by exact route segments (2026-08-04)

Decision: centralize browser-rendered protected prefixes and require an exact
segment match. Include Cortex, finance, and inventory with existing dashboard
modules. Keep `/api/*` outside redirect matching so API callers receive typed
authorization responses from their handlers.

Reason: `/cortex` previously reached its server component without middleware
session gating, and finance/inventory had the same drift. A shared segment-safe
contract prevents unauthenticated route rendering without weakening existing
tenant/RBAC checks or turning API errors into login HTML.

## D-142 - Make authenticated Cortex responses private and non-cacheable (2026-08-04)

Decision: apply `Cache-Control: private, no-store, max-age=0` and `Vary: Cookie`
to every authenticated Cortex route response, including authorization,
validation, and server-error paths. Keep streaming bodies, citation headers,
request contracts, and Nest/PostgreSQL authority unchanged.

Reason: Cortex responses can contain tenant-scoped records and citations.
Route-specific cache behavior (notably graph's private fifteen-second cache)
creates an avoidable shared-cache/privacy risk. A single immutable transport
contract is easier to test and audit while preserving the existing permission
model and avoiding a schema or business-logic rewrite.

## D-141 - Keep public Cortex preview read-only (2026-08-04)

Decision: demonstrate Cortex on the marketing page with bounded sample
questions, deterministic answer/source states, and no network or ERP mutation.
Expose state through `aria-pressed` and `aria-live`; reserve real retrieval,
citations, permissions, and approvals for the authenticated Cortex surface.

Reason: the landing page must explain the AI brain without implying that an
anonymous visitor can inspect tenant data or finalize a transaction. A local
preview improves comprehension while preserving the Nest/PostgreSQL authority
boundary and keeping marketing interaction independent from hosted DB state.

## D-140 - Reconcile the complete migration ledger before hosted apply (2026-08-04)

Decision: treat the 55-row hosted Supabase ledger and 85-file source ledger as
an exact-prefix drift, not as permission to apply the final source file or
rewrite migration history. Restore the target into an isolated PostgreSQL 17
clone, replay the complete source ledger, compare catalog/data/RLS state, and
author one forward-only reconciliation migration for any remaining drift.

Reason: the 30-file suffix includes constraint replacement and transaction
boundaries that cannot be proven safe from source inspection alone. Backup,
Storage, duplicate-record, audit-recovery, rollback, integration, owner,
provider, and spend evidence must exist before a production mutation. This
keeps PostgreSQL authoritative, preserves tenant isolation, and prevents an
irreversible hosted deploy from masking an unknown target state.

## D-139 - Reconstruct supplier links only at gated email send time (2026-08-04)

Decision: let the existing supplier-email worker derive a confirmation URL in
memory only when the link-delivery flag and public-write flag both authorize
the same tenant. Verify the session belongs to that tenant and Purchase Order,
is pending, and has not expired; use the server-only HMAC secret and an HTTPS
API origin. Persist neither the URL nor the raw token.

Reason: the outbox remains a redacted durable intent, provider retries remain
idempotent, and a misconfigured or closed public route cannot result in a dead
supplier link. The source seam is independently disabled until hosted schema,
provider, rollback, and spend evidence clears.

## D-138 - Mint supplier sessions without persisting raw tokens (2026-08-03)

Decision: at authorized `scm_issue`, optionally create one tenant-scoped
pending supplier-confirmation session associated with the durable workflow
request. Derive the public token from the random session UUID, tenant UUID, and
a server-only HMAC secret; persist only the SHA-256 hash. Put only the session
UUID in the supplier-issued outbox payload. Keep the session flag, tenant
allowlist, and secret closed/unset by default; do not add a public link to the
existing supplier email in this slice.

Reason: deterministic derivation lets a future delivery worker reconstruct a
link without storing a bearer secret in PostgreSQL or outbox JSON. The
workflow-request association and pending-PO uniqueness make retries safe while
preserving the existing SCM status, supplier-email retry, and delivery
behavior. Link delivery requires its own provider, expiry, rollback, and
spend-bounded evidence.

## D-137 - Keep supplier confirmation independent from fulfillment (2026-08-03)

Decision: add a closed-by-default
`POST /v1/public/purchase-orders/:token/confirmation` NestJS command backed by
tenant-scoped hashed sessions and a durable replay ledger. Accept, decline, or
request-changes is persisted with responder metadata and nullable-actor audit
inside one transaction. The command requires an issued Purchase Order but does
not change its delivery, receipt, inventory, or payment state. Session minting
and email-link delivery remain a separate follow-on slice.

Reason: a supplier acknowledgement is an external response, not fulfillment
evidence. Keeping the state machine separate prevents a public link from
creating stock, delivery, or financial effects, while preserving replay safety,
tenant isolation, expiry/revocation controls, and the existing supplier email
retry path.

## D-136 - Maintain a clean-room capability baseline before breadth (2026-08-03)

Decision: use `docs/architecture/CAPABILITY_MATRIX.md` as the product-scope
baseline for construction parity and multi-business expansion. Measure
capability by user outcome, state machine, invariant, authority boundary, and
release evidence rather than by route count or visual similarity. The next
bounded source slice is a closed-by-default, token-authorized supplier
confirmation command for an issued Purchase Order.

Reason: the existing construction spine is broad enough that a big-bang module
catalog would increase complexity and hosted migration risk. A capability
matrix exposes the one missing Rework-aligned handoff without inventing
requirements, copying another system's internals, or weakening tenant,
permission, audit, idempotency, and rollback controls. The supplier decision
must remain independent from delivery, inventory, and payment state.

## D-135 - Route public client signing through Core with durable replay (2026-08-03)

Decision: add a closed-by-default `POST /v1/public/signatures/:token`
NestJS command. The hashed signing token is the only unauthenticated
authority. NestJS derives tenant and source scope from a locked session,
validates bounded PNG data, uploads through the service-role Storage adapter,
creates the signature document, stamps the tenant-owned source, persists a
service-only replay result, and writes nullable-actor semantic audit in one
transaction. A matching processing/succeeded replay row prevents cleanup from
deleting an object that may already be owned by another attempt. Next.js
remains a compatibility adapter with a stable retry key; selected Core
failures never fall through to a direct database write. The migration and
selectors remain false/empty until hosted parity, disposable replay/expiry/
revocation/source-stamp proof, rollback, provider-identity, owner-input, and
spend gates clear.

Reason: external signatures are official ERP approvals even though the signer
has no account. A token-derived, tenant-scoped transaction preserves the
existing portal UX while removing browser-side authority from the canary path,
preventing duplicate commits, cross-tenant source stamping, unaudited
approval, and unsafe concurrent Storage cleanup.

## D-134 - Route document deletion through Core with durable replay (2026-08-03)

Decision: add a closed-by-default `DELETE /v1/documents/:documentId` NestJS
command. NestJS derives tenant and actor from a locked membership, rechecks
`document.manage`, refuses deletion when processing history exists, removes
derived scope rows and the document in one transaction, stores a
tenant-scoped replay result, and writes semantic audit. Next.js remains a
compatibility adapter with a stable retry key; selected Core failures never
fall through to a second write. The migration and selectors remain false/empty
until hosted schema parity, disposable integration, rollback, duplicate-data,
audit-chain, provider-identity, and spend gates clear.

Reason: deleting a source document can remove derived scope evidence and has
irreversible Storage consequences. A server-owned transaction plus durable
replay prevents cross-tenant deletion, duplicate retries, loss of processing
history, and unaudited mutation while preserving the existing UI and safe
legacy path for unselected tenants.

Publication note: source checkpoint `5ad72ec` is published to both target
branches under `kurtgav <kurtgavin.design@gmail.com>`. This does not authorize
hosted migration or deployment; the ordered migration, data, rollback, and
provider readiness gates remain mandatory.

## D-133 - Route cash draft mutations through Core with durable replay (2026-08-03)

Decision: add closed-by-default NestJS commands for cash draft create/update
and delete. NestJS derives tenant and actor from a locked membership,
rechecks `finance.manage_cash`, validates tenant-owned Cash Accounts and open
allocation targets, commits draft rows and allocations in one transaction,
stores a tenant-scoped idempotency result, and writes semantic audit. The
replay ledger intentionally keeps deleted target UUIDs. Next.js remains a
compatibility adapter with stable retry keys; selected Core failures never
fall through to a second write. The migration and selectors remain
false/empty until hosted parity, disposable integration, rollback,
duplicate-data, audit-chain, provider-identity, and spend gates clear.

Reason: draft cash evidence is mutable but still affects the official
financial workflow and later posting. A server-owned transaction boundary
prevents cross-tenant target references, duplicate retries, unaudited deletes,
and browser-side authority while preserving the existing UI and safe legacy
path during the strangler migration.

## D-132 - Route draft customer-invoice cancellation through Core (2026-08-03)

Decision: add closed-by-default
`POST /v1/finance/customer-invoices/:invoiceId/cancel`. NestJS derives tenant
and actor from a locked membership, rechecks `finance.issue_invoice`, locks the
invoice, claims a separate tenant-scoped idempotency ledger, reuses the
existing `cancel_customer_invoice` database function for state authority, and
writes semantic audit in the same transaction. Next.js remains a compatibility
adapter with a stable retry key; selected Core failures never fall through to a
second write. The migration and selectors remain false/empty until hosted
parity, disposable integration, rollback, duplicate-data, audit-chain, and
provider-identity gates clear.

Reason: draft cancellation changes official invoice state even though it does
not post a journal. It therefore needs the same tenant lock, capability check,
replay safety, audit attribution, and database transaction boundary as posting
and reversal. A separate ledger prevents idempotency keys from colliding
across distinct invoice operations.

## D-131 - Route customer-invoice reversal through Core with a durable replay boundary (2026-08-03)

Decision: add closed-by-default
`POST /v1/finance/customer-invoices/:invoiceId/reverse`. NestJS derives tenant
and actor from a locked membership, rechecks `finance.issue_invoice`, locks the
invoice, claims a tenant-scoped idempotency ledger, reuses the existing
`reverse_customer_invoice` database function for journal/state authority, and
writes semantic audit in the same transaction. Next.js remains a compatibility
adapter with a stable retry key; selected Core failures never fall through to a
second write. The migration and selectors remain false/empty until hosted
parity, disposable integration, rollback, duplicate-data, audit-chain, and
provider-identity gates clear.

Reason: PostgreSQL already owns reversal journal balancing, fiscal-period
validation, receipt-allocation safeguards, and invoice state. Reusing it avoids
duplicate accounting logic while moving authorization, replay safety, tenant
isolation, and audit orchestration into the modular Nest boundary. A durable
tenant-scoped result also makes retries safe without exposing authority fields
to the browser.

## D-130 - Publish reviewed source with an identity-verified fast-forward

Decision: publish reviewed ERP source only after confirming the exact GitHub
repository, active `kurtgav` identity, remote base SHA, and clean local tree.
Use a non-forced fast-forward push to both the default branch and the reviewed
working branch. A successful source push does not authorize Supabase migration,
Railway release, Vercel build, feature-flag enablement, or hosted-data changes.

Reason: source publication and hosted promotion have different risk and billing
surfaces. Separating them preserves rollback, prevents accidental account or
fork writes, and keeps production gates explicit when hosted schema/data parity
is unresolved.

## D-129 - Reuse the database receivables function behind Core invoice issuance

Decision: add the closed-by-default
`POST /v1/finance/customer-invoices/:invoiceId/issue` command. NestJS derives
tenant and actor, rechecks `finance.issue_invoice`, locks membership and the
invoice, claims a tenant-scoped idempotency ledger, calls the existing
`issue_customer_invoice` function, stores a strict result, and writes semantic
audit in the same transaction. Next.js remains a compatibility adapter with
one stable retry key; selected Core failures never fall through to a second
write. Invoice cancel and reversal remain separate legacy paths in this
slice.

Reason: PostgreSQL already owns customer receivables journal balancing,
numbering, fiscal-period validation, and invoice state. Reusing that function
avoids duplicate accounting logic while moving authorization, replay safety,
tenant isolation, and audit orchestration into the modular Nest boundary. Keep
the migration and selectors false/empty until hosted parity, disposable
integration, rollback, duplicate-data, audit-chain, and provider-identity
gates clear.

## D-128 - Reuse database cash functions behind a Core command

Decision: add closed-by-default NestJS commands for cash posting and reversal.
NestJS derives tenant and actor, rechecks `finance.manage_cash`, locks the
tenant membership and cash transaction, claims a shared tenant-scoped
idempotency ledger, calls the existing `post_cash_transaction` or
`reverse_cash_transaction` function, and audits the status change in one
transaction. Next.js remains a compatibility adapter with stable retry keys;
selected Core failures never fall through to a second write.

Reason: PostgreSQL already owns balanced cash journals, numbering, allocation
validation, and reversal invariants. Reusing those functions avoids duplicate
accounting logic while moving authorization, replay safety, and audit
orchestration into the modular Nest boundary. Keep the migration and both
selectors disabled until hosted parity, disposable integration, rollback,
duplicate-data, audit-chain, and provider-identity gates clear.

## D-127 - Route supplier-bill reversal through Core

Decision: add `POST /v1/finance/supplier-bills/:supplierBillId/reverse` as a
closed-by-default NestJS command. NestJS derives tenant and actor, rechecks
`finance.post`, locks membership and the bill, calls the existing
`reverse_supplier_bill` database function, stores a strict result in a
tenant-scoped idempotency ledger, and writes semantic audit in the same
transaction. The Next Server Action is a compatibility adapter with one stable
retry key; selected Core failures never fall through to a second write.

Reason: the database function already owns the balanced reversal journal
effect. Wrapping it in the Core authority adds authorization, retry safety,
tenant isolation, and audit without duplicating accounting rules or changing
the visible UI. Keep all reversal controls false/empty until the ordered
hosted migration suffix, duplicate-data review, audit-recovery input,
disposable integration, rollback, and spend gates clear.

## D-126 - Treat provider readiness as necessary, not sufficient

Decision: a green Railway/Vercel readiness response never authorizes a hosted
release by itself. The controlled release gate must also clear migration
parity, duplicate Purchase Order review, audit-chain tenant approval,
integration evidence, exact source identity, rollback, and spend controls.
Keep Vercel Git deployment disabled and do not create preview builds while any
gate is unresolved.

Reason: the 2026-08-03 recheck returned healthy providers while Supabase was
still 55/75 migrations and the Railway CLI was unauthorized under the requested
`kurtgav` identity. Separating liveness from release authorization prevents a
healthy but unreviewed artifact or wrong-account deployment.

## D-125 - Reuse the database payable function behind a Core supplier-bill command

Decision: add `POST /v1/finance/supplier-bills/:supplierBillId/post` as a
closed-by-default NestJS command. The browser sends only `postingDate`; NestJS
derives tenant and actor, rechecks `finance.post`, locks the draft bill, calls
the existing database `post_supplier_bill` function, stores a strict result in
a dedicated tenant-scoped idempotency ledger, and writes semantic audit in the
same transaction. The Next Server Action remains a compatibility adapter;
supplier-bill reversal is not moved in this slice.

Reason: the database function already owns balanced payable/journal posting,
so wrapping it in one server transaction moves authorization, retry safety, and
audit authority without duplicating accounting rules or introducing a second
financial posting implementation. Keep all controls false/empty until the
ordered hosted migration suffix, duplicate data review, audit-recovery input,
and disposable integration gates clear.

## D-124 - Reuse the delivery workflow ledger for site-preparation completion

Decision: add `complete_site_preparation` to the existing
`delivery_workflow_action` enum and expose
`POST /v1/procurement/deliveries/:deliveryScheduleId/site-preparation/complete`
as a closed-by-default NestJS command. The browser sends only bounded notes
and an opaque idempotency key. NestJS derives tenant and actor, rechecks
`delivery.receive`, locks the `site_preparing` schedule, writes preparation
timestamps/actor/notes, stores the exact replay result, and writes semantic
audit in one transaction.

Reason: site readiness is an official workflow transition. Keeping the
schedule evidence and status change behind one server transaction prevents
partial preparation records and duplicate clicks while preserving the current
Next action for tenants not selected for cutover. Do not apply the migration
alone; it belongs to the ordered hosted suffix after the existing delivery
ledger migration.

## D-123 — Reuse the delivery workflow ledger for site-preparation start

Decision: the `scheduled -> site_preparing` transition uses the existing
tenant-scoped `delivery_workflow_requests` idempotency ledger and adds only the
`start_site_preparation` action value. NestJS locks tenant membership and the
delivery row, derives the actor from PostgreSQL, commits the state change and
semantic audit event in one transaction, and replays only a strict stored
result. The Next adapter sends an opaque retry key and fails closed when its
exact tenant canary is not enabled.

Reason: one ledger and one transaction boundary prevent duplicate workflow
effects while keeping the migration incremental. Do not apply this migration
alone to a hosted database that has not been reconciled through its preceding
ledger migrations.

## D-001 — Incremental modular monolith

Decision: keep Next.js and introduce one NestJS deployment as the core ERP
transaction authority. Do not perform a big-bang rewrite or split business
modules into microservices.

Reason: preserves working behavior and supports cross-module transactions while
making authority boundaries explicit.

## D-002 — PostgreSQL is the source of truth

Decision: official records, workflow state, audit evidence, and integrity
constraints live in PostgreSQL. Caches, queues, search indexes, and AI outputs
are rebuildable projections or evidence.

## D-003 — NestJS owns official sensitive writes

Decision: migrated commands are authorized and committed by NestJS. Next.js
adapts existing UI contracts; the browser never writes sensitive tables
directly.

## D-004 — Python is analysis-only

Decision: Python may parse, extract, forecast, analyze, or render documents. It
may not approve or finalize an ERP transaction.

## D-005 — Tenant and actor derive server-side

Decision: never accept tenant or actor identity in a business command. Verify
the Supabase bearer token, then load active tenant membership and role from
PostgreSQL.

## D-006 — Transactional audit attribution

Decision: stamp verified actor claims inside the same PostgreSQL transaction as
the mutation so database triggers produce attributable audit evidence. Do not
rely on a second best-effort audit write.

## D-007 — Feature-flagged compatibility adapters

Decision: each migrated Server Action keeps its external behavior and selects
the Nest path only when a server-side flag is enabled. An ambiguous Nest
failure never falls through to a duplicate legacy write.

## D-008 — Strict shared contracts

Decision: use shared strict Zod command/result schemas across the Next adapter
and Nest boundary. Reject unknown fields rather than silently stripping
attacker-controlled input.

## D-009 — Optimistic concurrency for editable records

Decision: editable commands include the last observed version/timestamp and
reject stale writes. Higher-risk workflows will use explicit state versions and
idempotency keys.

## D-010 — Clean-room product implementation

Decision: external ERP products may inform general capability research only.
Do not copy code, schema, UI, text, branding, tests, documentation, or internal
structure.

## D-011 — Disposable integration evidence

Decision: database integration tests run inside a transaction that always
rolls back and are enabled only in the clean PostgreSQL 17 CI job. Container
readiness uses the disposable database and real Redis. Do not probe official
transaction writes against a configured remote database.

## D-012 — Database drift is a release gate

Decision: a target database must exactly match the reviewed migration ledger
before a migrated Nest command can be enabled. Database drift is reported; it
is never repaired automatically during an application release.

## D-013 — Non-linear history uses reconciliation

Decision: when later migrations are applied after a missing version, do not
replay historical files directly. Restore the target into an isolated clone,
diff it against the clean PostgreSQL 17 target, and create one reviewed
forward-only reconciliation migration. Repair ledger history only after
catalog and data equivalence are independently proved.

## D-014 — Database and Storage recovery are separate

Decision: platform database backup/PITR is the database recovery authority;
encrypted logical dumps are supplemental. Storage objects require a separate
inventory and recovery artifact because database restore covers Storage
metadata, not deleted objects.

## D-015 — pnpm workspace configuration is authoritative

Decision: with pnpm 10, root dependency overrides and peer-dependency policy
live in `pnpm-workspace.yaml`, not the ignored `package.json#pnpm` field.
Frozen install plus an unchanged lockfile hash is required evidence for
configuration-only moves.

Reason: a stale lockfile can hide ignored policy until a future dependency
resolution silently changes the graph.

## D-016 — Authorized hosted-database reconciliation

Decision: the explicit production database authorization was executed only
after a dry run, version inventory, SQL review, and business baseline capture.
The 23 missing versions were applied in order, followed by one forward-only
security hardening migration. Catalog verification and unchanged row/monetary
baselines are required evidence.

Deviation: this release did not have the previously preferred restored-clone
rehearsal. The absence of that rehearsal remains a process gap; successful
production application and catalog checks do not erase it.

## D-017 — Database tests require explicit disposable configuration

Decision: database tests never discover `DATABASE_URL` from repository-local
application environment files. A caller or CI job must explicitly inject the
disposable database URL and expected-schema flags. Rollback-only tests are
still writes and must not target a hosted application database by accident.

## D-018 — Migration tooling uses PostgreSQL session mode

Decision: Supabase migration commands use the direct/session-mode port 5432.
Transaction-mode port 6543 is not used for migrations because prepared
statements are unsupported there and produced a pre-execution collision.

## D-019 — Release identity is explicit

Decision: GitHub pushes, commit attribution, Railway deployment, and Vercel
deployment use `kurtgav` / `kurtgavin.design@gmail.com`. Provider identity and
release SHA are verification evidence, not incidental metadata.

Reason: Vercel correctly blocked a current-main deployment before build when
the historical commit mapped to `thirdcodekurt`, who is not a member of the
authorized Vercel team.

## D-020 — Deploy infrastructure before enabling transaction migration

Decision: the Railway NestJS API and Redis may be deployed and health-checked
while `ERP_PROJECT_WRITES_VIA_API` remains false. The flag can change only
after live Auth, permission, tenant-isolation, stale-write, audit, and rollback
evidence passes.

Reason: infrastructure availability is not proof that official ERP
transactions are ready to move.

## D-021 — Analytics must fail cleanly

Decision: production telemetry is enabled at the Vercel project boundary and
must load without generating browser errors. Analytics remains observational;
it cannot authorize or mutate ERP records.

Reason: shipping a client integration that predictably returns 404 creates
noise that can conceal real frontend failures.

## D-022 — Do not assume one UUID version for existing records

Decision: API path validation accepts any syntactically valid UUID already
allowed by PostgreSQL. Tenant-scoped lookup, authorization, and record
existence determine access. Malformed values still fail at the boundary.

Reason: production contains a valid legacy Project identifier whose version
nibble is not v4. Enforcing v4 rejected an existing record before tenant
isolation could execute.

## D-023 — Hosted authorization proof must be non-mutating

Decision: production Auth/capability/tenant tests use short-lived one-time
sessions and guaranteed failure paths. Capture target rows and audit state
before and after; equality is required.

Reason: production authorization evidence is necessary, but production
business records are not test fixtures.

## D-024 — Correlate commands without logging business context

Decision: Next generates a UUID for each migrated command. Nest validates or
replaces it, echoes it as `x-request-id`, and records one structured outcome.
Allowed fields are event, request ID, operation, method, status, outcome, and
duration. Authorization headers, payloads, raw URLs, tenant/user IDs, and
record IDs are forbidden.

Reason: operators need a stable cross-service handle, but runtime logs must not
become a second store of credentials or sensitive ERP data.

## D-025 — Rollback selection is exact and independently tested

Decision: only the literal value `ERP_PROJECT_WRITES_VIA_API=true` selects
Nest. Unset, empty, `false`, and differently cased values keep the legacy
Server Action. Tests exercise both branches without a hosted write.

Reason: fail-closed parsing makes a misconfigured rollback return to the
known legacy path instead of silently enabling a migrated transaction.

## D-026 — Hosted transaction proof uses reversible demo data

Decision: after no-write authorization boundaries pass, a migrated command
requires one controlled hosted transaction against explicitly designated demo
data. Capture the complete mutable record and tenant audit tail immediately
before the command, change one non-critical field through Nest, verify the
committed result and audit chain, then restore the exact business values
through a second authorized Nest transaction. Append-only audit history and
the expected `updated_at` advance are retained.

Reason: compilation and denial paths do not prove that the deployed
transaction authority can commit, attribute, correlate, and recover a real
ERP command. Reversible demo data provides that evidence without enabling the
Web migration flag or directly editing the database.

## D-027 — Project-write cutover requires two server-side gates

Decision: `ERP_PROJECT_WRITES_VIA_API=true` is necessary but insufficient.
The authenticated user's database-derived tenant must also match
`ERP_PROJECT_WRITES_VIA_API_TENANT_IDS`. Missing, empty, malformed, or
non-matching allowlists fail closed. `*` is accepted only as the sole entry
for a separately approved all-tenant rollout.

Reason: one global Boolean cannot perform a controlled tenant canary. Enabling
it would move every tenant at once and defeat the required blast-radius and
rollback controls.

## D-028 — Native disposable evidence supplements exact container parity

Decision: when host virtualization is unavailable, an isolated imported WSL1
distribution may run disposable PostgreSQL 17 and Redis for clean migration
replay, fail-closed database tests, and Nest integration. The lane must use a
dedicated database, contain no hosted credentials, and be destroyed or rebuilt
between replay proofs. It does not satisfy the final pinned Supabase
PostgreSQL/Redis CI gate.

Reason: production data must never become a test fixture. Native disposable
evidence shortens the feedback loop and exposed real migration/function
defects, while the pinned CI lane remains authoritative for platform parity.

Outcome: the lane found four production-relevant function defects before
release. Clean-local and hosted function fingerprints match after the
forward-only migration release; the production feature flag remains disabled.

## D-029 — Release tooling must be immutable

Decision: CI downloads Actionlint from a versioned release and verifies the
exact Linux archive SHA-256 before extraction. A mutable upstream branch
bootstrap script is not permitted for a release gate.

Reason: pinned workflow actions do not make CI reproducible when a shell step
still executes mutable remote code. Version and digest pinning makes the
reviewed tool artifact explicit and fail closed.

## D-030 — Watched-path skips retain the last runtime artifact

Decision: a commit outside a deployable service's reviewed watch set does not
force a redundant runtime rebuild. Release evidence records the provider's
skip event, the skipped repository SHA, the retained runtime artifact SHA, and
live readiness. Commits that affect the service must still deploy and match
the reviewed source SHA exactly.

Reason: a monorepo documentation or CI-only commit can legitimately produce
different repository-head and backend-runtime SHAs. Hiding that difference or
claiming a skipped event as a deployment would weaken release traceability.

## D-031 -- Database enum catalogs are application contracts

Decision: every persisted enum consumed by application queries or workflow
code is a versioned contract. Clean replay and hosted release verification
must assert the exact canonical labels and ordering. Additions use
forward-only migrations; production labels are never removed as an emergency
rollback.

Reason: TypeScript/schema agreement did not prove the hosted PostgreSQL
catalog was current. The missing `partial_delivered` label passed compilation
and caused a production Server Component failure. Catalog assertions catch
that drift before deployment without mutating business data.

## D-032 -- Database incident closure requires affected-route proof

Decision: a hosted database repair is not closed by catalog inspection alone.
Re-execute the affected authenticated route with a hard reload, verify its
critical rendered regions and browser console, then reconcile provider
runtime requests and error clusters for the same release window.

Reason: a successful SQL probe proves the repaired contract but not the full
Server Component, authentication, rendering, and production-observability
path that users exercise.

## D-033 -- Short-lived self-hosted CI is the no-cost M1 runner

Decision: while GitHub-hosted jobs are blocked by organization billing, the
authoritative M1 application-schema gate may run on a repository-scoped,
short-lived Windows runner supplied by the developer. The workflow is manual,
private-repository only, restricted to `kurtgav`, read-only to repository
contents, and receives no production secrets. It runs PostgreSQL 17 and exact
Redis 7.4.9 inside the isolated `ThirdCodeERP-Test` WSL1 distribution, uses a
dedicated disposable database, uploads no artifacts, and removes the runner
registration and work directory after the job.

The lane is valid only when it replays the complete migration history, executes
all database tests with zero skips, proves deterministic schema state, runs the
Nest transaction integration and production smoke, passes the remaining static
and build gates, and is reconciled with the hosted Supabase ledger/catalog.
The Docker/Supabase-container lane remains an equivalent future gate.

Reason: GitHub documents self-hosted runners as free to use, while current paid
hosted jobs are rejected before any step executes. Requiring payment or working
hardware virtualization adds no application correctness evidence. The
short-lived, reviewed-code-only boundary limits local-machine exposure without
weakening the actual release checks.

## D-034 -- Vercel releases are explicit and single-artifact

Decision: disable Vercel Git auto-deploy for this project. Git pushes are source
publication, not deployment authorization. A frontend release occurs only after
the exact SHA passes CI and a production deployment is explicitly approved.
Do not create a duplicate feature-branch preview for a SHA already validated
locally. Prefer promoting an already validated deployment over rebuilding it.

Reason: synchronized pushes to `main` and the feature ref generated two Vercel
builds per commit, including CI-only and documentation-only changes. The project
has exhausted included credit and entered on-demand billing. Explicit releases
reduce compute use and make the deployment decision auditable.

## D-035 -- Self-hosted verification does not upload dependency caches

Decision: omit `cache: pnpm` from `actions/setup-node` in the transient
self-hosted workflow. The developer-owned machine already retains its pnpm
store; the workflow uploads no dependency cache and no artifacts.

Reason: run `30421480977` passed every substantive verification step, then
stalled in setup-node's post-job cache upload. Remote caching adds storage and
network use without improving correctness or the persistent local runner's
dependency availability. Follow-up run `30422175962` completed all gates and
post-job actions successfully in 5m33s with remote caching disabled.

## D-036 -- M1 uses a clean dedicated canary tenant

Decision: do not enable Project routing for an existing tenant whose complete
audit chain fails predecessor or hash verification. Do not delete, update,
re-hash, checkpoint around, or otherwise conceal historical append-only
evidence. Provision one dedicated canary tenant through a reviewed supported
onboarding path. It must have an active Supabase Auth identity, an authorized
same-tenant application user, a reversible E2E Project, and a genesis-rooted
chain that passes the read-only planner before provider configuration changes.

Reason: the primary demo tenant has suitable users and Projects but two
historical predecessor mismatches and 151 historical hash mismatches. The only
currently clean QA tenant has no user or Auth identity. Weakening the gate would
turn an audit-integrity defect into accepted rollout policy; rewriting history
would destroy evidence. A dedicated canary creates the smallest trustworthy
boundary without changing production transaction rules.

## D-037 -- Canary provisioning uses normal product onboarding

Decision: create the dedicated M1 identity through `/auth/signup`, complete
email confirmation, and create its non-critical Project through the
authenticated product UI. Do not provision the canary by direct SQL, by
writing `auth.users`, or through a one-off service-role script.

Reason: the deployed Auth trigger already atomically creates an isolated tenant
and same-ID Admin profile for a new Auth identity, and the existing Project
flow creates the audit root. Exercising normal product paths proves the
customer onboarding boundary and avoids privileged data repair disguised as
test setup. The only external prerequisite is an unused user-controlled email
whose confirmation is explicitly authorized.

## D-038 -- Harden privileged signup provisioning before canary use

Decision: retain the Auth trigger as the atomic tenant/Admin bootstrap, but run
its `SECURITY DEFINER` function with an empty `search_path`, fully qualify every
relation and built-in, bound display metadata to column limits, generate a
deterministic bounded tenant slug, and revoke direct execution from `PUBLIC`,
`anon`, and `authenticated`. Treat `raw_user_meta_data` only as display input;
never use it for role or capability decisions.

Reason: `supabase_auth_admin` needs a definer function to create application
rows, while an ambient path would broaden privileged name resolution. The
normal signup trigger can block account creation if it fails, so its complete
behavior must replay against PostgreSQL and be exercised in database tests
before creating the dedicated canary.

## D-039 -- Organization type is profile data, never authority

Decision: persist signup `organization_type` on the tenant only after
normalizing it to the shared product catalog. Enforce the catalog with a
validated database check constraint and use `other` for missing or unknown
values. Never derive role, capability, membership, approval authority, or
tenant access from this user-editable field.

Reason: the signup UI already required business classification, but the
provisioning trigger discarded it. Persisting constrained profile context
improves onboarding continuity without creating a metadata-to-authorization
escalation path. One shared catalog plus database enforcement prevents UI,
application, and hosted-schema drift.

Validation: migration `20260729054456` is hosted and current at 50/50;
PostgreSQL 17 clean replay passes; 220/220 database tests run without skips;
existing identity and tenant counts are unchanged; hosted function privileges
and trigger state remain hardened.

Rollback: do not edit applied history or delete tenant data. Disable public
signup if provisioning regresses, then apply a reviewed forward compensation
that restores the prior trigger body while retaining or safely deprecating the
additive profile column.

## D-040 -- Owner-approved architecture supersedes stale bootstrap guidance

Decision: when repository bootstrap guidance conflicts with the explicit
owner-approved course correction and maintained architecture documents, use the
current architecture documents. Do not implement obsolete tRPC, PostgreSQL 16,
pnpm 9, or Inngest-as-target rules. Do not rewrite `AGENTS.md` without the
owner sign-off that file requires.

Reason: `AGENTS.md` references a missing
`docs/Third Code ERP_PRD_v1.md` and predates the approved Next.js, NestJS,
PostgreSQL 17, Redis/BullMQ, and Python-analysis-only architecture. Allowing it
to redirect new work would reintroduce explicitly rejected architecture.

Validation: repository dependency manifests, deployed topology, hosted database,
and maintained architecture documents all match the newer architecture.

Rollback: revert this documentation decision only together with an approved,
internally consistent replacement governance set. Runtime state is unaffected.

## D-041 -- Correct the landing incrementally and scope Vercel telemetry

Decision: preserve the accepted public landing architecture and apply a
targeted responsive/accessibility correction. At 390px, render the hero as
three non-wrapping text lines, hide its decorative inline micro-image, remove
decorative ordinals, and enforce 44px visible interaction targets. Render
`@vercel/analytics` only when `VERCEL=1`; use responsive-image fetch priority
instead of duplicate preload hints.

Reason: live browser measurement proved six hero lines and undersized mobile
targets, contradicting the landing specification and GPT Taste constraints.
A full redesign would add risk without improving the accepted desktop system.
Unconditional Vercel telemetry also creates false console failures in local or
alternative-host production artifacts.

Validation: require optimized production build success; exact H1 line-box
measurement at 1440, 768, and 390; zero horizontal overflow; zero decorative
ordinal labels; no visible mobile target below 44px; working accordion and FAQ;
valid JSON-LD; and zero browser console errors or warnings.

Rollback: revert the landing component, CSS module, and conditional analytics
render together. No data or provider rollback is required. Existing Vercel
production remains unchanged until a separately approved deployment.

## D-042 -- Document processors produce evidence, not transactions

Decision: document-processing authority moves incrementally to NestJS. BullMQ
jobs contain only an opaque job ID. NestJS reloads authoritative tenant,
Project, document, actor, and Storage context from PostgreSQL. Python receives a
short-lived exact-object read grant and returns bounded, versioned, hash-linked
evidence without database or Storage service-role credentials. NestJS alone
validates and commits pending-review scope rows inside an actor-stamped,
idempotent transaction.

Reason: current Python path accepts caller-supplied authority and writes
`scope_items` directly. Current Next.js paths also duplicate writes, retries,
and draft-BOM creation without durable processing state. Hosted catalog
inspection confirms missing composite tenant/Project constraints and audit
triggers on `documents` and `scope_items`.

Validation: require same-tenant composite constraints, evidence immutability,
explicit capability tests, duplicate/retry proof with real Redis, atomic
database integration with zero skips, Python credential-removal tests,
compatibility response and browser proof, and an authorized reversible canary.

Rollback: keep new route flag false and tenant allowlist empty, stop queue
consumption, preserve job/evidence/audit records, and retain legacy path.
Applied schema rollback is a reviewed forward compensation; immutable evidence
and audit rows are never deleted.

## D-043 -- Uploads prove same-tenant Project access before side effects

Decision: upload sign and complete routes must load Project with both
authenticated tenant and requested Project ID before quota, Storage,
document-recording, parsing, AI, or queue work. Missing and cross-tenant
Projects return the same 404 response.

Reason: storage-path prefix validation proves string shape, not Project
ownership. Independent tenant and Project foreign keys also do not prove both
records belong together. Shared `getProject` compounded the gap by querying
only tenant and comparing requested ID against one returned row.

Validation: require exact generated SQL predicates for tenant and Project ID,
cross-tenant denial tests for both routes, valid same-tenant compatibility
tests, full type/lint/test/build gates, and final live authenticated proof after
an explicitly approved deployment.

Rollback: revert shared query, two route guards, and their tests together.
No database or provider rollback is needed for source-only work. If deployed,
promote last known-good Vercel artifact; never disable tenant checks to recover
an unrelated upload failure.

## D-044 -- Document mutations require capability and atomic audit

Decision: define `document.manage` as the server-enforced authority for signed
upload, document creation, and document deletion. Grant it to operational
roles and keep `viewer` read-only. Audit signed credential issuance before
returning it. Commit official document creation or deletion and the
corresponding hash-chain audit entry in the same PostgreSQL transaction.
Delete derived document scope rows in the deletion transaction. Start
non-transactional object cleanup only after the database commit succeeds.

Reason: authentication and tenant derivation do not prove mutation authority.
Unaudited document changes violate the product authority boundary. Removing a
Storage object before independent database deletes can also create a broken
live record when a later write fails.

Validation: require actual capability-matrix tests, missing-capability denials
before side effects, tenant-and-Project-bound document lookup, audit-failure
rollback tests, proof that Storage cleanup follows the audit transaction, full
lint/typecheck/test/build gates, and authenticated live proof only after an
explicitly approved consolidated deployment.

Rollback: revert the capability, route/action guards, transactional audit
helper, and tests together. No schema or provider rollback is required for the
source candidate. If deployed, promote the prior Vercel artifact; do not grant
mutation authority to `viewer` as an outage workaround.

## D-045 -- Cortex entity behavior comes from one exhaustive registry

Decision: define every versioned Cortex node type once with its display label,
color, role access path, permitted source table, and canonical record route.
Derive graph RBAC, citation labels, navigation, and entity-source validation
from that registry. Resolve the node by authenticated tenant before checking
source ownership and role access. Return the same 404 for missing, mismatched,
and forbidden records.

Reason: independent partial maps silently drifted as finance and inventory
types were added. That produced inconsistent visibility, generic labels,
missing record links, and an entity endpoint that could not describe newer
records. A source/type ownership check also prevents one registered source
name from being paired with a node of another type.

Validation: require exact registry equality with the 48-value Drizzle enum,
metadata and route checks for every type, registered/unregistered source tests,
finance-source compatibility, forbidden-role and source/type mismatch tests,
full lint/typecheck/test/build gates, and local production health/readiness and
unauthenticated-boundary smoke.

Rollback: revert the registry, compatibility re-export, derived RBAC, entity
route guard, shared citation labels, and tests together. No schema, data,
Storage, Auth, queue, or provider rollback is required. If deployed, promote
the prior Vercel artifact; never reconnect Git or purchase a separate rollback
build when an existing artifact can be promoted.

## D-046 -- Persist citation identity, reauthorize citation presentation

Decision: keep the Cortex answer body as `text/plain`. Return a bounded,
base64url-encoded citation header for the current response. When loading saved
messages, treat persisted citation metadata as untrusted and use only valid
node IDs to reload current citation fields under authenticated tenant and
current-role scope. Derive record links from the canonical entity registry.

Reason: changing the streamed body would break existing clients. Rendering
persisted titles and references directly would let stale metadata survive a
role downgrade, record supersession, or graph correction. Reauthorization at
read time preserves conversation continuity without weakening tenant or RBAC
boundaries.

Validation: require plain-text response compatibility, bounded UTF-8 header
round-trip and malformed-header fail-closed tests, current-role history
rehydration tests, cross-tenant/forbidden omission, full
lint/typecheck/test/build gates, production-mode health/readiness and
unauthenticated-boundary smoke, plus desktop and 390px focus/overflow checks.

Rollback: revert the citation header, history rehydration, citation component,
styles, and tests together. Existing stored messages remain readable as plain
text. No schema, row, Auth, Storage, queue, provider, or deployment rollback is
needed. If later deployed, promote the retained last-known-good Vercel
artifact; do not reconnect Git or buy a separate rollback build.

## D-047 -- Operational Cortex context is route-derived and read-only

Decision: render Cortex context from the authenticated dashboard layout using
one exact UUID-route resolver. Map supported detail routes to canonical source
tables, then delegate retrieval to the existing tenant- and role-authorized
entity API. Do not add Cortex queries or route maps to each record page.
Project detail remains excluded because it already owns an inline panel.

Reason: duplicating context wiring across record pages would drift from the
canonical registry and mix AI presentation with ERP business logic. A layout
resolver gives finance, procurement, inventory, CRM, claims, variation,
punchlist, and warranty records consistent Obsidian-like backlinks while
preserving existing transaction authority.

Validation: require exact route/ref-table/record-ID tests, unsupported and
malformed fail-closed tests, canonical-source assertions, one-panel render
tests, exact cash-transaction navigation, full lint/typecheck/test/build gates,
local production authentication boundary checks, and 1440/768/390 focus,
target-size, and overflow proof.

Rollback: revert the route resolver, layout injection, wrapper, cash route
correction, tests, and spec together. Existing record pages and Project Cortex
panel remain functional. No schema, row, Auth, Storage, queue, provider, or
backend rollback is required. If later deployed, promote the retained
last-known-good Vercel artifact without reconnecting Git.

## D-048 -- Cortex relationship meaning is derived after authorization

Decision: keep the existing tenant/source/type/role authorization gate before
context-pack retrieval. Build a bounded relationship response only from the
pack's role-filtered neighbors and citations. Translate canonical edge type
plus direction through an original presentation map; use `Connected` for
unknown types. Route destinations through the canonical entity registry.

Reason: source chips show evidence but not relationship meaning. Returning raw
graph neighbors to the browser would duplicate authorization and navigation
logic in React. Server-side assembly preserves one trust boundary while making
record backlinks useful to non-technical operators.

Validation: require outgoing/incoming/unknown label tests, citation-join and
bound tests, authorization-order route tests, canonical-link and static-fallback
render tests, full lint/typecheck/test/build gates, local production 401 proof,
and 1440/768/390 focus, target-size, truncation, console, and overflow checks.

Rollback: revert the response builder, entity-route extension, relationship
component/style, tests, and spec together. Existing summary and citation chips
remain functional. No schema, row, Auth, Storage, queue, backend, provider, or
data rollback is required. If later deployed, promote the retained
last-known-good Vercel artifact without reconnecting Git.

## D-049 -- Cortex provenance is normalized before browser presentation

Decision: reuse node provenance already loaded by the tenant- and role-scoped
context pack, but return only a bounded safe presentation projection. Map
origin to user-facing kind, label, and explanation; serialize a validated ISO
timestamp; discard every raw identity, reference, hash, and sequence field.
Render the result through a native collapsed disclosure.

Reason: provenance makes an Obsidian-like operational graph trustworthy, but
raw rows contain actor IDs, internal references, hash-chain material, and
global sequence values that users do not need. A server projection explains
evidence without expanding browser authority or leaking internals.

Validation: require all-origin and unknown-origin mapping tests, malformed-time
omission, six-event bound, explicit raw-field absence, route retrieval limit,
native disclosure render tests, full lint/typecheck/test/build gates,
hosted aggregate coverage, local 401 proof, and 1440/768/390 interaction,
focus, target-size, console, and overflow checks.

Rollback: revert the evidence projection, route retrieval bound, disclosure
component/style, tests, spec, and documentation together. Existing summary,
relationship, and citation UI remains functional. No schema, row, Auth,
Storage, queue, backend, provider, or data rollback is required. If later
deployed, promote the retained last-known-good Vercel artifact without
reconnecting Git.

## D-050 -- Focused Cortex graphs are server-authorized bounded neighborhoods

Decision: treat `refTable` and `refId` as an untrusted navigation hint. Validate
the pair, resolve the node under the authenticated tenant, verify canonical
source/type ownership and current-role access, and then retrieve one bounded
hop using the server-derived node ID. Recheck tenant on the focus node, edge,
and joined neighbor. Preserve the original whole-graph response when no focus
is supplied.

Reason: a browser-only highlight can silently focus a forbidden or missing
record, and a fixed 1,500-node whole-graph cap can omit an older requested
record. A small authorized neighborhood makes the exact record dependable,
reduces payload and visual noise, and keeps React out of the authorization
boundary.

Validation: require unauthenticated, malformed, partial, source/type mismatch,
role denial, authorized focus, and whole-graph compatibility tests; root
lint/typecheck/test/build; a connected-database authenticated E2E that follows
the real record backlink; API bounds; clear-focus behavior; zero console/page
errors; and 1440/768/390 no-overflow screenshots.

Rollback: revert the focused database helper, graph route extension, page
query wiring, record backlink, canvas focus state, responsive shell changes,
tests, and documentation together. The existing whole graph and entity panels
remain functional. No schema, business row, Storage, queue, backend-provider,
or deployment rollback is required. If later deployed, promote the retained
last-known-good Vercel artifact without reconnecting Git.

## D-051 -- Saved Cortex record context is immutable and server-authorized

Decision: store an optional complete canonical source-table and UUID pair on
the conversation, not a client-selected tenant or internal graph-node ID.
Authorize the pair before creation, keep it immutable, and reauthorize its
current node, canonical entity mapping, tenant, and role on every reply and
history read. Preserve unscoped conversations. Remove authenticated browser
write policies and grants from Cortex conversation and message tables.

Reason: record-scoped AI cannot remain honest across reloads if focus exists
only in a URL or React state. Storing a node ID would bind history to an
internal graph lifecycle, while trusting a browser-supplied tenant or direct
database write would weaken tenant isolation and audit authority.

Validation: require bounded input tests, create/restore/mismatch/revocation
route tests, canonical registry and role checks, pair-constraint runtime
proof, authenticated direct-write denial, 51-migration clean replay, 224/224
zero-skip database tests, Nest integration, full lint/typecheck/test/build,
secret and workflow scans, hosted catalog verification, and advisor review.

Rollback: revert application code first if necessary; nullable columns and
removed browser write grants are backward compatible with the retained live
frontend. Database rollback is a reviewed compensating forward migration only:
restore the exact prior grants/policies if direct browser mutation is
deliberately reauthorized, then remove the constraint/columns only after
proving no scoped conversation remains. Never edit hosted migration history.

## D-052 -- Cortex chat scope is explicit and cannot switch silently

Decision: resolve URL focus on the server and pass only authorized canonical
context into the chat client. Show the current scope persistently. Permit
in-place history restore only when both contexts are null or their canonical
source-table and UUID pairs match exactly. Render other scopes as explicit
Cortex navigation. Disable chat when a requested record is unavailable.

Reason: letting React infer scope from raw URL values or silently loading a
different saved record makes answers appear grounded when the graph and chat
refer to different business records. Exact-pair comparison preserves immutable
conversation meaning while keeping navigation understandable.

Validation: require pure equality/route/label tests, focused/company/unavailable
render tests, existing API context suites, full repository
lint/typecheck/test/build, authenticated local production QA, exact title and
scope assertions, visible mobile controls, 1440/768/390 screenshots, zero
overflow/errors, and test-session revocation.

Rollback: revert the page authorization wiring, context helper, agent
presentation/history behavior, CSS, tests, and documentation together. The
durable database/API context contract remains safe and backward compatible.
No schema or provider rollback is required; Vercel remains on the retained
last-known-good deployment.

## D-053 -- Saved Cortex conversations use authorized deep links

Decision: accept a validated UUID `conversationId` query and restore it through
the existing authorized conversation-detail API. Keep record focus in the URL,
append conversation identity to cross-context history links, synchronize
create/load state with `history.replaceState`, and remove only conversation
identity when starting a new chat. Use a monotonically increasing local request
token so only the latest restore may commit UI or URL state.

Reason: requiring users to change record context, reopen history, and select
the same thread adds avoidable friction. An opaque conversation UUID is safe
as a locator only because server authorization remains decisive and the URL
contains no tenant, user, prompt, answer, or graph-node data.

Validation: require UUID/encoding/query-preservation tests, full
lint/typecheck/test/build, existing conversation authorization suites,
authenticated production-browser restore, message-count and URL assertions,
new-chat cleanup, responsive screenshots, zero overflow/errors, no hosted
write or AI call, and global test-session revocation.

Rollback: revert page query parsing, URL helper, agent restore/synchronization,
E2E assertions, and documentation. Existing history buttons and durable
conversation context remain functional. No schema, row, Auth, Storage, queue,
backend, or provider rollback is required.

## D-054 -- Cortex history search stays local to authorized recent chats

Decision: filter only the existing bounded response of 30 authorized recent
conversations. Match every normalized query term against conversation title
plus human record-scope label, preserve server order, and label the result set
as recent. Never index or expose tenant IDs, user IDs, record UUIDs, or
internal graph-node IDs.

Reason: users need fast retrieval without another database/API surface or a
misleading promise of global history search. Reusing the authorized response
preserves the current ownership, tenant, role, record-context, and citation
boundary while avoiding provider and query cost.

Validation: require title, record-title, record-type, company-wide, blank, and
no-result helper tests; focused component tests; full lint/typecheck/test/build;
authenticated production-browser search, clear, deep-link restore, mobile
screenshot, no overflow/errors, and global test-session revocation.

Rollback: revert the filter helper, agent history controls, CSS, tests, and
documentation together. The conversation API, database, durable context,
deep links, and provider state remain unchanged.

## D-055 -- Authenticated rate limits use verified user identity

Decision: key anonymous request buckets by IP and authenticated request buckets
by the verified Supabase user ID. Do not reuse one IP bucket across auth-state
boundaries or across authenticated users sharing a NAT.

Reason: the authenticated threshold is higher than the anonymous threshold.
Reusing one IP counter allowed authenticated traffic to make a later anonymous
request fail immediately and made unrelated users behind one shared address
consume the same bucket.

Validation: require pure bucket-identity tests, the existing middleware suite,
full lint/typecheck/test/build, and one sequential browser run that exercises
authenticated Cortex followed by the public landing page.

Rollback: revert the helper, middleware wiring, tests, and documentation
together. No schema, API contract, hosted row, provider, or deployment rollback
is required.

## D-056 -- Frontend releases use one queued Standard build

Decision: keep Vercel Git disconnected, disable on-demand concurrent builds,
use the Standard 4 vCPU/8 GB machine, and require explicit approval for exactly
one manual production build. Do not create a duplicate preview.

Reason: the accumulated frontend candidates can be validated in one release
while keeping provider spend predictable. Queuing prevents accidental
concurrent builds; Standard build compute has no added charge in the current
no-on-demand configuration.

Validation: require provider-setting evidence, zero deployments after source
pushes, one exact candidate SHA, complete local gates, a written production
test matrix, and a retained rollback deployment before requesting approval.

Rollback: use Vercel Instant Rollback to retained deployment
`dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`, verify the production alias and core
routes, and preserve environment configuration. Do not rebuild the old source.

## D-057 -- Dashboard chooses authorization mode before querying

Decision: use the canonical `/pipeline/board` role permission to choose between
the executive dashboard and an assignee-scoped Today dashboard. Invoke only the
selected loader. Restricted roles receive pending task counts constrained by
both authenticated tenant and authenticated user.

Reason: `/dashboard` is intentionally available to every role, but this did
not authorize every role to read pipeline value, GP, forecast, rep performance,
or executive alerts. Querying restricted data and hiding it later in React
would still violate least privilege.

Validation: require role-matrix tests, explicit loader non-invocation tests,
component content/link tests, full lint/typecheck/test/build, and authenticated
viewer production-browser proof at 1440/768/390 with zero forbidden content,
overflow, console errors, or page errors.

Rollback: revert the mode helper, Today query/component, dashboard wiring,
tests, specification, and documentation together. Existing executive
dashboard behavior returns for all roles, so rollback is functional but
reopens the identified authorization exposure. No schema or provider rollback
is required.

## D-058 -- Search input is literal and every join repeats tenant scope

Decision: normalize search input once, cap it at 100 characters, and escape
PostgreSQL `ILIKE` escape, percent, and underscore characters. Build only
role-authorized record queries. Apply authenticated tenant predicates to both
base and joined tables, preserve assignee scoping for tasks, and mark every
response private/no-store with Cookie variation.

Reason: search fans one browser-controlled string across many record types.
An unescaped backslash can change wildcard semantics, an unscoped display join
can expose a foreign tenant label when application credentials bypass RLS, and
a cached response can retain user-specific result metadata.

Validation: require helper and role-matrix tests, 401/short-query cache-header
tests, full lint/typecheck/test/build, secret/workflow/prohibited-source scans,
and an authenticated restricted-role browser proof using both a real authorized
record and a literal wildcard probe. Require zero forbidden result types,
overflow, console errors, page errors, and a globally revoked one-time session.

Rollback: revert source commit `8dc051e`. No schema or provider rollback is
required because the candidate is not deployed. Rollback restores prior search
behavior and therefore reopens the identified input, join, and cache risks.

## D-059 -- AI draft handoff uses explicit mode and opaque one-time state

Decision: keep record search and AI drafting as explicit command-palette modes.
Ask mode makes no search request. Transfer a bounded question through
same-tab, five-minute, one-time browser state keyed by an opaque UUID; place
only that UUID in the temporary route. Accept it only for company-wide Cortex,
consume and remove it once, clear the marker URL, prefill the composer, and
never auto-send.

Reason: silently treating every unmatched record query as an AI question would
send user intent into a different system boundary. Putting prompt text in a URL
would expose it to history, logs, copied links, and analytics. Explicit mode
and local one-time state preserve user control and minimize disclosure.

Validation: require normalization/expiry/one-time unit tests, keyboard
selection tests, authenticated real-search preservation, zero Ask-mode search
requests, zero chat requests before Send, exact composer prefill, prompt-free
URL, removed storage, 1440/768/390 visual proof, full repository gates, and
provider no-deployment evidence.

Rollback: revert source commit `8058c8a`. No schema or provider rollback is
required because the candidate is not deployed. Record search returns to its
previous behavior and Cortex remains available through its direct route.

## D-060 -- Public signatures require one locked database transaction

Decision: treat external canvas signing as one official transaction. Validate
the bounded PNG, derive scope from the hashed session, upload under a random
key, lock and recheck the exact session, and commit document, tenant-scoped
source stamp, session stamp, and nullable-actor entity audit together. Remove
the uploaded object when the database transaction fails.

Reason: the old flow allowed concurrent submissions to pass one unsigned check
and intentionally let the signature survive a failed audit caused by a
fabricated zero-UUID actor. Independent writes could leave partial official
state or orphaned Storage. External actors are legitimately nullable; audit is
not optional.

Validation: require focused malformed/oversized payload tests, shared
transaction and tenant-predicate evidence, nullable-actor audit proof,
audit-failure cleanup, concurrent replay denial, missing-source denial,
unauthenticated invalid-token browser proof, full repository gates, and
provider no-deployment evidence.

Rollback: revert source commit `e99b88f`. No schema or provider rollback is
required because the candidate is not deployed. Rollback restores the
unaudited partial-write and replay risks and therefore is emergency-only.

## D-061 -- RFQ dispatch is tenant-locked and retry-idempotent

Decision: derive manual RFQ authority from the authenticated server profile and
route background approval events through a server-only service. Lock the
tenant-scoped BOM, detect a prior result, create the RFQ, and write its audit
inside one transaction. Enforce one RFQ per tenant/BOM with database
uniqueness and a tenant-composite BOM foreign key. Deliver notification only
after commit and never on an idempotent replay. Deny direct browser mutations
to RFQs and quotes.

Reason: the former browser-callable Server Action accepted a caller-provided
system tenant, used a fabricated zero-UUID actor, and separated RFQ creation
from audit. The producer emitted a different event from the consumer trigger,
and retries had no durable uniqueness boundary. Browser Data API writes could
also bypass official workflow authority.

Validation: require action, service, queue-handler, and Drizzle contract tests;
53/53 hosted migration parity; 228/228 disposable PostgreSQL 17 database tests;
full lint, typecheck, test, and production build; direct privilege proof;
secret/workflow/prohibited-source scans; successful Railway readiness; and zero
new Vercel deployments.

Rollback: application rollback is source commit `f173957`. The database
migrations are forward-only because they close cross-tenant, duplicate, and
browser-write risks. A later corrective migration may change the contract only
after an explicit compatibility and security review.

## D-062 -- RFQ quote commands use one locked state machine

Decision: give each quote attempt a tenant-scoped UUID idempotency key and a
canonical BOM-line ID. Lock the tenant RFQ, derive material identity from its
stored line, validate all parents, and commit quote, status, and audit in one
transaction. Lock completion/cancellation, recheck allowed source state and
coverage, and commit transition plus audit together. Enforce the same state
graph and tenant relationships in PostgreSQL. Keep notification after commit.

Reason: the former flow committed quote, status, and audit independently;
trusted browser material identity; could complete a pending or incompletely
quoted RFQ by calling the action directly; and had no durable retry key.
Creation also discarded material IDs for uncontracted lines, so code/material
fallback could never prove full coverage. These defects permitted partial
official state, duplicate quotes, false completion, and weak tenant evidence.

Validation: require 26 focused Web tests, 12 RFQ database contract/runtime
tests in the zero-skip lane, cross-tenant vendor rejection, duplicate-key
rejection, invalid-transition rejection, audit-failure rollback, 54/54 clean
replay and hosted ledger parity, full lint/typecheck/test/build, 453
application tests, 236/236 database tests, 77/77 static generation, secret and
workflow scans, and zero Vercel deployments.

Rollback: revert application source commit `20d276c` only if necessary.
Migration `20260729162944` is forward-only because removing it would reopen
cross-tenant, duplicate-submission, evidence-deletion, and invalid-transition
paths. Correct database defects with a reviewed forward migration. Keep
Vercel Git disconnected and the retained production deployment active until
one consolidated frontend release is explicitly approved.

## ADR-028: RFQ quote command moves behind a disabled NestJS adapter

Decision: introduce only quote logging in the NestJS modular monolith. Route
Next.js to it only when an exact feature flag and explicit tenant UUID
allowlist both match. Never fall back after an enabled API attempt.

Reason: this creates one authoritative, permission-checked transaction
boundary without a big-bang rewrite or dual-write ambiguity. Existing
complete/cancel behavior remains unchanged.

Rollback: unset the flag/allowlist or revert this application milestone. No
schema rollback exists because this milestone adds no migration.

## ADR-029: Public discovery URLs come from one validated origin

Decision: resolve canonical metadata, structured-data identities, robots
sitemap location, and sitemap entries from `NEXT_PUBLIC_SITE_URL`, then
server-only `SITE_URL`, then Vercel's production hostname, with the retained
Third Code Vercel origin as compatibility fallback. Accept only absolute
HTTP(S) origins without credentials, paths, queries, or fragments. Omit
sitemap `lastModified` when no verified content-change date exists.

Reason: hardcoded Vercel URLs made a no-cost alternative host publish the
wrong canonical identity. A synthetic current timestamp also claimed content
freshness without evidence. One strict resolver keeps discovery output
consistent and makes hosting replaceable without changing visible UI.

Validation: require resolver precedence and rejection tests, rendered
canonical and structured-data checks, robots/sitemap/manifest endpoint checks,
1440/768/390 browser coverage, no console/page errors or horizontal overflow,
full lint/typecheck/test/build, and secret/workflow scans.

Rollback: revert this isolated application commit. The current Vercel origin
remains the resolver fallback, so rollback requires no database or provider
change. Do not reconnect Vercel Git or deploy during rollback.

## ADR-030: Alternative frontend hosting uses Next standalone

Decision: preserve Next.js and make standalone Node output opt-in through
`NEXT_OUTPUT_MODE=standalone`. Package it as a non-root Node 22 image and keep
normal output as the default. Use `APP_REVISION` as the provider-neutral
release identity, with Railway and Vercel SHA variables as migration
fallbacks.

Reason: the application depends on dynamic SSR, Middleware, Server Actions,
route handlers, and request-specific CSP nonces. Static hosting changes
security and behavior. Opt-in standalone output enables owned-compute hosting
without a big-bang rewrite or coupling the default build to one provider.

Validation: require normal production build, isolated standalone build,
77/77 generated pages, real standalone process health, SSR landing, nonce CSP,
robots, sitemap, manifest, unit tests for revision resolution, full repository
gates, and zero provider deployments. A Docker image build remains mandatory
before traffic cutover when a Docker-capable Linux host is available.

Rollback: revert this application commit. No schema, data, provider, DNS, or
Supabase rollback is required because this milestone does not deploy or cut
traffic. Keep the retained Vercel artifact and Git disconnection unchanged.

## ADR-031: RFQ terminal commands use an independent disabled NestJS adapter

Decision: expose completion and cancellation through one strict NestJS
transition route, while keeping their cutover flag and tenant allowlist
independent from quote logging. Derive authority from the authenticated
principal, require `rfq.dispatch`, lock the tenant RFQ, enforce coverage and
state rules, update with the locked source status, and write audit evidence in
the same transaction. Never retry through the compatibility writer after an
API attempt.

Reason: terminal commands must move into the modular-monolith authority
boundary incrementally without coupling their rollout to quote logging,
changing visible behavior, or introducing ambiguous dual writes.

Validation: require strict shared contract tests, Nest HTTP and service tests,
Next branch-selection and failure tests, full repository gates, and a
zero-skip PostgreSQL 17/Redis lane proving tenant denial, covered completion,
repeated-transition conflict, cancellation reason audit, and rollback.

Rollback: leave `ERP_RFQ_TERMINAL_WRITES_VIA_API` absent/false and its
allowlist empty, or revert this source milestone. No schema, data, queue,
Storage, Python, Vercel, or Supabase rollback is required.
## D-063 -- Manual RFQ creation uses an independent disabled Nest adapter

Date: 2026-07-30

Decision: Manual BOM-to-RFQ creation is exposed as
`POST /v1/procurement/rfqs` in NestJS. The caller may supply only the BOM UUID.
Authenticated principal supplies tenant and actor authority; `rfq.dispatch`
supplies permission authority; server code supplies `source: manual`.

The transaction locks the tenant-scoped BOM, returns an existing tenant/BOM
RFQ as an exact replay, filters lines already covered by a contracted rate,
inserts one pending RFQ, and writes one semantic audit before commit. Existing
database uniqueness on `(tenant_id, bom_id)` remains the final duplicate
barrier.

Next.js selects this command only when exact
`ERP_RFQ_CREATE_WRITES_VIA_API=true` and a valid independent tenant allowlist
both match. Empty, malformed, mixed wildcard, or unmatched configuration uses
the compatibility path. Once Nest is selected, errors never fall back to a
second write path.

Reason: manual creation can migrate independently from quote, terminal, and
background-worker authority. Separate gates reduce blast radius and prevent a
partial backend outage from causing duplicate writes.

Rollback: leave the gate unset or set it to exact `false`; revert the source
commit if needed. No schema or data rollback is required.

## D-064 -- Approved-BOM RFQ dispatch uses a disabled BullMQ authority path

Date: 2026-07-30

Decision: NestJS exposes a protected enqueue command accepting only the BOM
UUID. It derives tenant and actor from the authenticated principal and derives
source, queue, versioned deterministic job ID, retry count, and backoff from
server code. The worker validates the payload, reloads the actor membership,
rechecks current `rfq.dispatch`, requires an approved tenant BOM, and invokes
the same atomic RFQ transaction used by manual creation.

The source job has five exponential attempts. Its final failure creates one
bounded deterministic record in a dedicated dead-letter queue. Next.js selects
the new producer only through independent exact flag and strict tenant
allowlist variables. A selected Nest failure never falls back to Inngest.

Reason: enqueue-time authorization can become stale, duplicate delivery is
normal, and ambiguous dual producers can create conflicting side effects.
Execution-time reauthorization, one transaction authority, deterministic
identity, and explicit terminal failure preserve tenant isolation and
operational evidence.

Cutover constraint: keep the new flags unset until the existing RFQ
notification side effect has an idempotent NestJS outbox/delivery replacement
and a controlled hosted canary is approved.

Rollback: leave the flag absent/false and the allowlist empty, or revert this
source milestone. The existing Inngest path remains authoritative. No schema,
data, Supabase, Storage, Python, UI, or Vercel rollback is required.

## D-065 -- Automatic RFQ notifications use a PostgreSQL outbox

Date: 2026-07-30

Decision: the automatic NestJS RFQ transaction commits one tenant-scoped
notification intent and immutable procurement-recipient delivery snapshots
with the RFQ and semantic audit. BullMQ jobs carry only version and UUID
identity. PostgreSQL owns delivery state, attempt count, stale recovery,
terminal evidence, and in-app uniqueness.

Email content is rebuilt server-side from authorized PostgreSQL rows and sent
with one stable provider idempotency key. Missing email configuration fails
closed. An active processing claim is not reclaimed; a stale claim may be
recovered, but the database ceiling prevents more than five provider attempts.

Recovery scheduling requires exact
`ERP_NOTIFICATION_SWEEP_ENABLED=true` and defaults false. Automatic dispatch,
its tenant allowlist, and recovery scheduling remain disabled until an
approved tenant canary.

Reason: notification intent must survive a process or Redis failure without
repeating the official RFQ transaction, leaking business data into Redis, or
creating unbounded provider cost. Database authority plus provider
idempotency makes retries observable and bounded.

Rollback: keep all three flags absent/false and revert application source if
needed. Leave the forward migration and durable evidence in place. Do not
delete outbox or dead-letter records. Existing Inngest behavior remains
authoritative while the Nest path is disabled.

## D-066 -- Production releases are manual, parity-first, and cost-bounded

Date: 2026-07-30

Decision: a hosted database release first compares the complete repository
migration ledger with the target Supabase project. Exact parity means no SQL is
executed. Railway is not rebuilt when the reviewed source delta does not touch
its watched application paths.

Vercel production delivery uses an explicitly selected reviewed SHA after all
local and disposable-service gates pass. Build count and provider identity are
recorded. If Vercel requires a production-environment rebuild after a protected
preview, that single required build is allowed; failed or duplicate retries
are not. Git is disconnected after verification so later pushes cannot create
automatic builds.

Reason: replaying current migrations, rebuilding unchanged backend content, or
leaving frontend auto-deploy enabled adds integrity risk and avoidable provider
cost without changing the released application.

Verification: canonical health/readiness and revision, authenticated browser
rendering, runtime-error clusters, HTTP 5xx, Railway PostgreSQL/Redis
readiness, protected command denial, Supabase parity, and exact rollback
identities are required.

Rollback: immediately restore the previous ready Vercel production deployment
and retain the current Railway image when the backend did not change. Database
rollback uses a reviewed forward compensating migration only; never delete
durable audit or outbox evidence.

## D-067 -- Purchase-order authority moves through a disabled Nest boundary

Date: 2026-08-01

Decision: keep existing Next.js PO Server Actions operational, but enforce
tenant-derived capability checks and same-tenant project/vendor references at
their current write boundary. Add strict NestJS
`POST /v1/procurement/purchase-orders` contract with required
`Idempotency-Key`, but keep service fail-closed and non-mutating until durable
tenant-composite idempotency record and complete PostgreSQL transaction parity
are proven.

Reason: immediate cutover would leave duplicate retries, partial BOM/group
creation, and approval/receiving state changes without equivalent authority
evidence. Disabled contract makes intended boundary testable while preserving
live behavior and avoiding unsafe fallback or provider release.

Constraints: no client-supplied tenant or actor fields; Nest capability guard
must authorize every command; PostgreSQL remains source of truth; Redis cannot
be idempotency authority; Python cannot finalize ERP state; no Vercel or
Railway deployment is implied.

Rollback: revert source commit. Existing Server Actions remain authoritative,
and `ERP_PO_CREATE_WRITES_ENABLED` stays absent/false. No database rollback is
required because this milestone adds no migration.
## D-068: Tenant-scoped idempotent standalone PO command (2026-08-01)

Decision: keep the existing Server Action as the default and introduce a
disabled Nest transaction seam behind exact feature flags and UUID tenant
allow-lists. Persist request hash, state, result, actor, and tenant in
PostgreSQL; lock the request row for replay/conflict handling; use an advisory
tenant lock for PO numbering; and commit PO, lines, audit, and result together.

Rationale: retries must never duplicate money or official ERP records, and a
browser or Python worker must not finalize a transaction. A candidate migration
is intentionally not applied to hosted Supabase until disposable integration
proof and a canary rollback plan exist. This is original code and schema,
independent of ERPNext internals.

## D-069: Preserve the accepted landing architecture during backend migration (2026-08-01)

Decision: keep the current Third Code ERP landing composition and visual
language stable while ERP write authority moves incrementally into NestJS.
Protect it with source invariants and live desktop/mobile browser evidence.

Rationale: the public surface already meets its responsive, accessibility, and
SEO contract; a rewrite would add release risk without improving the current
milestone. Backend migration must not regress a validated customer entry point.

Constraints: no Vercel deploy is implied, and no visual change is accepted
without updated regression evidence.

## D-070: Use owned WSL1 lane for disposable authority proof (2026-08-01)

Decision: use the existing `ThirdCodeERP-Test` Alpine WSL1 distribution for
local PostgreSQL 17/Redis reproducibility when Docker cannot start. Keep the
lane disposable, repository-pinned, and outside hosted credentials.

Rationale: it proves migration parity and transaction behavior at zero new
provider cost while hardware virtualization remains unavailable. Passing local
proof does not authorize hosted SQL or production flags.

Evidence: 56/56 migrations, 243/243 database tests without skips, and 7/7 Nest
integration tests passed; schema-before/schema-after SHA-256 matched.

## D-071 -- PO approval transitions use a separate disabled authority slice

Date: 2026-08-01

Decision: keep PO approval, issuance, and receiving separate. Add only the
first four approval transitions to a NestJS transaction boundary, guarded by
an exact feature flag and tenant allowlist, with a PostgreSQL request ledger.
Leave the current Next Server Actions authoritative until a reviewed canary.

Rationale: approval stamps and state transitions need the same tenant lock,
idempotency, audit, and rollback evidence as PO creation, while supplier email
and SCM issuance add external side effects that require a separate outbox
milestone. A bounded disabled slice reduces blast radius and provider cost.

Constraints: no browser or Python finalization, no hosted migration until
read-only reconciliation, no provider deployment implied, and no fallback
after a canary command begins. The original implementation is independent of
ERPNext code, schemas, text, or internal structure.

Evidence update: disposable 57-migration replay and 8/8 Nest/Redis
integration passed. Hosted read-only plan is 55/57 with only the two candidate
suffixes missing; both remain unapplied pending review.

The Next server-only client has a separate exact workflow delegation flag and
result validation, but no Server Action calls it yet. This keeps the current
notification behavior and rollback path intact.

## D-072 -- Transactional PO workflow notification parity (2026-08-01)

Decision: require an independent notification flag and tenant allowlist before
any Nest Purchase Order workflow write. In the same PostgreSQL transaction,
persist a strict workflow outbox payload and role-routed in-app/email delivery
rows. Let BullMQ carry opaque delivery identities and let PostgreSQL own
idempotency, stale recovery, dead-letter evidence, and in-app uniqueness.

Rationale: a state transition without its approval notification creates an
operationally inconsistent ERP. Durable intent must commit or roll back with
the official status/audit result; provider delivery remains retryable and
non-authoritative. The implementation is original and unrelated to ERPNext
internals.

Constraints: flags default false, no hosted SQL or provider deployment is
implied, and the current Server Actions remain rollback authority. Python
cannot create, approve, notify, issue, receive, or finalize the Purchase
Order. SCM issuance and supplier-side email remain separate milestones.

Evidence: candidate migration `20260801110000`; 58/58 disposable migrations,
244/244 database tests without skips, 8/8 Nest/Redis integration tests, full
shared/API/web suites 94/79/300, root typecheck/lint, and 77/77 Next pages.

## D-073 -- Block canary on audit-chain integrity (2026-08-01)

Decision: do not enable PO/project write authority or select a canary tenant
while the read-only cutover planner reports audit predecessor or hash
mismatches. Repair must be a separately scoped, reviewed operation with its
own evidence; this milestone performs no repair.

Evidence: PostgreSQL 17 read-only target inspection found the demo target and
auth identity, project audit trigger, hardened audit function, and non-public
function permissions. It also found 2 predecessor-link mismatches, 151 hash
mismatches, and no `project.update` capability for the selected actor. No
database or provider state changed.

## D-074 -- Use the database audit hash formula for future server writes (2026-08-01)

Decision: keep the existing database trigger formula as the compatibility
authority and make all new API/Next server audit writes plus verification use
the same formula. Do not rewrite immutable historical rows in this milestone.

Rationale: two hash algorithms made new audit evidence appear invalid even
when the append-only chain links were present. Aligning future writers removes
the source of new divergence without silently altering historical evidence.

Evidence: fixed parity vector passed; API/web typechecks and serial full tests
passed; disposable PostgreSQL 17/Redis 7.4.9 replay and integration passed.
Hosted SQL and provider deployment were not performed.

## D-075 -- Audit recovery reports are read-only and opaque (2026-08-01)

Decision: use the audit recovery planner as the only next-step evidence tool
for the blocked demo tenant. It must run repeatable-read/read-only, require an
explicit tenant selector, hide entity IDs/business values, and return a
non-zero `--require-clear` result while any chain/hash/control blocker exists.

Rationale: recovery analysis must be reproducible without creating a second
write path or leaking tenant data. A report cannot be treated as a repair or
canary approval.

Evidence: contract tests 4/4; hosted read-only run reproduced 661 rows, 2 link
mismatches, and 151 hash mismatches. No database or provider state changed.

## D-076 -- Unknown audit hash profiles block recovery (2026-08-01)

Decision: classify historical audit rows against only the current PostgreSQL
trigger formula and the legacy JSON writer formula. Rows matching neither are
unknown, not repairable by inference, and remain a hard canary blocker.

Evidence: hosted read-only profile verification found 510 database-profile
rows, 40 legacy-JSON rows, 111 unknown rows, and 2 broken predecessor links.
The verifier's 3/3 contract tests passed; no audit or provider state changed.

## D-077 -- Never weaken Purchase Order uniqueness to force a release (2026-08-01)

Decision: keep the candidate migration's tenant-scoped Purchase Order number
uniqueness guard unchanged. The hosted demo data contains one duplicate group
of 12 records, so the atomic 55-to-58 migration attempt must fail closed until
an owner-approved data remediation is defined.

Rationale: silently renaming, deleting, or allowing duplicate official numbers
would alter business meaning and undermine the idempotent authority. A failed
transaction is safer than a partially applied schema or fake migration history.

Evidence: the transaction rolled back at the explicit guard; the migration
ledger stayed at 55/58 and the post-attempt readiness checks remained green.

## D-078 -- Duplicate remediation evidence must be read-only (2026-08-01)

Decision: use a bounded duplicate planner to support owner review instead of
mutating demo Purchase Orders automatically. The planner emits only opaque
references, counts, timestamps, statuses, and review order; it never exposes
PO numbers or UUIDs and never writes.

Rationale: a migration blocker is not authorization to rename, delete, or
choose a canonical business record. Evidence must be reproducible before a
forward remediation is designed.

Evidence: hosted planner returned one group with 12 records and
`review_required`; planner contract tests 4/4 passed and all repository gates
remained green.

## D-079 -- Guard runtime branding, preserve internal provenance (2026-08-01)

Decision: production runtime source and public text must not contain ABI Ops,
ERPNext, or Frappe markers. Internal migration names/comments may retain
clean-room provenance needed for engineering traceability; they are not user
facing output.

Evidence: the runtime scan found no forbidden markers and the new branding guard
passed. No visible copy or provider state changed.

## D-080 -- Aggregate release evidence before any deployment (2026-08-01)

Decision: use `scripts/plan-controlled-release.mjs` as the single read-only
preflight for future provider promotion. It must require current migration
parity, clear duplicate evidence, clear audit recovery, and verified live
readiness. Missing evidence remains `review_required`.

Rationale: independent green checks can hide a red data or audit gate, while
repeated previews consume Vercel budget. One fail-closed report makes the
release decision reproducible without granting the tool mutation authority.

Evidence: contract 4/4; hosted report correctly blocked 55/58 migrations,
one duplicate group of 12 records, and missing audit selector while Railway
and Vercel readiness returned 200. No SQL, flag, provider, or deployment state
changed.

## D-081 -- Keep Stock Receipt draft creation disabled behind exact authority (2026-08-01)

Decision: add a separate NestJS Stock Receipt draft-creation command with an
exact decimal boundary, tenant-composite idempotency record, same-tenant
reference validation, semantic audit, and database transaction. Keep the
command disabled by default and leave the existing Server Action as the
compatibility path. Do not combine draft creation with posting, ledger,
supplier-bill matching, reversal, or frontend cutover.

Rationale: receiving is a sensitive inventory write, but the hosted migration
ledger, duplicate PO data, and audit recovery are not release-clear. A small
server-only seam provides testable authority and rollback without guessing at
hosted data or incurring provider deployments.

Evidence: 59-migration PostgreSQL 17 replay, zero-skip database lane, API
integration create/replay/conflicting-key/rollback proof, full TypeScript/
lint/test/build gates, and migration-contract coverage passed. Hosted Supabase,
Railway, Vercel, feature flags, and business rows were not changed.

## D-082 -- Python CAD parsing cannot commit ERP records (2026-08-01)

Decision: keep Python limited to Storage-backed document processing and bounded
extraction evidence. Tenant/project validation, derived `scope_items`
replacement, exact line totals, and audit logging belong to the application
transaction. The existing Next path is transitional; the future Nest adapter
must preserve the same contract before cutover.

Rationale: a worker supplied with tenant identifiers must not be able to write
official ERP records, bypass tenant authorization, or create an unaudited retry
path. A shared response schema and transactional application commit preserve
the current upload behavior while closing that authority gap.

Evidence: worker PostgreSQL dependency and `src/db.py` removed; contract tests
4/4, web tests 305/305, typecheck/lint, 77/77-page build, and Python
compilation passed. No hosted state or provider deployment changed.

## D-083 -- NestJS owns the future CAD evidence commit (2026-08-01)

Decision: add a disabled NestJS CAD evidence-commit command that reuses the
shared worker contract and performs tenant validation, derived-row replacement,
exact line totals, idempotency, and semantic audit in one PostgreSQL
transaction. Keep Python evidence-only and retain the Next transaction as the
compatibility/rollback path until a reviewed canary proves parity.

Rationale: moving the authority boundary incrementally preserves current API
behavior while preventing a parser retry or worker credential from committing
official ERP records. A server-only idempotency record and composite tenant
foreign keys make retries and cross-tenant references fail closed.

Evidence: 60-migration disposable PostgreSQL replay, 250/250 zero-skip
database assertions, 10/10 API integration assertions, full package tests,
typecheck, lint, production build, Actionlint, and Gitleaks passed. Hosted
Supabase, Railway, Vercel, feature flags, and business rows were not changed.

## D-084 -- Durable CAD processing intake is Nest-owned (2026-08-01)

Decision: add an additive, disabled NestJS processing-job intake. The command
accepts only `{mode, requestedFormat, createDraftBom}` plus a required
Idempotency-Key. PostgreSQL derives tenant, project, document, and actor
relationships; a composite-FK/RLS-protected row is created or replayed in one
transaction. BullMQ receives only `{schemaVersion, jobId}` and deduplicates by
opaque transport ID. Status reads are bounded and tenant-filtered.

Rationale: a queue message must not become a second authority or leak tenant
and storage context. Persisting the job before enqueue makes Redis loss
recoverable by retry, while keeping worker credentials and official ERP writes
out of the Python adapter. The processor bridge remains a separate gate
because enabling intake without a proven worker would strand jobs.

Evidence: 61-migration PostgreSQL 17 replay, 253/253 zero-skip database
assertions, 11/11 API integration assertions, focused HTTP/service/queue
contracts, and typecheck passed. Hosted Supabase, Railway, Vercel, flags, and
business rows were unchanged.

## D-085 -- Sign the private CAD evidence request at Nest (2026-08-01)

Decision: the NestJS processor is the only component allowed to resolve a
document-processing job. It issues a 120-second exact-object Supabase Storage
URL and signs the exact JSON body with an HMAC containing timestamp and job
UUID. Python verifies that signature before downloading, enforces byte/item
limits, hashes the source, and returns bounded deterministic evidence only.

The legacy bearer `/parse` endpoint remains a compatibility path while callers
are migrated. Its service-role credential is not required by the new private
endpoint and is never sent through Redis or the evidence request. The Nest
processor uses the existing transaction-authority commit service and refuses
draft-BOM requests until a separate idempotent BOM command is available.

Rationale: signed exact-object access closes the worker credential and
tenant-substitution risks without a big-bang rewrite. PostgreSQL remains the
source of truth for state and official scope rows; Redis only delivers opaque
job identity and retries. Flags and allowlists stay closed until complete
disposable and hosted release evidence exists.

## D-086 -- Persist evidence before derived CAD writes (2026-08-01)

Decision: store every validated processing attempt in
`document_processing_evidence` before Nest commits derived scope rows or a
draft BOM. The row is tenant-scoped, composite-FK protected, bounded, RLS
enabled, browser-inaccessible, and keyed by `(tenant_id, job_id, attempt)`.
It stores source hash, producer identity, formats, warnings, and the strict
worker payload; signed URLs and credentials are never persisted.

Decision: implement draft BOM creation as an independent Nest transaction,
gated by `ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED` plus an explicit tenant
allowlist. The transaction locks the job, rechecks actor/document context,
creates one draft BOM and line set with integer-centavo totals, attaches the
job ID, and writes semantic audit evidence. Retries replay the existing BOM;
partial scope-only success is never reported for a BOM request.

Rationale: immutable attempt evidence makes source/hash/audit reconstruction
possible without granting Python ERP authority. A separate idempotent command
keeps BOM creation recoverable after scope commit and prevents duplicate
delivery from creating financial planning records twice. All flags remain
closed pending end-to-end processor and hosted canary proof.

## D-087 -- Scope and draft BOM commit atomically (2026-08-01)

Correction to D-086's initial sequencing proposal: once a processing attempt
requests a draft BOM, the existing Nest CAD evidence-commit transaction owns
both derived scope replacement and draft BOM creation. Evidence persistence
remains a separate immutable attempt record written first; scope rows, BOM,
BOM lines, job attachment, idempotency completion, and semantic audit are one
transaction and one replay boundary. A duplicate delivery reuses the durable
job/BOM ID rather than creating a second planning record.

Rationale: a separate post-scope BOM transaction could expose a partial
scope-only success if BOM creation failed. Keeping the derived writes under
the established idempotency transaction gives PostgreSQL all-or-nothing
rollback while preserving the evidence-first audit trail. The draft gate and
tenant allowlist remain closed until hosted schema parity and a controlled
canary are approved.

## D-088 -- Do not bypass hosted release gates (2026-08-01)

Decision: a source-green branch may be pushed for review, but hosted Supabase
migrations and Railway/Vercel deployments remain withheld while the controlled
release planner reports any integrity blocker. In the current snapshot, the
Purchase Order uniqueness migration cannot run because one tenant has 12 demo
records sharing a number, and audit-chain recovery cannot be assessed without
an owner-approved `AUDIT_RECOVERY_TENANT_ID`.

Rationale: automatically renumbering issued records or guessing a recovery
tenant could change business history. The owner must choose a reversible,
record-level remediation before the unique index and subsequent migrations are
applied. Readiness HTTP 200 alone is not sufficient release evidence.

## D-089 -- CI schema proof excludes test-only grants (2026-08-01)

Decision: run the empty public-schema diff immediately after a clean Supabase
reset, then apply the narrowly scoped CI-only `anon`/`authenticated` grants
required by legacy RLS tests. Pre-create the diff artifact because the pinned
CLI omits it when no changes exist.

Rationale: test compatibility grants are not production schema and must not
hide migration drift; production migrations and hosted privileges remain the
source of truth.

## D-090 -- Processor canary must be rollback-only (2026-08-02)

Decision: prove the M2.5 processor path with an isolated PostgreSQL fixture and
real Nest state/evidence/commit services before enabling any production tenant.
The canary must include signed worker-boundary validation, duplicate delivery
suppression, scope reconciliation, semantic audit, and transaction rollback.

Rationale: unit mocks cannot prove the interaction between the worker contract,
PostgreSQL state machine, tenant composite checks, and audit chain. A rollback
fixture gives that evidence without mutating hosted demo data.

## D-091 -- Redis is delivery-only for processing jobs (2026-08-02)

Decision: the document-processing queue transports only an opaque job UUID and
uses BullMQ deduplication for delivery efficiency. PostgreSQL remains the
authority for claim, attempt count, terminal status, evidence, scope, BOM, and
audit after duplicate delivery or Redis failure.

Rationale: queue state can be retried, duplicated, or lost. Keeping tenant and
business payloads out of Redis limits leakage and prevents transport state from
finalizing an ERP transaction.

## D-092 -- Recover transport from PostgreSQL state (2026-08-02)

Decision: recover document-processing transport from PostgreSQL, never from
Redis. Stale claims are reset to `queued` in PostgreSQL, and a bounded batch of
opaque queued UUIDs feeds `enqueuePending()` through the idempotent queue key.
Recovery cannot mark a job succeeded or failed, write evidence, approve scope,
or finalize an ERP transaction.

Rationale: Redis loss is expected to be recoverable, while PostgreSQL owns the
job state machine and tenant-scoped business authority. A bounded source query
limits recovery pressure and keeps transport retries from becoming a second
source of truth.

## D-093 -- Recovery scheduler requires execution-gate intersection (2026-08-02)

Decision: create the document-processing recovery scheduler only when recovery,
processing intake, worker bridge, and Nest evidence-commit gates are enabled.
The recovery tenant allowlist must intersect both processing and commit tenant
allowlists. The scheduler payload contains only its schema version; the worker
uses PostgreSQL to select and re-enqueue opaque job IDs.

Rationale: re-enqueuing while the execution path is disabled would turn a safe
recovery loop into repeated terminal failures. Requiring the same tenant-scoped
execution gates keeps transport recovery aligned with the authority that can
actually finish the ERP transaction.

## D-094 -- Cortex search is keyword-first and source-validated (2026-08-02)

Decision: expose Cortex keyword retrieval through a tenant-session-bound route.
Apply the caller's role-derived node-type scope in the database query, validate
each returned node against the entity registry/ref-table pair, and return only
source metadata plus a safe deep link. The interactive graph may debounce this
route, but must not invoke embeddings or an LLM on every keystroke.

Rationale: derived graph search improves discoverability without widening
authorization or adding provider spend to normal navigation. Cortex remains a
read-only projection; NestJS/PostgreSQL remains the authority for official ERP
transactions and audit state.

## D-095 -- RAG suggestions are bounded read-only evidence

Decision: keep BOM similarity suggestions behind the existing Next compatibility
route for this incremental slice, but authorize from the authenticated profile,
reuse the BOM visibility policy, validate a 5–300 character description before
embedding, cap results to five finite scores at or above 0.75, and identify each
result as approved-BOM history. Provider or vector failures return a safe 503;
the route never approves, writes, or finalizes a BOM.

Rationale: this makes the current user-visible RAG path safe and testable
without a big-bang frontend/API cutover. A later Nest read adapter can preserve
the contract once the Railway API release is independently verified.

## D-096 -- CI verification precedes hosted promotion (2026-08-02)

Decision: treat commit `fa283f94376aacd8f7febd9324b162697571efa1` as the M2.8
source candidate only after GitHub Actions run `30713863937` passes the full
executable lane. A green source lane does not override the read-only hosted
release planner; Supabase SQL, Railway deploy, Vercel deploy, flags, and
business-data writes remain gated by current hosted integrity evidence.

Rationale: separate source correctness from provider mutation and avoid an
unbounded or billing-producing release while hosted migration, duplicate PO,
and audit-recovery blockers remain unresolved.

## D-097 -- Python owns embedding generation behind an explicit boundary (2026-08-02)

Decision: introduce `apps/workers/ai` as the Python-owned advisory embedding
boundary. It receives only bounded text, requires a private bearer secret, and
returns validated vectors. When `AI_WORKER_URL` is configured, shared
TypeScript embedding helpers use Python and fail closed on incomplete worker
configuration. With no URL, the existing TypeScript OpenAI path remains a
temporary compatibility fallback.

Rationale: honor the target architecture without a big-bang cutover or broken
RAG behavior. Python remains advisory-only; NestJS/PostgreSQL still own every
official ERP transaction, audit, and tenant-scoped write.

## D-098 -- M2.9 source candidate passed executable release gates (2026-08-02)

Decision: record `56bb76eb2dc7f4f7f00fbe4690e06323696b0618` and GitHub Actions
run `30715179369` as the reviewed M2.9 source candidate. Hosted deployment,
worker URL enablement, Supabase SQL, flags, and business-data writes remain
separately gated by the read-only controlled-release planner.

Rationale: a green source pipeline proves reproducibility and build safety but
does not prove hosted data integrity, provider authorization, or production
runtime identity.

## D-099 -- Change Request commands remain gated and idempotent (2026-08-02)

Decision: introduce the NestJS Change Request command as a closed-by-default
compatibility boundary. The opportunity path parameter is authoritative; the
body cannot provide tenant or actor identity. PostgreSQL records a tenant/key
request hash and result, while the same transaction creates the request,
design-role in-app intent, and audit evidence. Replays return the validated
stored result; hash mismatches conflict.

Rationale: this moves a sensitive business write toward Nest/PostgreSQL without
a big-bang UI rewrite, prevents retry duplicates, preserves current behavior
while flags are closed, and makes tenant/RBAC/audit correctness testable before
any hosted migration or provider promotion.

## D-100 -- M3.0 source candidate passed executable release gates (2026-08-02)

Decision: record commit `765285a57d37885980f01774bffdb27676a203e0` and GitHub
Actions run `30717165544` as the reviewed M3.0 source candidate. The run passed
static checks, secret scan, unit tests, Postgres 17 migration/schema replay,
database tests without skips, Nest transaction integration, container smoke,
and production build; E2E remains credential-gated.

Rationale: source reproducibility and transaction-boundary evidence are now
proven without weakening the independent hosted release planner. Supabase SQL,
Railway/Vercel deploys, flags, queues, and business-data writes remain blocked
until hosted ledger, duplicate-data, and audit-recovery findings are cleared.

## D-101 -- Change Request database evidence remains disposable (2026-08-02)

Decision: prove the M3.0 command against disposable PostgreSQL before any
hosted migration or cutover. The integration probe uses a transaction-bound
Nest service, seeds two tenants, asserts idempotency and tenant/RBAC behavior,
checks exactly one design notification and semantic audit row, and forces a
rollback. It never targets the hosted Supabase URL and remains credential
gated in local runs.

Rationale: mocked tests cannot establish composite foreign keys, RLS-era
privilege boundaries, notification uniqueness, or audit-chain interaction.
Disposable evidence adds confidence without mutating demo production data.

## D-102 -- M3.0 disposable integration passed CI (2026-08-02)

Decision: record `77b6e04206a48ff47ffeee5567b56bf3e3195e65` and CI run
`30718464238` as the M3.0 database-evidence candidate. Postgres 17 rebuilt the
full migration chain, ran 256/256 database tests without skips, and executed
the Change Request tenant/RBAC/idempotency/notification/audit/rollback probe.

Rationale: the authority boundary is now proven against a fresh schema in CI,
while hosted data-integrity findings remain independently unresolved.

## D-103 -- Keep the Change Request web cutover closed by default (2026-08-02)

Decision: ship the compatibility seam in commit `d5ee498`, but leave the
tenant allowlist disabled. The Server Action preserves its existing API and
direct-write behavior until the hosted migration ledger, Purchase Order
duplicate review, and audit-recovery owner input are resolved.

Rationale: this provides an executable incremental migration boundary without
exposing an unproven hosted transaction path or changing the public UI. The
stable browser retry key aligns the compatibility path with Nest idempotency,
while authorization and official commit authority remain server-side.

## D-104 -- CI green does not override hosted release blockers (2026-08-02)

Decision: record CI run `30732430851` as the M3.1 source evidence, but do not
apply the eight pending hosted migrations or deploy Railway/Vercel. Railway
and Vercel readiness are healthy; the controlled planner remains the release
authority.

Rationale: fresh-schema reproducibility proves source correctness, not hosted
data correctness. The duplicate Purchase Order group and missing approved
audit-recovery tenant still require owner-level decisions before mutation.

## D-105 -- Cut over only supported Purchase Order approval states (2026-08-02)

Decision: route draft submission, PM approval, and Commercial approval through
the existing Nest workflow command behind the closed tenant allowlist. Keep SCM
issuance and rejection on legacy actions until their command/state/notification
parity is implemented and tested.

Rationale: partial cutover must not silently change authorization or supplier
side effects. Nest already provides idempotency, state-machine checks,
notification intent, and audit authority for the three supported actions;
unsupported states remain explicit compatibility work.

## D-106 -- CI evidence does not authorize Purchase Order canary (2026-08-02)

Decision: record run `30733168171` as green source evidence, but keep
`ERP_PO_WORKFLOW_WRITES_VIA_API` disabled and do not deploy. The hosted planner
still reports eight migrations pending, 12 duplicate Purchase Orders, and no
approved audit-recovery tenant.

Rationale: source reproducibility and provider readiness cannot prove hosted
data integrity or owner intent for irreversible business-record remediation.

## D-107 -- Complete Purchase Order rejection parity before issuance cutover (2026-08-02)

Decision: route rejection from PM, Commercial, and SCM-pending states through
the existing Nest workflow command behind the same closed tenant allowlist.
Use one stable browser idempotency key per rejection, and extend the outbox
payload constraint with a forward-only migration. Keep SCM issuance on the
legacy action until supplier email dispatch, evidence stamping, retries,
dead-letter handling, and audit are represented by a server-owned outbox
contract.

Rationale: rejection has no external supplier side effect and can therefore
share the proven transactional command boundary. Issuance currently does, so
cutting it over without an equivalent outbox would risk duplicate or lost
supplier messages. CI run `30733959058` proves fresh-schema reproducibility;
hosted planner blockers still control promotion.

## D-108 -- Make SCM issuance server-authoritative only with an outbox (2026-08-02)

Decision: add `scm_issue` to the Nest Purchase Order workflow and authorize it
with the exact `po.issue` capability. Commit the status transition, internal
workflow intent, supplier-issued outbox, immutable supplier delivery snapshot,
and audit in one tenant-scoped transaction. Send supplier mail only from the
BullMQ worker, with one provider idempotency key, bounded retry/dead-letter,
`supplier_email_sent_at` evidence, and a delivery audit update. Keep the Next
action and visible UI as a compatibility seam, closed by default.

Rationale: the previous Server Action sent external mail directly after a
status write, which could lose delivery evidence or duplicate mail on retry.
The separate outbox child preserves atomic ERP state while isolating provider
failure. A nullable vendor join cannot be part of a PostgreSQL `FOR UPDATE`
query, so the implementation locks the PO/project first and then takes a
tenant-scoped vendor share lock. CI run `30735228348` proves the migration,
schema diff, no-skip DB lane, and integration behavior.

## D-109 -- Do not promote M3.4 from source green alone (2026-08-02)

Decision: keep all PO workflow flags and tenant allowlists closed, do not apply
the ten pending hosted migrations, and do not deploy Vercel/Railway until the
read-only planner is clear and the owner supplies canonical duplicate-PO
mapping plus `AUDIT_RECOVERY_TENANT_ID`.

Rationale: fresh-schema CI proves source correctness but cannot resolve hosted
business-data ambiguity or establish the required audit recovery authority.

## D-110 -- Keep finance journal posting closed until hosted data review (2026-08-02)

Decision: introduce the Nest journal-post command and durable tenant-scoped
idempotency/audit boundary, but keep
`ERP_FINANCE_JOURNAL_POST_WRITES_VIA_API`,
`ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED`, and both tenant allowlists false or
empty. Retain the existing database `post_journal_entry` function as the sole
numbering and ledger-state authority. Do not apply the new migration or deploy
Railway/Vercel while the controlled planner is `review_required`.

Rationale: this gives the application a safe, testable core seam without
creating a second posting implementation or changing live behavior. Fresh
schema replay and green CI cannot resolve the hosted migration gap, 12-record
Purchase Order duplicate group, zero audit evidence, or missing
`AUDIT_RECOVERY_TENANT_ID`; those remain owner-controlled release blockers.

## D-111 -- Redact Cortex prompts before external model calls (2026-08-02)

Decision: apply a deterministic direct-identifier redaction pass to Cortex
graph context, semantic embedding queries, and all user/assistant prompt turns
before they reach an external model. Audit only redacted previews and stable
prompt/response hashes, with explicit started/completed phases and model/fallback
outcomes. Do not change the visible landing or tenant/RBAC retrieval contract.

Rationale: tenant isolation limits which records a user may access but does not
make raw PII safe to export to a model provider. A small, tested boundary
reduces direct-identifier exposure while retaining useful construction context
and the deterministic grounded fallback. No AI output gains transaction
authority from this change.

## D-112 -- Route the binary-CAD canary through Nest without fallback (2026-08-02)

Decision: add the frontend selector `ERP_DOCUMENT_PROCESSING_VIA_API` and
strict UUID allowlist `ERP_DOCUMENT_PROCESSING_TENANT_IDS`, both closed by
default. For an explicitly selected tenant and binary DWG only, Next submits
the document-processing job to Nest/BullMQ and polls a validated status proxy.
If core rejects or is unavailable, the request fails closed; Next never calls
its legacy CAD scope writer after selecting the core path. Draft-BOM and
evidence gates remain independent and closed.

Rationale: the core API is the required authority for signed evidence,
tenant/RBAC checks, idempotency, audit, and official scope-item commits. A
fallback would create two writers and could silently bypass those controls.
The canary preserves current behavior for every non-allowlisted tenant while
making the migration seam executable and reversible without a schema change.

## D-113 -- Route Stock Receipt creation through Nest without fallback (2026-08-02)

Decision: add the independent frontend selector
`ERP_INVENTORY_RECEIPT_CREATE_VIA_API` and strict UUID allowlist
`ERP_INVENTORY_RECEIPT_CREATE_TENANT_IDS`, both closed by default. For an
explicitly selected tenant, Next sends the Stock Receipt command to Nest with
an opaque `Idempotency-Key`; core rejection or unavailability returns a safe
error and never invokes the legacy direct writer. The existing form and copy
remain unchanged.

Rationale: inventory creation is an official ERP transaction and must have one
tenant-authorized writer with exact quantity/cost handling, replay protection,
and audit. A fallback would create duplicate-write risk during a lost response
or core outage. The allowlisted canary preserves current behavior elsewhere and
requires no schema change in this source slice.

## D-114 -- Keep Stock Receipt post/reversal canaries closed until hosted review (2026-08-02)

Decision: add separate Nest commands for Stock Receipt posting and reversal,
with `inventory.post_receipt` authorization, tenant-composite durable
idempotency, existing PostgreSQL function authority, and same-transaction
semantic audit. Route Next only for exact-`true` plus UUID-allowlisted tenants;
otherwise preserve the existing direct Server Action path. If a selected core
request fails, return the failure and never fall back to a second writer.
Keep `ERP_INVENTORY_RECEIPT_POST_VIA_API`,
`ERP_INVENTORY_RECEIPT_REVERSE_VIA_API`, their API-side write gates, and all
tenant lists false/empty by default.

Rationale: posting and reversal change inventory and accounting evidence, so a
browser or React component cannot remain an official writer. Existing database
functions already own numbering, balance, fiscal-period, and state checks;
reusing them avoids a second ledger implementation. Durable result replay
prevents duplicate effects after lost responses. The source and disposable
database lanes are green, but hosted migration parity, duplicate Purchase
Order review, audit-recovery ownership, and exact rollback evidence remain
independent promotion gates.

## D-115 -- Route single BOM-to-PO creation through Nest without fallback (2026-08-02)

Decision: add a separate Nest command for creating one Purchase Order from an
approved or locked BOM. Reuse `purchase_order_create_requests` with a command
hash, lock the tenant-scoped source rows, copy lines and approved budget
cost-code mappings, lock an approved BOM, and write the PO/BOM audit evidence in
one transaction. Route Next only for exact-true plus UUID-allowlisted tenants;
otherwise preserve the existing Server Action. Core rejection or outage never
falls back to a second writer. Keep grouped-by-supplier creation separate.

Rationale: BOM-to-PO is an official financial/procurement transaction and the
old browser writer performed number allocation, inserts, BOM locking, and audit
as separate operations. A single Nest transaction gives tenant/RBAC authority,
exact idempotent replay, and a reversible canary without changing visible UI or
requiring a new table. The source and disposable database lanes are green, but
hosted migration/data review and spend-bounded provider approval remain
independent release gates.

## D-116 -- Route grouped BOM-to-PO creation through Nest without fallback (2026-08-02)

Decision: keep supplier-grouped BOM generation as a distinct command at
`POST /v1/procurement/purchase-orders/from-bom/grouped`. The browser submits
only the BOM UUID and an opaque idempotency key. Nest derives tenant and actor
authority, validates active same-tenant rate cards/vendors and approved
budget mappings, allocates all PO numbers under one tenant lock, inserts the
complete assigned group, records unassigned lines in the result, locks the
BOM only after success, and stores the full result for exact replay. The
transaction rolls back the entire group on any failure.

Rationale: the legacy action performed grouping, number allocation, inserts,
BOM locking, and audit as separate browser-side writes. Treating the supplier
set as one command prevents partial PO groups and duplicate retries while
preserving the current wizard. A separate boundary avoids silently changing
the single-PO contract. API and Next grouped canaries stay exact-`true` plus
UUID-allowlisted and closed by default; selected core failures never fall back
to a second writer. No schema change or hosted mutation is needed for this
source slice.

Validation: CI run `30742910106` passed the full Postgres 17/Redis
reproducibility lane, including the grouped transaction integration, plus
lint, typecheck, tests, secret scan, and build. Hosted migration/data/audit
review and spend-bounded deployment approval remain independent gates.

## D-117 -- Route delivery receipt through Nest without fallback (2026-08-02)

Decision: add a dedicated `delivery_workflow_requests` ledger and the strict
Nest command `POST /v1/procurement/deliveries/:deliveryScheduleId/receipt`.
The browser sends only optional bounded notes and an opaque idempotency key.
Nest derives tenant/actor membership, requires `delivery.receive`, locks the
delivery schedule, accepts only `scheduled` or `in_transit`, stamps receipt
metadata, stores the result, and writes semantic audit in one transaction.
Route the existing Server Action only for exact-`true` plus UUID-allowlisted
tenants; selected core failures never invoke the direct writer. Keep all
flags and tenant lists false/empty by default.

Rationale: Stock Receipt creation already requires an accepted delivery, while
the legacy receipt button could update `delivery_schedules` outside a durable
replay boundary. A single server transaction prevents duplicate/lost-response
effects and keeps tenant/RBAC/audit authority out of the browser without
changing the current panel. Site prep, inspection, acceptance, and cancellation
remain separate steps to avoid a big-bang delivery rewrite. Hosted migration,
duplicate-data repair, audit recovery, readiness, and spend-bounded deployment
remain independent promotion gates.

## D-118 -- Preflight delivery visibility before idempotency claim (2026-08-02)

Decision: check that the requested delivery schedule exists for the
authenticated tenant inside the Nest transaction before inserting or claiming
the delivery workflow idempotency row. Keep the composite tenant foreign key
on the ledger as the final integrity guard.

Rationale: an unknown or cross-tenant schedule must produce the stable
tenant-safe `Delivery not found` contract, not a leaked PostgreSQL constraint
error. The preflight still leaves all official mutation, replay, audit, and
tenant authorization inside the same transaction. Disposable Postgres 17/Redis
integration passed after this correction; hosted migration and provider
promotion remain separately gated.

## D-119 -- Route journal reversal through Nest without fallback (2026-08-02)

Decision: add a dedicated `journal_reverse_requests` ledger and the strict
Nest command `POST /v1/finance/journals/:journalEntryId/reverse`. The browser
sends only a bounded reason, posting date, and opaque idempotency key. Nest
derives tenant and actor authority, requires the existing `finance.post`
capability, preflights same-tenant journal visibility, locks the journal,
invokes the existing PostgreSQL reversal function, stores the exact result,
and writes semantic audit in one transaction. The Next adapter is selected
only for exact-`true` plus UUID-allowlisted tenants; selected core failures
never invoke the direct writer. All flags remain false/empty by default.

Rationale: reversal creates an official financial journal and an equal/opposite
posted entry. The old Server Action called the database function directly and
could not durably bind a lost response to one retry. A tenant-scoped ledger
and one Nest transaction provide replay, RBAC, audit, and stable error
boundaries while preserving the existing finance screen. The database
function remains ledger/numbering authority; AI/Python remains advisory.

Validation and release boundary: local source gates pass, but the new
PostgreSQL integration requires the explicit disposable environment. GitHub
run `30745515593` was blocked before job execution by account
payment/spending-limit state. Hosted migration/data/audit review and
spend-bounded provider approval remain independent; no hosted state changed.

## D-120 -- Reuse delivery ledger for inspection start (2026-08-02)

Decision: add `start_inspection` to the existing
`delivery_workflow_action` enum and expose
`POST /v1/procurement/deliveries/:deliveryScheduleId/inspection/start` as a
closed-by-default Nest command. The command accepts only an empty strict body
and an opaque idempotency key, rechecks same-tenant membership and
`delivery.receive`, locks a `received` schedule, inserts the pending
inspection, transitions it to `inspecting`, and commits replay data plus
semantic audit in one transaction. The existing Server Action selects it only
for exact-`true` plus UUID allowlist and never falls back after selection.

Rationale: inspection start is an official delivery state change and must not
be a browser-side sequence of inspection insert plus schedule update. Reusing
the already tenant-scoped ledger avoids another idempotency table while the
action enum keeps receipt and inspection requests distinguishable. Later
inspection result/acceptance and cancellation commands remain separate so the
delivery rewrite stays incremental.

Validation and release boundary: local focused/full suites, typecheck, lint,
build, release-plan tests, Actionlint, Gitleaks, and diff checks passed; the
guarded database integration was skipped without its explicit environment.
Source is pushed as `08567b8b4b529f43126925ff67df132e15f71818`. GitHub run
`30746647147` failed before executable steps, and no hosted migration or
provider mutation occurred. All four inspection-start flags remain
false/empty.

## D-121 -- Reuse delivery ledger for inspection completion (2026-08-02)

Decision: add `complete_inspection` to the existing
`delivery_workflow_action` enum and expose
`POST /v1/procurement/deliveries/:deliveryScheduleId/inspection/complete` as a
closed-by-default Nest command. The browser sends only result, bounded notes,
and an opaque idempotency key. Nest derives tenant and actor, rechecks
`delivery.receive`, locks the `inspecting` schedule and pending inspection,
requires defect evidence for `fail`, commits inspection plus accepted/rejected
status, stores exact replay, and writes semantic audit in one transaction.
Selected core failures never invoke the direct writer.

Rationale: inspection completion is an official terminal delivery decision;
two independent browser writes could leave inspection history and delivery
status inconsistent or duplicate a decision after a lost response. Reusing
the existing tenant-scoped ledger keeps receipt, start, and completion under
one replay boundary while distinct enum actions preserve audit semantics.
Notifications and later stock/three-way matching remain separate concerns.

Validation and release boundary: local full suites, typecheck, lint, builds,
release-plan tests, Actionlint, Gitleaks, and diff checks passed. The guarded
database integration was skipped without its explicit environment. Source is
pushed as `67beedab53680238f785e0947d90588eedd71e3e`; GitHub run
`30748096044` failed before executable steps; no hosted migration or provider
mutation occurred. All four inspection-completion flags remain false/empty.

## D-122 -- Reuse delivery ledger for cancellation (2026-08-02)

Decision: add `cancel_delivery` to the existing `delivery_workflow_action`
enum and expose
`POST /v1/procurement/deliveries/:deliveryScheduleId/cancel` as a
closed-by-default Nest command. The browser sends only a bounded reason and
opaque idempotency key. Nest derives tenant and actor, rechecks
`delivery.receive`, locks a cancellable schedule, stores cancellation evidence,
commits the exact replay result, and writes semantic audit in one transaction.
The compatibility action selects Nest only for exact-`true` plus UUID allowlist
and never falls back after selection.

Rationale: cancellation is an official terminal delivery decision. Leaving
the transition as a browser-side direct update would allow duplicate or
cross-tenant decisions and would not bind a lost response to one retry. Reusing
the existing tenant-scoped delivery ledger keeps receipt, inspection, and
cancellation under one replay boundary while explicit columns preserve the
business evidence needed for review. Python/AI remains advisory.

Validation and release boundary: local focused/full suites, typecheck, lint,
build, release-plan tests, Actionlint, Gitleaks, and diff checks passed; the
guarded database integration was skipped without its explicit environment.
Source is pushed as `e8d4a6c181358756879435a76e8bd5a9317cc751`. GitHub run
`30749461755` failed before executable steps because of account
payment/spending-limit state. No hosted migration or provider mutation
occurred; all four cancellation flags remain false/empty.
