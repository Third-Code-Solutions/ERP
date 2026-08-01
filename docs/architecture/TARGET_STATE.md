# Target State

Third Code ERP remains an incremental TypeScript system. The target is a
modular monolith, not a rewrite and not a microservice fleet.

## Authority boundaries

```text
Browser
  -> Next.js frontend/BFF
    -> NestJS modular monolith
      -> PostgreSQL transaction + audit
      -> Redis/BullMQ
      -> object storage
      -> Python analysis services
```

- Next.js owns rendering, interaction, browser-safe reads, and compatibility
  adapters during migration.
- NestJS authorizes and commits official ERP transactions.
- PostgreSQL is the source of truth and enforces critical constraints.
- Redis and BullMQ provide queues, retries, caching, idempotency coordination,
  and distributed locks.
- Python returns analysis, extraction, forecasts, and document-processing
  evidence. It never approves or finalizes an ERP transaction.
- Supabase Storage or an equivalent object store holds files; PostgreSQL holds
  tenant-scoped metadata and immutable evidence references.

## Governance source of truth

- Explicit owner-approved architecture decisions and migration documents govern
  current implementation when older repository instructions conflict.
- Repository bootstrap files must not reference missing documents or superseded
  stack choices.
- Reconcile stale governance in a dedicated reviewed change; do not silently
  let obsolete pnpm, PostgreSQL, API, or queue rules redirect implementation.

## Required invariants

1. Every business record has a non-null tenant scope.
2. Every sensitive command has explicit capability authorization.
3. Official mutations and their audit attribution share one database
   transaction.
4. Monetary values use exact decimal/numeric types, never floating point.
5. Approval workflows use explicit persisted state machines and guarded
   transitions.
6. Retryable critical commands have an idempotency key and durable result.
7. Critical integrity is protected by database constraints as well as service
   validation.
8. Browser code cannot write sensitive tables directly.
9. AI output is advisory and traceable to inputs/model/version.
10. Existing public behavior is preserved until a replacement slice passes
    contract, integration, tenant-isolation, security, and rollback checks.
11. Auth-triggered tenant provisioning uses a narrowly scoped
    `SECURITY DEFINER` function with an empty `search_path`, fully qualified
    objects, no client execution privilege, and atomic tenant/Admin creation.
    User-editable signup metadata is display data only, never authorization.

## Nest module shape

Modules align to business capabilities: identity/access, tenants, CRM,
projects, cost control, procurement, inventory, construction, finance,
documents, workflow, audit, and reporting. Modules share one deployment and
one transaction boundary where required; they do not share private tables or
reach through each other's internals.

## Release evidence

- Attribute Git commits and provider actions to the explicitly authorized
  release identity. A provider-level `BLOCKED` deployment is not a build and
  cannot be presented as a release.
- Preserve one exact release SHA across GitHub refs, Vercel metadata, Railway
  metadata, and database migration evidence when that SHA changes each
  deployable artifact. For a watched-path skip, record the skipped event and
  prove the retained artifact's exact runtime SHA and readiness.
- Prove hosted identity and tenant boundaries through no-write failure paths
  before enabling a migrated transaction. Snapshot affected records and audit
  state before/after.
- Before enabling a migrated command, execute one explicitly authorized,
  reversible transaction against designated demo data. Restore through the
  same Nest authority, reconcile both append-only audit records, and prove
  tenant hash-chain continuity.
- Canary tenants must begin with a verifiable genesis-rooted audit chain, an
  active Supabase Auth identity, a same-tenant application user holding the
  required capability, and a non-critical reversible record. Historical chain
  failures are never waived, deleted, or rewritten to make a rollout pass.
- Create the dedicated canary through the normal public signup and authenticated
  Project-create flow. Do not insert Auth, tenant, user, Project, or audit rows
  through an operator SQL session or a one-off service-role script.
- Run the redacted read-only Project cutover planner immediately before and
  after the maintenance window. Store the complete mutable business baseline
  only in the approved restricted release artifact, never in Git or provider
  logs.
- Gate incremental production routing by exact command flag and an explicit
  database-derived tenant allowlist. Missing or malformed canary configuration
  must retain the legacy selector.
- Correlate each official command across Web and Nest with a validated UUID.
  Structured runtime outcomes may contain operation, method, status, outcome,
  and duration only; never log bearer tokens, command payloads, URLs with
  identifiers/query values, tenant IDs, user IDs, or business-record IDs.
- Keep root package-manager policy in the supported workspace configuration;
  frozen installs must not mutate the reviewed lockfile or emit ignored-setting
  warnings.
- Pin release tooling to immutable versions and verify downloaded binary
  digests before execution; never bootstrap a release gate from a mutable
  upstream branch.
- Rebuild PostgreSQL 17 from zero and reject skipped database tests.
- Permit an isolated native PostgreSQL 17/Redis 7.4.9 lane as the authoritative
  application-schema M1 gate when paid hosted runners and local virtualization
  are unavailable. Require a clean full migration replay, zero skipped database
  tests, deterministic schema fingerprint, Nest integration/smoke proof, and a
  separate hosted Supabase ledger/catalog comparison. The pinned container lane
  remains an equivalent future option, not a payment prerequisite.
- Run the no-cost lane only from a private repository through a manual,
  actor-restricted, repository-scoped short-lived runner. Start it for one
  reviewed workflow, then stop, deregister, and erase it. Never install it as a
  service, expose production secrets, upload dependency caches/artifacts, or
  execute unreviewed pull-request code.
- Treat runner deregistration and credential erasure as immediate security
  gates. Retry non-secret work-directory deletion separately when Windows
  retains transient file handles.
- Exercise Nest identity, membership, capability, tenant, concurrency, audit,
  and rollback behavior against that disposable database.
- Use real Redis for readiness and container smoke checks.
- Compare the target database migration ledger before any rollout.
- Treat database enum labels and ordering as versioned application contracts;
  verify canonical catalogs during clean replay and hosted release planning.
- Close production database incident repairs only after the affected
  authenticated route is hard-reloaded, its critical regions render, the
  browser console is clean, and provider runtime errors are reconciled.
- Never use a production database as a write-test fixture.
- Require a read-only, hash-bearing release plan for every hosted target.
- For non-linear history, reconcile an isolated restored clone with a new
  forward-only migration; never blindly replay missing historical files.
- Treat platform backup/PITR and Storage object recovery as separate evidence.
- Require database test commands to receive an explicit disposable
  `DATABASE_URL`; never auto-load an application `.env.local` as a write-test
  target.
- Use a direct or session-mode PostgreSQL connection for migration tooling.
  Reserve transaction-mode poolers for application traffic that does not
  require prepared statements.

## Deployment mapping

- Vercel `thirdcode-erp`: Next.js frontend/BFF only.
- Vercel Git auto-deploy disabled. Source publication does not authorize a
  build; production uses one explicitly approved deployment of a green SHA,
  with promotion preferred over redundant rebuilds.
- Vercel Web Analytics: first-party product telemetry with a clean browser
  console and no transaction authority.
- Railway `Third Code ERP API`: the single NestJS modular monolith.
- Railway `Redis`: BullMQ, caching, retry coordination, and distributed locks.
- Supabase project `aqqrtkmtcsfkbyyqxowv`: PostgreSQL, Auth, and Storage.
- Python analysis workers remain separately deployable but cannot become
  transaction authorities.

## Onboarding classification boundary

- Organization type is constrained tenant profile data, not authorization.
- One shared catalog must drive UI options, TypeScript validation, database
  constraints, provisioning logic, tests, and reproducibility checks.
- Unrecognized signup metadata must fail safely to `other`.
- Roles, capabilities, memberships, and tenant access must never be derived
  from user-editable organization metadata.
- Applied migrations remain immutable. Any rollback is a reviewed forward
  compensation while preserving existing tenant and identity rows.

## Public landing quality boundary

- Keep the landing AIDA structure, original generated construction imagery,
  Satoshi display typography, dense 24-cell bento, and scoped GSAP motion.
- Render the hero in no more than three visual lines at supported desktop,
  tablet, and 390px mobile widths. Hide the decorative inline heading image
  when it would force extra mobile lines.
- Use descriptive content labels instead of decorative section/question
  ordinals. Retain numeric state only where it communicates functional
  position, such as an accessible carousel counter.
- Require zero horizontal overflow, visible focus states, reduced-motion
  behavior, and at least 44px visible mobile interaction targets.
- Load Vercel Analytics only on Vercel. Local or alternative-host production
  artifacts must not emit missing-script console errors.
- Gate any paid frontend build on green local checks, browser evidence at
  1440/768/390, exact charge disclosure, and explicit user approval.

## Document-processing evidence boundary

- A processing request enters NestJS with verified identity, explicit
  capability, same-tenant document lookup, and a required idempotency key.
- PostgreSQL stores processing state machine and immutable evidence.
- BullMQ carries only an opaque processing-job ID. NestJS reloads tenant,
  Project, document, actor, and object context from PostgreSQL.
- Python receives one short-lived exact-object read grant and returns bounded,
  versioned, hash-linked evidence. It receives no database credential,
  service-role credential, tenant authority, capability, or approval state.
- NestJS validates evidence and commits pending-review scope rows inside one
  actor-stamped transaction.
- Duplicate delivery returns one durable result and at most one draft BOM.
- `documents` and `scope_items` use composite tenant/Project constraints and
  transactional audit triggers.
- Legacy upload remains default until a disabled-by-default, tenant-scoped
  canary proves compatibility, reconciliation, and rollback.

## Upload access boundary

- Before issuing a signed object-upload URL or recording document metadata,
  server code loads Project by both authenticated tenant and Project ID.
- Missing and cross-tenant Projects return the same 404 response.
- Rejection occurs before quota, Storage, database mutation, parsing, AI, or
  queue work.
- Database composite tenant/Project constraints remain required defense in
  depth; application checks do not replace them.

## Document mutation authority boundary

- `document.manage` is an explicit server-enforced capability. Operational
  roles may manage documents; `viewer` remains read-only.
- Signed upload credentials are never returned unless identity, tenant,
  capability, same-tenant Project, quota, Storage issuance, and audit append
  all succeed.
- Official document creation and its actor-stamped hash-chain audit entry
  commit in one PostgreSQL transaction.
- Document deletion binds document ID, tenant ID, and Project ID in the
  authoritative query. Derived scope deletion, document deletion, and audit
  append commit atomically.
- Object Storage cleanup occurs only after the database transaction succeeds.
  A cleanup failure may leave an inaccessible orphan object, but cannot leave
  a live database record pointing to an object deleted before commit.
- M2 still adds composite database constraints and audit triggers. Application
  authority checks are immediate defense, not a substitute for database
  integrity.

## Cortex entity consistency boundary

- One typed registry covers every versioned Cortex node type and owns its
  display label, color, access path, permitted source table, and record route.
- Non-admin roles are deny-by-default for unknown types. Application graph,
  entity lookup, citations, and record navigation use the same registry.
- Entity lookup first resolves a tenant-scoped node, then verifies that the
  node type owns the requested source before retrieval. Forbidden and
  mismatched records use the same non-enumerating 404 response.
- Registry completeness is checked against the database enum contract.
- Application filtering supplements PostgreSQL RLS and database authorization;
  it never replaces them. Any new node type requires coordinated database
  policy, mirror, registry, route, and test changes.

## Cortex citation trust boundary

- A grounded answer may expose only citations already authorized for the
  caller's tenant and current role.
- The streamed answer body remains backward-compatible `text/plain`; bounded
  navigation metadata travels in a separate response header.
- Persisted conversation metadata is an index only. History rendering
  rehydrates citation node IDs from current graph state and never trusts stored
  titles, references, Project IDs, or routes.
- Canonical entity-registry navigation owns record URLs. Unknown or non-routed
  node types render non-interactive labels instead of guessed links.
- Citation controls require readable labels, visible focus, 44px mobile
  targets, bounded text, and zero horizontal overflow.

## Cortex record-context boundary

- Supported operational detail pages expose the same grounded record context
  without embedding database or business logic in individual React pages.
- One exact route resolver maps UUID-backed detail paths to canonical Cortex
  source tables. Unsupported, nested, malformed, and collection paths fail
  closed.
- Dashboard route authorization executes first. Cortex entity retrieval then
  enforces authenticated tenant, source/type ownership, and current-role node
  scope.
- Project detail keeps its existing inline panel; layout injection must never
  duplicate it.
- Canonical registry routes open exact records when a detail surface exists.
- Context remains read-only. It cannot approve, post, reverse, allocate, or
  finalize an ERP transaction.

## Cortex relationship-meaning boundary

- A record backlink must communicate both the connected record and why the
  graph connects it to the current record.
- Directional labels derive only from canonical server-returned edge types and
  direction. Unknown edge types receive a neutral bounded label.
- Relationship rows are assembled only from the tenant- and current-role-
  filtered context pack. Missing citations are omitted; destinations are never
  guessed from edge metadata.
- Canonical entity-registry routing owns navigation. Unsupported records remain
  readable static context.
- The response is bounded, read-only, keyboard accessible, responsive, and
  cannot approve or finalize an ERP transaction.

## Cortex evidence-presentation boundary

- Operational record context exposes a concise evidence trail only after
  authenticated tenant, source/type, and current-role authorization.
- Raw provenance remains server-only. Actor IDs, internal origin references,
  hash-chain values, tenant/subject identifiers, and global sequences are not
  presentation data.
- Server maps supported origins to clear user-facing meaning and an ISO
  timestamp. Unknown origins fail safely; invalid timestamps disappear.
- Evidence order remains newest-first and response size remains bounded.
- Presentation uses a native accessible disclosure with no client mutation,
  approval, posting, or workflow authority.

## Cortex focused-navigation boundary

- A record-to-graph link is an untrusted focus request, not authorization.
- Focus input must be a canonical source table plus UUID supplied together.
  Invalid input fails before graph access.
- The server derives tenant and role from the authenticated profile, resolves
  the current node, verifies source/type ownership, and returns the same 404
  for missing, mismatched, or forbidden records.
- Focused retrieval must recheck tenant and current-row status on the focus,
  every edge, and every joined neighbor. Role scope is applied before a
  neighbor can enter the response.
- Response size is bounded to the focus plus at most 80 direct neighbors.
  `focusNodeId` is server-derived and must match a returned node.
- The unfocused whole-graph API remains backward compatible.
- Presentation must identify the bounded count as shown, keep the exact focus
  visually persistent, avoid drawer occlusion, preserve keyboard navigation,
  and produce no horizontal overflow at 1440, 768, or 390.
- Focused graph context remains read-only and cannot approve, post, reverse,
  allocate, or finalize an ERP transaction.

## Cortex conversation-context boundary

- A saved conversation may bind immutably to one canonical ERP record through
  a complete source-table and UUID pair. Unscoped conversations remain valid.
- Browser input is an untrusted navigation hint. The server derives tenant and
  role, resolves the current node, checks canonical source/type ownership, and
  applies current-role scope before reading or writing conversation data.
- Missing, mismatched, revoked, and forbidden records return the same
  non-enumerating response. History must hide context the current user can no
  longer access.
- Browser roles may select authorized conversation rows but cannot insert,
  update, or delete conversations or messages directly. Official writes use
  server transaction authority.
- Record context grounds analysis and citations only. AI may explain,
  summarize, or recommend; it cannot approve, post, reverse, allocate, or
  finalize ERP transactions.
- The next presentation slice must expose the active record clearly, preserve
  saved-conversation semantics, and pass keyboard, responsive, console, and
  overflow QA before any explicitly approved consolidated Vercel release.

## Cortex conversation-context presentation

- The chat surface always names its scope: one authorized canonical record,
  company-wide, or unavailable.
- A requested but unauthorized record cannot silently become a company-wide
  chat. Input and suggestions fail closed until focus is cleared.
- Saved threads show their record scope. In-place restore requires exact
  canonical-pair equality; other contexts use explicit navigation.
- Starting a new chat preserves the page's authorized record context. Changing
  records never mutates or rebinds an existing conversation.
- Record-specific prompts explain, summarize, and identify evidence or linked
  work only. Presentation cannot approve or finalize an ERP transaction.
- Keyboard focus remains visible, mobile targets are at least 44px, long titles
  truncate safely, and 1440/768/390 layouts have no horizontal overflow.

## Cortex conversation deep-link boundary

- Saved conversations have shareable in-application URLs containing only an
  opaque UUID plus optional canonical record focus.
- UUID validation occurs before client restore. URL possession grants no
  access; the detail API reauthorizes owner, tenant, current role, persisted
  record context, and citations.
- Restoring or creating a conversation updates URL state without a page reload.
  Starting a new chat removes conversation identity while retaining authorized
  record focus.
- Restore is latest-request-wins. Stale network responses cannot replace newer
  conversation state or repopulate a cleared chat.
- Cross-record history navigation carries the immutable conversation identity
  and canonical context together. Context mismatch fails closed.
- URLs never contain tenant ID, user ID, prompt text, answer text, or internal
  graph-node ID.

## Cortex recent-history search boundary

- History search operates only on the bounded, already-authorized recent
  conversation response. Presentation must label this scope honestly and must
  not imply full-history or cross-tenant search.
- Matching may use conversation title and human canonical-context labels only.
  Tenant IDs, user IDs, record UUIDs, and internal graph-node IDs remain
  excluded from searchable and visible text.
- Search is local, deterministic, case- and diacritic-insensitive, preserves
  server order, and never weakens owner, tenant, current-role, record-context,
  or citation authorization.
- Keyboard focus is visible, mobile targets are at least 44px, empty results
  are bounded, and the open panel produces no horizontal overflow.

## Shared request-rate-limit identity boundary

- Anonymous requests are bucketed by network address.
- Authenticated requests are bucketed by verified user identity, not by a
  shared IP and not by browser-supplied identity.
- Transitioning from authenticated to anonymous traffic cannot reuse the
  authenticated counter under a lower anonymous limit.
- Two authenticated users behind one NAT cannot consume each other's bucket.
- Rate limiting is defense in depth. Tenant authorization and permission
  checks remain mandatory for every sensitive route.
- A future Redis-backed limiter must preserve these identity semantics while
  adding shared-instance atomicity, bounded retention, and operational metrics.

## Cost-controlled frontend activation boundary

- Git-triggered Vercel deployment stays disabled.
- Candidate preparation is source-only. Production requires explicit approval.
- One approved release means one queued Standard production build, no preview,
  no duplicate deploy, and exact SHA verification.
- Production acceptance requires public and authenticated browser evidence,
  runtime-error review, API readiness, release identity, and responsive proof.
- The retained last-known-good deployment remains the instant-rollback target
  until the new release is verified.

## Permission-aware Today boundary

- Dashboard data follows the same canonical role policy as direct route
  access. A universally reachable shell never implies universally readable
  executive data.
- Loader selection happens before database work. A forbidden dashboard mode
  cannot query and then hide restricted data in React.
- Restricted roles receive tenant- and assignee-scoped work only.
- Executive pipeline, GP, forecast, rep, and alert reads require the same role
  permission as `/pipeline/board`.
- Quick links derive from the canonical navigation registry and cannot expose
  forbidden workspaces.
- Today remains read-only. It cannot approve, post, reverse, allocate, commit,
  delete, or finalize an ERP transaction.

## Permission-safe universal search boundary

- Search input is bounded and interpreted as literal text. User-supplied
  wildcard or escape characters cannot broaden a query.
- Searchable record types are selected from the same canonical role policy as
  direct navigation. A result link never grants permission and every query
  still authorizes independently.
- Base and joined records repeat the authenticated tenant predicate. Foreign
  display labels cannot be joined into an otherwise tenant-scoped result.
- Assignee-scoped types remain assignee-scoped. Search cannot turn a personal
  task surface into a tenant-wide task directory.
- User-specific results are private and non-cacheable.
- Search is read-only. It cannot approve, post, commit, allocate, delete, or
  finalize an ERP transaction.

## Search-to-Cortex draft boundary

- Record search and AI drafting are explicit modes. Search is the default;
  Ask mode does not fan the question into record-search requests.
- Browser-to-Cortex draft transport uses an opaque, expiring, one-time
  identifier. Prompt text never enters the route, server render parameters,
  provider request, or analytics event during handoff.
- The server accepts a draft handoff only for a company-wide Cortex route
  without record focus or saved-conversation identity.
- Draft consumption removes browser state before parsing. Malformed, expired,
  future-dated, empty, undersized, or invalid-ID state fails closed.
- Opening Cortex only prefills and focuses the composer. The user must
  explicitly press Send before any AI request.
- The AI surface remains analysis-only. It cannot approve or finalize an ERP
  transaction.

## Public signing integrity boundary

- A public signing token is the only authority for the external flow. Tenant,
  entity type, entity ID, source Project, document ID, and audit identity are
  never accepted from browser input.
- Signature payloads are bounded and structurally validated before Storage or
  database work.
- Storage upload uses a collision-resistant key. Official database state is
  committed only after the exact signing-session row is locked and its signed,
  revoked, and expired state is rechecked.
- Signature document creation, tenant-scoped source stamping, signing-session
  stamping, and entity audit share one database transaction.
- An unauthenticated external signer is represented by nullable `actor_id`.
  Fabricated system users and zero UUIDs are forbidden.
- Audit failure fails the official signature transaction. Database failure
  triggers compensating Storage cleanup.
- Concurrent and replayed submissions cannot create another signature
  document, source transition, session stamp, or audit.
- This safe Next.js authority is transitional. The public signing command must
  move behind NestJS incrementally without weakening the token, transaction,
  tenant, audit, replay, or cleanup invariants.

## RFQ dispatch integrity boundary

- BOM-to-RFQ creation produces at most one official RFQ per tenant/BOM.
- Browser input never supplies system mode, tenant, actor, or role. Manual
  dispatch derives all authority from the authenticated server profile.
- Background dispatch accepts only a trusted queue event and revalidates any
  initiating actor against the event tenant before audit attribution.
- BOM lock, retry check, tenant-scoped line/rate lookup, RFQ insert, and audit
  share one database transaction.
- Database uniqueness and a tenant-composite BOM foreign key remain the final
  retry and cross-tenant integrity boundary.
- Notification is post-commit and independently retryable. Replaying an
  already committed dispatch emits no duplicate audit or notification.
- Browser database roles may read authorized RFQ state but cannot mutate RFQs
  or quotes directly.
- The transitional Next.js service must move behind NestJS incrementally
  without weakening transaction, idempotency, tenancy, permission, actor, or
  audit invariants.

## RFQ quote workflow integrity boundary

- A quote submission has one stable tenant-scoped idempotency key and one
  canonical BOM-line identity. Browser retries reuse the key; exact replay
  returns the durable result and conflicting reuse fails closed.
- The server derives material identity from the locked RFQ line. Browser input
  cannot select a cross-tenant or unrelated material.
- RFQ, vendor, material, BOM line, actor, and quote references are
  tenant-validated before mutation and protected by database constraints where
  persistence requires the relationship.
- Quote creation, first-quote status change, and their audits share one
  database transaction. Completion/cancellation and audit also share one
  transaction.
- Completion rechecks full line coverage while holding the RFQ lock. Client
  rendering is convenience only and never workflow authority.
- PostgreSQL enforces the explicit state graph. `completed` and `cancelled`
  are terminal; an invalid transition fails independently of application code.
- Notifications occur only after commit. Notification failure cannot roll
  back or misreport an already committed official transaction.
- The current Next.js service is a compatibility implementation. The next
  incremental migration places the same commands behind a disabled NestJS
  procurement adapter before any provider-level cutover.

The disabled quote adapter now exists. Target activation remains a measured
single-tenant canary only after M1 provider gates; completion and cancellation
move later as separate, independently verified milestones.

The disabled terminal adapter now also exists. Quote and terminal routing use
independent exact flags and tenant allowlists so each command family can be
canaried and rolled back without dual writes. Production activation remains a
separate owner-approved milestone; the compatibility implementation stays
authoritative until that proof succeeds.

## Host-portable public discovery boundary

- One validated origin controls canonical metadata, Open Graph URLs,
  structured-data identities, portal links, `robots.txt`, and `sitemap.xml`.
- Vercel is a compatible host, not a permanent identity embedded throughout
  the application.
- Alternative hosting must set `NEXT_PUBLIC_SITE_URL` during the production
  build. Mixed origins, credential-bearing URLs, path-scoped origins, and
  silently malformed values fail closed.
- Sitemap timestamps represent verified content changes only. Unknown dates
  are omitted rather than synthesized.
- Hosting portability cannot weaken CSP, authentication, tenant isolation,
  authorization, audit, or transaction boundaries.

## Portable frontend runtime boundary

- The supported alternative is a full Node.js Next standalone runtime, never a
  static export that drops Middleware, Server Actions, route handlers, SSR, or
  per-request CSP nonces.
- The same reviewed SHA identifies source, image, `/api/health`, and
  `/api/ready`.
- Public browser variables are fixed at build time. Server credentials remain
  runtime-only and cannot enter image layers.
- The runtime is non-root, listens behind a TLS reverse proxy, exposes
  liveness and database readiness separately, and retains the previous image
  for immediate application rollback.
- Vercel remains disconnected and retained as external rollback until the
  alternative hostname passes authenticated, tenant-isolated production
  evidence and traffic cutover receives explicit approval.
# RFQ transaction-authority progress

- Manual BOM-to-RFQ creation now has a strict, tenant-derived NestJS command
  behind an independent disabled cutover gate.
- Quote logging and terminal RFQ transitions already use separate disabled
  NestJS adapters.
- Target remains one NestJS procurement authority for manual and automatic
  RFQ creation, quotes, and state transitions.
- Automatic creation now has a disabled Redis/BullMQ producer-consumer path
  owned by the NestJS modular monolith. The transitional Inngest path remains
  authoritative until equivalent notification delivery is idempotent and
  observable.
- A selected BullMQ job must reauthorize the queued actor at execution time,
  validate the approved BOM state, reuse the official RFQ transaction, and
  end in a bounded completed, retrying, failed, or dead-letter state.
- Python will not approve, create, complete, cancel, or otherwise finalize RFQ
  transactions.
- Cutover remains tenant-by-tenant, fail-closed, observable, reconciled, and
  reversible without a browser fallback after a selected Nest command begins.

## RFQ notification delivery boundary

- Official RFQ state, semantic audit, notification intent, and recipient
  snapshots commit atomically in PostgreSQL.
- Redis jobs contain opaque identities only. Recipient data, business copy,
  credentials, and provider responses remain outside Redis.
- PostgreSQL owns delivery idempotency, attempt ceilings, stale-processing
  recovery, terminal dead-letter evidence, and in-app uniqueness.
- Delivery revalidates tenant membership and the current procurement role.
  Python cannot approve, create, notify, or finalize an RFQ transaction.
- Provider email retries use one stable idempotency key and identical payload.
  Missing server-only email configuration fails closed.
- Recovery polling and automatic RFQ routing are independent exact flags,
  default false, and require a controlled tenant canary before activation.
- Browser roles may read their authorized notification rows but cannot write
  official notification, outbox, or delivery state.

## Controlled production delivery boundary

- Supabase migration parity must be proven before release. A current 55/55
  ledger is a no-op release condition, not permission to replay migrations.
- Railway rebuilds only when watched backend application files changed.
  Documentation-only repository commits must remain skipped.
- Vercel production releases are manually initiated from one reviewed SHA
  after local and disposable-database gates pass. Preview and production build
  counts are recorded because promotion may rebuild with production-only
  environment variables.
- Vercel Git remains disconnected after every approved release. Source pushes
  alone cannot consume Vercel build resources.
- A release is complete only after canonical health/readiness, authenticated
  browser behavior, runtime errors, HTTP 5xx, Railway readiness, Redis,
  Supabase migration parity, and rollback identity are verified.
- The frontend rollback target is the immediately previous ready production
  deployment. The backend rollback target is the previous healthy Railway
  image; database migrations remain forward-only unless an explicit
  compensating migration is reviewed.

## Purchase-order transaction boundary

- Browser forms submit validated commands to NestJS; React and Next.js Server
  Actions do not directly commit `purchase_orders`, `po_line_items`, approval
  stamps, receipts, or supplier-issuance state.
- NestJS derives tenant and actor from the verified Supabase principal, checks
  capability and state-machine transitions, validates same-tenant project,
  vendor, cost-code, and line references, then commits PO plus lines plus
  semantic audit in one PostgreSQL transaction.
- Money remains integer centavos or exact PostgreSQL decimal types; client
  totals are never trusted. Every retry carries a tenant-composite durable
  idempotency key and returns the original result without a duplicate PO.
- Redis/BullMQ carries only opaque notification identities after commit. Python
  may recommend or analyze, never create, approve, issue, receive, or finalize
  a Purchase Order.
- Current implementation is intentionally transitional: the Nest route and
  schema contract exist, but adapter is disabled and non-mutating until
  idempotency storage and parity evidence are added.
## 2026-08-01 evidence added for PO authority

The target modular monolith now has a concrete, disabled first transaction
slice: one Nest command owns standalone PO creation, PostgreSQL owns the
idempotency and number constraints, and Next delegates only when both exact
feature gates and the tenant allowlist match. The transaction is the boundary
for capability authorization, same-tenant reference checks, integer-centavo
calculation, audit, and replay. Python remains advisory and cannot finalize a
PO. The next proof required is disposable PostgreSQL/Redis integration plus a
single-tenant canary; hosted flags stay false.
