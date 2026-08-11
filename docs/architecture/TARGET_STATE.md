# Target State

## M3.294 Core Togal BOM commit canary (2026-08-12)

The target BOM import boundary sends reviewed Togal lines from the Next
compatibility adapter to Nest Core. Core derives tenant and role authority,
locks the draft BOM, validates referenced records, calculates integer-centavo
cost/TCV/GP totals, writes lines plus the idempotency ledger and semantic audit
in one transaction, and replays an identical key without duplication.

Keep `ERP_BOM_TOGAL_COMMIT_VIA_API` and
`ERP_BOM_TOGAL_COMMIT_WRITES_ENABLED` disabled with empty tenant lists outside
the disposable proof. Python/AI may propose or analyze lines but cannot
approve or finalize a BOM. Managed parity, release identity, rollback,
authenticated smoke, and spend controls are still required before opening a
real tenant.

## M3.293 Purchase Order uniqueness release gate (2026-08-12)

The target release process fails closed when the first idempotency/uniqueness
batch sees duplicate `(tenant_id, po_number)` data. Owner review must produce
an opaque remediation packet and a zero-duplicate read-only result before the
unique index or request ledger is applied. Core/AI cannot silently select the
surviving PO; PostgreSQL remains authoritative and the migration remains
ordered.

Until that gate clears, all hosted migrations and provider deployments remain
closed.

## M3.292 Core document-intake canary (2026-08-12)

The target upload boundary records the canonical document in Nest Core after
the browser has uploaded a Storage object. Core derives tenant/project scope,
requires `document.manage`, commits the document plus idempotency ledger and
audit atomically, and replays identical retries without duplication. The
legacy route remains a compatibility adapter, and extractor/AI processing is
not implied by this non-extractor proof.

Keep document selectors closed outside disposable tests. Python/AI may analyze
documents later but cannot approve or finalize the ERP record.

## M3.291 Core notifications browser canary (2026-08-12)

The target notification path is now browser-proven through the modular Nest
authority: the authenticated Next adapter forwards the session bearer and
request ID, Core derives tenant/user scope, PostgreSQL commits read-state in a
transaction, and semantic audit evidence is retained. The compatibility route
remains the default until managed parity and release gates pass.

The topbar popover and Settings cards must remain usable at 390px without
horizontal overflow. Keep both notification selectors closed outside the
disposable canary; Python/AI remains advisory and cannot approve ERP state.

## M3.290 Managed parity gate (2026-08-12)

The target release process treats Supabase as PostgreSQL source of truth but
requires an authoritative, read-only ledger and advisor review before a
hosted migration. The connected project is healthy and RLS-enabled, yet its
55/124 migration prefix and advisor findings mean the 69-migration suffix is
not a deployable unit. Each ordered batch must have a tested rollback,
readiness check, tenant/audit review, and explicit release identity. No
provider build is part of this gate.

Keep AI/Python advisory and all Core/Web selectors closed until a batch has
passed local replay and the hosted release gate.

## M3.289 Core bank-statement Storage browser canary (2026-08-12)

The local target proof now covers the user journey through the Core Storage
authority: Next selects the exact tenant branch, the server adapter forwards
the session bearer and request ID, Core signs and audits the private
tenant-prefixed object, the import remains PostgreSQL-authorized, and terminal
cleanup is audited and tenant-scoped. A foreign path is denied before any
object deletion and the disposable object is removed after the proof.

Keep both Core Storage selectors and the Web `*_VIA_API` selector false with
empty tenant lists outside the harness. This remains source/disposable evidence
only; managed Storage policy/key parity, readiness, release identity,
rollback, authenticated smoke, and spend evidence remain required.

## M3.288 Core bank-statement Storage authority seam (2026-08-12)

The target boundary has an original, typed Nest authority for private bank
statement uploads: capability checks and exact tenant path validation happen in
Core, Storage credentials remain server-only, and signing/cleanup are audited.
Next is a compatibility adapter only; once selected for one exact tenant, its
Storage route delegates to Core with terminal-error semantics and no direct Web
Storage fallback. PostgreSQL remains the ERP source of truth; the Storage
object is only source evidence and Python/AI remains advisory.

Keep `ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_ENABLED=false` with an
empty API tenant list and keep the Web
`ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_VIA_API=false` with an empty
tenant list outside disposable proof. The existing Web Storage/form selector
also stays closed. Managed Storage policy/key parity, readiness, release
identity, rollback, authenticated smoke, and spend evidence are required
before opening one tenant.

## M3.278 Protected bank-reconciliation Web/Core browser canary (2026-08-11)

The local evidence now covers the user-facing reconciliation seam: an
authenticated Next page selects Core only for an exact tenant, forwards the
server-only session bearer and bounded limit query, maps typed statement rows
into KPI and register values, and remains responsive. The disposable browser
proves redirect, RBAC, blocked provider traffic, terminal contract noise,
statement ordering/statuses, and cleanup.

Keep `ERP_FINANCE_RECONCILIATION_READS_VIA_API=false` with an empty tenant list
and keep `ERP_FINANCE_RECONCILIATION_READS_ENABLED=false` with an empty Core
allowlist outside local proof. PostgreSQL remains authoritative; Python/AI
remains advisory and cannot approve or finalize financial transactions. Hosted
parity, readiness, release identity, rollback, and spend evidence remain
required.

## M3.277 Protected finance-cash Web/Core browser canary (2026-08-11)

The local evidence now covers the user-facing cash seam: an authenticated
Next page selects Core only for an exact tenant, forwards the server-only
session bearer and bounded query, maps typed cash transactions into KPI and
table rows, and remains responsive. The disposable browser proves redirect,
RBAC, blocked provider traffic, terminal contract noise, exact receipts and
disbursements, and cleanup.

Keep `ERP_FINANCE_CASH_READS_VIA_API=false` with an empty tenant list and keep
`ERP_FINANCE_CASH_READS_ENABLED=false` with an empty Core allowlist outside
local proof. PostgreSQL remains authoritative; Python/AI remains advisory and
cannot approve or finalize financial transactions. Hosted parity, readiness,
release identity, rollback, and spend evidence remain required.

## M3.276 Protected finance-cash Core HTTP canary (2026-08-11)

The local evidence now covers the guarded Nest cash-register read seam:
PostgreSQL remains authoritative for tenant-scoped cash evidence, and Core
returns exact centavo receipt/disbursement totals and status counts under an
exact tenant allowlist. Auth/RBAC, fail-closed selector behavior, invalid
ranges, direction/date/account filters, pagination, row ordering,
foreign-tenant isolation, and rollback are proven in a disposable transaction.

Keep `ERP_FINANCE_CASH_READS_ENABLED=false` and its tenant list empty, and
keep `ERP_FINANCE_CASH_READS_VIA_API=false` with an empty tenant list outside
local proof. The Web/Core selector remains closed until a separate
authenticated browser proof exists. Python/AI remains advisory and cannot
approve or finalize financial transactions. Hosted parity, readiness, release
identity, rollback, and spend evidence remain required.

## M3.275 Protected finance-payables Web/Core browser canary (2026-08-11)

The local evidence now covers the user-facing payables seam: an authenticated
Next page selects Core only for an exact tenant, forwards the server-only
session bearer and bounded query, maps typed supplier-bill data into KPI,
aging, and table rows, and remains responsive. The disposable browser also
proves redirect/RBAC, blocked provider traffic, terminal contract noise, and
cleanup.

Keep `ERP_FINANCE_PAYABLES_READS_VIA_API=false` with an empty tenant list and
keep `ERP_FINANCE_PAYABLES_READS_ENABLED=false` with an empty Core allowlist
outside local proof. PostgreSQL remains authoritative; Python/AI remains
advisory and cannot approve or finalize financial transactions. Hosted parity,
readiness, release identity, authenticated smoke, rollback, and spend
evidence remain required.

## M3.274 Protected finance-payables Core HTTP canary (2026-08-11)

The local evidence now covers the guarded Nest supplier-payables read seam:
PostgreSQL remains authoritative, supplier bills are posted by the database
function, and Core returns exact centavo balances under an exact tenant
allowlist. Auth/RBAC, fail-closed selector behavior, invalid ranges, filters,
pagination, aging math, draft/posted totals, foreign-tenant isolation, and
rollback are proven in a disposable transaction.

Keep `ERP_FINANCE_PAYABLES_READS_ENABLED=false` and its tenant list empty, and
keep `ERP_FINANCE_PAYABLES_READS_VIA_API=false` with an empty tenant list
outside local proof. The Web/Core selector remains closed until a separate
authenticated browser proof exists. Python/AI remains advisory and cannot
approve or finalize financial transactions. Hosted parity, readiness, release
identity, rollback, and spend evidence remain required.

## M3.273 Protected finance-receivables Web/Core browser canary (2026-08-11)

The local evidence now covers the user-facing receivables seam: an
authenticated Next page selects Core only for an exact tenant, forwards the
server-only session bearer and bounded query, maps the typed result into KPI
and invoice rows, and remains responsive. The disposable browser also proves
redirect/RBAC, blocked provider traffic, terminal contract noise, and cleanup.

Keep `ERP_FINANCE_RECEIVABLES_READS_VIA_API=false` with an empty tenant list,
and keep `ERP_FINANCE_RECEIVABLES_READS_ENABLED=false` with an empty Core
allowlist outside local proof. PostgreSQL remains authoritative; Python/AI
remains advisory and cannot approve or finalize financial transactions.
Hosted parity, readiness, release identity, authenticated smoke, rollback,
and spend evidence remain required.

## M3.272 Protected finance-receivables Core HTTP canary (2026-08-11)

The local evidence now covers the guarded Nest receivables read seam:
PostgreSQL remains the financial source of truth, invoice issuance is posted by
the database function, and Core returns exact centavo balances under an exact
tenant allowlist. Auth/RBAC, fail-closed selector behavior, filters,
pagination, overdue math, foreign-tenant isolation, and rollback are proven in
a disposable transaction. The raw SQL date bind is driver-safe and regression
covered.

Keep `ERP_FINANCE_RECEIVABLES_READS_ENABLED=false` and its tenant list empty
outside local proof. The Web/Core selector remains closed until a separate
authenticated browser proof exists. Python/AI remains advisory and cannot
approve or finalize financial transactions. Hosted parity, readiness, release
identity, rollback, and spend evidence remain required.

## M3.271 Protected finance-ledger Web/Core browser canary (2026-08-11)

The local evidence now covers the user-facing ledger boundary: an authenticated
Next page selects Core only for an exact tenant, forwards the session bearer
token through a server-only adapter, renders immutable posted lines and
centavo totals, and preserves filter behavior. The browser proof also covers
redirect, request provenance, responsive layout, and terminal contract noise.
The selector remains closed outside the disposable harness; this is not a
production canary.

Keep `ERP_FINANCE_LEDGER_READS_VIA_API=false` and its tenant list empty, and
keep `ERP_FINANCE_LEDGER_READS_ENABLED=false` with an empty Core allowlist
outside local proof. PostgreSQL remains authoritative; Python/AI remains
advisory and cannot approve or finalize ledger transactions. Hosted parity,
readiness, release identity, rollback, and spend evidence remain required.

## M3.270 Protected finance-ledger Core HTTP canary (2026-08-11)

The local evidence now covers the read side of the finance ledger boundary:
Nest authenticates and authorizes the caller, applies an exact tenant allowlist,
reads immutable posted lines with exact centavo arithmetic, and returns
bounded account filters and pagination. A disabled selector fails closed with
503, a viewer cannot read finance data, a foreign tenant is invisible, and the
database transaction is rolled back after the proof. This is source and
disposable-environment evidence, not a production canary.

Keep `ERP_FINANCE_LEDGER_READS_ENABLED=false` with an empty tenant list outside
the harness. PostgreSQL remains authoritative; Python/AI remains advisory and
cannot approve or finalize ledger transactions. Hosted parity, readiness,
release identity, rollback, and spend evidence remain required before opening
one tenant.

## M3.269 Successful bank-statement Core browser proof (2026-08-11)

The intended boundary is now proven locally: the browser uploads only to a
tenant-prefixed private Storage object, Nest Core is the sole financial write
authority, and the Core transaction persists the typed draft statement,
statement line, durable idempotency result, source path/hash, and audit. The
browser follows the returned statement ID to a tenant-scoped detail page and
shows source provenance plus roll-forward evidence. Cleanup rejects a
cross-tenant path before any object deletion.

This is source and disposable-environment evidence, not a production canary.
Keep `ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_ENABLED`, the Web/Core import
selector, and `ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS` false with
empty tenant lists. Python/AI remains advisory and cannot import, approve, or
finalize financial evidence. Hosted parity, readiness, release identity,
rollback, and spend evidence remain required before opening one tenant.

## M3.268 Bank-statement browser Storage canary proof (2026-08-11)

The browser Storage handoff now has a repeatable local proof: an authenticated
tenant can request a signed private upload, PUT the CSV directly through the
Supabase Storage client, submit only the tenant-prefixed path to Core, and
clean up on a terminal response. The proof uses a disposable PostgreSQL
tenant, loopback auth/Storage, a controlled Core failure, exact idempotency
and bearer assertions, audit evidence, no ERP-table write, and desktop/mobile
browser checks. This is source evidence only; all production selectors remain
closed and no provider traffic is allowed by the test boundary.

Successful Core response/detail rendering, real object retrieval, and
cross-tenant cleanup denial are the next proof gates. Python/AI remains
advisory and cannot approve or finalize financial evidence.

## M3.267 Bank-statement browser Storage handoff (2026-08-11)

The bank-statement form has a closed-by-default browser Storage path. When the
exact Web import and Storage-upload selectors match one tenant, the browser
requests a signed URL, uploads the CSV to the private `documents` bucket, and
passes only the validated tenant-prefixed path to the Core import command.
Inline base64 remains the compatibility path while the canary is closed. A
failed upload or terminal Core/action result triggers audited tenant-scoped
cleanup; no browser path writes ERP tables or falls back after Storage is
selected.

The signed-upload POST and DELETE routes require `finance.manage_cash`, exact
tenant path validation, bounded CSV metadata, and audit. Keep
`ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS=false` with an empty tenant
allowlist, and keep the API/Web import selectors closed, until authenticated
browser evidence, Core response parity, cleanup/rollback, hosted parity, and
spend controls are recorded. Python/AI remains advisory and cannot import,
approve, or finalize financial evidence.

## M3.266 Bank-statement storage source and Web/Core parity seam (2026-08-11)

The import contract supports either a bounded inline CSV or a private,
tenant-prefixed object-storage source. Core is the only transaction authority:
it validates the path against the authenticated tenant, downloads through a
server-only signed URL reader capped at 2 MB, parses and balances the CSV,
persists the source path and hash with the draft statement, and records the
durable idempotency result and audit in one transaction. Storage credentials,
object availability, size, and parser failures fail closed. The Web signed
upload route never writes ERP tables and requires `finance.manage_cash`.

The Web action has a typed Core adapter with terminal-error semantics and an
exact-tenant selector. A disposable UI/browser proof now covers signed upload,
Core import, response mapping, protected access, and source-byte integrity;
both selectors remain closed until hosted parity, rollback, readiness, and
spend evidence are approved. The current form remains the inline source
compatibility path for hosted tenants. Python/AI can inspect or recommend but
cannot import, approve, or finalize ERP evidence.

## M3.286 Bank-statement storage browser proof (2026-08-12)

The disposable browser contract proves the private Storage handoff without
opening a hosted tenant: the Web server signs a tenant-prefixed path using the
service role, the browser uploads with the signed token, and Core reads the
object through its own short-lived signed URL before parsing and committing the
draft. The proof captures exact path, actor credentials, and source bytes;
cleanup remains an explicit failure path and is tenant-prefix checked before
the Storage delete.

Keep `ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS=false` and its tenant
allowlist empty outside a disposable test. Do not promote this path to hosted
Supabase, Railway, or Vercel until migration parity, Storage policy review,
readiness, rollback, exact SHA, and spend-bounded approval are all clear.

## M3.287 Public landing local browser contract (2026-08-12)

The public landing contract now has a dedicated disposable Playwright config
and package command. It exercises the real Next page on loopback only and
asserts the current Organization/WebSite/WebPage/SoftwareApplication/FAQPage
graph, crawl metadata, responsive bounds, interaction state, CTA destinations,
mobile target sizes, and zero browser errors. Keep this contract local and
source-gated; it does not authorize Vercel, Railway, Supabase, analytics, or
other provider activity. The Vercel Git integration remains disconnected and
provider spend remains explicitly bounded.

## M3.265 Bank-statement import authority (2026-08-11)

Core owns the fail-closed import command at
`POST /v1/finance/reconciliation/import`. The browser sends a strict body
containing the tenant Cash Account, statement metadata, integer-cent opening
and closing balances, and a base64 CSV source capped at 2 MB, plus an opaque
idempotency key. Core derives and rechecks tenant, actor, role, account
visibility, line date range, duplicate fingerprints, and balance roll-forward;
then inserts draft statement evidence and its lines in one transaction. A
force-RLS request ledger stores the durable replay result and semantic audit.
The shared parser is the compatibility seam; raw CSV bytes are not persisted.
Keep `ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_ENABLED=false` and its tenant
list empty until hosted parity, object-storage upload, readiness, protected
browser cutover, rollback, and spend evidence are approved. Python/AI may
extract or analyze documents but cannot import, approve, or finalize ERP
transactions. The existing Web action remains the compatibility path until a
separate Web/Core response-parity proof. The source-only Web import adapter and
authenticated disposable browser proof now exist; keep
`ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_VIA_API=false` with an empty tenant
list outside the disposable canary.

## M3.264 Bank-statement void authority (2026-08-11)

Core owns the fail-closed void command at
`POST /v1/finance/reconciliation/:statementId/void`. The browser sends a
strict reason body and opaque idempotency key; Core derives and rechecks
tenant, actor, role, and statement visibility, locks the reconciled
statement, invokes the trusted PostgreSQL state transition, stores a durable
tenant-scoped replay result, and emits semantic audit in one transaction.
Keep `ERP_FINANCE_RECONCILIATION_VOID_WRITES_ENABLED=false` and its tenant
list empty until hosted parity, readiness, protected browser cutover,
rollback, and spend evidence are approved. Python/AI may analyze evidence but
cannot void, import, or finalize it. The existing Web action remains the
compatibility path until a separate Web/Core response-parity proof. The
source-only Web adapter and browser proof now exist behind
`ERP_FINANCE_RECONCILIATION_VOID_WRITES_VIA_API=false` with an empty tenant
list by default; keep both selectors closed outside the disposable canary.

## M3.263 Bank-statement reconciliation authority (2026-08-11)

Core owns the fail-closed reconciliation command at
`POST /v1/finance/reconciliation/:statementId/reconcile`. The browser sends a
strict empty body and opaque idempotency key; Core derives and rechecks tenant,
actor, role, and statement visibility, locks the statement, invokes the
trusted PostgreSQL state transition, stores a durable tenant-scoped replay
result, and emits semantic audit in one transaction. Keep
`ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_ENABLED=false` and its tenant list
empty until hosted parity, readiness, protected browser cutover, rollback, and
spend evidence are approved. Python/AI may analyze evidence but cannot
reconcile, void, import, or finalize it. The existing Web action remains the
compatibility path until a separate Web/Core response-parity proof.

## M3.262 Bank-statement line match/unmatch authority (2026-08-11)

Core owns the fail-closed manual line commands at
`POST /v1/finance/reconciliation/:statementId/lines/:lineId/match` and
`/unmatch`. The browser sends a strict cash-transaction body for match or an
empty strict body for unmatch plus an opaque idempotency key. Core derives and
rechecks tenant, actor, role, and line visibility, locks the statement and
line, calls PostgreSQL's trusted state transition, stores a durable tenant-
scoped replay/conflict result, and emits semantic audit in one transaction.
Keep `ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_ENABLED=false` and its
tenant list empty until hosted parity, readiness, protected browser cutover,
rollback, and spend evidence are reconciled. Python/AI may analyze evidence
but cannot match, unmatch, reconcile, void, import, or finalize it. The
existing Web manual-match behavior remains the compatibility path until a
separate Web/Core response-parity proof.

## M3.261 Bank-statement auto-match command authority (2026-08-11)

Core owns the fail-closed auto-match command at
`POST /v1/finance/reconciliation/:statementId/auto-match`. The browser
contract is an empty strict body plus an opaque idempotency key; Core derives
tenant, actor, role, and statement visibility, locks the statement, and calls
PostgreSQL's trusted matching function. A tenant-scoped force-RLS request
ledger stores the exact result for replay and key-conflict detection, while a
semantic audit event records the match counts. Python/AI may analyze evidence
but cannot match, reconcile, void, import, or finalize it. Keep
`ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_ENABLED=false` and its tenant
list empty until hosted parity, readiness, protected browser cutover,
rollback, and spend evidence are reconciled. The existing Web auto-match
action remains the compatibility path until a separate Web/Core response
parity proof.

## M3.260 Repository test baseline repair (2026-08-11)

Repository tests must model the same authorization and locking sequence as Core
without weakening behavior or bypassing tenant checks. The customer-invoice
draft replay fixture now supplies the locked project result before the
idempotency claim, keeping the test aligned with the authoritative transaction
ordering.

## M3.259 Bank reconciliation read authority (2026-08-11)

Core owns the bounded `GET /v1/finance/reconciliation` projection when the
exact tenant selector is enabled. The endpoint authenticates the principal,
requires `finance.read`, validates the strict limit, joins statements/accounts/
lines with tenant-matched keys, returns bounded integer-cent evidence, and
conceals other tenants. The Web page keeps the direct server-side read as the
default and treats selected-Core failure as terminal; both selectors remain
closed until hosted parity, RLS, readiness, protected browser, rollback, and
spend gates are reconciled. Python/AI remains analysis-only and cannot import,
match, reconcile, or void bank evidence.

## M3.258 Cash draft delete authority (2026-08-11)

The Core owns cash draft create/update/delete. Draft deletion locks the
tenant-scoped draft, removes allocations while the draft guard still permits
child deletion, then deletes the parent; PostgreSQL's before-delete guard
returns `OLD` so the command cannot be silently cancelled. The request ledger
retains the deleted UUID and durable result for replay, while cross-tenant
identifiers remain concealed. Python/AI may analyze but cannot mutate cash
drafts. Keep `ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED=false` and its tenant list
empty until hosted parity, readiness, browser, rollback, and cost gates are
reconciled.

## M3.257 Cash transaction workflow authority (2026-08-11)

The Core owns POST /v1/finance/cash-transactions/:cashTransactionId/post and
/reverse. The browser sends only a strict posting or reversal body and an
opaque idempotency key; Core resolves tenant, actor, role, and visible cash
state, locks the tenant-scoped transaction before audit or request claim, and
PostgreSQL atomically applies allocations, creates and posts the balanced
journal, and records durable workflow linkage. Replays return the durable
result, key reuse for another command conflicts, and cross-tenant ids remain
concealed. Python/AI may analyze but cannot approve or finalize cash. Keep the
write selector closed until hosted parity, readiness, browser, rollback, and
cost gates are reconciled.

## M3.256 Journal reversal authority (2026-08-11)

The Core owns POST /v1/finance/journals/:journalEntryId/reverse. The browser
sends only a strict reason, posting date, and opaque idempotency key; Core
resolves tenant, actor, role, and posted journal state, locks the visible
tenant-scoped entry before audit or request claim, and PostgreSQL atomically
creates and posts the balanced reversal entry with durable linkage. Replays
return the durable result, key reuse for another command conflicts, and
cross-tenant ids remain concealed. Keep the write selector closed until
hosted parity, readiness, browser, rollback, and cost gates are reconciled.

## M3.255 Journal posting authority (2026-08-11)

The Core owns POST /v1/finance/journals/:journalEntryId/post. The route and
opaque idempotency key are the only command authority; Core resolves tenant,
actor, role, and journal state, locks the tenant-scoped draft before audit or
request-ledger claim, and calls the PostgreSQL posting function to assign the
number and commit the balanced journal. Replays return the durable result,
key reuse for another journal conflicts, and cross-tenant ids remain
concealed. Keep the write selector closed until hosted parity, readiness,
browser, rollback, and cost gates are reconciled.

## M3.254 Supplier Bill reversal authority (2026-08-11)

The Core owns POST /v1/finance/supplier-bills/:supplierBillId/reverse. The
browser sends an opaque idempotency key plus reversal reason and posting date;
Nest authorization resolves tenant and actor, locks the tenant-scoped bill,
and PostgreSQL atomically records the reversal link, balanced journal unwind,
request ledger, and semantic audit. Replays return the original result, key
reuse with a different command conflicts, and cross-tenant records remain
concealed. The write selector stays closed until hosted parity, readiness,
browser, rollback, and cost gates are reconciled.

## M3.253 Supplier Bill posting authority

Supplier-bill posting is a Core-owned finance command at
`POST /v1/finance/supplier-bills/:supplierBillId/post`. The browser sends only
the strict posting date and an opaque idempotency key; Core derives tenant,
actor, role, supplier bill, purchase-order controls, fiscal period, control
accounts, internal bill number, and journal authority from locked server state.
The transaction preflights and locks the tenant-scoped bill before audit or
request-ledger claim, then owns the PostgreSQL posting function, result ledger,
semantic audit, and rollback. Replays return the durable result; changed
commands conflict; cross-tenant ids are concealed. Keep the write selector
disabled until hosted parity, release identity, readiness, protected browser
evidence, rollback, and spend approval are independently complete.

## M3.252 Customer invoice draft-creation authority

Draft customer-invoice creation is a Core-owned command at
`POST /v1/projects/:projectId/customer-invoices`. The browser sends only
strict billing inputs and an opaque idempotency key; Core derives tenant,
actor, role, project/account, approved BOM, invoice number, exact centavo
amounts, and audit authority from locked server state. The transaction owns
the tenant-scoped project preflight, request ledger, draft invoice, semantic
audit, and rollback. Cross-tenant project ids are concealed before ledger
claim; replay returns the durable result; changed commands conflict. Keep the
selector disabled until hosted parity, release identity, readiness, protected
browser evidence, rollback, and spend approval are independently complete.

## M3.251 Customer invoice draft-cancellation authority

Draft customer invoice cancellation is a Core-owned finance command at
`POST /v1/finance/customer-invoices/:invoiceId/cancel`. The browser sends an
empty strict body and an opaque idempotency key; Core derives tenant, actor,
role, and invoice state from locked server state. One PostgreSQL transaction
owns the tenant-scoped request ledger, draft-to-cancelled transition,
semantic audit, and rollback. Replays return the durable result; a reused key
for a different invoice conflicts; cross-tenant ids are concealed. Posted
invoices must use the separate reversal authority. Keep the cancellation
selector disabled until hosted parity, release identity, readiness, protected
browser evidence, rollback, and spend approval are independently complete.

## M3.250 Customer invoice reversal authority

Customer invoice reversal is a Core-owned finance command at
`POST /v1/finance/customer-invoices/:invoiceId/reverse`. The browser sends
only a strict reason, posting date, and opaque idempotency key; Core derives
tenant, actor, role, invoice, fiscal period, journal, and reversal authority
from locked server state. One PostgreSQL transaction owns the
tenant-scoped request ledger, cancelled invoice transition, posted journal
reversal, semantic audit, and rollback. Replays return the durable result;
changed commands conflict; cross-tenant ids are concealed. Keep the write
selector disabled until hosted parity, release identity, readiness,
protected browser evidence, rollback, and spend approval are independently
complete.

## M3.249 Customer invoice issuance authority

Customer invoice issuance is a Core-owned finance command. The browser sends
only a posting date and opaque idempotency key; Core derives tenant, actor,
role, invoice, business account, control accounts, fiscal period, and journal
authority from locked server state. One PostgreSQL transaction owns the
tenant-scoped request ledger, journal posting, invoice transition, semantic
audit, and rollback. Replays return the durable result without another
posting; a reused key with a different command conflicts; cross-tenant access
is concealed. Keep the write selector disabled until hosted parity, release
identity, readiness, protected browser evidence, rollback, and spend approval
are independently complete.

## M3.248 Managed Supabase parity/security release gate

The managed `ERP` project must be a verified linear prefix of the repository:
117/117 migrations through `20260810130000`, with no missing or unexpected
history. Every public table must have the intended RLS/policy contract, server
workflow ledgers must be force-RLS/service-only, privileged functions must not
be callable by `anon` or broad `authenticated` roles, and advisors must have no
unaccepted security or performance WARNs. Demo-data duplicate mapping,
audit-chain recovery, backup/restore, readiness, exact deployed SHA, and
rollback are separate release evidence.

The current read-only audit is not a cutover: hosted is 55/117 migrations with
11 security WARNs and one performance WARN. Do not apply SQL, enable a tenant,
or trigger a provider build until the ordered review batches and the spend /
rollback gate are explicitly approved.

## M3.247 Document-processing command authority

Document processing is a Core-owned asynchronous command. The browser sends a
strict CAD mode/format request and an opaque idempotency key; Core derives
tenant, actor, role, document, and project from verified server state, writes
one tenant-scoped durable job and semantic audit in PostgreSQL, then hands
BullMQ only the opaque job id. A replay returns durable status without another
enqueue or audit event. Python/CAD/OCR/AI may analyze through the worker bridge
and return bounded evidence, but it cannot authorize, create, approve, or
finalize ERP records. Draft BOM creation remains separately gated and is not a
browser authority.

The protected disposable HTTP canary proves auth/RBAC, strict input and
idempotency, disabled gates, cross-tenant concealment, queue identity, audit,
and rollback. Keep
`ERP_DOCUMENT_PROCESSING_JOBS_ENABLED=false`,
`ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED=false`,
`ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED=false`, and
`ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED=false` with all corresponding
tenant lists empty until hosted migration parity, exact release identity,
readiness, protected browser evidence, rollback, and spend approval are
independently complete.

## M3.246 Document intake authority evidence

Document intake is a guarded Nest command at `POST /v1/documents`. The browser
uploads an object first, then sends only strict file metadata and an opaque
idempotency key. Core derives tenant, actor, role, and project scope; validates
that the storage path is `${tenant_id}/${project_id}/...`; and commits the
canonical document row, tenant-scoped replay ledger, and semantic audit in one
PostgreSQL transaction. A protected disposable HTTP canary proves auth, RBAC,
disabled-by-default behavior, cross-tenant concealment, storage-path scope,
replay/conflict, forced RLS, and rollback. Python/AI/OCR may analyze the
document later but cannot approve or finalize the canonical ERP record.

Keep `ERP_DOCUMENT_INTAKE_WRITES_ENABLED=false` and
`ERP_DOCUMENT_INTAKE_WRITES_TENANT_IDS` empty until hosted parity, exact
release identity, readiness, protected browser evidence, rollback, and spend
approval are independently complete.

## M3.245 Stock Receipt post/reverse authority evidence

Stock Receipt posting and reversal are guarded Nest commands. Core derives
tenant, actor, role, receipt state, journal accounts, and Purchase Order scope
from locked server state; one PostgreSQL transaction owns the tenant-scoped
replay ledger, receipt state, stock ledger, journal, PO received quantity, and
semantic audit. A protected disposable HTTP canary proves auth, RBAC,
disabled-by-default behavior, cross-tenant concealment, explicit state
transitions, balanced accounting side effects, replay/conflict, forced RLS,
and rollback. Web adoption remains closed.

Keep `ERP_INVENTORY_RECEIPT_POST_WRITES_ENABLED=false`,
`ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS` empty,
`ERP_INVENTORY_RECEIPT_REVERSE_WRITES_ENABLED=false`, and
`ERP_INVENTORY_RECEIPT_REVERSE_WRITES_TENANT_IDS` empty until hosted parity,
exact release identity, readiness, protected browser evidence, rollback, and
spend approval are independently complete. A tenant-scoped receipt preflight
must remain before workflow-request claiming so cross-tenant requests fail
closed without a database constraint error.

## M3.244 Stock Receipt authority evidence

Stock Receipt draft creation is a guarded Nest command at
`POST /v1/inventory/stock-receipts`. The browser sends only strict receipt
fields and an opaque idempotency key; Core derives tenant, actor, role,
Purchase Order, tracked material/UOM line, and active warehouse scope from
server state. One PostgreSQL transaction owns the draft, receipt lines,
tenant-scoped replay ledger, and semantic audit. A protected disposable HTTP
canary proves auth, RBAC, disabled-by-default behavior, cross-tenant
concealment, replay/conflict, RLS/browser privilege boundaries, and rollback
while Web adoption remains closed.

Keep `ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED=false` and
`ERP_INVENTORY_RECEIPT_CREATE_WRITES_TENANT_IDS` empty until hosted parity,
exact release identity, readiness, protected browser evidence, rollback, and
spend approval are independently complete. The existing create-request table
is RLS-enabled with browser privileges revoked but is not force-RLS; any
hardening requires its own backward-compatible migration and verification.

## M3.243 Asset maintenance authority evidence

Asset maintenance history creation and reads have a protected Nest boundary:
`POST /v1/assets/:assetId/maintenance` and
`GET /v1/assets/:assetId/maintenance`. Core derives tenant, actor, role, and
asset scope from locked server state, validates the strict command, persists
one append-only record with a tenant-scoped idempotency ledger, and writes
semantic audit in the same transaction. A protected disposable HTTP canary
proves auth, RBAC, disabled-by-default behavior, replay/conflict, read scope,
RLS/service-only privileges, and rollback while Web adoption remains closed.

Keep `ERP_ASSET_MAINTENANCE_READS_ENABLED=false`,
`ERP_ASSET_MAINTENANCE_READS_TENANT_IDS` empty,
`ERP_ASSET_MAINTENANCE_CREATE_WRITES_ENABLED=false`, and
`ERP_ASSET_MAINTENANCE_CREATE_WRITES_TENANT_IDS` empty until hosted parity,
exact release identity, readiness, protected browser evidence, rollback, and
spend approval are independently complete. No schema migration is required
for this evidence milestone.

## M3.242 Change Request authority evidence

Client Change Request creation is a guarded Nest command at
`POST /v1/crm/opportunities/:opportunityId/change-requests`. The browser sends
only the strict request fields and an opaque idempotency key; Core derives
tenant, actor, role, opportunity, and affected-design-file scope from locked
server state. One PostgreSQL transaction owns the change request, design-role
notifications, replay ledger, and semantic audit. A protected disposable HTTP
canary proves auth, capability, tenant isolation, replay/conflict, and
rollback while Web adoption remains closed.

Keep `ERP_CHANGE_REQUEST_WRITES_ENABLED=false`, its tenant list empty,
`ERP_CHANGE_REQUEST_WRITES_VIA_API=false`, and its UUID allowlist empty until
hosted parity, exact release identity, readiness, protected browser evidence,
rollback, and spend approval are independently complete.

## M3.241 Opportunity stage-transition authority

Opportunity stage changes are a Nest-owned command at
`POST /v1/crm/opportunities/:opportunityId/stage-transition`. The browser
sends only `newStage`, an optional bounded regression/lost reason, and an
opaque `Idempotency-Key`; tenant, actor, role, current stage, account KYC, and
official side effects come from locked server state. Core validates the shared
stage state machine, updates probability/weighted TCV, closes and starts the
stage SLA clock, stores the exact replay result, and writes semantic audit in
one PostgreSQL transaction.

For `won` and `closed_won`, Core calls the existing conversion authority inside
that same transaction. Project creation or reuse, signed-contract evidence,
checklist generation, notifications, opportunity backlink, conversion replay,
and audit therefore cannot partially commit after the stage changes. Python
and AI remain advisory and cannot finalize the transition.

The transition ledger is tenant-scoped, forced-RLS, service-only, and keyed by
tenant plus idempotency key. The Next pipeline action selects this authority
only for exact-`true` plus UUID allowlists; selected failures fail closed and
never fall back to a second writer. Keep
`ERP_OPPORTUNITY_STAGE_WRITES_ENABLED=false`,
`ERP_OPPORTUNITY_STAGE_WRITES_TENANT_IDS` empty,
`ERP_OPPORTUNITY_STAGE_WRITES_VIA_API=false`, and its allowlist empty until
hosted migration parity, protected production browser evidence, readiness,
exact SHA, rollback, and spend approval are independently complete.

## M3.240 Won-opportunity project conversion authority evidence

The won-to-project handoff has a protected Nest transaction boundary:
`POST /v1/crm/opportunities/:opportunityId/convert-to-project`. Core owns
capability and tenant authorization, won-stage state validation, a
tenant/idempotency ledger, project and opportunity linking, the twelve-item
pre-construction checklist with dependency-aware SLA clocks, role notifications,
and semantic audit writes. Database triggers remain part of the append-only
audit evidence. A disposable HTTP canary proves replay, key reuse conflict,
cross-tenant concealment, rollback, and the complete handoff without enabling a
production tenant.

Keep `ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED=false`, the tenant allowlist empty,
and `ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API=false` with an empty allowlist until
hosted parity, exact Core release identity, readiness, protected browser
evidence, rollback, and spend approval exist. The legacy Web conversion path
remains the compatibility behavior; no hosted or provider state changed in
M3.240.

## M3.239 CRM opportunity detail authority evidence

Opportunity detail reads have a protected Nest boundary that authenticates the
caller, checks `opportunity.read`, repeats tenant predicates on the opportunity
and every progress aggregate, and returns a strict account/project/progress
projection. M3.239 adds a transaction-bound HTTP canary for PPRF, inspection,
design, and open-change-request counts while leaving Web adoption closed.

Keep the existing direct compatibility query and any opportunity Core selector
closed until hosted parity, exact Core release identity, readiness, protected
browser evidence, rollback, and spend approval exist.

## M3.238 CRM accounts read authority evidence

CRM account list, detail, and KYC queue reads have a protected Nest boundary
that authenticates the caller, checks the account or KYC capability, repeats
tenant predicates across every related graph query, bounds filters and page
size, and conceals another tenant's account as 404. M3.238 records a real
transaction-bound HTTP canary against disposable PostgreSQL/Redis: 1/1 PASS,
with root tests 173/173 files and 750/750 tests, typecheck/lint/build PASS,
and the full zero-skip disposable lane completed after 116 migrations.

Keep the existing Web compatibility path and any account Core selectors
closed until hosted parity, exact Core deployment identity, readiness,
protected browser evidence, rollback, and spend approval exist. No schema or
provider change was needed for this evidence milestone.

## M3.237 Project command-center read authority

The project detail command center has a reviewed Nest read contract:
`GET /v1/projects/:projectId/command-center`. Core owns exact tenant/project
authorization and the bounded aggregate of pending/overdue tasks, documents,
pending decisions, open punch-list items, active deliveries, and latest
progress. The query is intentionally empty and strict so the browser cannot
smuggle an `asOf` or tenant override. The Web adapter validates the exact
tenant/project response and fails closed; the six-query direct read remains a
mixed-version compatibility path.

M3.237 records the local gate as shared 2/2, Web Core client 3/3 plus project
query tests 11/11, protected API canary 1/1, root 173/173 files and 750/750
tests, and a complete zero-skip disposable environment with 116 migrations,
149/149 database suites and 370/370 tests, 33/33 API integration files and
49/49 tests, and equal schema hashes. Keep
`ERP_PROJECT_COMMAND_CENTER_READS_VIA_API=false` and its allowlist empty until
hosted parity, readiness, protected browser evidence, rollback, and spend
approval exist.

## M3.236 Project read/list authority evidence

Before any tenant opens the existing project read or list adapters, the
source release must prove the real Nest identity/capability chain against
disposable PostgreSQL: a viewer can read only its tenant, cross-tenant project
IDs return concealed 404s, list filters and ordering are bounded, malformed
limits fail closed, and search results never disclose another tenant.
M3.236 records that protected local gate as 1/1 focused canary plus the full
zero-skip 116-migration environment. Keep
`ERP_PROJECT_READS_VIA_API=false` and `ERP_PROJECT_LISTS_VIA_API=false` with
empty allowlists until hosted parity, readiness, protected browser evidence,
rollback, and spend approval exist.

## M3.235 Project-comment read authority

The project comments surface has a reviewed, bounded Core read contract:
`GET /v1/projects/:projectId/comments?limit={1..100}`. Nest owns exact tenant
and project authorization, deterministic newest-first ordering, bounded
pagination, author projection, and strict response serialization. The Web
adapter validates tenant/project/item scope and fails closed on malformed Core
responses; the direct query remains a compatibility fallback until a tenant
canary is explicitly opened.

M3.235 records the local gate as shared 2/2, API controller 6/6, protected
HTTP 1/1, Web client 7/7, root 173/173 files and 750/750 tests, and a complete
zero-skip disposable PostgreSQL/Redis environment with 116 migrations,
149/149 database suites and 370/370 tests, 66/66 API integration suites and
49/49 tests, and equal schema hashes. Keep
`ERP_PROJECT_COMMENT_READS_VIA_API=false` and its allowlist empty until hosted
parity, readiness, protected browser evidence, rollback, and spend approval
exist.

## M3.234 Project-comment authority evidence

Before any tenant opens Core project-comment writes, the source release must
prove the real identity/capability chain against disposable PostgreSQL:
create/delete operations remain tenant- and project-scoped, mentions resolve
only inside the tenant, idempotency replays safely and rejects command reuse,
audits are atomic, disabled tenants fail terminally, and rollback removes
domain, ledger, and audit rows. M3.234 records that local gate as a 1/1
focused canary and 66/66 API integration suites / 49/49 tests in the full
zero-skip environment. The Web compatibility actions and all selectors stay
closed until hosted parity, readiness, protected browser evidence, rollback,
and spend approval exist.

## M3.233 Notifications read-state authority evidence

Before any tenant opens Core notification read-state, the source release must
prove the real identity/capability chain against disposable PostgreSQL: every
read and write is tenant- and recipient-scoped, malformed commands fail closed,
updates are audited and transactional, the disabled flag returns terminal 503,
and rollback removes both domain and audit rows. M3.233 records that local gate
as a 1/1 focused canary and 64/64 API integration suites / 48/48 tests in the
full zero-skip environment. The Web compatibility route and all selectors stay
closed until hosted parity, readiness, protected browser evidence, rollback,
and spend approval exist.

## M3.232 Today protected local HTTP canary evidence

Before any tenant opens `ERP_TODAY_READS_VIA_API`, the source release must
prove the bounded `/v1/today` contract against disposable PostgreSQL/Redis:
verified identity, tenant and assignee predicates, cross-tenant exclusion,
project-context behavior, strict query rejection, capability denial, request
correlation, and transaction rollback. M3.232 records that local gate as 2/2
focused tests and 62/62 API integration suites / 47/47 tests in the full
zero-skip lane. The selector remains closed until hosted parity, readiness,
protected browser evidence, rollback, and spend approval exist.

## M3.231 Today/Project Command Center read authority

The dashboard Today surface has one reviewed Core read contract:
`GET /v1/today?includeProjects={true|false}`. Nest owns server time and Manila
day boundaries, tenant/assignee predicates, bounded result sizes (8 tasks, 6
projects), and capability checks. The browser never supplies tenant identity
or `asOf`; a shared Zod contract rejects unknown fields and invalid response
shapes. Project context is an explicit optional capability-bearing expansion,
not an accidental role bypass.

Web adoption is a tenant-scoped, fail-closed canary controlled by
`ERP_TODAY_READS_VIA_API` and `ERP_TODAY_READS_VIA_API_TENANT_IDS`, defaulting to
the current direct read. Required before opening the canary: protected local
HTTP evidence, exact Core deployment identity, database/Redis readiness,
tenant-crossing and assignee-negative cases, rollback observation, and a
spend-bounded owner approval. No hosted selector is open now.

## M3.230 Hosted Supabase reconciliation gate

Managed parity evidence must compare the exact repository ledger against the
authorized target without writing SQL. Current target identity is project
`aqqrtkmtcsfkbyyqxowv`, healthy PostgreSQL 17.6.1, 55 applied migrations, and
61 ordered pending migrations through source head
`20260810120000_project_comment_delete_fk_tenant_preservation`.

Apply stays closed while the target is only a prefix and newer authority
tables are absent. Required evidence remains: restorable backup/clone,
isolated 116-migration replay, catalog/data/RLS/function diff, zero-skip DB and
API tests, security-advisor remediation review, rollback proof, exact owner
approval, and a spend-bounded canary. Read-only advisors currently show 14
security findings and 253 performance findings; these are not silently
auto-fixed in production.

## M3.229 Multi-business master-data universal search

The universal-search contract must cover the shared operational vocabulary
without bypassing authorization: vendor and material nodes are visible only
to the roles granted those Cortex scopes, every query remains tenant-scoped,
and Web fallback results preserve the same labels and safe links as Core.
Core remains the authoritative path; the Web fallback is bounded, read-only,
and fail-closed when the Core canary is selected. No browser-supplied tenant
identity or direct sensitive write is introduced.

Current evidence: shared-types 50 files/315 tests, API search 2 files/6 tests,
Web search/command-palette 3 files/21 tests, package typechecks/lints, root
test/typecheck/lint/build, provider-spend, DB-boundary, and workflow-reference
guards pass. The disposable PostgreSQL/Redis gate passes with 116 migrations,
370/370 database tests and 45/45 API integration tests, zero skips, and stable
schema dumps. Hosted source/live parity and production release remain separate
unverified gates.

## M3.228 Disposable zero-skip data/API release gate

Every source change that affects database or Nest business behavior must be
replayable on an isolated PostgreSQL 17/Redis 7.4.9 runtime. The gate must
apply every checked-in migration, run database tests with skips forbidden,
run the Nest integration suite, and prove that tests do not mutate the
schema. The lane is local-only and must never read hosted credentials or
contact Supabase, Vercel, or Railway.

Current evidence: 116 migrations; database 149/149 files and 370/370 tests
with zero skips; API 30/30 files and 45/45 tests; schema-before and
schema-after SHA-256 both
`4FCC37BD3D4BE7B40F108812C7E57D30BC25806E4D7F71D10E8FDE8665C3FDD2`.

This gate establishes local migration and transaction integrity only. It does
not certify hosted provider state, production data, rollout capacity, or
billing behavior.

## M3.227 Controlled upload browser runtime and UX hardening

The project document-upload journey must expose preparing, uploading, and
finalizing progress while asynchronous work is actually in flight. A
localhost-only Playwright proof must exercise the real login and Documents
route against disposable PostgreSQL/Auth/Web state, intercept object storage
and terminal Core responses, reject unexpected provider traffic, and record
console, page-error, accessibility, and desktop/tablet/mobile evidence.
Responsive project navigation must contain its own horizontal overflow rather
than widening the application viewport. Hosted provider credentials, live
Storage objects, Core deployment, and production release remain separate
gates.

## M3.227 Current evidence boundary

The disposable browser proof now passes 1/1 with exactly one sign, object PUT,
and completion request, zero unexpected Storage requests, zero console/page
errors, a captured ARIA snapshot, and no more than one pixel responsive
overflow. The progress hook and Documents subnav fixes are source changes;
production/hosted behavior is not inferred from this local run.

## M3.226 Clean E2E typecheck baseline

All repository E2E specs must pass strict TypeScript checking before browser
runtime evidence is trusted. Environment-backed values may be asserted at
runtime, then narrowed explicitly for request headers. Baseline now passes;
disposable browser execution remains separate.

## M3.225 Controlled upload-flow browser evidence

The project upload journey must be exercised in a disposable local browser
with sign, object upload, completion, progress, terminal Core failure, console,
network, accessibility, and responsive assertions. Provider traffic must be
intercepted or local; the fixture must reject hosted URLs. Fixture source now
exists; runtime evidence and unrelated E2E typecheck cleanup remain open.

## M3.224 Provider-neutral document Storage contract

Server upload and processing code must depend on a narrow binary object
contract. Supabase is one adapter, not a compile-time business-logic
dependency; compatible object providers can be tested locally and swapped
without changing tenant authorization or parser/Core transactions. Provider
credentials, object availability, browser behavior, and hosted release remain
separate gates.

## M3.223 Protected upload-complete runtime

The upload-complete path must record the tenant-scoped document, download and
parse the real file, and send authoritative evidence to protected Core. Core
failure must remain visible as a terminal processing state with no legacy
scope writer fallback. Disposable evidence now covers this runtime boundary;
provider-backed Storage, browser behavior, and hosted release remain separate
gates.

## M3.222 Disposable parser-to-Core HTTP parity

The real Web CAD parser must emit strict worker evidence that crosses the
server-only adapter into the protected Nest route, where verified identity,
capability, tenant scope, idempotency, exact totals, replacement, audit, and
rollback are authoritative. Disposable evidence now covers this boundary;
provider-backed Storage, protected upload-route, browser, and hosted release
remain separate gates.

## M3.221 Disposable CAD Core replay integrity

CAD Core replay must return the exact worker-contract identity and source
metadata, replace only document-owned scope, preserve unrelated and other-
tenant rows, replay one idempotency result, create no draft BOM unless an
explicit separate draft-BOM command is selected, and roll back as one
transaction. Disposable evidence now covers these invariants; actual Web
parser HTTP runtime and hosted release remain separate gates.

## M3.220 CAD Web/Core response identity parity

Web accepts CAD Core success only when returned document, project, and tenant
identities equal the requested document, project, and verified principal
tenant. Any mismatch is a terminal error; no compatibility write or success
presentation is allowed.

## M3.219 Protected CAD HTTP boundary

CAD evidence commits must cross the real Nest authentication and capability
boundary. Verified membership supplies tenant authority; caller-supplied
tenant or actor fields are rejected; missing bearer, missing membership, and
insufficient capability fail before Core invocation. Idempotency is preserved
at the controller boundary.

## M3.218 Tenant-preserving deletion evidence

Composite tenant foreign keys that retain immutable workflow evidence must
null only nullable target references. Required tenant identity remains intact
after deletion, preserving tenant isolation, auditability, and idempotent
replay. PostgreSQL migration semantics and Drizzle declarations stay reviewed
together; destructive hosted migration remains approval-gated.

## M3.217 CAD evidence producer boundary

Web CAD parsing produces validated evidence only. Nest Core owns official
scope replacement, idempotency, tenant authorization, totals, and audit.
Draft BOM creation remains separate until its response and rollback parity are
proven. Compatibility persistence stays available only while selector is
closed.

## M3.216 CAD evidence authority boundary

CAD parsing and AI/OCR remain evidence producers. Official scope replacement,
idempotency, exact centavo totals, and audit stay in Nest Core. Web may call
the strict server-only adapter only for an exact reviewed tenant; Core errors
are terminal and never re-enter a Web database writer. Parser-to-Core parity,
auto-BOM authority, and rollback evidence must precede any canary.

## M3.215 DocuSeal callback authority

DocuSeal completion callbacks cross a strict, server-authenticated Nest
boundary. The Core transaction derives tenant scope from the portal token,
locks the BOM before mutation, persists signed evidence, and appends an audit
event. Web remains a compatibility adapter and may deliver ancillary
notifications only after Core commits; it cannot regain business-write
authority after a selected-Core failure. Exact tenant selectors and internal
tokens stay fail-closed until replay and hosted release evidence exist.

## M3.214 user-scoped notification authority

The authenticated shell reads notifications and commits read-state changes
through a permission-checked Nest boundary. Every query is tenant + recipient
scoped; every state mutation is transactionally audited; and the Web route is
only a compatibility mapper. Exact tenant selectors remain closed until
replay, protected browser proof, rollback, readiness, and spend evidence are
available.

## M3.213 finance read authority seam

Sensitive finance register reads move into Nest Core behind capability checks,
verified principals, tenant-scoped joins, bounded result contracts, and exact
decimal-cent representation. Web keeps a compatibility read path during
incremental migration, but an explicitly selected Core tenant receives a
terminal error on Core failure rather than an unsafe direct fallback. Canary
selectors remain exact-UUID and closed by default until database/RLS parity,
protected browser proof, rollback, readiness, and spend evidence exist.

## M3.212 one source-safe chat context boundary

Every Cortex response and deterministic fallback must derive answer text,
citations, and model prompt context only from UUID-backed, registry-validated
source-table/node-type pairs. Core and Web authorities may omit malformed
derived rows, but neither may pass raw graph projections to an AI model or
persist unsafe evidence. The shared contract remains the single source of the
invariant; database retrieval uses it at runtime.

## M3.211 one sanitizer across graph authorities

The Web compatibility graph route and Nest Core graph authority use identical
shared sanitization. Authority selection changes ownership only; it never
changes source identity, bounded links, or malformed-row behavior.

## M3.210 resilient graph reads

Graph read authorities must degrade per malformed row, not per request. They
retain only schema-valid, source-registered nodes and links whose endpoints are
present in the retained set; invalid focused records resolve to a concealed
not-found. This keeps Cortex usable and honest while protecting tenant-scoped
AI/navigation consumers.

## M3.209 one canonical Cortex source contract

Graph nodes, keyword hits, and citation evidence share the same source
identity invariant: registered reference table plus matching canonical node
type. Any authority or consumer that receives malformed/mismatched data fails
closed at schema validation, preventing unsafe deep links and unsourced AI
context.

## M3.208 canonical Cortex source boundary

Every Core Cortex search result must be a registered source-table/node-type
pair and satisfy the shared result schema before it crosses the Core boundary.
Malformed or unknown derived rows are omitted rather than exposed or used as a
navigation authority. This rule applies independently of the Web compatibility
adapter and remains tenant/role/capability scoped.

## M3.207 Core-owned universal search read authority

Nest Core owns universal-search reads behind `GET /v1/search`, with capability
authorization, verified tenant isolation, canonical role/entity policy, and
assignee-scoped task visibility. It queries an indexed, tenant-scoped graph
projection and returns only bounded navigation-safe hits. The Web layer remains
a compatibility surface and selects Core only through an exact UUID tenant
allowlist; selected-Core errors are terminal and cannot silently re-enter
direct database fan-out.

The source seam is deliberately disabled until disposable PostgreSQL replay,
graph backfill/parity, protected browser evidence, exact release identity,
readiness/rollback checks, and spend controls are available. This milestone
does not claim full record-family parity or hosted activation.

## M3.206 universal search authority handoff

The Web palette and Nest Core read authority consume one strict universal
search result contract. Every hit is a bounded, relative navigation target;
tenant, role, query-plan, SQL, and provider diagnostics never cross the
boundary. A result declares `complete` or `partial`; partial results identify
only the affected record kinds so operators can trust the visible data without
being misled about coverage. Core will derive tenant, role, capability, and
assignee scope from the verified principal, and the Web compatibility route
will select Core only for an exact tenant canary. Selected-Core failure is
terminal; there is no direct-read fallback after authority selection.

The current slice makes the response contract and degraded-state behavior
explicit while preserving the existing Web API. Core selection remains
disabled until PostgreSQL replay, protected browser, release identity,
rollback, readiness, and spend evidence exist.

## M3.205 managed parity is a source-accurate, read-only release gate

The managed-database release manifest always reflects the current migration
ledger while preserving the last independently verified hosted prefix. Source
head, count, pending suffix, order, and review-batch membership are machine
checked. A manifest refresh never implies hosted application, history repair,
branch creation, or canary approval. Hosted migration remains blocked until
backup/PITR, Auth/Storage/catalog/RLS parity, zero-skip replay, release
identity, rollback, readiness, and spend evidence are independently present.

## M3.204 project discussion deletion authority

Project comments have a single auditable lifecycle authority. Nest Core owns
tenant-scoped deletion, capability checks, idempotent replay, and the semantic
audit transaction. The Web layer may select that authority only through an
exact tenant allowlist; a selected-Core failure is terminal and cannot fall
back to a browser/database mutation. Deletion evidence remains durable after
the comment row is removed through a service-only result ledger with nullable
target references. The default rollout is reversible and closed until
zero-to-current PostgreSQL replay, hosted release identity, rollback,
readiness, and protected-browser evidence are approved.

## M3.203 project discussion authority

Project comments are an official tenant-scoped ERP traceability record. Core
derives actor and tenant from verified membership, validates project scope,
resolves mentions, writes the comment and semantic audit in one PostgreSQL
transaction, and stores a durable idempotency result for safe retries. Web may
select this authority only through an exact tenant gate; a selected-Core
failure is terminal and never falls back to browser/database mutation. The
legacy Server Action remains a reversible compatibility path until local
migration replay, hosted identity, rollback, and protected browser evidence
are approved.

## M3.202 canonical command serialization

Every authority-selected document command serializes optional fields through a
single canonical representation before transport and idempotency hashing.
Absent descriptions become `null`; retries therefore address the same command
identity across Web, Core, and PostgreSQL. The selector remains reversible and
closed by default until hosted evidence is approved.

## M3.201 upload authority selection

The Web upload route has one explicit authority selector. When an exact tenant
canary and supported non-extractor format match, Core commits the document and
returns the frozen Web shape; no legacy write is reachable after selection.
When the selector does not match, existing legacy behavior remains available
for compatibility, especially for extractor formats awaiting independent
processing parity. This transition is reversible by clearing the gate.

## M3.200 upload response compatibility and replay evidence

The legacy upload response is a shared, strict contract. The existing Web
route remains authoritative while a disposable Core canary maps only
non-extractor uploads to that contract. No extractor or AI/CAD result is
silently discarded, and a selected-Core failure never falls back to a direct
Web write. Local zero-to-current replay is the prerequisite for any hosted
database release; source parity is not hosted-state evidence.

## M3.199 document intake authority

Document creation is a Nest transaction, never a browser/database write. The
verified principal supplies tenant/user/role; the project and storage prefix
are tenant-scoped; the request ledger makes retries idempotent; the audit event
commits with the document. Web can select this authority only through an exact
tenant canary and must fail closed without a direct fallback. The current Web
adapter is intentionally unconnected until parity, migration replay, release
identity, rollback, and spend gates pass.

## M3.198 Next API database boundary

Every Next API direct database write is either removed in favor of Nest or is
temporarily listed with an owner, operation set, and migration target. Raw
`db.execute` is explicitly read-only classified. The verifier is a guard
against new split authority; it does not certify hosted behavior or permit a
canary.

## M3.197 release identity and rollback gate

Every release candidate has machine-checked source SHA/branch/clean state,
matching API/Web release identities, explicit rollback targets, and a clear
spend/deployment guard before any canary. Missing hosted evidence remains
`review_required`; source tests never imply production identity.

## M3.196 protected auth and tenant boundary

The future Core owner/context route is exercised through the real JWT
membership guard, capability metadata, strict query pipe, and controller in a
disposable source harness. Tenant/user/role scope is derived from verified
membership; caller-selected tenant scope is rejected before business logic.
The route remains unconnected and disabled until exact hosted release
identity, database replay, browser, rollback, and spend gates pass.

## M3.195 protected owner/context HTTP boundary

The Core owner/context endpoint now has local strict-input and status/message
coverage, while the exact-tenant Web seam fails closed on selected-Core timeout
without retries or direct fallback. The chat route remains unconnected until
deployed auth, cross-tenant replay, release identity, rollback, and spend gates
are proven.

## M3.194 deterministic owner/context parity evidence

The future Core owner/context seam now has a repeatable 12-case fixture against
the current Web contract, including concealed ownership/focus failures and
immutable-context conflict semantics. This evidence remains source-only; the
Web chat route stays unconnected until protected HTTP behavior, exact deployed
identity, rollback, hosted database replay, and spend gates pass.

## M3.193 conversation owner/context authority

Chat bootstrap will resolve owner and immutable focused context through a
separate exact-tenant Core seam before prompt assembly. Core owns tenant/user
ownership, current-role scope, canonical source/type checks, and 404/409
semantics. The Web seam is server-only, strict, bounded, and has no direct
database fallback after selection. It remains unconnected until deterministic
legacy parity, protected-flow evidence, hosted identity, rollback, and spend
gates pass.

## M3.192 unconnected Web chat seam

The future Web chat route has a server-only exact-tenant Core retrieval seam
with no direct fallback after Core selection. Its transport is authenticated,
bounded, no-store, single-timeout, JSON-focus safe, and strict-schema parsed.
Conversation ownership/context remains an independent authority boundary; the
route is not wired until that parity and protected-flow evidence is complete.

## M3.191 chat retrieval parity evidence

The legacy direct retrieval fixture and strict Core chat projection now have a
repeatable equality check for one tenant-shaped source set. This is evidence
for serialization and citation parity only; it does not certify the browser
conversation owner/context path, hosted identity, RBAC, rollback, or spend.
The next seam must keep conversation ownership and focused-record
authorization explicit before any Web cutover.

## M3.190 bounded Cortex chat retrieval authority

The chat read path has a separate Core projection at
`GET /v1/cortex/chat-retrieval`. It returns bounded recent nodes, keyword
matches, an optional focused summary/citation set, deterministic keyword
answer citations, graph stats, freshness, and an explicit semantic status.
Nest owns tenant/RBAC scope and rejects disabled or non-allowlisted tenants;
the database remains the source of truth. The Web chat route is not cut over
until deterministic parity, protected-flow, rollback, and spend evidence are
reviewed. Semantic/provider retrieval and conversation ownership remain
separate slices.

## M3.189 Cortex chat retrieval authority

Chat retrieval will have its own strict projection and Nest authority covering
recent, keyword, focused, citation, freshness, and optional semantic context.
Write/generation and conversation list/detail canaries remain separate; no
existing write flag implies chat read approval.

## M3.188 Local release/rollback metadata

The review packet records an exact source candidate and documented Web rollback
reference. API/Railway rollback identity remains an explicit external gate;
local source state cannot certify hosted release identity.

## M3.187 Exact-tenant Cortex brief canary gate

The dashboard brief Web gate rejects wildcard selection and requires one
reviewed tenant UUID. Other read seams remain independently governed. Exact
tenant behavior is locally tested; hosted approval is still separate.

## M3.186 One-tenant Cortex brief canary review

Canary activation requires a review packet with exact source/deployment
identity, tenant/role proof, parity, rollback, bounded request behavior, and
spend evidence. The current packet is review-only; both API/Web gates remain
closed until external hosted evidence is supplied.

## M3.185 Dashboard brief parity evidence

The dashboard seam has a deterministic fixture proving the legacy and
normalized Core projections are equivalent for the bounded brief. This is
parity evidence only; it does not approve a tenant canary or imply graph/chat
authority migration.

## M3.184 Dashboard server-component brief adapter

The dashboard consumes one server-only brief seam. It selects Nest authority
only for an exact tenant allowlist, normalizes the strict Core projection into
the existing render model, and fails closed visibly on Core errors. The legacy
database path remains for unselected tenants; chat, graph, and other reads are
not implicitly cut over.

## M3.183 Cortex brief read authority

The brief now has a strict shared contract and Nest tenant/role read authority.
The Web adapter is independently canaried and fail-closed; its flag stays
false until parity, identity, rollback, and spend evidence exist. The dashboard
server component remains a separate cutover; the legacy direct path stays for
unselected tenants.

## M3.182 Cortex read-authority inventory

Core read authority is complete only when brief, graph, entity, search, and
conversation projections have shared schemas, Nest authorization, tenant
canaries, parity evidence, and fail-closed rollback. The current graph,
entity, search, and conversation canaries remain separately gated. The brief
needs a new shared contract and Nest read service before dashboard cutover;
chat retrieval and conversation bootstrap need their own parity design. A
write or provider canary must never be treated as read authority.

## M3.181 user-facing Cortex search consumer boundary

User-facing search remains a tenant- and role-scoped record projection. Nest
derives authorization from the authenticated principal; Next accepts only a
bounded query and maps registered sources to safe deep links. The result
contract is strict and cannot carry process snapshot scope, metric, or counter
fields. Command-palette normalization remains presentation-only. Process
observability stays backend-only and unregistered from Cortex search, graph,
brief, and chat consumers.

## M3.180 operational adapter consumer ownership audit

No runtime consumer is registered for the process snapshot evaluator. A future
consumer must be a separately reviewed operational adapter; consumer metadata
cannot enable a route, exporter, sink, or deployment.

## M3.179 fail-closed operational adapter trigger conditions

Any future operational adapter must first satisfy the nine review inputs in
the pure evaluator: authorization, scope, redaction, retention, rate, cost,
owner, exact SHA, and rollback artifact. Eligibility is evidence only and
cannot enable a route, exporter, sink, or deployment.

## M3.178 operational snapshot ownership and release evidence

The closed snapshot policy names an ERP backend owner, binds any future
operational release to an exact Git commit SHA, and requires rollback to a
last-known-good artifact without rebuilding. These are evidence requirements,
not deployment authority.

## M3.177 deployment observability access-policy audit

The process snapshot seam carries an explicit immutable access policy and a
module-boundary contract: internal Nest service only, no controller/exporter,
process scope, no tenant attribution, fixed-cardinality redaction,
process-lifetime retention, disabled external sink, zero external spend, and
separate deployment review. Public health/readiness probes remain limited to
liveness and dependency readiness.

## M3.176 backend-only operational snapshot seam

Operational tooling may read one schema-versioned process snapshot from the
Nest observability service. Snapshot values are immutable, fixed-cardinality,
and explicitly process-scoped. No public controller or browser route may bind
this seam; future export requires separate security and cost review.

## M3.175 local post-commit enqueue observability

The closed-by-default alert handoff exposes a fixed-cardinality process-local
metric seam. It counts `post_commit` and `recovery_fallback` outcomes as
`enqueued`, `skipped`, or `failed`, and emits sanitized structured records
without tenant, event, alert, credential, or transport-error identity. The
transactional outbox remains authoritative: post-commit transport failure
cannot reject an ERP commit, while recovery transport failure remains
retryable. No metrics exporter or public endpoint is enabled in this slice.

## M3.174 post-commit circuit-alert enqueue wiring

Every transaction that creates an aggregate `opened` or `recovered` alert must
return the newly-created event to its transaction owner. The owner may call
the disabled queue seam only after PostgreSQL commit succeeds. The durable
alert ledger is the transactional outbox: queue loss never rolls back an ERP
transaction, and the recovery scheduler re-enqueues the same opaque event key.

Settlement, reconciliation, generation cancellation/retry/failure, claim
failure, and generation recovery must share this boundary. No caller may
enqueue from inside a transaction or pass raw alert data to BullMQ. All queue,
worker, recovery, and route gates remain closed by default.

## M3.173 disabled-by-default BullMQ alert delivery seam

The alert transport must carry only `{schemaVersion,eventKey}`. The job ID is
deterministic from the durable event key, retries are capped at three attempts
with bounded exponential backoff, and terminal BullMQ envelopes may be
replaced only during a database-backed recovery pass. A worker reloads the
tenant from PostgreSQL, rechecks the exact intersection of job/worker/route
gates, claims the event transactionally, and routes the same protocol-v1
envelope. It must never trust tenant data from the queue payload.

Recovery runs only when all gates and exact tenant allowlists intersect. It
re-enqueues pending, failed-under-ceiling, or stale-processing event keys and
records `stale_attempt_limit` when a stale claim has exhausted its durable
ceiling. The adapter token remains unbound to external credentials in this
milestone; local fakes prove identity, retry, stale, and closed-gate behavior.

Activation still requires a credential-isolated external adapter, complete-
clone migration replay, backup/PITR evidence, one exact tenant, a low approved
policy, one reviewed release SHA, live RBAC/cancellation proof, and rollback.

## M3.172 durable claim-to-route orchestration

Durable alert claims must be the only source for adapter delivery. Nest must
claim pending, failed, or stale-processing rows transactionally, route exactly
the validated event envelope, map route outcomes to delivered or bounded
failure state, and stop a drain after one failure. A retry must reuse the same
event key and never create a second alert. Tenant/policy scope and source
identity remain database-enforced; stale claims remain recoverable.

The orchestration seam must preserve existing generic sinks while enabling the
provider-neutral router. It must not add a queue worker or external adapter
until a separately reviewed milestone proves job identity, backoff, scheduler
gates, and rollback. No provider, pager, credential, or hosted deployment is
authorized here.

Activation still requires a disabled-by-default queue worker, credential-
isolated external adapter, complete-clone migration replay, backup/PITR
evidence, one exact tenant, a low approved policy, one reviewed release SHA,
live RBAC/cancellation proof, and an approved rollback.

## M3.171 provider-neutral alert routing

Nest must build one strict, versioned aggregate alert envelope from a durable
circuit event. The envelope carries event-key idempotency, exact tenant/policy
scope, provider/model, bounded failure count/timestamps, and runbook identity;
it cannot carry credentials, URLs, prompts, responses, user identity, or raw
adapter errors. Routing must require a separate exact-tenant gate and remain
closed by default.

Adapters must receive only this envelope, expose a stable non-secret key, and
deduplicate by `eventKey`. Nest maps known adapter failures to a bounded
taxonomy and maps unknown failures to `route_unknown`; raw messages never cross
the result or persistence boundary. Local fake conformance is required before
any external route is considered. No provider or external pager is authorized
by this source milestone.

Activation still requires credential-isolated adapter review, tested external
routing, complete-clone migration replay, backup/PITR evidence, one exact
tenant, a low approved policy, one reviewed release SHA, live RBAC/cancellation
proof, and an approved rollback.

## M3.170 durable circuit alert ledger and delivery seam

Every tenant/provider/model circuit opening and proven recovery must produce a
single durable, aggregate-only event. Event identity must be deterministic and
source-scoped, with PostgreSQL uniqueness preventing duplicate transitions or
recovery replays. The ledger must support pending, processing, delivered, and
failed states, bounded retries, stale-claim recovery, and a sink contract that
never receives prompts, responses, credentials, attempt IDs, or user identity.

Nest owns observation, audit, claim, and delivery authorization. A sink failure
must be safe to retry by event key and must not hot-loop the queue. External
paging remains a separately approved adapter; this milestone uses a local fake
sink only. Tenant scope, policy scope, source linkage, checks, and service-only
RLS remain database-enforced.

This source boundary is locally complete. Activation still requires a tested
external routing adapter, complete-clone migration replay, backup/PITR
evidence, one exact tenant, a low approved policy, one reviewed release SHA,
live RBAC/cancellation proof, and an approved rollback. No provider or hosted
deployment is authorized by this milestone.

## M3.169 provider health and automatic circuit breaking

Provider execution must expose tenant-scoped operational truth without raw
prompts, responses, credentials, attempt identity, or user identity. Authorized
owners, administrators, and finance users need UTC-day held/consumed/remaining
spend, bounded outcome counts, unknown outcomes, latency percentiles, current
policy state, retry time, and probe state. Caller-supplied tenant scope is
forbidden; Nest derives it from the verified principal.

A configured failure burst must stop new reservations and dispatches. Circuit
evidence remains durable until provider success, cooldown opens only one
half-open probe, and policy-row locking prevents concurrent probes. Quiet time
cannot silently close a tripped circuit. Stable outcome codes and the attempt
ledger remain the evidence; Redis, Python, and the browser cannot reset,
reserve, dispatch, settle, or finalize provider work.

This source boundary is locally complete. It does not authorize credentials or
a real provider. Production activation still requires tested external alert
routing, complete-clone migration replay, backup/PITR evidence, one exact
tenant, a low approved policy, one reviewed release SHA, live RBAC/cancellation
proof, and an approved rollback.

## M3.168 provider protocol and spend-safe dispatch

Every paid assistant dispatch must use a strict versioned contract constructed
by Nest after the current attempt is durably reserved. The request must be
re-redacted, bounded, free of internal tenant/user/job/request/attempt identity,
and bound to one deterministic dispatch key and request fingerprint. Provider
plans must declare a bounded request ceiling and timeout before reservation.

Responses must match the protocol and reserved model, cite only authorized
evidence, remain within the reservation, and return an opaque receipt that is
hashed before persistence. The official completion must match the durable
response fingerprint exactly. PostgreSQL must freeze dispatch identity and
reject any mismatched completion even from a direct service-role writer.
Automatic retries after dispatch are forbidden when the provider outcome is
unknown; conservative maximum settlement bounds spend and prevents a second
dispatch. Python remains advisory and cannot reserve, dispatch, settle, or
commit official ERP state.

This boundary is source-complete and locally replayed. It does not authorize a
credential or real provider. Activation still requires spend/latency/error
observability with an automatic circuit breaker, complete-clone migration
replay, backup/PITR evidence, one exact tenant, a low policy ceiling, one
reviewed release SHA, live RBAC/cancellation proof, and an approved rollback.

## M3.167 provider-grounded completion provenance

An official provider-grounded assistant turn must be inseparable from exactly
one settled provider attempt. The durable link is tenant-composite, unique per
attempt, and immutable after commit. PostgreSQL must reject any completion
whose attempt belongs to another tenant or job, is not the job's current
attempt, is unsettled, did not succeed, exceeds its reservation, or used a
different policy model. Deterministic completions remain explicitly unlinked.

Only trusted Nest orchestration may construct the provider-grounded completion
variant. External and signed callers cannot claim that outcome or provide an
attempt identity. Nest must reauthorize claim fencing, RBAC, context, and
citations and atomically commit the official message, completion provenance,
job state, and semantic audit. Redis and Python remain unable to approve or
finalize the transaction; prompts and provider payloads remain outside audit.

This provenance boundary is source-complete and locally replayed. It does not
authorize credentials or a real adapter. Provider activation still requires a
provider-neutral request/response contract, deterministic dispatch identity,
bounded timeout/error handling, observability and alerts, complete-clone
migration replay, backup/PITR evidence, one exact tenant, low spend limits, a
reviewed release SHA, live RBAC/cancellation proof, and an approved rollback.

## M3.166 provider execution and recovery safety

Provider orchestration must remain Nest-owned and fail closed. A model call may
start only after exact-tenant execution and budget gates pass and PostgreSQL has
reserved the current claimed attempt. The same attempt may be dispatched at
most once. Provider output is advisory until Nest validates its completion
shape, restricts citations to the evidence selected under current tenant/RBAC
scope, settles the cost, and commits through the existing fenced completion
authority.

Cancellation, retry, failure, and stale-job recovery must never strand an open
reservation. A reserved attempt closes at zero; a dispatched attempt whose
external outcome cannot be proven closes at its reserved maximum. Recovery is
independently gated so stale work can be safely drained after intake and model
execution close, without reopening dispatch. Redis transports identity only,
PostgreSQL owns state and money, and Python cannot reserve, dispatch, settle,
approve, or commit official ERP state.

The fake-only seam now proves this lifecycle. A real adapter remains prohibited
until the assistant completion contract records provider-grounded provenance
and immutable linkage to exactly one settled current attempt, followed by
separate credential, observability, canary, backup/PITR, and release approval.

## M3.165 provider-attempt budget authority

No paid model dispatch may begin without a durable Nest reservation against an
enabled exact-tenant policy. PostgreSQL is the cost authority: bounded integer
micros, request and UTC-day limits, immutable tenant/job/attempt identity,
idempotent replay, serialized budget checks, and an explicit
reserve-dispatch-settle or reserve-release state machine. Redis cannot grant a
budget, and Python cannot reserve, dispatch, settle, release, approve, or commit
official ERP state.

Closing a rollout gate or policy must stop new reserve/dispatch work without
stranding existing reservations; Core must retain terminal settlement/release
authority. Open reservations consume their maximum cost until released or
settled. Actual settlement cannot exceed the reservation. Policy and attempt
changes must be permission-scoped and audited without raw prompts or provider
payloads.

The source contract is now present but intentionally inactive. No policy is
seeded, no tenant is allowed, and no provider adapter calls a model. Activation
still requires complete-clone managed replay, backup/PITR evidence, explicit
tenant and micros limits, observability, cancellation/recovery proof, and one
separately approved controlled release.

## M3.164 protected browser and cancellation reliability

Every asynchronous Cortex release must have a reproducible protected-browser
proof through Next, Nest, BullMQ/Redis, the advisory Python worker, and
PostgreSQL. The proof must use local identities and endpoints, remove inherited
hosted/provider credentials, block foreign egress, and exercise success,
pending, terminal failure, authorization revocation, cancellation, responsive
layout, accessibility, and console health. Compilation alone is insufficient.

An absent conversation identity is omitted, never encoded as `null` against an
optional UUID contract. One job owns one idempotent browser canceller shared by
poll failure, explicit new chat, React unmount, and `pagehide`. Browser teardown
must start cancellation before document destruction; duplicate triggers must
coalesce to one DELETE. PostgreSQL remains terminal truth if the response from
an unloading document cannot be observed.

This local browser gate is now satisfied for M3.163. It does not authorize a
managed canary or paid model. All Cortex flags stay closed until complete-clone
replay, backup/PITR evidence, exact-tenant approval, and explicit spend limits
are complete.

## M3.163 cost-bounded asynchronous Cortex handoff

Long-running assistant work must not occupy a Next server invocation. The Web
facade may authenticate, start one durable Core job, and return `202`; the
browser may poll only a same-origin, owner-scoped proxy with a fixed attempt
cap, private caching, rate limiting, abort, and cancellation. Legacy response
text, citations, conversation identity, accessibility, and visible interaction
must remain compatible during exact-tenant rollout.

Nest remains result authority. A job status alone cannot release stored
assistant content. Core must reauthorize the current database principal,
tenant/user ownership, conversation context, official source turn, and current
citation visibility before each final read. Pending and terminal failures must
never carry a result. PostgreSQL remains truth; Redis/Python cannot authorize
or return official ERP memory directly to the browser.

The handoff is a function-duration guard, not a cloud-build-cost claim. Vercel
Git stays disconnected; deployment remains a separately approved, single,
reviewed release after managed replay and canary evidence. All flags default
closed. A local protected-browser proof of success, timeout, abort/cancel, and
permission revocation is required before any canary.

## M3.162 provider-free Cortex generation jobs

Assistant execution belongs to the NestJS modular monolith. PostgreSQL is the
authoritative state machine and fencing ledger; BullMQ/Redis transports opaque
job identity and provides bounded retry/recovery only. Core must recheck the
current principal, tenant, capability, owned conversation, immutable context,
official user turn, and graph scope before releasing redacted evidence. It must
reauthorize worker citations and atomically commit official memory and audit.

Python remains advisory. Its deterministic grounded endpoint receives no
tenant credential or database access and cannot approve, finalize, or persist
an ERP transaction. A future external model may be placed behind this same
boundary only after Nest reserves an explicit provider budget and defines
idempotent attempt accounting; provider credentials and decision authority
must not move to browsers.

Selected Next traffic keeps compatibility through an exact-tenant gate and
never falls back to direct database or provider work after Core selection.
Intake, worker, recovery, and Web gates remain independently closed by default.
Managed replay, protected canary evidence, and a cost-approved release remain
required before activation.

## M3.161 trusted Cortex assistant-generation authority

Assistant generation is a trusted server workflow, never a browser-selected
message role. NestJS owns permission checks, one-user-turn/one-generation
identity, durable lease/fencing, official message commit, exact replay, current
citation projection, and chained audit. PostgreSQL is transaction truth; Redis
may coordinate later execution but cannot replace the ledger. A server-only
HMAC binds the Next compatibility facade to the authenticated tenant/user and
exact command.

Provider work may start only after a durable claim. Concurrent or completed
retries make no provider call. If paid quota is unavailable, the selected path
must finish with a free grounded answer instead of abandoning a live lease.
Python may later perform model inference, retrieval analytics, or document
processing, but it cannot authorize, approve, or directly commit assistant or
ERP records. Core must validate any returned evidence before completion.

This source milestone moves claim/completion and memory authority only. The
existing Next route still performs retrieval and optional model streaming.
Moving that AI execution behind a bounded Nest/BullMQ/Python contract,
managed-database replay, exact-tenant comparison, and protected canary evidence
remain separate release gates. Every gate defaults closed.

## M3.160 Cortex user-turn write authority

Official human-authored Cortex memory belongs to the NestJS modular monolith.
The browser may submit only content, optional registered-record context, an
owned conversation ID, and an idempotency key. Core derives tenant, actor,
role, capability, and the immutable `user` message role; rechecks current
authorization in the same PostgreSQL transaction; enforces tenant identity
with composite constraints; and writes a raw-content-free chained audit.

Idempotency is durable PostgreSQL authority, not process memory or Redis. Exact
replay returns the original result; reuse for a changed command conflicts.
Redis/BullMQ may transport later work but cannot become transaction truth.
Python and AI providers cannot approve, finalize, or directly persist official
ERP memory.

Assistant/provider turns require a separate trusted server-to-server authority
that the browser cannot impersonate. Until that boundary exists, only the user
turn may use Core and assistant persistence remains in the existing server
compatibility path. Next remains a closed-by-default, exact-tenant facade and a
selected Core error fails closed. Managed replay, exact-tenant parity, and
protected canary evidence remain release gates.

## M3.159 Cortex conversation read authority

Saved Cortex memory reads belong to the NestJS modular monolith. List and
detail inputs expose no tenant, user, role, or node-type scope. Core derives all
four from the authenticated principal, limits history, conceals foreign and
revoked threads, validates immutable record context, and rehydrates stored
citation IDs against the caller's current graph visibility. Stored titles and
references are never presentation authority.

Next remains a compatibility facade behind a separate, exact-tenant,
closed-by-default read gate. A selected Core error must fail closed; it cannot
fall back to direct database reads. PostgreSQL remains the source of truth and
the derived Cortex graph remains rebuildable. Read migration cannot authorize
chat writes, provider calls, or ERP transactions. Exact-tenant legacy/Core
parity and protected browser evidence remain release gates.

## M3.158 protected Cortex route evidence boundary

Protected Cortex integration must be reproducible without minting, revoking,
or reading a hosted identity. A loopback contract may exercise the exact
`getUser` and server-owned profile projection used by Web while PostgreSQL
remains the official ERP read source. The harness must reject unexpected
Auth/REST calls, keep all canaries and provider credentials closed, block
foreign browser egress, and prove unauthenticated denial, tenant-scoped graph
reads, conversation isolation, responsive behavior, and zero spend commands.

The page must open at its header; chat-follow behavior may scroll only the
agent's internal message log. Development CSP may admit an explicitly
configured loopback Auth/Realtime origin, but production CSP cannot inherit
that exception. Root tests should use bounded package concurrency so strict
timeouts measure behavior instead of workstation saturation.

This route-wiring boundary is now satisfied. Full GoTrue/PostgREST behavior,
managed Auth recovery, exact-tenant parity, backup/PITR, and production release
authorization remain separate gates.

## M3.157 auth-safe cost-control browser evidence

Provider-spending UI must be testable without minting or revoking a hosted
identity. Server code owns whether the control is visible and enabled; the
browser receives no tenant selector or permission override. A localhost-only
gallery may render the real component for deterministic interaction testing,
but it must connect to no hosted Auth, database, queue, or provider and must
never become an application route.

Browser evidence must cover closed rollout, cancellation, exact disclosure,
one command, idempotency header, active states, success, terminal failure,
responsive fit, touch targets, overflow, console errors, and foreign network
requests. This evidence is now satisfied locally. Full production-route session
integration and exact-tenant release approval remain separate gates.

## M3.156 semantic-index runtime proof boundary

Every cost-bearing semantic-index workflow must first pass a disposable,
zero-skip PostgreSQL/Redis lane with a deterministic fake worker. The lane must
prove browser-table denial, current permission enforcement, tenant isolation,
idempotency, active-job uniqueness, batch and call ceilings, empty-work
behavior, recovery on Redis loss, terminal handling after an uncertain
provider reservation, atomic database commit, and audit-chain continuity.

That local runtime boundary is now satisfied for M3.155. It does not authorize
a hosted migration, protected tenant canary, real provider call, or release.
Those remain separate owner-approved gates with an exact tenant, written spend
ceiling, auth-safe browser evidence, managed backup/PITR proof, and rollback
ownership.

## M3.155 cost-bounded semantic indexing authority

Semantic indexing is a durable, explicit, cost-disclosed Core workflow. One
human confirmation creates one tenant-scoped job for exactly one bounded batch:
at most 64 current graph nodes and at most one provider call. PostgreSQL is the
only job authority; Redis/BullMQ is recoverable transport; Python is the only
embedding-provider boundary and receives no tenant, role, actor, or transaction
authority. Derived vectors remain rebuildable and never become ERP source of
truth.

Only current owners/admins with `cortex.index.manage` may create or inspect a
job. The browser never writes a sensitive table and never loops provider-spend
commands. Idempotency, an active-job uniqueness constraint, exact tenant gates,
provider quota, audit, and one-call reservation all fail closed. Any crash after
reservation but before an acknowledged result becomes terminal rather than
retrying uncertain spend. Intake, worker, recovery, Web cutover, and legacy
compatibility are independently reversible and disabled by default.

## M3.154 Cortex entity-context read authority

Entity context, relationships, citations, and evidence belong to the NestJS
modular monolith. Request input contains only one registered source table and
UUID. Tenant, role, capability, and node-type scope come from the authenticated
principal. Responses are bounded, schema-validated, and presentation-safe;
internal provenance chain material never leaves Core.

The Next compatibility route remains the default until independent exact-
tenant Core/Web gates select the new path. A selected Core failure is terminal,
while not-found behavior remains non-enumerating. The derived graph remains
rebuildable and is never the ERP source of truth. Entity retrieval performs no
AI-provider call and cannot approve or mutate an ERP transaction.

## M3.153 Cortex graph read authority

Interactive graph retrieval belongs to the NestJS modular monolith. Request
input may contain only an optional complete registered record focus; tenant,
role, and node-type scope always come from the authenticated principal. The
contract bounds nodes and links, binds each source table to one canonical node
type, rejects malformed or inconsistent payloads, and conceals unauthorized
focus records without enumeration.

The Next compatibility route remains the default until two exact tenant gates
select Core. Once selected, Core unavailability is terminal rather than a
reason to regain direct database access. Core and Web flags remain independently
closed until managed graph parity, protected role-by-role browser evidence, and
rollback approval are complete. No AI provider call is part of graph browsing.

## M3.152 owner-governed duplicate remediation

Duplicate remediation planning must be deterministic, collision-aware, and
read-only, but business approval stays human-owned. A recommendation artifact
must live outside source control, expose no identifiers in console output,
refuse overwrite, and remain incompatible with the executable version-1
mapping. Only an owner-reviewed mapping validated against a fresh snapshot may
be applied, and only to an isolated complete managed restore before production.
Proposal generation can never enable a canary, apply SQL, or certify parity.

## M3.151 managed-snapshot replay evidence boundary

Database release evidence must distinguish an ordered source-suffix replay
from full managed-project parity. Export preflight accepts only an explicit
session/direct PostgreSQL URL plus PostgreSQL 17 tooling. Snapshot replay
verification is localhost-only, read-only, and fails on missing/reordered
migrations, duplicate Purchase Order groups, tenant tables without RLS, or
anonymous tenant-helper execution. A synthetic clone mapping can prove
migration dependencies but can never become owner approval or production
remediation evidence. Auth, Storage, vector, provider grants, zero-skip
integration, backup/PITR, and object recovery remain separate hard gates.

## M3.150 managed database parity evidence

Managed release must use one machine-checked linear migration manifest tied to
the exact target project and source head. Every missing version must appear
once, in repository order. Review batches may organize evidence but must not
imply that a partial production suffix is safe. Before any hosted apply, an
owner-approved duplicate Purchase Order mapping, supported managed backup/PITR
restore drill, separate Storage-object recovery, Auth/public-user identity
proof, RLS/privilege closure, semantic-audit recovery, exact-SHA readiness,
rollback, one-tenant canary, and explicit spend ceiling must pass. Free local
replay precedes any hourly managed branch.

## M3.149 Core-owned user-role assignment

Official user-role changes must be authorized and committed only by NestJS
Core. The command must re-derive actor membership, require `admin.users`,
lock actor and target rows, enforce owner/admin hierarchy and self-demotion
invariants, reject stale expected-role commands, persist tenant-scoped
idempotent replay, and write bounded semantic audit in the same PostgreSQL
transaction. Authenticated browser sessions retain tenant-scoped user reads
but no direct user-table mutations. Web remains a compatibility adapter;
selected Core failures never fall back. The migration and four canary flags
stay unapplied/disabled until managed parity, recovery, identity, audit,
rollback, and bounded-spend gates pass.

## M3.148 authenticated-only tenant identity helper

`public.auth_tenant_id()` must remain executable only by the roles that need
it for tenant RLS and trusted service work: `authenticated` and
`service_role`. Anonymous users must not invoke the helper directly. Public
portal flows stay behind server-mediated boundaries; no critical ERP table
write is granted to the browser. The privilege rule must be source-tested,
runtime-replayed, and included in the reproducibility verifier before managed
application.

## M3.147 managed Supabase parity gate

Managed Supabase must be proven to match the repository migration ledger and
Core-owned privilege/RLS contract before any hosted canary. The current
project is healthy but 46 local migrations behind; the invoice draft replay
ledger is absent remotely. The target gate requires an ordered, reviewed
migration plan with duplicate-data remediation, backup/PITR evidence, a
security-advisor remediation plan, and a rollback rehearsal. Do not apply the
pending set or enable invoice writes from a read-only parity check.

## M3.146 Core-only customer invoice draft creation

Customer invoice drafts must be committed only by NestJS Core through the
typed command boundary. Next.js Billing and Procurement callers may preserve
their existing contracts, but must not perform invoice math, number
allocation, direct `invoices` writes, or duplicate audit writes. Core must
lock tenant membership and the Project/BOM, require `finance.issue_invoice`,
use exact integer cents, allocate numbers transactionally, persist a
tenant-scoped idempotency result, and emit bounded audit evidence. The
service-only replay ledger and authenticated invoice mutation revokes must be
replayed before any managed canary. API/Web write flags remain false and
allowlists empty until managed parity, recovery, identity, audit, and spend
evidence pass.

## M3.145 Core-only Cost Entry permissions and replay proof

The reproducibility verifier must model the current authority boundary:
authenticated users retain tenant-scoped Cost Entry reads, while all Cost
Entry INSERT/UPDATE/DELETE operations are committed by NestJS Core under its
transaction, capability, idempotency, and audit contract. Runtime replay must
prove that even a permitted business role cannot bypass Core with a direct
browser write. Every migration change must replay no-skip PostgreSQL/Redis,
run API integration, and preserve the schema hash before managed review.

## M3.144 Core Cost Entry restore boundary

Restoration must be a separate authenticated, idempotent command. NestJS
must lock membership and the voided Cost Entry, require `cost.record`, verify
the tenant-scoped prior void snapshot, clear only void metadata, audit the
restore, and commit a replay result in one transaction. The command is
manual-entry-only, returns a terminal `restored` result, and fails closed on
missing or mismatched snapshots. Restore flags remain disabled until
disposable replay, managed parity, backup/recovery, identity, audit, and
spend evidence pass. No browser or Python path may restore a record directly.

## M3.143 Core-only Cost Entry deletion action

Cost Entry deletion must remain a thin authenticated command client. Next
requires `cost.record`, validates the bounded reason/idempotency inputs, and
calls the NestJS DELETE boundary; it must never delete `cost_entries` or write
a second audit event. The action must verify the Core result's tenant,
Project, entry, manual source, and `voided` state before revalidation. Core
errors and invalid scope fail closed. The API gate stays disabled until
restore/recovery proof, managed parity, identity, audit, and spend evidence
are approved. The existing Cost Table surface remains compatible while the
command boundary is migrated.

## M3.140 Core-only Project creation

Project creation must be a thin authenticated command client. Next validates
the form and idempotency input, requires the local capability, and calls
NestJS; it must never write `projects` or re-derive tenant ownership from a
browser-side database query. NestJS remains the only authority for locked
membership authorization, tenant-scoped idempotency, official mutation, and
audit. Core/API unavailability or a mismatched tenant result fails closed.
The API-side tenant canary gate stays disabled until managed parity,
recovery, identity, audit, and spend evidence are approved.

## M3.141 Core-only manual Cost Entry creation

Manual Cost Entry creation must be a thin command client. Next validates form
shape and converts money to integer cents, then calls NestJS; it must not
query `projects`/`cost_codes` or insert `cost_entries`. NestJS owns
membership authorization, active Cost Code/category validation, tenant scope,
idempotency, official mutation, and audit. The action verifies returned
tenant/Project identity and fails closed. Cost Entry deletion remains an
explicit follow-up command boundary, not silently part of this slice.

## M3.142 Core Cost Entry void boundary

Cost Entry correction must be a reversible void, not a physical delete. The
Core command locks tenant membership and the target Project/entry, requires
`cost.record`, accepts manual entries only, records an idempotency result and
pre-void snapshot, updates `voided_at`/actor/reason in the same transaction,
and writes one audit event. Every active-cost read excludes voided rows. The
delete canary and Web compatibility cutover remain closed until restore proof,
read parity, and a real-tenant recovery review pass.

## M3.139 repeatable Core authority evidence

Every Core write slice must have a disposable PostgreSQL/Redis replay, no-skip
database evidence, Nest integration proof, and unchanged schema hash before a
managed-provider action is considered. Local replay is necessary source proof,
never a substitute for hosted catalog/data parity or backup/rollback evidence.

## M3.138 one configuration vocabulary for Project updates

Project update routing must not have a dormant legacy selector or operator
flag. The only required Web setting is the Core API endpoint/session boundary;
readiness and tenant authorization are enforced by NestJS. Rollback is an
exact Web/API source release, and Core outage remains fail-closed.

## M3.137 Core-only Project updates

The Project edit surface must be a thin command client. Next validates form
shape and revalidation only; NestJS authenticates and authorizes the tenant,
locks membership and Project rows, applies the status state machine, commits
the official record, and emits audit. Any Core read/write failure must fail
closed without a direct-table retry. The remaining work is protected runtime
canary evidence and removal of the obsolete update feature-flag/config
surface.

## M3.136 one Project update authority

All Web Project updates must call the NestJS transaction authority. Until
that convergence, the compatibility fallback must use the same tenant/profile
capability check and shared status-transition policy, fail closed before any
write, and remain explicitly non-canary. The final migration removes direct
browser-era writes and proves optimistic concurrency, audit parity, and
rollback at the Core boundary.

## M3.135 explicit Project status workflow

Project status must be a server-owned state machine, not a free-form enum
assignment. Core updates must allow only declared transitions, preserve
terminal states, return a bounded conflict for invalid movement, and audit
the before/after status in the same transaction. Legacy compatibility paths
must converge on this authority before any tenant canary is enabled.

## M3.134 transaction-bound project-update authorization

Every mutable Project command must lock and recheck tenant membership before
locking the Project, applying optimistic concurrency, writing the mutation,
or emitting audit. Request roles remain transport claims only. A missing or
insufficient membership rolls back without touching Project state. Keep the
Core canary closed until hosted parity, RLS/catalog review, identity,
rollback, audit recovery, and spend controls are approved.

## M3.133 transaction-bound project-create authorization

Every sensitive Core write must derive authorization from a tenant membership
row locked in the same database transaction as idempotency, mutation, and
audit. Project creation is the current reference slice: stale or forged
request claims cannot change tenant scope or capabilities, and a denied
membership aborts before any idempotency or project write. Keep the canary
closed until hosted parity, RLS/catalog review, identity evidence, rollback,
and spend controls are approved.

## M3.132 maintenance due operations

Asset operations should answer “what needs service next?” without opening each
record. The maintenance authority must select the latest record per tenant
asset before applying a bounded date window, expose explicit overdue/due-soon
state and pagination, and retain project/location context. Web surfaces the
projection as an optional service-watch panel that fails independently from
the register. The route remains capability-checked and closed until hosted
schema parity, RLS/audit review, and a protected canary are approved; Python
and Cortex may advise but cannot finalize service transactions.

## M3.131 asset maintenance history

Every operational asset must expose a tenant-scoped, append-only service
timeline. A maintenance command must use exact cent amounts, enforce service
date ordering in both Zod and PostgreSQL, lock the asset and membership in one
transaction, be replay-safe by tenant/idempotency key, and emit semantic plus
row-trigger audit evidence. Browser clients may only call the Nest authority;
the default remains closed until hosted schema parity and a protected canary
are approved. Retired assets remain historical but reject new events.

## M3.130 dashboard resilience (2026-08-07)

Dashboard analytics must degrade to the already-authorized Today view when an
optional executive query fails. The UI must say that analytics are unavailable,
must never substitute fake KPI values, and must preserve tenant/role scope.
The original failure remains observable in server logs and the full executive
view returns when the data boundary is healthy.

## M3.129 self-hosted replay evidence (2026-08-07)

The free self-hosted lane must prove the ordered migration ledger, zero-skip
runtime tests, Nest integration, and unchanged schema hash before any managed
database action. A direct replay does not replace the pinned Supabase CLI
shadow-database diff; that artifact remains required in Docker/CI.

## M3.128 cache-safe test evidence (2026-08-06)

Runtime test results must be invalidated when database, Redis, or integration
expectation inputs change. A cached result from a no-database lane is not valid
evidence for a database-backed release. The CI gate must verify this contract
before executing the test task.

## M3.127 pinned CLI diff evidence (2026-08-06)

The release artifact must include a pinned Supabase CLI or self-hosted CI
schema diff in addition to direct PostgreSQL replay verification. If the local
Docker engine is unavailable, the gate stays open and no hosted action is
allowed; do not substitute an HTTP readiness check.

## M3.126 disposable replay evidence (2026-08-06)

The source ledger must recreate the schema from a disposable PostgreSQL 17
baseline, load the deterministic seed, satisfy the catalog verifier, and run
all database tests without skips. This proves source correctness only. Hosted
parity still requires a supported managed backup/export, catalog/data diff,
rollback rehearsal, and explicit release authorization.

## M3.125 capability evidence boundary (2026-08-06)

Capability status must name the exact source checkpoint and distinguish local
implementation from hosted readiness. A green local build or HTTP 200 does not
promote a capability while migration parity, catalog least privilege, duplicate
record mapping, audit recovery, rollback, identity, or spend evidence is open.
The matrix must keep NestJS as the transaction authority, Web as a guarded
client, and Python/Cortex as advisory-only.

## M3.124 bounded public interaction (2026-08-06)

Public interactive controls must expose their domain bounds to keyboard and
assistive technology. The team-priority carousel uses a clamped index, native
`disabled` buttons, visible disabled styling, and no wraparound surprise.
Above-fold media must declare intentional loading priority without making
below-fold decorative assets eager on mobile.

## M3.123 catalog security gate (2026-08-06)

Every controlled database release plan must report both direct table privileges
held by `anon` and policies that include `public` in their role set. Either
count blocks promotion, even when RLS is enabled or readiness endpoints return
HTTP 200. The gate is read-only and must remain independent of migration
execution, provider deploys, and application feature flags.

## M3.122 anonymous authority baseline (2026-08-06)

The source ledger now carries an explicit least-privilege migration: no direct
`anon` table or sequence privileges, no legacy tenant policy assigned only to
`PUBLIC`, and no change to explicit authenticated or service-role grants. The
database verifier must prove this on PostgreSQL 17 before the migration can be
applied to a hosted project. A clean replay is still required; the current
evidence is a disposable suffix replay plus full catalog verification.

## M3.121 hosted role and policy baseline (2026-08-06)

Every public ERP table must remain RLS-enabled and have no direct `anon`
table or sequence privileges. Tenant ERP policies target the authenticated
role unless a documented public-portal edge is intentionally server-mediated;
public policies and broad client grants are not accepted as a substitute for
NestJS authorization. The controlled release planner must include catalog
evidence for RLS, role grants, privileged function execution, and service-only
ledgers. A readiness 200 or an empty advisor response cannot override a
catalog security finding. The source hardening migration must pass a clean
PostgreSQL 17 replay before any hosted application.

## M3.120 dashboard incident revalidation (2026-08-06)

Protected dashboard access must redirect anonymous requests to sign-in and
must not reintroduce the historical Purchase Order enum drift. Incident proof
must combine browser behavior, runtime error clusters, deployment identity, and
schema/catalog evidence; a user-supplied digest alone is not release approval.
No deployment is allowed while the controlled release planner is blocked.

## M3.119 public favicon identity (2026-08-06)

All product entry points, including browser metadata assets, use the same
Third Code ERP identity. The favicon must remain covered by the runtime
branding test and must not reintroduce legacy single-letter or vendor marks.
Release still requires the existing database, duplicate-data, audit, readiness,
identity, security, and provider-spend gates.

## M3.118 Won-to-Project authority contract (2026-08-06)

Won/closed-won conversion must be one NestJS/PostgreSQL transaction. The
browser may send only the opportunity path, an empty strict command, and an
idempotency key. Nest derives tenant/actor membership, checks
`opportunity.convert`, locks the opportunity/project, verifies signed-contract
evidence for existing projects, creates or reuses the checklist, records
notification intent, writes audit evidence, and replays the exact result. The
service-only ledger is forced-RLS and service-role-only. Activation requires
ordered hosted migration parity, disposable replay, duplicate-PO resolution,
rollback, readiness, protected canary, and spend approval; compatibility and
all flags remain closed until then.

## M3.115 provider spend gate (2026-08-06)

Every controlled release must include a green, read-only provider spend
report. Vercel Git deployment stays disabled, repository automation cannot
invoke Vercel or Railway deploy commands, and readiness alone cannot authorize
a paid provider action. A failed or missing spend report blocks the release;
the gate does not create a build or infer a numeric billing allowance.

## M3.117 duplicate Purchase Order owner-review artifact (2026-08-06)

The duplicate-data gate must offer a safe path for a database owner to review
the exact current snapshot without exposing business values in logs or writing
to hosted state. The template generator writes only to an explicit secure path
outside the repository/build output, refuses overwrite, leaves every
replacement blank, and remains separate from the SQL repair/migration action.

## M3.116 Togal BOM authority target (2026-08-06)

Togal-derived BOM commits must execute through NestJS for explicitly canaried
tenants. The browser supplies only a strict command and idempotency key; Nest
derives actor/tenant authority, validates all referenced catalog identities,
locks the BOM, commits lines/totals/audit evidence in one PostgreSQL
transaction, and replays the exact result on retry. Core failures must never
fall back to browser-owned writes. The migration, managed parity, disposable
replay, protected canary, rollback, and provider-spend gates remain required
before enabling production flags.

## M3.114 duplicate-data mapping gate (2026-08-06)

Before any uniqueness migration, owner mapping must be versioned, external to
Git, snapshot-fresh, tenant-correct, complete across all duplicate rows, and
collision-free. A read-only repeatable-read validator must pass before clone
replay or hosted repair. Mapping validation never substitutes for managed
backup, parity, rollback, canary, identity, or spend evidence.

## M3.113 security-scan provenance gate (2026-08-06)

Repository secret scanning must remain green. Deterministic test-only
idempotency values may be allowlisted only with exact value and path scope plus
provenance; broad rules, production paths, and real secrets remain blocked.
The clean scan does not waive hosted database, rollback, canary, identity, or
spend gates.

## M3.112 managed replay and duplicate-data gate (2026-08-06)

The release lane must retain a recoverable supplemental export plus a
Supabase-managed backup/PITR point, restore the real auth/storage/grants/RLS
surface into an isolated PostgreSQL 17 clone, and replay the ordered suffix.
Synthetic duplicate renames are permitted only to test migration syntax and
dependencies; they never authorize a hosted data repair. The hosted suffix
and all feature flags remain closed until the owner maps the 12 duplicate
Purchase Orders, the managed catalog/security diff is green, rollback is
proved, and provider spend/identity gates pass.

## M3.111 recoverable database export gate (2026-08-06)

Every hosted parity rehearsal must begin with a supported, redacted logical
export plus a platform backup/PITR point. The export preflight must reject a
transaction-pooler URL, missing PostgreSQL 17/Supabase tooling, leaked
connection secrets, and any attempt to store roles/schema/data dumps in Git or
public build artifacts. Exports are evidence only until restored and compared
on an isolated PostgreSQL 17 clone.

## M3.110 public landing release evidence (2026-08-06)

The public landing route must keep its Third Code ERP identity and discoverable
metadata while remaining responsive at desktop and mobile widths. A browser
smoke pass is required for title, canonical, description, OG image, structured
data, H1, overflow, and console errors. Hosted landing evidence is separate
from feature-branch promotion and cannot waive backend, database, rollback, or
spend gates.

## M3.109 dashboard failure-state gate (2026-08-06)

Every protected dashboard route must fail into a recoverable Third Code ERP
state, never an opaque framework screen. The boundary may expose only an
opaque digest, must provide retry and safe navigation, preserve tenant/data
claims, and remain usable at mobile widths. It does not replace provider
runtime logs or authorize deployment while hosted parity gates remain open.

## M3.108 hosted parity release gate (2026-08-06)

Treat the hosted target as not promotable while its 55-migration prefix is
missing 39 ordered source migrations, source-only tables are absent, the
tenant-scoped 12-record Purchase Order duplicate group lacks owner mapping,
and security advisories remain unresolved. Required evidence is a supported
backup/catalog/data/audit export, ordered disposable replay and clone diff,
owner-approved duplicate mapping, security review, protected canary,
rollback, readiness, exact release identity, and spend cap. A clean Vercel
runtime-error query or Railway readiness check does not substitute for parity.

## M3.107 inventory UOM maintenance gate (2026-08-06)

UOM maintenance must remain permission-checked and tenant-scoped through the
Nest authority seam when its exact feature flag and UUID allowlist are enabled.
Only display name and active state may change; code and decimal precision stay
immutable. The Web/Core selectors remain compatibility-default and must fail
closed until hosted Supabase parity, protected canary, rollback, readiness,
exact deployment identity, and spend evidence clear. Deactivation only removes
the UOM from new assignments; existing stock evidence is retained.

## M3.106 inventory item policy control gate (2026-08-06)

Catalog item policy maintenance must remain permission-checked and routed
through the Nest authority seam when its exact tenant flag/allowlist is enabled.
The UI may select only an active UOM for a catalog item and must preserve the
immutable item identity boundary; database stock-posting invariants remain the
final guard. Keep the selector closed until hosted parity, protected canary,
rollback, readiness, and spend evidence clear.

## M3.105 inventory warehouse control gate (2026-08-06)

Warehouse maintenance must remain a permission-checked server action backed by
the Nest authority seam when its exact feature flag and tenant UUID allowlist
are enabled. The UI may edit only the display name and active state; code and
project identity stay immutable, and deactivation is rejected when net stock is
nonzero. Keep the selector closed until hosted schema/RLS parity, protected
canary, rollback, readiness, and spend evidence clear.

## M3.104 provider spend guard gate (2026-08-06)

Every frontend release must fail closed when Vercel Git deployment is enabled
or any workspace manifest/workflow contains a Vercel deploy command. The guard
is green (`3/3`), Vercel Git is disconnected, and no preview/build is created
by default. A single explicit provider action remains gated on hosted Supabase
parity, rollback, protected canary, exact deployment identity, and spend-cap
evidence. Railway is not manually redeployed.

## M3.103 delivery schedule creation authority gate (2026-08-06)

Delivery scheduling must commit through Nest under `delivery.receive`,
tenant-derived membership, an issued-PO row lock, the
`delivery_schedule_create_requests` tenant/idempotency ledger, atomic schedule
creation, in-app recipient notifications, and semantic audit. The compatibility
Web action may select this route only for exact-`true` plus UUID tenant
allowlist and must fail closed after a selected Core error. Keep
`ERP_DELIVERY_SCHEDULE_CREATE_WRITES_ENABLED=false`,
`ERP_DELIVERY_SCHEDULE_CREATE_WRITES_TENANT_IDS` empty,
`ERP_DELIVERY_SCHEDULE_CREATE_WRITES_VIA_API=false`, and its allowlist empty
until hosted migration/RLS parity, protected canary, rollback, and spend gates
clear. Python/AI remains advisory and cannot create or approve ERP records.

Local evidence now includes source migration 94/94, service-only table/RLS/
privilege checks, a rollback-only schedule replay/isolation/audit/notification
integration, API 104/449, Web 87/567, and an isolated Nest/Next 81/81 build.
This does not authorize hosted SQL or provider promotion while Supabase remains
at 55/94 and required backup, duplicate-PO, security, canary, rollback, and
spend gates remain open.

## M3.102 delivery in-transit authority gate (2026-08-06)

The delivery state machine must commit `site_ready -> in_transit` through Nest
under `delivery.receive`, tenant-derived membership, a row lock/optimistic
status predicate, durable tenant/idempotency-key replay, and semantic audit.
Next may retain the current action surface, but it must select the Core route
only for exact-`true` plus UUID tenant allowlist and must fail closed after a
selected Core error. Keep
`ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_ENABLED=false`,
`ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_TENANT_IDS` empty,
`ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_VIA_API=false`, and its allowlist empty
until the ordered hosted migration suffix, protected canary, rollback, and
spend gates clear. Python/AI remains advisory and cannot commit the transition.

Local release evidence now includes broad API 104/445, Web 87/565, database
reproducibility 93/93 migrations, and an isolated Nest/Next production build
with 81/81 routes. These checks do not authorize hosted migration or provider
promotion while Supabase remains at 55/93 and the required backup, catalog,
data/audit, duplicate-PO, security, canary, rollback, and spend gates remain
open.

The backend is currently running the pushed source on Railway deployment
`27591050-3977-4755-92ae-941a6894ac77` (`SUCCESS`); this does not authorize a
database migration, tenant canary, or Vercel promotion. Keep the delivery
flags closed until hosted parity and spend gates clear.

## M3.101 hosted Asset Register parity gate (2026-08-06)

Hosted Supabase must contain the ordered asset migration and match the
disposable replay before any tenant canary: `public.assets`, forced RLS,
service-role-only grants, audit trigger, composite indexes, and migration
ledger entry must be present and verified. Current hosted evidence is 55/92
migrations with no asset relation. Keep all asset selectors false/empty and
do not apply or create a branch until supported backup/catalog/data/audit
export, duplicate Purchase Order mapping, and security review are complete.

## M3.100 Asset Register replay gate (2026-08-06)

The disposable replay now proves the typed Core asset read projection matches
the direct tenant-scoped query, including Project context, pagination/search,
tenant exclusion, audit trigger output, forced RLS, and client-role privilege
denial. This is necessary evidence, not hosted authorization. Keep
`ERP_ASSET_READS_ENABLED=false`, `ERP_ASSET_READS_TENANT_IDS` empty,
`ERP_ASSET_READS_VIA_API=false`, and its allowlist empty until hosted migration
parity, backup/catalog/data/audit export, security review, protected browser
canary, rollback, and spend gates pass.

## M3.99 Asset Register Web cutover gate (2026-08-06)

The Asset Register Web route must remain a read-only, tenant-derived surface
over the typed Nest `GET /v1/assets` projection. Keep
`ERP_ASSET_READS_VIA_API=false` and its allowlist empty until the source asset
migrations are replayed on disposable PostgreSQL 17, hosted schema/data/RLS/
audit parity is reviewed, and a protected browser canary plus rollback and
spend evidence pass. The route must never regain a direct browser database
fallback. Asset creation, assignment, maintenance, depreciation, and
accounting remain separate Nest-authorized workflows; Python/AI stays advisory.

## M3.98 shell identity gate (2026-08-06)

Authenticated shell must show only Third Code ERP identity. Source now uses an
accessible `TC` mark and a regression test; keep Vercel Git disconnected and
do not infer live UI completion until one explicitly approved, spend-bounded
manual deployment is captured. No backend, database, tenant, or permission
behavior changed.

## M3.97 hosted parity gate (2026-08-06)

Hosted Supabase is an evidence source only: PostgreSQL 17.6, 55/92 migrations,
88 RLS-enabled public tables, 303 policies, zero cash/supplier-bill rows, and
one 12-record tenant-scoped Purchase Order duplicate group. Keep all cash
selectors false/empty. Before any hosted apply or tenant canary, obtain the
supported backup/catalog/data/audit export, resolve the duplicate mapping,
review the 11 security warnings (including security-definer grants and leaked
password protection), and reconcile source migrations in order. No provider
action is implied by a read-only snapshot.

## M3.96 replay parity gate

The cash register Core seam now has disposable database proof: direct and Nest
rows/aggregates match for two tenants, exact cents survive serialization, and
direction/date filters remain bounded. Keep production selectors closed until
hosted migration/data parity, owner-approved duplicate Purchase Order mapping,
RLS/audit review against the hosted clone, protected browser proof, rollback,
and spend controls clear. Local replay is evidence, not permission to mutate
Supabase or enable a production tenant.

## M3.96 increment: Core-owned cash transaction register reads

Cash register reads move behind a typed, tenant-derived NestJS projection
before a browser cutover. `GET /v1/finance/cash-transactions` owns bounded
account/direction/status/date scope, same-tenant cash-account and counterparty
joins, exact-cent amounts, and receipt/disbursement aggregates; Next retains a
fail-closed adapter and the existing page for unselected tenants. Keep the
seam closed until disposable cash/account/vendor replay, exact-cent parity,
RLS/audit review, protected browser proof, rollback, and spend gates clear.

## M3.95 increment: Core-owned supplier payables reads

Supplier payables reads move behind a typed NestJS projection before a
browser cutover. `GET /v1/finance/payables` owns tenant/status/date scope,
same-tenant supplier-bill context, posted disbursement allocation joins,
integer-cent balances, and aging totals; Next retains a fail-closed adapter
and the existing page for unselected tenants. Keep the seam closed until
disposable supplier-bill/allocation replay, exact-cent parity, RLS/audit
review, protected browser proof, rollback, and spend gates clear.

## M3.94 increment: Core-owned customer receivables reads

Customer receivables reads move behind a typed NestJS projection before a
browser cutover. `GET /v1/finance/receivables` owns tenant and invoice-status
scope, posted allocation joins, integer-cent balance math, and aging totals;
Next retains a fail-closed adapter and the existing page for unselected
tenants. Keep the seam closed until disposable invoice/allocation replay,
exact-cent parity, RLS/audit review, protected browser proof, rollback, and
spend gates clear.

## M3.93 increment: Core-owned Finance general-ledger reads

Finance Ledger reads move behind a typed NestJS projection before any browser
cutover. `GET /v1/finance/ledger` derives tenant and posted-state scope from
the verified principal, requires `finance.read`, uses integer cents, and
returns bounded same-tenant journal context. Next keeps a compatibility
adapter, exact feature flag, and tenant allowlist; no Core failure restores a
direct read for a selected tenant. Keep this closed until disposable replay,
parity, protected browser proof, rollback, and spend gates clear.

## M3.92 increment: Core-owned Cortex keyword reads

Cortex keyword retrieval is a read-only, tenant-derived NestJS contract before
it becomes an AI/semantic workflow. The browser sends only a bounded query;
the verified principal supplies tenant and role, and the server-owned role
scope is applied before the derived graph is searched. Shared Zod types keep
the transport stable. Next remains an adapter with a fail-closed tenant
canary; no Core failure can silently restore direct database authority for a
selected tenant. Provider-backed semantic retrieval, recommendations, and all
official ERP writes remain separate, explicitly gated capabilities.

Third Code ERP remains an incremental TypeScript system. The target is a
modular monolith, not a rewrite and not a microservice fleet.

## M3.91 Closed operational asset read projection (2026-08-06)

The first operational asset read is a typed, tenant-derived NestJS projection:
`GET /v1/assets` with bounded filters and pagination, `asset.read` capability
authorization, and a same-tenant Project name join. Keep it closed behind the
API flag and tenant allowlist until the source migration suffix has been
replayed on disposable PostgreSQL 17 and a protected canary proves schema
parity, tenant isolation, audit/RLS behavior, and rollback. Do not add a Web
adapter or maintenance/accounting behavior in this slice. Python remains
advisory only and direct browser database access remains denied.

## M3.90 Operational asset register boundary (2026-08-06)

The first asset capability is an operational register, not a fixed-asset
accounting module. Each row has a tenant-safe identity, controlled kind and
status, optional current Project/location assignment, and immutable-history
intent through the existing audit boundary. Retired rows remain evidence.

Keep acquisition, capitalization, depreciation, tax basis, disposal,
maintenance events, service history, assignment history, and work orders out of
this slice until separate accounting, approval, and event-history contracts are
specified. NestJS must own any future read/write projection; direct browser
table access remains denied. The source migration stays closed until the
ordered hosted suffix, duplicate Purchase Order reconciliation, disposable
PostgreSQL replay, rollback, and spend gates clear.

## M3.89 Purchase Order uniqueness must fail as a bounded conflict (2026-08-06)

After the tenant-scoped unique index is proven on the replay and hosted
database, a concurrent or legacy-number collision at the official Purchase
Order transaction boundary must return a stable 409 conflict without exposing
PostgreSQL details. Unknown database failures remain errors. Keep all PO Core
flags false/empty while duplicate records, migration parity, rollback, audit,
and spend-cap gates are unresolved.

## M3.88 Purchase Order creation boundary proof (2026-08-06)

Purchase Order commands must calculate integer centavos server-side, derive
tenant/project/actor scope from locked membership, create header and lines in
one transaction, record a bounded audit event, and replay exact results for a
reused idempotency key. Capability denial and missing tenant membership must
occur before the replay ledger claims a request. Keep PO Core flags disabled
until hosted reconciliation, disposable replay, rollback, and spend-cap gates
clear.

## M3.87 Protected cost-entry boundary proof (2026-08-06)

Every financial command must have executable proof for disabled defaults,
capability denial, tenant membership scope, idempotent replay, and bounded
audit content before a canary. Tests must exercise server-owned tenant/project
identity and prove rejected requests cannot claim or create records. Keep
Core cost writes and the browser adapter disabled until hosted reconciliation,
backup/export, disposable replay, rollback, and spend-cap evidence exist.

## M3.86 Cost entry command authority (2026-08-06)

Manual project cost recording is a tenant-scoped Nest command, not a browser
database write. The command accepts integer centavos, validates the project
and active Cost Code inside one transaction, requires `cost.record`, writes
audit evidence, and replays an exact result for a reused idempotency key. The
Next Server Action remains a compatibility adapter selected only by an exact
flag and tenant allowlist; default flags stay false/empty. Python/Cortex may
recommend or analyze costs but cannot create, approve, or finalize them.

The source ledger includes the new forced-RLS, service-only idempotency table,
but hosted reconciliation, backup/export, tenant mapping, protected browser
proof, rollback evidence, and spend cap remain mandatory before any canary or
hosted apply. Keep Vercel Git/build disabled and do not infer production
promotion from local compilation.

## M3.85 Spend-safe web delivery (2026-08-06)

The target web delivery lane must fail closed when automatic Vercel Git
deployments are enabled or repository automation contains a deploy command.
The guard is static and read-only; an explicitly approved production release
must still use a separately reviewed, spend-capped provider action.

## M3.84 Audit summary clarity (2026-08-06)

Audit retrieval should expose one authoritative filtered total above the
event stream. The page-length count is not presented as the total, and the
summary remains read-only, tenant-scoped, and compatible with the closed Core
adapter. This is a usability polish slice; it does not authorize a cutover,
hosted migration, or provider build.

Release evidence policy (rechecked 2026-08-03): provider readiness is only a
necessary signal. A production promotion also requires an exact source SHA,
complete ordered migration ledger, duplicate-record decision, audit-chain
tenant approval, disposable integration evidence, rollback evidence, and a
spend-bounded provider action. Railway identity, project/service/environment,
source deployment, and basic PostgreSQL/Redis readiness are verified as
`kurtgav`; protected-flow, migration, rollback, and spend evidence is still
required. Keep Vercel Git deployment disabled and avoid preview builds while
those gates are incomplete.

## M3.83 Clean-room source boundary (2026-08-05)

Runtime web/API/package text must contain only Third Code product identity.
The regression guard rejects former-product/vendor markers, including
`Rework` and `BuildOps`; research documents and immutable migration history
remain separately classified provenance. New source slices must keep this
boundary green before release.

SHA `1c5b8de` is active on Railway deployment
`2e4c80f9-e243-46c3-acfa-6af417a448ee` with readiness/health 200 and audit
401 boundary. Vercel remains on old revision `31c04942a93d` with no build;
Supabase remains read-only.

## M3.82 Searchable audit history (2026-08-05)

The target Audit surface offers a small, calm query model: action/entity
filters, stable URLs, 25-row pages, and explicit totals. Both compatibility
and Core paths share the same bounded view contract, while Nest remains the
future authority and raw `diff` stays redacted whenever Core is selected.
Protected browser evidence, tenant canary approval, hosted reconciliation,
and rollback proof remain separate release gates.

Source SHA `e98a03b` is validated locally but is not a Vercel production claim.
Vercel remains on retained revision `31c04942a93d` with no new build; Supabase
remains read-only. No provider action is justified by this read-only UI slice.

## M3.81 Core-gated audit browser seam (2026-08-05)

The target keeps the project Audit experience visually stable while moving its
read authority incrementally. A tenant allowlist and explicit environment flag
select the Nest redacted activity projection; the page checks the verified
role before selection and never falls back to a direct database read after
Core is chosen. The default remains the existing path until protected role,
redaction, tenant-isolation, rollback, and hosted-data gates pass. No AI or
Python process may approve or finalize a transaction.

Source SHA `e8d993d` is live on Railway deployment
`5a562db0-d682-4d99-adba-0adb20436bc8`; readiness/health are 200 and the
unauthenticated activity boundary is 401. Supabase remains read-only at 55/90
and Vercel remains untouched. Treat the stale Railway provider metadata as an
operator review item only; do not trigger a billing-producing provider change
from the metadata string alone.

## M3.80 Audit activity projection (2026-08-05)

The target now includes a small, permissioned activity read model before any
AI indexing or UI cutover. Nest owns `GET /v1/audit/activity`; PostgreSQL's
append-only `audit_log` remains the source of truth. The route is tenant-scoped
from the verified principal, uses bounded pagination and allowlisted capability
roles, and redacts `diff` payloads. Future Cortex/Obsidian-style views may
consume this projection, but Python remains advisory and cannot approve or
finalize ERP transactions.

The source slice is live at Railway SHA `1170b55` with deployment
`e62e25b9-7e26-4b59-bb32-35ba524c6ae2`; no hosted migration is needed. Keep
Supabase reconciliation, tenant mapping, rollback, protected browser proof,
and spend caps as separate gates. Resolve the stale provider build-command
metadata only through a reviewed, non-billing provider change; do not infer
correctness from that string while the file manifest and live health checks
remain the evidence.

## M3.79 Read-only clone reconciliation (2026-08-05)

The release process now has an original, fail-closed reconciliation report
between the disposable PostgreSQL 17 replay and a hosted clone. It compares
schema/security catalog, migration history, tenant-scoped record counts,
financial measures, and audit endpoints inside read-only transactions. A
non-empty diff produces `reconcile_required`; it cannot apply SQL or mutate
data.

The current report proves PostgreSQL 17 on both sides but finds the expected
55/90 hosted prefix plus catalog, grant, data, financial, and audit drift.
Backup/export, owner-approved mapping, rollback proof, protected browser
evidence, and spend approval remain mandatory before any hosted apply or
canary. Vercel remains untouched. Docs/scripts-only pushes should remain
Railway `SKIPPED` records, never paid builds.

## M3.78 Disposable replay evidence (2026-08-05)

Promotion requires a clean, no-skips source replay before any hosted database
action. The repository lane now proves all 90 migrations apply in order on
PostgreSQL 17, Redis 7.4.9 is available for queue integration, all 108
database suites/311 tests pass, and schema-before/schema-after hashes match.
The test contract explicitly separates the normal zero-balance deactivation
guard from the legacy inactive-Warehouse reversal allowlist.

This closes the local replay gate only. The source correction was released by
one watched-path Railway auto-deployment
`a7371ef0-0b16-45c6-b4fd-323f33ddf634` for docs commit
`303f2667044bb11537c16cc54f7280297c2d2913`; its live readiness and health
checks are 200. Supabase is still an exact 55/90
prefix with 35 pending migrations and the source-only command ledger/indexes
absent; backup/export, clone catalog/data/RLS reconciliation, owner mapping,
rollback proof, protected browser evidence, and a spend cap remain required.
No migration flag or Vercel action may be enabled from this evidence alone.

## M3.77 Stock Movement posting/reversal command seam (2026-08-05)

Posting and reversal now have an original NestJS command seam while the
existing database functions remain the transaction authority. The API must
derive tenant/actor from the verified principal, require
`inventory.post_movement`, serialize the tenant membership and movement rows,
claim a request-hash idempotency key in a forced-RLS service-only ledger, call
the existing database function, complete the result, and append semantic
audit evidence in one transaction. The strict shared result envelope keeps
movement/journal identifiers exact.

Adoption requires both
`ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_VIA_API=true` with a strict tenant UUID
allowlist in Next and
`ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_ENABLED=true` with the matching
API allowlist. Both remain false/empty, so the legacy Server Actions remain
the compatibility path and no browser write is cut over. Source SHA
`7f19315b967f81e120fa64bebc95ed338c4ad2cb` is live on Railway as successful
deployment `5320235d-c242-4b3c-8b24-c8de9e1cd8cd`; `/ready` and `/health` are
200 and unauthenticated post/reverse are 401. Supabase is read-only at 55/90
with 35 migrations pending; no hosted schema/data or Vercel action is
implied. Rollback is the disabled flags or prior API deployment.

## M3.75 Stock Movement draft creation authority (2026-08-05)

Stock Movement draft creation is a transactional Nest command, not a browser
database write. The command derives tenant and actor from the verified
principal, rechecks `inventory.manage`, validates the database-matching
Warehouse/Project/Item/Cost Code rules, uses exact integer conversions, claims
and replays a tenant-scoped idempotency key, creates the draft and lines, and
writes an audit event before commit. Posting and reversal stay in their
existing database workflows until their own seams are verified.

Next adoption requires both
`ERP_INVENTORY_STOCK_MOVEMENT_CREATE_VIA_API=true` with a strict tenant UUID
allowlist and the API-side
`ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_ENABLED=true` with the same
allowlist. Both remain disabled/empty. Source SHA
`3b920185fdc438dfc5dd5972f738ea9e0a1d7e30` is Railway deployment
`e231fe1f-bd37-4e68-bef9-a2d26e0c1061`; readiness/health are 200 and the
unauthenticated command boundary is 401. Supabase is read-only at 55/89 with
34 migrations pending; no Vercel deployment is implied.

## M3.76 Hosted catalog verifier hardening (2026-08-05)

The release verifier treats server-only command ledgers as first-class
catalog evidence. It now checks the Stock Movement idempotency table for
forced RLS, no anon/authenticated privileges, service-role authority, and
valid tenant/key/state indexes. The hosted read-only result remains non-ready
while the ordered ledger is 55/89: baseline catalog/RLS/security checks pass,
while the new table/indexes are absent until the pending suffix is safely
replayed. A clean PostgreSQL 17 disposable replay remains required; provider
and Vercel actions stay closed.

## M3.74 Stock Movement detail read authority (2026-08-05)

Stock Movement detail is a read-only Nest authority. It must return one
tenant-scoped movement header plus bounded line and ledger evidence, require
`inventory.read`, normalize timestamps to an explicit UTC ISO contract, and
keep quantities/money exact across the API boundary. Next adoption is
independent from the register gate:
`ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_VIA_API=true` plus a strict tenant
UUID allowlist. The compatibility query remains the default until protected
browser canary, rollback, and hosted migration parity are approved. Existing
post/reverse/delete actions remain outside this read seam.

Source SHA `a693e15fafc4b4b5d2df4f3fd6bef6f72015d702` is live on Railway as
successful deployment `a62a237e-2a82-4a40-88ca-2354011d3c9d`; `/ready` and
`/health` are 200 and unauthenticated detail access is 401. Supabase is
read-only at 55/88 with 33 source migrations pending; no Vercel deployment is
implied.

## M3.73 Inventory Stock Movement register read (2026-08-05)

Stock Movement discovery is a read-only Nest authority with a strict shared
envelope. It must derive tenant scope and actor from the verified principal,
require `inventory.read`, bound filters/page size, and preserve money as exact
integer strings. The Next page may adopt it only through
`ERP_INVENTORY_STOCK_MOVEMENT_READS_VIA_API=true` plus a strict tenant UUID
allowlist; the compatibility read remains the default until a protected
tenant canary, rollback evidence, and hosted migration parity are approved.
The route does not approve, post, reverse, or otherwise mutate ERP state.

Source SHA `9d3cf5ed179f24c0382ecd7b53b9b94f87812578` is live on Railway as
successful deployment `4cbaefcf-82a4-4549-83f4-2bfa094fcebb`; `/ready` and
`/health` are 200 and the unauthenticated route is 401. Supabase is read-only
at 55/88 with 33 source migrations pending; no hosted schema/data or Vercel
deployment is implied.

## M3.72 Inventory Warehouse deactivation integrity boundary (2026-08-05)

Warehouse state authority must reject deactivation while its tenant-scoped
ledger balance is nonzero. Nest performs the balance check inside the same
transaction after locking the tenant Warehouse and emits no update or audit on
conflict. The forward-only database contract repeats that invariant at the
database boundary and uses a compatible Warehouse share lock on ledger writes;
only explicit receipt/movement reversal events can write to an inactive
Warehouse. This migration remains source-only until the hosted migration ledger
is reconciled and replayed safely. The exact flags stay disabled, and the Next
Server Action remains the compatibility path.

Source SHA `f391f49d0aa002101649afa79dfc75872120df72` is live on Railway as
successful deployment `48cc2b18-1c5d-45eb-b59d-b54571fe673c`; `/ready` and
`/health` are 200 and unauthenticated protected routes return 401. Supabase is
read-only at 55/88 (33 source migrations pending); no Vercel deployment or
hosted schema/data action is implied.

## M3.71 Inventory Warehouse closeout/readiness read (2026-08-05)

Warehouse deactivation decisions now have a narrow Nest read authority. The
strict result reports exact bigint quantity/value strings, tenant identity,
active state, and an explicit disposition. Nest derives tenant and actor from
the verified principal, rechecks `inventory.manage`, locks the tenant rows,
and aggregates only that Warehouse's ledger entries. It is read-only; no
approval or state mutation is delegated to the browser. The Next adapter is
behind an exact flag and tenant allowlist, both disabled. Source SHA
`425c66a757ffa66cd4dfefca2079ebfd61fb3bbf` is live on Railway as successful
deployment `1ee3706a-5ef3-4004-9708-ac3efcad5483`; readiness and health are
200 and the unauthenticated closeout route is 401. No hosted schema/data or
Vercel deployment is implied.

## M3.70 Inventory Warehouse update/deactivation command boundary (2026-08-05)

Inventory setup now has a narrow Warehouse state authority in Nest. The
command accepts only a trimmed name and explicit active boolean; Warehouse
code and project scope remain immutable identity fields once stock evidence
exists. Nest derives tenant and actor from the verified principal, rechecks
`inventory.manage` inside one transaction, locks the tenant row, makes the
state setter idempotent, and audits the before/after state. Next adoption stays
behind an exact flag plus tenant allowlist, with the direct Server Action as
compatibility path. Source SHA
`4737fec37f97360f8c3ffe6bc98f0bdc78a4cdf5` is live on Railway as successful
deployment `382d281a-b022-4296-8b9d-ee84a07c80b1`; readiness and health are
200 and both unauthenticated Warehouse write routes return 401. No hosted
schema/data or Vercel deployment is implied.

## M3.69 Inventory Warehouse creation command boundary (2026-08-05)

Inventory setup now includes a narrow Warehouse creation authority in Nest.
The command accepts only code, name, and nullable project scope; derives tenant
and actor from the verified principal; rechecks `inventory.manage` inside one
transaction; verifies project tenant ownership; enforces tenant-scoped
uniqueness; and audits the create. Next adoption stays behind an exact flag
plus tenant allowlist, with direct Server Action behavior as compatibility
path. Source SHA `7b0ccf1d9dda19a61d8f2c26ead42b562b6f2534` is live on Railway as
successful deployment `fbbda042-9b51-4c21-a518-a6e4c2fb2752`; readiness and
health are 200 and the unauthenticated Warehouse route returns 401. No hosted
schema/data or Vercel deployment is implied.

## M3.68 Inventory UOM creation command boundary (2026-08-05)

Inventory setup now has a narrow UOM creation authority in Nest. The command
accepts only code, name, and decimal precision; derives tenant and actor from
the verified principal; rechecks `inventory.manage` inside one transaction;
enforces tenant-scoped uniqueness; and audits the create. Next adoption stays
behind an exact flag plus tenant allowlist, with direct Server Action behavior
as compatibility path. Source SHA `ae6d7992ebdfcb0439f181ecdcd72b9cb8673c2b`
is live on Railway as successful deployment
`5ffd0087-7951-4111-92b6-72293cadef14`; readiness and health are 200 and the
unauthenticated UOM route returns 401. No hosted schema/data or Vercel
deployment is implied.

## M3.66 Inventory summary authority seam and read-only ledger (2026-08-05)

The safe inventory slice is now implemented as a tenant-scoped Nest summary
read. It returns strict shared types, exact bigint money/quantity strings,
bounded collections, explicit `inventory.read`, repeated tenant predicates,
and no browser write authority. Next adoption remains disabled behind an
exact flag and tenant allowlist; the existing inventory page is the
compatibility path. Source SHA `4da9772516f80255a2cb4adbe376d4ca733513e4`
is live on Railway as successful deployment
`6ba50aba-0f58-4f02-b7b4-655b3e71a70f`; readiness is 200 and the protected
route returns 401 without a principal. The hosted migration ledger remains
read-only at 55/87 until recovery/export, dependency audit, owner mapping,
and disposable PostgreSQL 17 replay gates are complete. Vercel remains
deployment-disabled for this slice.

## M3.67 Inventory item policy command boundary (2026-08-05)

The target authority now includes a narrow, transactional item-policy command:
tenant membership and `inventory.manage` are rechecked in Nest, active UOM and
material item rows are locked within one transaction, stock identity remains
database-guarded, and semantic audit records the change. The command is an
idempotent state setter and remains fail-closed behind an exact flag and tenant
allowlist. The Next direct server action is the compatibility path. Source SHA
`8a0c059826aabf3b0711277c68f1b182db46aa25` is live on Railway as successful
deployment `19b808c7-f07c-40f3-a268-df35aaf86071`; `/ready` and `/health` are
200, unauthenticated inventory summary is 401, and startup logs map the
command route. No hosted schema/data or Vercel deployment is implied.

## M3.65 CRM opportunity detail graph boundary (2026-08-05)

Opportunity detail reads move toward Nest authority through a strict,
tenant-scoped `GET /v1/crm/opportunities/:opportunityId` envelope. The route
requires a verified principal and explicit `opportunity.read`, repeats tenant
predicates on account/project joins and progress subqueries, and returns
bounded current-state aggregates for PPRF, inspections, designs, and change
requests. Next adoption remains exact-flag plus tenant-allowlist gated and
fails closed on identity drift; the hardened direct server-side read remains
the compatibility path. No schema, hosted-data, or frontend-provider action is
implied.

## M3.64 CRM KYC queue authority boundary (2026-08-04)

Pending-KYC account queues move toward Nest authority through a strict,
tenant-scoped `GET /v1/crm/accounts/kyc-queue` envelope. The route requires
`account.kyc_review`, repeats the tenant predicate on account and artifact
joins, caps results at 200, orders deterministically, and returns a separate
scoped total. Next adoption remains exact-flag plus tenant-allowlist gated and
fails closed on tenant identity drift; direct server-side reads remain the
compatibility path. No schema, hosted-data, or frontend-provider action is
implied.

## M3.63 CRM account detail graph boundary (2026-08-04)

Account detail reads move toward Nest authority through a strict, bounded
graph envelope. The contract requires a verified principal, explicit
`account.read`, repeated account and tenant predicates on every child query,
document joins scoped to the same tenant, capped child collections, and a
separate tenant-scoped opportunity count. Next adoption remains exact-flag plus
tenant-allowlist gated; every nested identity is validated and mismatches fail
closed. The existing direct server-side query remains the default. This is a
read-only seam: no schema, data, or hosted provider action is implied.

## M3.62 CRM account collection read boundary (2026-08-04)

CRM account collections move toward Nest authority through a shared, strict
read envelope. The Nest contract requires a verified principal, explicit
`account.read`, repeated `tenant_id` scope, bounded query filters, allowlisted
sort columns, deterministic page/limit pagination, and opportunity counts.
Next adoption remains exact-flag plus tenant-allowlist gated and fails closed
on tenant or pagination identity drift; the compatibility DB query remains the
default. No database schema/data action or frontend deployment is implied.

## M3.61 Project update audit boundary (2026-08-04)

Nest project updates must write their semantic before/after diff through the
existing append-only audit chain inside the same transaction as the
tenant-scoped optimistic-concurrency update. The response must pass the shared
`projectUpdateResultSchema`. Next may adopt the authority only through the
existing exact project-write flag and tenant allowlist; direct compatibility
writes remain the default until protected canary evidence exists.

## M3.60 Project collection read boundary (2026-08-04)

The Projects collection must be readable through a stable Nest contract before
the browser can migrate off direct database queries. The contract requires a
verified principal, `project.read`, repeated tenant predicates, bounded
filters, allowlisted sort columns, deterministic pagination, and a shared
result envelope. The Next canary must validate tenant and pagination identity
and fail closed on mismatch or unavailable authority.

The source slice is complete and its API source SHA is live on Railway with
readiness and authorization-boundary evidence. The flag remains disabled. No
frontend build or hosted data action is implied; canary activation still
requires protected browser, rollback, exact deployment, and spend evidence.

## M3.59 Nest Redis dependency boundary (2026-08-04)

Redis transport must be owned by one global Nest module that exports the shared
`REDIS_CLIENT` token. Health checks, quotas, locks, and future queue workers
import that boundary instead of relying on providers declared in the root
module. The module owns one lifecycle and keeps Redis accounting separate from
PostgreSQL ERP authority.

The source fix is not a release claim until the exact Railway deployment passes
build, startup, `/ready`, and `/health` checks. Keep frontend deployment and
paid Vercel builds closed.

## M3.58 Project detail read target (2026-08-04)

Project detail reads may move from the Next compatibility query to Nest only
through an exact flag plus tenant UUID allowlist. Nest must derive the caller
from the verified Supabase principal, require the explicit `project.read`
capability, repeat `project_id` and `tenant_id` predicates, and serialize a
stable shared read model. The Next adapter must reject mismatched identity or
tenant data and must not silently fall back to a different authority when the
canary is enabled. Default behavior remains unchanged until protected browser,
deployment identity, rollback, and spend evidence are recorded.

## M3.57 Auth-session recovery target (2026-08-04)

Stale or revoked Supabase refresh tokens must be recoverable at the middleware
boundary without turning public requests into 500s or weakening authorization.
Recognized refresh-token failures clear only Supabase auth-cookie chunks,
continue as anonymous, and let the existing protected-route redirect enforce
access. Unknown auth/provider failures remain visible for diagnosis.

The source slice adds this boundary without database writes or new provider
calls. Future release evidence must repeat the stale-cookie redirect test on
the exact deployed frontend while preserving the spend gate.

## M3.55 Provider spend guard target (2026-08-04)

Provider-backed requests must have explicit, route-aware burst protection. The
edge guard may fail closed for short bursts while preserving existing payload
contracts and read-only deterministic fallbacks. It must report scope and
limit through standard rate-limit headers without exposing secrets.

This source slice is complete in `4d190dfd`. It is intentionally per-instance;
the target architecture moves authoritative quotas and locks to shared Redis
behind NestJS, with tenant/user dimensions, retry-safe accounting, metrics, and
an operator-visible spend budget. Do not claim global enforcement from the
current edge map.

## M3.56 Shared Redis provider quota target (2026-08-04)

Provider-backed Next routes should hand off only a bounded bucket identity to an
authenticated NestJS quota seam. Nest must derive tenant/user scope from its
verified principal, keep provider policy server-owned, and use an atomic Redis
operation with expiry. A blocked decision must carry standard retry/limit/scope
headers; a Redis/API failure must fail closed before external provider work.

Source `M3.56` implements this seam behind an exact per-tenant canary flag. The
flag is false/empty by default, so source publication does not activate it.
Redis remains accounting/lock transport, never ERP transaction authority;
PostgreSQL transactions and audit records remain authoritative for business
state. Later milestones add operator budgets, metrics, and idempotent spend
ledger reconciliation without putting secrets or business content in Redis.

## M3.54 Cortex command-palette source target (2026-08-04)

The global palette should be a low-cost entry point to the permissioned Cortex
brain without turning search into an AI or transaction surface. Search records
remains the default path. Only an explicit Ask Cortex mode may query the
bounded graph, and only registry-approved nodes with canonical links may be
opened. The final Ask Cortex action must remain a user-confirmed draft handoff;
sending and ERP authority stay inside the protected Cortex flow.

The source slice is complete in `6c975261`. Keep the request debounce,
abort/stale-response guards, 20-hit server cap, tenant/role scope, and no-
provider boundary. A future authenticated visual proof may use a disposable
tenant only after credential handling, spend approval, and release gates are
explicitly satisfied.

## M3.53 Clean-room runtime branding target (2026-08-04)

All product-facing runtime text and metadata should be independently branded
as Third Code ERP. The regression boundary covers web, API, and package source
without conflating research/provenance documentation with shipped product
surface. Live release checks must repeat marker, metadata, responsive, and
console validation; no frontend build is implied while Vercel spend remains
closed.

Source `0c911f8` adds the expanded guard and evidence record. It does not
rename migration files or erase research references, because doing so would
damage database history and clean-room traceability.

## M3.52 Cortex operational brief presentation target (2026-08-04)

The Cortex page should give an authorized operator a calm, dense, source-first
knowledge pulse: recent records with freshness and canonical links, a visible
permission scope, and provenance/connection counts. The UI is responsive at
desktop, tablet, and mobile widths, keyboard navigable, and reduced-motion
safe. Registry filtering stays in the server-side presentation model so an
unknown graph source cannot become a browser link.

The source panel is complete in `1e5aa4d`; it remains a read-only capability.
No hosted migration, AI call, Python finalization, or frontend provider action
is implied. Keep Vercel Git deployment disabled and require an explicit,
spend-approved frontend release with exact-SHA/browser evidence before any
public UI claim.

## M3.51 Cortex operational brief target (2026-08-04)

Cortex should give every authorized operator a small, source-backed pulse of
what the knowledge graph knows now: recent records, freshness, provenance
coverage, graph counts, and links back to the canonical ERP surface. The
brief is always tenant- and role-scoped, bounded to a small server-enforced
limit, and read-only. AI may explain the evidence later, but it cannot approve
or finalize ERP transactions.

The source contract is now present without a database migration. Hosted rollout
still requires the same ordered migration, duplicate-record, rollback, and
spend gates; source availability is not a production deployment claim.

Source `cfffa7a` is present on both target branches; the exact GitHub/Railway
check is successful and live Railway readiness is healthy. Vercel created no
deployment after the push, and Supabase remains at the 55-migration boundary.

## M3.50 cost and migration safety target (2026-08-04)

Every release must be spend-bounded as well as technically green. Vercel Git
deployment stays disabled and no preview is created by default; a frontend
promotion requires one explicitly approved build with a known rollback. A
source push alone is not frontend production evidence.

The database target must reach the ordered source head only after a supported
recoverable backup, dependent-row/audit export, and owner-approved decision for
the 12 duplicate Purchase Order records. Read-only planners are mandatory
before any apply. They must report a linear ledger, PostgreSQL 17, no
duplicate blocker, and a reviewed migration risk set. No manual SQL, migration
history edits, or out-of-order suffix apply is an acceptable shortcut.

## M3.49 supplier confirmation review target (2026-08-04)

Suppliers can review an issued Purchase Order through a token-scoped,
least-privilege page that is readable on desktop and mobile and offers three
explicit decisions. The page is a presentation surface only: the Nest
controller owns tenant/session/expiry checks, idempotency, state transitions,
transactions, and audit. Already answered, revoked, expired, invalid, and
unavailable links are read-only or fail closed without leaking internal IDs or
token material.

The read flag and tenant allowlist stay false/empty until the hosted session,
line-item, and replay schema is reconciled and the disposable cross-tenant,
expiry, revocation, replay, rollback, provider, and spend evidence is complete.
The source milestone is therefore not a production capability claim.

Source `386fd2a` is present on both target branches and the Railway API
deployment succeeded with healthy `/ready` and `/health` responses. The public
read probe remains `503` by design. Vercel produced no deployment, and
Supabase remains at the 55-migration boundary with the duplicate-PO preflight
failure; these provider facts do not promote the portal to Live.

## M3.48 landing GEO target (2026-08-04)

The public surface has a single canonical, machine-readable product graph:
organization -> website -> landing page -> Third Code ERP software, with FAQ
answers attached to the page. Keep the graph derived only from public copy and
stable IDs; never expose tenant records, authenticated search URLs, or inferred
capabilities. Preserve the existing visual landing design while validating the
HTML output and legacy-brand absence in production-server checks.

Source validation is green: focused 5/5, Web 67/451, workspace lint/typecheck,
diff check, and 79/79-route build. This does not authorize a hosted DB replay or
a paid Vercel deployment. Supabase duplicate-PO and Vercel spend gates remain
closed.
Post-push source evidence: `ce1ae6e` is on both target branches, the exact
GitHub Railway check is successful, Railway safely skipped the API service,
and its live readiness remains 200. Vercel reports no deployment after the
push and the public URL is still the previous release; do not present the new
GEO graph as production until a spend-approved deployment path exists.

## M3.47 proposal read target (2026-08-04)

Every proposal read must repeat both the opportunity identity and the caller's
tenant identity. Related rows and nullable joins cannot trust a UUID alone.
This is a query-level defense-in-depth rule; server actions, RLS, and Nest
authority remain responsible for official writes and state transitions.

Source validation is green: focused 2/2, Web 66/450, workspace lint/typecheck,
diff check, and 79/79-route build. No hosted migration is needed. Keep Vercel
Git disconnected and spend-protected, and keep Supabase mutation flags closed.
Post-push source/docs `5a5e525` are on both branches. GitHub/Railway status is
successful with a safe Railway skip and live readiness 200; Vercel has no new
deployment. Supabase remains non-ready for ordered replay: 55 migrations,
branch API `MIGRATIONS_FAILED`, and the last successful logs read shows the
duplicate-PO `P0001` preflight failure. A later logs request returned
`INVALID_ARGUMENT`; it is not treated as success.

## M3.46 universal command palette target (2026-08-04)

Search and Ask Cortex share one calm, keyboard-first entry point. The input
owns the combobox state, results expose stable active descendants, and the
palette wraps navigation without opening a dead or stale destination. New
terms clear old results and late network responses are ignored. This remains a
read/navigation surface; existing server-side tenant and permission checks
stay authoritative.

Source validation is green at `e3dc6d6`: focused 7/7, Web 66/450, workspace
lint/typecheck, diff check, and 79/79-route production build. Authenticated
browser proof remains a provider-runtime gate. Keep Vercel Git disconnected
and spend-protected, do not apply hosted SQL, and do not promote a
source-only palette change as production-deployed evidence.
Source/docs `0a085b7` is present on both target branches. GitHub's Railway
check is successful, but Railway correctly skipped the commit because its API
watch set did not change; live readiness remains 200. Vercel reports no
deployment for this SHA, intentionally preserving the spend gate. Supabase
remains the unchanged 55/87 migration prefix with its duplicate-data block.

## M3.45 Cortex search target (2026-08-04)

The Obsidian-like Cortex search must remain a read-only, tenant-authorized
navigation surface that is usable from keyboard and pointer. Results must be
actionable only when an authorized destination exists; loading, empty, and
failure states must be visible and announced, and a changed term must never
leave stale records openable. The source implementation is complete at
`71c5cba`, with pure keyboard-navigation coverage and green source gates.

Authenticated desktop/mobile browser proof remains open because the local
Next Edge runtime could not resolve the configured Supabase host. Keep Vercel
Git disconnected and spend-protected, apply no hosted SQL, and do not treat a
local unauthenticated redirect as Cortex runtime proof. Source/evidence are
pushed at `e6fe073`; GitHub's Railway check and live API readiness are green,
while Supabase and Vercel remain unchanged.

## M3.44 admin data-quality target (2026-08-04)

Administrators get a calm, tenant-scoped read path for release-blocking data
quality findings. The Next.js page must remain presentation-only: Nest/API
authority and the database own all official ERP mutations, while this surface
only links to authorized source records. Report caps, explicit omitted-row
counts, and status buckets prevent a partial review from masquerading as a
repair decision.

The source slice is complete at `63bbf22` and its evidence is pushed at
`eab1719`. GitHub/Railway identity and live API readiness are verified. It is
deliberately schema-neutral;
the hosted uniqueness migration still waits for a supported backup, dependent
row/audit export, owner-approved canonical decision, and ordered suffix replay.
Keep migration flags closed, Vercel Git disconnected, and provider actions
spend-bounded. Vercel remains disconnected with no deployment for this SHA;
the next gate is the supported database backup and owner-approved duplicate
repair.

## M3.43 hosted-data target (2026-08-04)

The hosted database must reach the source migration head through a supported,
recoverable sequence. Before any Nest mutation canary, the release record must
contain the backup/restore point, canonical decision for the 12 duplicate
`PO-0002` rows, audited repair evidence, complete migration ledger, RLS and
policy review, Storage inventory, and exact provider identity. A healthy
service check alone is insufficient. No automation may delete or rename
business records, hand-edit migration history, or bypass the failed ordered
suffix.

## M3.42 Project Command Center target (2026-08-04)

The project overview is the construction team's bounded operating surface:
work queue, evidence, commercial decisions, punchlist, delivery watch, and
progress all remain linked to source records. The read path repeats tenant and
project ownership on every query, exposes no mutation authority, and hands
Cortex an explicit project reference. Responsive containment must hold at
390px and desktop, including the long project tab strip.

The source slice is complete at `a225340`. It is a frontend/read-query change
over the existing schema; no hosted migration is required. Before any hosted
promotion, verify the exact source SHA, Railway readiness, and the existing
Supabase catalog/reconciliation gate. Keep Vercel Git disconnected and all
mutation flags closed. The next vertical slice is one Nest-owned mutation
canary only after the provider, rollback, audit, tenant-isolation, and spend
gates clear.

## M3.41 Today Command Center target (2026-08-04)

Today is the first read-only operating surface after the BuildOps contract:
tenant-scoped task context, policy-gated project context, and explicit Cortex
navigation. It must remain a navigation and decision surface, not a hidden
mutation path. Task reads stay assignee-scoped; project reads reuse the
existing route authorization; Cortex retains its own record authorization.
Responsive proof covers 390px and desktop without horizontal overflow.

The source slice is complete at `ab905091ada2f7db927e6cf4c2de687ee2010194`.
The next target is provider verification of that exact SHA, followed by the
supported Supabase reconciliation and one small Nest-owned mutation canary.
No dashboard flag, Python worker, or browser write may bypass the authority
contract while those gates are open.

## M3.40 governing product target (2026-08-04)

The target product contract is now centralized in
[`docs/BuildOps_PRD_v1.md`](../BuildOps_PRD_v1.md). New work must express a
user outcome, actor, state machine, invariant, evidence source, and rollback
before implementation. The primary experience surfaces are Today,
Project Command Center, and Ask/Create/Find; they are navigation contracts,
not permission bypasses. NestJS remains the official mutation authority,
PostgreSQL the source of truth, Redis/BullMQ coordination-only, Python
advisory-only, and tenant/RLS/audit/idempotency rules apply to every slice.

This milestone changes no runtime state. It prevents a big-bang rewrite and
sets the next bounded sequence: repair supported hosted migration
reconciliation, then add an authorized read-only Today/Command Center slice,
then move one high-value mutation under the already guarded Nest seam.

## M3.39 durable project-create replay target (2026-08-04)

The target authority contract now includes a tenant-scoped
`project_create_requests` ledger. Its composite tenant foreign keys, unique
tenant/key index, request hash, explicit `processing -> succeeded` state, and
typed result checks make retries and conflicts deterministic. Nest claims and
completes the row in the project transaction, locks replay reads, emits audit
evidence, and never delegates approval or finalization to the browser or
Python. The Next adapter remains a compatibility seam and is closed by
default.

The source clone is reproducible at 87 migrations with zero-skip database and
API integration evidence. Production enablement still requires a hosted
55/87 catalog/data/RLS/Storage diff, approved backup/restore, duplicate and
audit recovery decisions, exact provider identity, and spend-bounded canary.
Keep `ERP_PROJECT_CREATE_WRITES_ENABLED` and
`ERP_PROJECT_CREATE_WRITES_VIA_API` false until those gates clear.

## M3.38 project creation authority target (2026-08-04)

Project creation is being strangled from the Next Server Action into the Nest
modular monolith through a typed, tenant-scoped `POST /v1/projects` boundary.
Nest owns capability authorization, transaction scope, actor/audit stamping,
and the official row commit. The legacy path remains available only while the
adapter flag is closed, preserving current behavior during migration.

Before any tenant canary, add a durable `project_create_requests` idempotency
record with request-hash and result replay semantics, then prove duplicate,
retry, conflict, rollback, audit-chain, and two-tenant isolation behavior on
PostgreSQL 17 + Redis. Keep both flags closed until that evidence and the
hosted catalog/data/RLS/backup/provider/spend gates clear. Python remains
advisory and cannot finalize this transaction.

## M3.36 replay evidence (2026-08-04)

The source ledger is now 86 migrations. A disposable PostgreSQL 17 + Redis
replay applied all 86, proved the schema/release planner current, executed
300/300 database tests with no skips, and passed 15 API integration files / 22
tests. The run found and fixed the strict supplier-issued outbox contract for
the optional confirmation-session UUID with a forward-only migration. This is
clone evidence only: the configured Supabase target remains at 55 applied
migrations and has not been mutated.

Database audit recheck 2026-08-04: hosted Supabase is at 55 of 86 source
migrations. The target remains behind source until a PostgreSQL 17 clone/replay,
catalog/data/RLS diff, backup/restore proof, and zero-skipped release evidence
clear the forward-only apply gate.

Authenticated browser evidence (M3.35): local route tests and browser suites
must prove session redirects before render, JSON authorization for API callers,
private response headers, role filtering, tenant-scoped graph/citation data,
and responsive behavior. Demo-tenant proof is useful runtime evidence but never
substitutes for isolated two-tenant database/Redis replay before promotion.

Browser authorization boundary (M3.34): every dashboard module, including
Cortex, finance, and inventory, is session-gated before route rendering. API
routes remain independently authorized and are never converted into HTML login
redirects. Prefix matching is segment-safe to prevent similarly named public
paths from inheriting access policy accidentally.

Authenticated Cortex transport boundary (M3.33): tenant-scoped responses are
private and non-cacheable at the Next.js edge/browser boundary, and vary on the
session cookie. This prevents shared-cache reuse of tenant data while leaving
NestJS authorization and PostgreSQL authority unchanged. Streaming chat keeps
the same body and citation protocol; only response headers are standardized.

## Capability baseline

The product scope is maintained in
[`CAPABILITY_MATRIX.md`](./CAPABILITY_MATRIX.md). It treats construction
workflow depth, multi-business ERP breadth, and hosted release readiness as
separate dimensions. The next bounded capability is supplier confirmation for
an issued Purchase Order; it must not mutate delivery, inventory, or payment
state and remains closed by default until its transaction and replay evidence
is complete.

The local M3.28 authority now implements that boundary with a hashed session,
explicit supplier decision state, tenant-scoped replay, and nullable-actor
audit. M3.29 adds a separate closed SCM-issuance minting seam: deterministic
HMAC-derived token, hash-only persistence, workflow-request association, and a
redacted session UUID in the supplier outbox. It does not emit a public link or
change delivery, inventory, receipt, or payment state. Link delivery remains a
separate proof-gated slice.

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

Document deletion follows the same boundary: the Nest command owns tenant and
capability authorization, processing-history protection, derived-row cleanup,
durable replay, and semantic audit; Next.js only adapts the existing UI and
performs best-effort Storage cleanup after commit. The deletion selector and
API controls remain disabled until hosted parity and the full release gates
clear.

Public client signing follows the same boundary with a capability-style
hashed token as its only unauthenticated authority. NestJS validates a
bounded PNG, derives tenant and source scope from the locked signature
session, writes the document and source stamp atomically, records a
service-only replay result, and audits the nullable external signer. The
deterministic Storage object is retained whenever a matching request may own
it; cleanup is only attempted when no replay row exists. Next.js keeps the
existing portal contract and selects the route only for an exact flag plus
UUID tenant allowlist. Public-signing migration and selectors remain
false/empty until hosted parity, disposable replay/expiry/revocation/source-
stamp proof, rollback, and spend gates clear.

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

## Reconciliation detail authority (M3.279, 2026-08-11)

Bank-statement detail is a protected Core read at
`GET /v1/finance/reconciliation/:statementId`. Nest is authoritative for
tenant scope, bounded line/candidate selection, timestamp normalization, and
concealed cross-tenant not-found behavior. Web consumes the strict shared
result only for an exact tenant canary; otherwise it preserves the legacy
compatibility read. The selector is closed by default and selected errors are
terminal. Reconciliation matching writes remain a separate future authority
slice.

The local browser canary now covers both register and detail reads, including
the authenticated Core request boundary and responsive rendering. Browser
evidence is disposable/local only and does not authorize hosted promotion.

## Reconciliation line match/unmatch authority (M3.282, 2026-08-12)

Manual line matching is a Nest-owned command at
`POST /v1/finance/reconciliation/:statementId/lines/:lineId/match`; unmatching
uses the same boundary with an empty strict body. The browser sends a
per-line/action opaque retry key. Nest derives and rechecks tenant and
capability, locks the statement and line, claims the tenant-scoped idempotency
request, invokes the trusted PostgreSQL transition, stores the exact result,
and writes semantic audit in one transaction.

The Web action remains a compatibility adapter selected only for exact `true`
plus an exact UUID allowlist; selected errors fail closed. API and Web line
selectors remain false/empty by default, and hosted promotion still requires
parity, readiness, rollback, exact SHA, and spend-bounded approval.

## Reconciliation statement reconcile authority (M3.283, 2026-08-12)

Statement reconcile is a Nest-owned command at
`POST /v1/finance/reconciliation/:statementId/reconcile`; the browser sends an
empty strict body and one opaque statement retry key. Nest derives and rechecks
tenant and capability, locks the draft statement, claims the tenant-scoped
idempotency request, invokes the trusted PostgreSQL transition, stores the
exact result, and writes semantic audit in one transaction.

The Web action remains a compatibility adapter selected only for exact `true`
plus an exact UUID allowlist; selected errors fail closed. API and Web reconcile
selectors remain false/empty by default, and hosted promotion still requires
parity, readiness, rollback, exact SHA, and spend-bounded approval.

## Reconciliation auto-match authority (M3.281, 2026-08-12)

Auto-match is a Nest-owned command at
`POST /v1/finance/reconciliation/:statementId/auto-match`. The browser sends
an empty strict body and one opaque retry key; Nest derives tenant and actor,
rechecks `finance.manage_cash`, locks the same-tenant draft statement, claims
the tenant-scoped idempotency request, invokes the exact-match database
function, persists the result, and audits the operation in one transaction.

The existing Web action is now a compatibility adapter. It selects Core only
for exact `true` plus an exact UUID allowlist and fails closed after selection;
unselected tenants retain the legacy path during migration. The browser canary
proves the authenticated adapter boundary locally. Both API and Web selectors
remain closed by default, and hosted promotion still requires parity,
readiness, rollback, exact SHA, and spend-bounded approval.
