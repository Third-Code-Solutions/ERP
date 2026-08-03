# Target State

Third Code ERP remains an incremental TypeScript system. The target is a
modular monolith, not a rewrite and not a microservice fleet.

Release evidence policy (rechecked 2026-08-03): provider readiness is only a
necessary signal. A production promotion also requires an exact source SHA,
complete ordered migration ledger, duplicate-record decision, audit-chain
tenant approval, disposable integration evidence, rollback evidence, and a
spend-bounded provider action. Keep Vercel Git deployment disabled and avoid
preview builds while those gates are incomplete.

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

## Finance authority progression

Cash draft create, update, and delete now have the same Core boundary as
posted cash transitions: strict tenant-free commands, locked membership
authorization, tenant-owned target validation, transactional allocation
writes, durable replay, and semantic audit. The draft replay ledger retains
deleted target UUIDs without granting browser or general-role access. The
Next.js compatibility adapter and visible UI remain unchanged for unselected
tenants; the exact API flag and UUID allowlist remain false/empty until the
ordered hosted migration suffix, disposable database proof, rollback,
duplicate-data, audit-chain, provider-identity, and spend gates clear.

Customer invoice issue and reversal are now represented as separate Core
vertical slices. Each selected route owns authorization, tenant-scoped
idempotency, transaction orchestration, and semantic audit while PostgreSQL
continues to own journal balancing, fiscal-period rules, and invoice state.
The Next.js Server Actions remain compatibility adapters during migration; a
selected Core failure is terminal and cannot fall back to a second write. Both
invoice issue and reversal selectors and API flags stay false/empty until the
ordered hosted migration set, disposable integration, rollback, duplicate-data,
audit-chain, provider-identity, and spend gates are cleared.

Customer invoice cancellation follows the same boundary as a third finance
slice: a separate idempotency ledger and route, no browser authority fields,
and a PostgreSQL state transition reused inside the Nest transaction. The
cancellation selector remains disabled until the ordered hosted migration set
and the same disposable, rollback, data-integrity, audit, identity, and spend
gates clear.

## Delivery workflow authority slice

The delivery state machine is migrated one transition at a time. M3.17 makes
`scheduled -> site_preparing` a NestJS-owned, tenant-scoped transaction with a
durable idempotency result and transactional audit event. Next.js keeps the
existing Server Action contract and selects the Nest route only for an exact
server-side flag plus tenant allowlist; the selector fails closed and never
falls back to a second write. The API and frontend controls remain
false/empty until hosted migration reconciliation, disposable integration,
canary, rollback, and spend gates are green.

M3.18 extends the same authority boundary for
`site_preparing -> site_ready`: preparation notes, `site_prepared_at`, and
`site_prepared_by` are committed by NestJS in one tenant-scoped transaction
with durable replay and semantic audit. The Next compatibility adapter keeps
the legacy behavior for unselected tenants and fails closed after a selected
core error. Its API and frontend controls remain false/empty until hosted
parity and canary gates clear.

M3.19 applies the same boundary to supplier-bill posting: NestJS owns
`POST /v1/finance/supplier-bills/:supplierBillId/post`, rechecks the finance
capability from tenant membership, locks the bill, calls the existing payable
posting function, persists a strict idempotent result, and audits the status
change in one transaction. The Next action remains a compatibility adapter;
the API and frontend selectors are exact, tenant-allowlisted, and fail closed.

M3.20 applies the same boundary to supplier-bill reversal: NestJS owns
`POST /v1/finance/supplier-bills/:supplierBillId/reverse`, validates the
bounded reason and posting date, rechecks `finance.post`, locks the bill,
reuses the existing reversal function, persists an idempotent result, and
audits the status change atomically. The Next action is a compatibility
adapter with a stable retry key; selected Core failures never fall through to
a second write. Reversal controls stay false/empty until hosted migration,
duplicate-data, audit-chain, integration, rollback, and spend gates clear.
Python/AI has no approval or posting authority.

M3.21 applies the same boundary to cash posting and reversal: NestJS owns
`POST /v1/finance/cash-transactions/:cashTransactionId/post` and `/reverse`,
rechecks `finance.manage_cash`, locks the tenant membership and cash record,
reuses the existing database posting/reversal functions, persists one shared
tenant-scoped idempotency result, and audits the status change atomically. The
Next cash actions remain compatibility adapters with stable retry keys; a
selected Core failure never falls through to a direct second write. Cash
controls stay false/empty until the ordered hosted suffix, disposable
integration, rollback, duplicate-data, audit-chain, and spend gates clear.

M3.22 applies the same boundary to customer invoice issuance: NestJS owns
`POST /v1/finance/customer-invoices/:invoiceId/issue`, rechecks
`finance.issue_invoice`, locks the tenant membership and invoice, claims a
tenant-scoped idempotency ledger, reuses the existing
`issue_customer_invoice` database function, persists a strict issued result,
and audits the status change atomically. Next.js remains a compatibility
adapter with one stable retry key; selected Core failures never fall through
to a direct database function. Invoice issuance controls remain false/empty
until the complete ordered hosted suffix, disposable integration, duplicate
data, audit-chain, rollback, provider-identity, and spend gates clear.

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
- Current implementation is intentionally transitional: the Nest route,
  durable idempotency storage, and transaction parity are proven in disposable
  PostgreSQL/Redis, but the adapter remains disabled and non-mutating until
  provider readiness, hosted schema reconciliation, and a canary are approved.

## Purchase-order approval workflow slice (2026-08-01)

- The target state-machine authority now has a second disabled Nest boundary
  for PM submission, PM approval, Commercial approval, and rejection.
- PostgreSQL owns a tenant-composite idempotency ledger for each workflow
  command. The service locks the request and PO, rechecks membership and the
  action capability, commits status/stamps/audit/result together, and returns
  the saved result on retry.
- Issuance, supplier notification, receiving, BOM/grouped generation, and
  browser cutover remain separate milestones. Python cannot approve or finalize
  any of them.
- The hosted migration and flags remain gated by read-only Supabase
  reconciliation, provider identity, readiness/log checks, and a reviewed
  single-tenant canary.
- Current hosted evidence is intentionally not parity: 55 applied versus the
  repository's 57 migrations. The two candidate migrations are identified by
  version and hash in the operations log; no hosted SQL has run.
- Next.js has a server-only workflow client contract with its own exact flag
  and tenant allowlist. It is a preparation seam only; browser calls remain on
  the current action path until the transaction's notification behavior is
  equivalent and a canary is approved.
## 2026-08-01 evidence added for PO authority

The target modular monolith now has a concrete, disabled first transaction
slice: one Nest command owns standalone PO creation, PostgreSQL owns the
idempotency and number constraints, and Next delegates only when both exact
feature gates and the tenant allowlist match. The transaction is the boundary
for capability authorization, same-tenant reference checks, integer-centavo
calculation, audit, and replay. Python remains advisory and cannot finalize a
PO. The next proof required is disposable PostgreSQL/Redis integration plus a
single-tenant canary; hosted flags stay false.

## Landing surface evidence (2026-08-01)

Treat the public landing page as a stable product boundary while backend
authority migrates. Preserve the measured three-line hero, dense bento grid,
progressive disclosure, keyboard-accessible carousel/FAQ, and Organization /
SoftwareApplication / FAQPage structured data. Any future visual change must
carry source regression coverage plus desktop/mobile browser evidence before a
provider deployment is considered.

## Authority proof evidence (2026-08-01)

The first standalone PO transaction slice has disposable runtime evidence:
PostgreSQL 17 replayed all 56 migrations, all 243 database tests executed, and
all 7 Nest/Redis integration tests passed. Hosted Supabase remains the source
of truth and must be reconciled read-only before any candidate migration is
applied.

## Purchase-order workflow notification parity (2026-08-01)

The target authority boundary now includes transactional notification intent:
Nest commits workflow state, audit evidence, outbox payload, and
tenant/role-scoped delivery rows together. BullMQ carries only opaque delivery
identities; PostgreSQL remains the source of truth for retry, stale processing,
dead-letter, and in-app uniqueness. The notification gate is independent and
defaults off, so no tenant can activate workflow writes without proven
notification parity. The current Next Server Actions and visible UI remain the
rollback path until hosted reconciliation and canary evidence are approved.

## Canary integrity gate (2026-08-01)

The target release process requires a read-only tenant audit-chain check before
any write canary. A blocked result (predecessor-link or hash mismatch, missing
actor capability, or failed audit controls) stops provider deployment and flag
enablement; repair is a separate reviewed milestone. Current demo evidence is
blocked by 2 link mismatches, 151 hash mismatches, and a missing
`project.update` capability for the selected actor.

## Audit hash parity (2026-08-01)

All new API and Next server audit writes use the same PostgreSQL-compatible
hash formula as `public.audit_log_trigger()`, and shared verification uses that
formula as well. Historical mismatches stay immutable and visible to recovery
review; no release may treat parity code as a historical repair.

## Read-only audit recovery boundary (2026-08-01)

Recovery planning must use a repeatable-read/read-only transaction, opaque
tenant references, bounded system event buckets, and explicit blocker output.
The planner cannot emit entity IDs or business values, cannot rewrite audit
history, and cannot clear the canary gate by itself.

Historical profile verification is also bounded to reviewed algorithms. Rows
matching neither the current database formula nor the legacy JSON formula are
unknown evidence and must remain a release blocker until provenance is proven.

## Release invariant (2026-08-01)

The target state requires tenant-scoped Purchase Order number uniqueness before
the new idempotency authority is enabled. The hosted demo dataset currently
contains one duplicate group (12 records); its remediation is an explicit data
decision, not an automatic migration side effect. The three forward migrations
must apply atomically and be ledger-recorded before any PO workflow flag or
production promotion is enabled.

The target release process now includes a bounded duplicate-remediation report
before the uniqueness migration. It is evidence-only: an owner must approve a
reversible record-level remediation before any data mutation is authored.

Runtime clean-room invariant: production web source and public text contain
only Third Code ERP branding. Legacy vendor markers are prohibited by a web
runtime regression test; internal provenance documentation is not shipped as
runtime output.

## Controlled release evidence boundary (2026-08-01)

- One read-only release planner must aggregate database ledger parity,
  duplicate-record safety, audit-chain integrity, and live backend/frontend
  readiness before a provider release is eligible.
- A missing evidence source is `review_required`, not an implicit pass. The
  planner's clear result is a prerequisite for any SQL application, flag
  enablement, or manual deployment.
- The planner remains provider-neutral and cost-safe: it cannot invoke a
  deployment, mutate Supabase, or change Vercel/Railway settings.

## Inventory receiving authority boundary (2026-08-01)

The target receiving flow creates only a tenant-scoped `draft` Stock Receipt
through NestJS. The command accepts no tenant or actor authority from the
browser, derives membership from PostgreSQL, and commits the request, receipt,
lines, idempotency result, and semantic audit in one transaction. Quantities
are parsed as integer micro-units and values as exact centavos; PostgreSQL
constraints and inventory triggers remain the final integrity boundary.

The idempotency record is server-only and replay returns the original result;
conflicting reuse is rejected. A rejected or failed transaction leaves no
receipt, lines, request completion, or semantic audit. Posting, ledger effects,
supplier-bill matching, and reversal stay separate explicit workflows. The
Nest command remains behind a false flag and empty tenant allowlist until the
hosted migration, audit recovery, duplicate remediation, and controlled
provider gate are independently clear.

## CAD document-processing boundary (2026-08-01)

Python is a document-processing adapter, not an ERP transaction authority. It
may download a tenant-scoped source file from object storage, convert or parse
it, and return bounded extraction evidence. The application authority validates
the document's tenant/project relationship and commits derived scope rows,
exact money totals, replacement semantics, and audit evidence in one database
transaction. The future Nest adapter will own this same commit contract before
the transitional Next server path is retired.

## CAD evidence authority target (2026-08-01)

The NestJS modular monolith owns the official CAD evidence commit. Python may
only read object-storage input and return bounded, schema-validated evidence.
The Nest command must derive tenant membership from PostgreSQL, enforce
`document.manage`, lock and validate the document/project relationship, replace
derived scope rows only for that document, calculate exact integer totals, and
write idempotency plus semantic audit evidence atomically. The command remains
behind a false flag and empty tenant allowlist until hosted migration parity,
duplicate Purchase Order remediation, audit recovery, and the controlled
provider gate are clear. The existing Next transaction is the rollback path
until a separate canary proves parity.

## CAD processing intake target (2026-08-01)

The NestJS modular monolith is the only accepted entry point for CAD job
creation. A tenant-authorized user submits a strict command with an
Idempotency-Key; PostgreSQL derives the document project and actor membership,
commits one durable queued job, and stamps audit context. A server-only BullMQ
producer carries only the opaque job UUID.

Status reads return bounded state without storage paths, tenant authority,
worker payloads, or credentials. The future processor will lock the job,
obtain a short-lived object-storage URL, call the Python evidence adapter, and
route every official scope/BOM write back through Nest transactions. The
intake flag and tenant allowlist stay false/empty until worker retry, stalled
job, and canary evidence exist.

## Signed CAD evidence bridge (2026-08-01)

The target private worker boundary is now source-implemented. A PostgreSQL
claim is the only source of tenant, project, actor, document path, and attempt
context. NestJS issues a 120-second exact-object signed URL and signs the raw
request body with an HMAC request ID bound to the processing job. Python can
read and parse that object only; it returns bounded evidence, source hash,
producer identity, and deterministic item keys. It cannot receive database
credentials, service-role authority, tenant/project identifiers, or ERP state.

The processor retries through BullMQ while PostgreSQL remains authoritative for
claim, terminal state, duplicate delivery, stale requeue, and failure. Scope
commit calls the existing Nest transaction service. When requested, scope
replacement and draft BOM creation share that same idempotent Nest transaction;
immutable worker evidence is persisted first. All bridge/commit flags
and tenant allowlists remain closed until disposable Python/API/Redis proof,
draft-BOM parity, hosted schema reconciliation, audit recovery, duplicate PO
remediation, and a controlled canary are approved.

## Durable evidence and draft-BOM completion (2026-08-01)

Each processing attempt persists validated, hash-linked worker evidence in a
tenant-scoped PostgreSQL table before any derived scope or BOM write. Evidence
contains no signed URL, credential, tenant authority, or ERP write command.
NestJS creates at most one draft BOM per processing job in a transaction that
locks the job, revalidates actor/document context, computes integer-centavo
line totals, attaches the BOM ID, and writes semantic audit evidence. A
separate draft-BOM flag and tenant allowlist stay closed until end-to-end
processor/retry/canary proof and hosted release gates are approved.

## CI/release parity (2026-08-01)

The reproducibility pipeline compares the clean migration-built public schema
before applying any CI-only legacy Data API grants needed by historical RLS
tests. It persists an empty diff artifact even when the pinned Supabase CLI
reports no changes. Hosted SQL and provider deploys remain gated by the
read-only ledger, duplicate-data, audit-recovery, and provider checks.

## M2.5 canary boundary (2026-08-02)

The first canary must run the real Nest processor and PostgreSQL state machine
inside an isolated rollback transaction. A worker response is accepted only
through the signed request client and evidence schema; duplicate delivery must
be ignored after terminal success; scope, evidence, audit, and tenant isolation
must be asserted before any production flag can open.

The BullMQ transport must carry only `{ schemaVersion, jobId }`. Queue-level
deduplication is delivery protection, not ERP authority; PostgreSQL claim,
state transition, evidence, commit, and audit remain the source of truth after
Redis retries, restarts, or data loss.

## M2.5 recovery boundary (2026-08-02)

Recovery uses a bounded PostgreSQL query: stale `processing` claims are reset
to `queued`, then at most 100 queued opaque UUIDs are offered to BullMQ. Missing
Redis jobs are recreated through the idempotent queue key; Redis never decides
ERP completion, failure, evidence, scope, or audit. A periodic recovery
scheduler requires explicit feature/tenant gates, metrics, and canary review
before enablement.

## M2.6 recovery scheduler boundary (2026-08-02)

The recovery scheduler is a BullMQ transport trigger, not an ERP authority. It
is installed only when the recovery, processing-intake, worker-bridge, and
commit gates are true and the recovery tenant IDs intersect the processing and
commit tenant allowlists. The scheduler carries no tenant, document, or actor
data. Its Nest processor asks PostgreSQL to reset stale claims and return a
bounded opaque UUID batch, then reuses idempotent transport enqueue. Missing
Redis jobs are recoverable; terminal ERP state remains PostgreSQL-owned.

## Cortex search boundary (2026-08-02)

Cortex search is a read-only, tenant-scoped retrieval surface. The authenticated
profile supplies tenant and role; the request supplies only a bounded query.
Role-derived node-type scope is applied in PostgreSQL because the server
database role bypasses RLS. Every result must pass the Cortex entity registry's
type/ref-table check before a deep link, summary, freshness, or source citation
is returned.

Interactive graph search may debounce keyword requests, but it must not call an
embedding or LLM provider per keystroke. Semantic retrieval remains an explicit
Cortex chat operation with provider availability and spend controls. Search
never writes ERP state, creates approvals, or treats derived graph data as the
canonical record; official transactions remain Nest/PostgreSQL-owned.

## RAG suggestions boundary (2026-08-02)

BOM suggestions are a bounded, tenant-session-authorized read path over
approved-BOM embeddings. The route validates input before any provider call,
requires the same BOM visibility policy as the UI, caps result count and
similarity range, returns provenance, and fails closed when OpenAI or vector
retrieval is unavailable. Embeddings remain derived evidence; pricing,
approval, and official ERP transactions stay in the NestJS/PostgreSQL path.

The source candidate is CI-verified at
`fa283f94376aacd8f7febd9324b162697571efa1` (run `30713863937`): full static,
test, Postgres reproducibility, Nest transaction, container, and production
build gates passed. Promotion still requires the controlled planner to clear
hosted data-integrity blockers.

## Python AI boundary (M2.9, 2026-08-02)

Embedding generation is moving behind a private Python advisory worker. The
worker accepts only bounded text batches, authenticates callers with a server
secret, validates model dimensions and ordering, and returns evidence without
tenant or business-record authority. Next.js and Inngest retain compatibility
contracts while `AI_WORKER_URL` is absent; setting it makes Python the sole
embedding backend for those callers. Chat completion migration remains a
separate slice.

The reviewed source candidate is `56bb76eb2dc7f4f7f00fbe4690e06323696b0618`;
GitHub Actions run `30715179369` passed all executable gates. Hosted worker
enablement remains a separately reviewed deployment after the controlled
planner is clear.

## Change Request command authority (M3.0, 2026-08-02)

Client Change Requests follow the modular-monolith command pattern: Next.js
keeps the current compatibility action, while NestJS exposes a separately
gated, tenant-scoped command with PostgreSQL idempotency, explicit capability
authorization, same-opportunity design-file validation, atomic in-app intent,
and audit evidence. The browser never supplies tenant or actor authority.
Promotion requires a clean migration replay, hosted ledger reconciliation, a
single-tenant canary, and exact runtime evidence; the default flags remain
closed.

The disposable database contract is executable in
`apps/api/integration/change-request.database.integration.spec.ts`: one
transaction proves tenant and capability denial, replay/hash behavior,
design-role notification intent, semantic audit linkage, and rollback. Hosted
promotion still requires the independent release planner to clear.

GitHub Actions run `30718464238` executes this contract in the disposable
Postgres 17 lane with no skips. CI evidence does not authorize hosted SQL or
provider promotion while the release planner is not clear.

## Web command cutover seam (M3.1, 2026-08-02)

The Change Request form now has an incremental authority seam: the current
Next.js action remains the public compatibility contract, but an explicit
tenant allowlist can route the same validated command to Nest. The browser
supplies only form data plus an opaque retry key; Nest remains responsible for
tenant, actor, capability, transaction, idempotency, notification, and audit
authority. The allowlist is closed by default and the legacy direct path is
retained until hosted ledger and data-integrity gates clear.

Commit `d5ee498` proves the web seam with focused action tests and the full web
suite. This is source evidence only; it does not authorize hosted migration or
provider promotion.

## M3.1 CI and hosted-readiness checkpoint (2026-08-02)

Run `30732430851` passed on source SHA
`1b3bff1efac5901e34859263f43b1be94835eced`, including the disposable
Postgres 17 replay, no-skip database lane, Nest integration/container smoke,
and production build. E2E remains credential-gated. Hosted readiness is
healthy but promotion is not authorized while the planner reports eight
pending migrations, 12 duplicate Purchase Order records, and missing
`AUDIT_RECOVERY_TENANT_ID`.

## Purchase Order approval authority seam (M3.2, 2026-08-02)

Purchase Order draft submission, PM approval, and Commercial approval share the
Nest workflow command when an explicit tenant canary flag is enabled. Next.js
still validates the visible record and preserves the compatibility action, but
Nest owns official status transition, PostgreSQL idempotency, role checks,
notification intent, and audit evidence. Browser retries use an opaque stable
key. SCM issuance and rejection remain separate legacy paths until command and
notification parity is implemented.

Commit `fa3c20a` proves the seam with five focused tests and full Web/build
validation. Hosted promotion remains gated by the independent data planner.

## M3.3 Purchase Order rejection parity (2026-08-02)

The same Nest/PostgreSQL command boundary now covers rejection from PM,
Commercial, and SCM-pending states. A rejection is an idempotent, tenant-local
state transition to `draft` with transactional notification intent and audit
evidence. Next.js remains a compatibility surface behind the existing
closed-by-default tenant allowlist, and browser retries use one stable opaque
key per action. Supplier issuance and its external email side effect remain a
separate migration slice until an outbox-owned delivery contract is proven.

Source commit `16904f0` passed the full executable CI pipeline in run
`30733959058`, including fresh Postgres 17 replay and the Purchase Order
transaction integration. This source evidence does not authorize hosted SQL
or provider promotion while the controlled planner is not clear.

## M3.2 CI checkpoint (2026-08-02)

Run `30733168171` passed on final SHA
`1bc232e55fa2f122aea5182b5ca442d536e916d4`, including fresh Postgres 17
replay, database tests without skips, Nest integration/container smoke, and
production build. E2E remains credential-gated. Healthy Railway/Vercel
readiness does not override hosted data-integrity blockers.

## M3.4 SCM issuance and supplier delivery authority (2026-08-02)

The target command boundary now includes SCM issuance. Nest owns the
`pending_scm_issuance -> issued` transition, `po.issue` authorization,
tenant-local idempotency, transaction locking, notification intent, and audit.
The Next.js action remains a closed-by-default compatibility adapter and the
existing UI remains visually unchanged.

Supplier email is a separate server-owned outbox child created in the same
transaction as the status change, never sent from the transaction. Its
tenant-scoped snapshot is immutable for delivery, its BullMQ job contains only
opaque IDs, and provider retries reuse one idempotency key. Delivery success
updates `supplier_email_sent_at` and writes audit evidence; transient failure
retries and final failure is durable dead letter. Python and browser code have
no transaction or delivery authority.

The source/CI proof is complete in commits `21a152d` / `52b6288` and run
`30735228348`. Hosted promotion is still a separate gate: the read-only
planner reports 55/65 migrations, 12 duplicate Purchase Orders, and no
`AUDIT_RECOVERY_TENANT_ID`. No production flag, SQL, queue, provider, or
business-data mutation is authorized until those owner decisions are complete.

## Finance journal posting authority (M3.5, 2026-08-02)

The target boundary for manual journal posting is a Nest command, not a React
component or direct browser write. A compatibility Server Action may validate
the current screen and call core only for an explicit tenant canary; otherwise
it retains the existing legacy RPC path without changing visible behavior.

Nest must authorize the tenant membership and `finance.post` capability under a
row lock, accept an opaque `Idempotency-Key`, and commit the idempotency record,
database posting call, result replay, and semantic audit in one PostgreSQL
transaction. The existing `post_journal_entry` function remains the sole
ledger authority for numbering, fiscal-period checks, balance checks, and the
posted state. Tenant composite keys and forced RLS prevent cross-tenant
replay. The two gates and tenant lists remain closed until hosted migration and
data-review gates clear. Python/AI may analyze or recommend but never post.

Source/CI proof is complete in commit `97106ba` and run `30736271967`; this is
not hosted promotion evidence while the planner reports 55/66 migrations,
duplicate Purchase Orders, and missing audit-recovery authority.

## Cortex external-model privacy boundary (M3.6, 2026-08-02)

Before any embedding or external chat completion, Cortex must transform model
context through a deterministic redaction policy. Direct identifiers in the
user prompt, prior turns, graph titles/summaries, focused-record summaries,
and semantic-query text are replaced with typed placeholders while tenant and
RBAC filtering remain unchanged. The model receives only the redacted prompt
pack; deterministic in-product retrieval remains the source-grounded fallback.

Every query must append hash-bearing started/completed audit evidence without
storing raw prompt text in the audit diff: model/fallback outcome, prompt hash,
response hash, redacted preview, source/citation counts, and context metadata.
Failures in audit persistence remain observable and fail open for read-only
chat; they never authorize a mutation. This slice changes no visible landing
surface and introduces no hosted schema mutation.

## CAD processing authority handoff (M3.7, 2026-08-02)

The target upload boundary is a tenant-scoped Nest command. An explicit,
closed-by-default Next canary may create the document record, then submit a
binary DWG processing job to Nest/BullMQ. Nest owns authorization, signed
Python evidence intake, scope-item/draft-BOM commits, idempotency, and audit;
Python remains advisory/read-only and the browser remains presentation-only.

The Next compatibility adapter must fail closed when the core command is
selected: it may report a queued/processing state and poll a validated status
proxy, but it must never write CAD scope items or fall back to its legacy
writer. The selector `ERP_DOCUMENT_PROCESSING_VIA_API` and UUID allowlist
`ERP_DOCUMENT_PROCESSING_TENANT_IDS` stay disabled until hosted planner,
worker, evidence, RBAC, and rollback gates are proven.

## Stock Receipt creation authority (M3.8, 2026-08-02)

The target boundary for creating a Stock Receipt is a tenant-scoped Nest
command. Nest owns `inventory.manage` authorization, PO/warehouse/delivery
same-tenant validation, exact decimal conversion, remaining-quantity
concurrency checks, tenant-local idempotency, and semantic audit. PostgreSQL
constraints and the existing inventory transaction remain the integrity
authority; Python/AI can advise but never commits inventory evidence.

Next may remain a compatibility adapter while the command is canaried. Its
selector and strict UUID allowlist are independently closed by default. Once
selected, a failed core request is returned to the user and never falls back
to a second writer. The form supplies one stable opaque retry key so a lost
response can be replayed safely without duplicate receipt creation.

## Stock Receipt post/reversal authority (M3.9, 2026-08-02)

Posting and reversal are separate Nest command boundaries. Nest derives the
actor and tenant from authenticated membership, requires `inventory.post_receipt`,
locks the same-tenant receipt, and invokes the existing PostgreSQL functions
for numbering, ledger balance, fiscal-period, and state authority. The
idempotency record, official result, and semantic audit evidence commit in the
same PostgreSQL transaction. A retry with the same tenant/key/command replays
the stored result; a conflicting command is rejected.

Next selectors
`ERP_INVENTORY_RECEIPT_POST_VIA_API`/`ERP_INVENTORY_RECEIPT_POST_TENANT_IDS`
and
`ERP_INVENTORY_RECEIPT_REVERSE_VIA_API`/`ERP_INVENTORY_RECEIPT_REVERSE_TENANT_IDS`
remain exact-`true` plus explicit-allowlist canaries, false/empty by default.
When selected, Next fails closed on core outage or rejection and never invokes
the direct RPC fallback. The visible receipt controls remain unchanged.

The forward-only idempotency migration is source-complete and replayed in the
disposable PostgreSQL 17 lane. Hosted Supabase remains a separate release gate
until its migration ledger, duplicate-PO review, audit-recovery tenant,
readiness, exact SHA, and rollback evidence are clear.

## BOM-to-Purchase Order authority (M3.10, 2026-08-02)

The canonical single-PO-from-BOM command is a tenant-scoped Nest transaction.
The browser may submit only BOM/project/vendor/date intent plus an opaque retry
key. Nest derives actor and tenant membership, requires `po.create`, locks the
approved BOM and related rows, copies the authoritative lines, allocates the
tenant PO number, locks the BOM, and records the idempotency result and semantic
audit in the same PostgreSQL transaction. PostgreSQL constraints and the
existing request table remain the integrity boundary; Python/AI cannot create,
approve, or finalize a PO.

The Next selector
`ERP_PO_BOM_CREATE_WRITES_VIA_API` with
`ERP_PO_BOM_CREATE_WRITES_VIA_API_TENANT_IDS` is exact-true plus explicit UUID
allowlist, false/empty by default. Core-side
`ERP_PO_BOM_CREATE_WRITES_ENABLED` and its UUID allowlist are independently
closed. On core rejection or outage, the selected path fails closed. The
grouped-by-supplier BOM path is intentionally not folded into this command and
requires its own authority/replay design before canarying.

## Grouped BOM-to-Purchase Order authority (M3.11, 2026-08-02)

Grouped supplier generation is a separate tenant-scoped Nest command, not a
client-side loop. The command accepts only a BOM reference and derives the
tenant, actor, capability, source lines, active rate cards, vendor names, and
approved cost-code mappings server-side. One PostgreSQL transaction allocates
all tenant PO numbers under an advisory lock, creates the complete assigned
supplier set, records unassigned lines in the returned preview, locks an
approved BOM only after successful inserts, persists one replayable grouped
result, and writes semantic audit evidence. A failed transaction creates no
partial PO set and leaves the BOM unlocked.

The Next action remains a compatibility adapter selected only by exact-`true`
plus UUID allowlist. A stable opaque browser retry key replays the whole group;
core rejection or outage fails closed with no direct-writer fallback. API and
Next grouped flags remain disabled until hosted migration/data/audit review,
tenant canary, readiness, exact-SHA, and rollback evidence are approved.

## Delivery receipt authority (M3.12, 2026-08-02)

Recording a delivery receipt is an official procurement state change owned by
Nest. The browser submits only optional bounded notes and an opaque retry key;
Nest derives tenant and actor membership, requires `delivery.receive`, locks
the same-tenant schedule, permits only `scheduled` or `in_transit`, stamps
receipt time/actor/notes, and commits the state, idempotency result, and
semantic audit in one PostgreSQL transaction. A conflicting retry key or
concurrent status change is rejected; an exact replay returns the stored
result. The ledger is forced-RLS and service-only.

The existing delivery panel remains the compatibility surface. Its Next action
routes to `POST /v1/procurement/deliveries/:deliveryScheduleId/receipt` only
for the exact-`true` selector
`ERP_DELIVERY_RECEIPT_WRITES_VIA_API` plus
`ERP_DELIVERY_RECEIPT_WRITES_VIA_API_TENANT_IDS`; selected core failures never
fall back to the direct Server Action. API and Next gates remain false/empty
until hosted migration/data/audit review, a disposable/demo tenant canary,
readiness, exact SHA, and rollback evidence are approved. Site preparation,
inspection, acceptance, and cancellation are separate legacy steps for later
milestones.

## M3.12 correction evidence (2026-08-02)

The delivery command now preflights the same-tenant schedule before claiming
the idempotency row. This preserves a stable tenant-safe not-found response
when a caller supplies an unknown or cross-tenant schedule id while retaining
the composite database foreign key as the final integrity guard. The corrected
transaction passed the disposable Postgres 17/Redis integration in CI. Hosted
activation remains gated by migration drift, duplicate data, audit-recovery
approval, readiness, exact SHA, and rollback evidence.

## Finance journal reversal authority (M3.13, 2026-08-02)

Journal reversal is a Nest-owned command at
`POST /v1/finance/journals/:journalEntryId/reverse`. The browser submits only
the bounded reason, posting date, and opaque idempotency key. Nest derives the
tenant and actor from the authenticated principal, rechecks `finance.post`,
preflights same-tenant journal visibility, locks the journal, and invokes the
existing PostgreSQL reversal function inside one transaction. The transaction
stores the strict result in `journal_reverse_requests` and writes semantic
audit evidence; replay returns the exact stored result. Python/AI cannot
approve or finalize this financial state change.

The Next adapter selects the command only for exact-`true` plus UUID-allowlisted
`ERP_FINANCE_JOURNAL_REVERSE_WRITES_VIA_API`; API and Next write gates are
independently closed by default. A selected core failure never falls back to a
second writer. The migration is source-complete and disposable-integration
ready, but hosted Supabase migration drift, duplicate demo data, audit
recovery, readiness, exact SHA, rollback, and provider spend approval remain
independent release gates.

## Delivery inspection-start authority (M3.14, 2026-08-02)

Inspection start is the next Nest-owned delivery state command at
`POST /v1/procurement/deliveries/:deliveryScheduleId/inspection/start`.
The browser submits an empty strict command and an opaque idempotency key.
Nest derives tenant and actor from the authenticated principal, rechecks
`delivery.receive`, locks the same-tenant schedule, permits only `received`,
creates the pending inspection, moves the schedule to `inspecting`, and
commits the exact replay result plus semantic audit in one transaction. The
existing delivery workflow ledger is reused with a new action enum value.

The compatibility action selects Nest only for exact-`true` plus UUID-allowlist
configuration; API and Next gates are false/empty by default and selected core
failures never fall back. Inspection result/acceptance, site preparation, and
cancellation remain separate later commands. Hosted migration drift,
duplicate demo data, audit recovery, readiness, exact SHA, rollback, and
spend approval remain independent promotion gates.

## Delivery inspection-completion authority (M3.15, 2026-08-02)

Inspection completion is a Nest-owned terminal delivery command at
`POST /v1/procurement/deliveries/:deliveryScheduleId/inspection/complete`.
The browser submits only the inspection result and bounded defect/acceptance
notes plus an opaque idempotency key. Nest derives tenant and actor, rechecks
`delivery.receive`, locks the `inspecting` schedule and pending inspection,
requires defect notes for `fail`, records the inspection outcome, transitions
the schedule to `accepted` or `rejected`, and commits exact replay data plus
semantic audit in one transaction. Python/AI cannot finalize this state.

The compatibility action selects Nest only for exact-`true` plus UUID-allowlist
configuration; API and Next gates are false/empty by default and selected core
failures never fall back. Delivery cancellation and later stock/three-way
matching effects remain separate commands. Hosted migration drift, duplicate
demo data, audit recovery, readiness, exact SHA, rollback, and spend approval
remain independent promotion gates.

## Delivery cancellation authority (M3.16, 2026-08-02)

Cancellation is a Nest-owned terminal delivery command at
`POST /v1/procurement/deliveries/:deliveryScheduleId/cancel`. The browser
sends only a bounded reason and opaque idempotency key. Nest derives tenant and
actor, rechecks `delivery.receive`, locks the same-tenant schedule, permits
only cancellable non-terminal statuses, stamps cancellation evidence,
persists the exact replay result, and writes semantic audit in one PostgreSQL
transaction. Python/AI cannot finalize this state.

The existing delivery action selects Nest only for exact-`true` plus UUID
allowlist configuration; selected core failures fail closed. The four
cancellation flags are false/empty by default, and the visible delivery UI is
unchanged. Hosted migration drift, duplicate demo data, audit recovery,
readiness, exact SHA, rollback, integration, and spend approval remain
independent promotion gates.
