# Third Code ERP capability matrix

## M3.263 Bank-statement reconciliation authority (2026-08-11)

The `finance.manage_cash` Core reconcile command now has protected
transaction-bound HTTP evidence for strict body/header handling,
JWT authentication, Finance/viewer authorization, closed-by-default selector
behavior, exact tenant-scoped statement locking, incomplete-evidence rejection,
trusted PostgreSQL reconciliation, durable replay/key conflict, semantic audit,
and rollback. Web adoption remains closed; keep
`ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_ENABLED=false` and its tenant
list empty. Python/AI remains analysis-only and cannot reconcile or finalize
bank evidence.

Validation: focused canary 1/1; root `pnpm test` shared 54/54 files and 326
tests, database 67/71 files with 237 passed and 143 environment-skipped tests,
API 173/173 files and 755 tests, Web 111/111 files and 768 tests; API
integration 55/55 files with 69 passed and two intentional Redis-restart
skips; typecheck, lint, build, migration contract, provider, release, parity,
boundary, workflow, actionlint, and spend gates PASS. Source is 121
migrations; hosted remains 55 applied/66 pending in 14 review batches. No
hosted or paid action.

## M3.262 Bank-statement line match/unmatch authority (2026-08-11)

The `finance.manage_cash` Core line match/unmatch commands now have protected
transaction-bound HTTP evidence for strict body/header handling,
JWT authentication, Finance/viewer authorization, closed-by-default selector
behavior, exact tenant-scoped statement/line locking, cross-tenant
concealment, trusted PostgreSQL transitions, durable replay/key conflict,
semantic audit, and rollback. Web adoption remains closed; keep
`ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_ENABLED=false` and its tenant
list empty. Python/AI remains analysis-only and cannot match or finalize bank
evidence.

Validation: focused canary 1/1; shared 54/54 files and 325/325 tests;
database 66/70 files with 235 passed and 143 environment-skipped tests; API
173/173 files and 754/754 tests; Web 111/111 files and 768/768 tests; API
integration 55/55 files with 69 passed and two intentional Redis-restart
skips; typecheck, lint, direct builds, and provider, release, parity,
boundary, workflow, actionlint, and spend gates PASS. Source is 120
migrations; hosted remains 55 applied/65 pending. No hosted or paid action.

## M3.261 Bank-statement auto-match authority (2026-08-11)

The `finance.manage_cash` Core auto-match command now has protected
transaction-bound HTTP evidence for strict empty-body/idempotency handling,
JWT authentication, Finance/viewer authorization, closed-by-default selector
behavior, exact tenant-scoped statement locking, cross-tenant concealment,
trusted PostgreSQL matching, durable replay/key conflict, semantic audit, and
rollback. Web adoption remains closed; keep
`ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_ENABLED=false` and its tenant
list empty. Python/AI remains analysis-only and cannot match or finalize bank
evidence.

Validation: focused canary 1/1; shared/database/API contracts pass; root tests
173/173 files and 753/753 tests; API integration 55/55 files and 69 tests with
two explicit Redis-restart skips; typecheck, lint, build, and provider,
release, parity, boundary, workflow, actionlint, and spend gates PASS. Source
is 119 migrations; hosted remains 55 applied/64 pending. No hosted or paid
action.

## M3.260 Repository test baseline repair (2026-08-11)

The customer-invoice draft capability retains the same Core authority,
tenant-scoped project lock, idempotency claim, and finance authorization. Only
the replay fixture was corrected to provide the project-lock result before the
request claim; no capability or production behavior changed.

Validation: focused spec 3/3; root tests 173/173 files and 752/752 tests;
API integration 54/54 files and 68 tests with two explicit Redis-restart
skips; typecheck, lint, build, and policy gates PASS. No hosted or paid action.

## M3.259 Bank reconciliation read authority (2026-08-11)

The existing `finance.read` Nest projection now has protected transaction-bound
HTTP evidence for authentication/RBAC, strict query handling, closed-by-default
selector behavior, bounded results, exact tenant-scoped statement/line
aggregates, cross-tenant concealment, and rollback. The Web selector remains
closed; keep `ERP_FINANCE_RECONCILIATION_READS_ENABLED=false`, its tenant list
empty, and the Web selector closed. Python/AI remains analysis-only and cannot
import, match, reconcile, or void bank evidence.

Validation: focused HTTP 1/1, API unit 4/4, shared contract 3/3, database
17/17, and API integration 54/54 files and 68 tests PASS with two explicit
Redis-restart skips; root typecheck, lint, build, and policy gates PASS. Root
`pnpm test` remains blocked by the pre-existing invoice-draft mock failure.
No hosted or paid action.

## M3.258 Cash draft delete authority (2026-08-11)

The existing `finance.manage_cash` Nest cash-draft command now has protected
transaction-bound HTTP evidence for create/update/delete, strict
body/header handling, authentication/RBAC, closed-by-default behavior,
tenant-scoped target validation, idempotent replay/conflict, concealed
cross-tenant update/delete, allocation replacement, durable delete replay,
semantic audit, tenant isolation, and rollback. A forward-only trigger repair
and ordered child-first deletion close the database boundary defect. Web
adoption remains closed; keep
`ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED=false` and its tenant list empty.
Python/AI remains analysis-only and cannot mutate cash drafts.

Validation: focused canary 1/1 PASS; database regression 3/3 PASS; API
integration 53/53 files and 67 tests PASS with two explicit Redis-restart
skips; API/database typecheck, root lint, production build, and provider/
release policy gates PASS. Source is 118 migrations; hosted remains 55
applied/63 pending. No hosted or paid action.

## M3.257 Cash transaction workflow authority (2026-08-11)

The existing `finance.manage_cash` Nest cash workflow commands now have
protected transaction-bound HTTP evidence for strict body/header handling,
authentication/RBAC, closed-by-default behavior, tenant-scoped visibility,
cross-tenant concealment, supplier-bill allocation, idempotent
replay/conflict, balanced post/reversal journals, semantic audit, tenant
isolation, and rollback. Web adoption remains closed; keep
`ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED=false` and its tenant list empty.
Python/AI remains analysis-only and cannot post, reverse, or finalize cash.

Validation: focused canary 1/1 PASS on local PostgreSQL 17/Redis 7.4.9; API
integration 52/52 files and 66 tests PASS with two explicit Redis-restart
skips under the 15-second timeout; typecheck, root lint, production build,
and provider/release policy gates PASS. No hosted or paid action.

## M3.256 Journal reversal authority (2026-08-11)

The existing `finance.post` Nest journal-reverse command now has protected
transaction-bound HTTP evidence for strict body/header handling,
authentication/RBAC, closed-by-default behavior, tenant-scoped visibility
preflight, cross-tenant concealment, posted-state/reason rules, idempotent
replay/conflict, balanced reversal linkage, semantic audit, and rollback. Web
adoption remains closed; keep
`ERP_FINANCE_JOURNAL_REVERSE_WRITES_ENABLED=false` and its tenant list empty.
Python/AI remains analysis-only and cannot reverse or finalize journals.

Validation: focused canary 1/1 PASS on local PostgreSQL 17/Redis 7.4.9; API
integration 51/51 files and 65 tests PASS with two explicit Redis-restart
skips under the 15-second timeout; typecheck, root lint, production build,
and provider/release policy gates PASS. No hosted or paid action.

## M3.255 Journal posting authority (2026-08-11)

The existing `finance.post` Nest journal command now has protected
transaction-bound HTTP evidence for authentication/RBAC, closed-by-default
behavior, tenant-scoped journal preflight, cross-tenant concealment,
idempotent replay/conflict, posted journal numbering, balanced lines,
semantic audit, tenant isolation, and rollback. The preflight fix prevents a
composite-FK 500 before any ledger claim. Web adoption remains closed; keep
`ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED=false` and its tenant list empty.
Python/AI remains analysis-only and cannot post or finalize journals.

Validation: focused canary 1/1 PASS on local PostgreSQL 17/Redis 7.4.9; API
integration 50/50 files and 64 tests PASS with two explicit Redis-restart
skips under the 15-second timeout; typecheck, root lint, production build,
and provider/release policy gates PASS. No hosted or paid action.

## M3.254 Supplier Bill reversal authority (2026-08-11)

The existing `finance.reverse` Nest supplier-bill command now has protected
transaction-bound HTTP evidence for auth/RBAC, strict browser input and
idempotency headers, closed-by-default behavior, tenant-scoped bill state,
cross-tenant concealment, legal reversal reason/state, idempotent
replay/conflict, balanced reversal journal linkage, semantic audit, and
rollback. Web adoption remains closed; keep
`ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_ENABLED=false` and its tenant list
empty. Python/AI remains analysis-only and cannot reverse or finalize bills.

Validation: focused canary 1/1 PASS on local PostgreSQL 17/Redis 7.4.9; API
integration 49/49 files and 63 tests PASS with two explicit Redis-restart
skips under the 15-second timeout; typecheck, root lint, production build,
and provider/release policy gates PASS. No hosted or paid action.

## M3.253 Supplier Bill posting authority (2026-08-11)

The existing `finance.post` Nest supplier-bill command now has protected
transaction-bound HTTP evidence for auth/RBAC, strict browser input,
disabled-by-default behavior, tenant-scoped bill preflight, cross-tenant
concealment, idempotent replay/conflict, posted bill linkage, balanced journal
posting, semantic audit, and rollback. Web adoption remains closed; keep
`ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED=false` and its tenant list empty.
Python/AI remains analysis-only and cannot post or finalize supplier bills.

Validation: focused canary 1/1 PASS on local PostgreSQL 17/Redis 7.4.9; API
integration 48/48 files and 62 tests PASS with two explicit Redis-restart
skips under `--testTimeout=15000`; API typecheck, root lint, production build,
and provider/release policy gates PASS. No hosted or paid action.

## M3.252 Customer invoice draft-creation authority (2026-08-11)

The existing `finance.issue_invoice` Nest draft-create command now has
protected transaction-bound HTTP evidence for auth/RBAC, strict browser
input, disabled-by-default behavior, tenant-scoped project preflight,
cross-tenant concealment, approved/draft BOM rules, exact centavo
calculation, idempotent replay/conflict, invoice/request-ledger linkage,
semantic audit, and rollback. The preflight fix prevents a composite-FK 500
before any ledger claim. Web adoption remains closed; keep
`ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED=false` and its
tenant list empty. Python/AI remains analysis-only.

Validation: focused canary 1/1 PASS; API integration 47/47 files and 61 tests
PASS with two explicit Redis-restart skips under `--testTimeout=15000`; API
typecheck, root lint, and production build PASS. No hosted or paid action.

## M3.251 Customer invoice draft-cancellation authority (2026-08-11)

The existing `finance.issue_invoice` Nest cancellation command now has
protected transaction-bound HTTP evidence for auth/RBAC, strict empty-body
input, disabled-by-default behavior, cross-tenant concealment, draft-to-
cancelled state, tenant-scoped idempotent replay/conflict, one semantic
audit event, and rollback. Web adoption remains closed; keep
`ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED=false` and its tenant list
empty. Posted invoices use the separate reversal command. Python/AI remains
analysis-only and cannot cancel or finalize invoices.

Validation: focused canary 1/1 PASS on local PostgreSQL 17/Redis 7.4.9; API
integration 46/46 files and 60 tests PASS with two explicit Redis-restart
opt-in skips; API typecheck, root lint, and production build PASS. No hosted
or paid action.

## M3.250 Customer invoice reversal authority (2026-08-11)

The existing `finance.issue_invoice` Nest reversal command now has a
rollback-only protected HTTP canary covering auth/RBAC, strict browser input,
disabled-by-default behavior, cross-tenant concealment, idempotent replay and
conflict, cancelled invoice linkage, balanced reversal journal, semantic
audit, and rollback. Web adoption remains closed; keep
`ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED=false` and its tenant
list empty. Python/AI remains analysis-only and cannot reverse or finalize
invoices.

Validation: focused canary 1/1 PASS on local PostgreSQL 17/Redis 7.4.9; API
integration 45/45 files and 59 tests PASS with two explicit Redis-restart
opt-in skips; API typecheck, root lint, and production build PASS. No hosted
or paid action.

## M3.249 Customer invoice issuance authority (2026-08-11)

The existing `finance.issue_invoice` Nest command now has protected
transaction-bound HTTP evidence for auth/RBAC, strict browser input,
disabled-by-default behavior, cross-tenant concealment, tenant-scoped
idempotency replay and conflict, balanced journal posting, invoice linkage,
semantic audit, and rollback. Web adoption remains closed; keep
`ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED=false` and its tenant list
empty. Python/AI remains analysis-only and cannot issue or finalize invoices.

Validation: focused canary 1/1; API integration 44/44 files and 58 tests with
two explicit Redis-restart opt-in skips; API typecheck PASS. Root parallel
tests are not claimed green because of unrelated timeout/budget-schema
environment evidence. No hosted or paid action.

## M3.248 Managed Supabase parity/security gate (2026-08-10)

Managed `ERP` provider evidence is now recorded without mutation. Hosted
PostgreSQL 17.6.1.121 is healthy, but the migration prefix is only 55/117
through `20260729233017`; 62 source migrations remain pending. The catalog
reports 88 public tables with RLS enabled, while advisors report 11 security
WARNs and one performance WARN. No production capability is eligible for
tenant cutover until the missing schema/security/recovery/release evidence is
resolved and spend-approved.

Validation: read-only Supabase project/migration/table/advisor queries;
`verify:managed-supabase-parity-plan`, `test:provider-spend-guard`, and
database-release policy checks pass. No hosted or paid action.

## M3.247 Document-processing command authority (2026-08-10)

The existing `document.process` and `document.processing.read` Nest authority
now has protected transaction-bound HTTP evidence for identity, capability
denial, disabled and draft-BOM gates, cross-tenant concealment, strict command
and idempotency handling, durable tenant-scoped job state, opaque queue
transport, one-time semantic audit, replay/key conflict, and rollback. Web
adoption remains closed; document-processing, worker-bridge, evidence-commit,
and draft-BOM flags/lists remain false/empty. Python/CAD/OCR/AI remains
analysis-only.

Validation: focused HTTP canary 1/1, controller contract 6/6, and
document-processing service/database/processor checks 13/13; API integration
43/43 files and 59/59 tests; root API 173/173 and 752/752, Web 111/111 and
768/768, shared 54/54 and 323/323; typecheck 5/5, lint 2/2, build PASS; the
disposable 117-migration PostgreSQL/Redis lane 151/151 suites and 373/373
tests with zero skips. No hosted or paid action.

## M3.246 Document intake protected HTTP canary (2026-08-10)

The existing `document.manage` Nest authority now has protected
transaction-bound HTTP evidence for identity, RBAC, disabled-tenant behavior,
cross-tenant project concealment, storage-path scope, canonical document
persistence, idempotent replay/key conflict, semantic audit, forced-RLS/
service-only request-ledger access, and rollback. Web adoption remains closed;
the document-intake flag and tenant list are false/empty. Python/AI/OCR remains
analysis-only and cannot finalize the ERP record.

Validation: focused HTTP canary 1/1 and migration contract 3/3; root API
173/173 files and 751/751 tests, Web 111/111 and 768/768, shared 54/54 and
323/323; typecheck 5/5, lint 2/2, production build; disposable 117-migration
PostgreSQL/Redis lane with database 373/373 tests and API integration 42/42
files and 58/58 tests, zero skips. No hosted or paid action.

## M3.245 Stock Receipt post/reverse protected HTTP canary (2026-08-10)

The existing `inventory.manage` Stock Receipt authority now has protected
transaction-bound HTTP evidence for post/reverse authentication, RBAC,
disabled-tenant behavior, cross-tenant concealment, explicit state transitions,
balanced journal and stock-ledger effects, PO quantity reconciliation,
idempotent replay/key conflict, semantic audit, forced-RLS/service-only
workflow-request access, and rollback. Web adoption remains closed; both
post/reverse flags and tenant lists are false/empty. The scoped receipt
preflight prevents composite-FK errors from crossing the tenant boundary.

Validation: focused canaries 3/3; root API 173/173 files and 751/751 tests,
Web 111/111 and 768/768, shared 54/54 and 323/323; typecheck 5/5, lint 2/2,
production build; disposable 117-migration PostgreSQL/Redis lane with
database 149/149 suites and 370/370 tests plus API integration 41/41 files
and 57/57 tests, zero skips. No hosted or paid action.

## M3.244 Stock Receipt protected HTTP canary (2026-08-10)

The existing `inventory.manage` Stock Receipt draft authority now has
protected transaction-bound HTTP evidence for identity, RBAC, disabled-tenant
behavior, exact PO/material/UOM/warehouse scope, idempotent replay/key
conflict, receipt-line persistence, semantic audit, RLS/browser privilege
boundaries, cross-tenant concealment, and rollback. Web adoption remains
closed; receipt-create flags and tenant lists are false/empty.

Validation: database plus HTTP canaries 2/2; root API 173/173 files and
751/751 tests, shared 54/54 files and 323/323 tests; typecheck 5/5, lint 2/2,
production build 82/82 pages; disposable 117-migration PostgreSQL/Redis lane
and API integration 40/40 files and 56/56 tests, zero skips. No hosted or
paid action. The create-request table has RLS and browser privilege revocation
but is not force-RLS in current source migration.

## M3.243 Asset maintenance protected HTTP canary (2026-08-10)

The existing `asset.maintenance.manage` Nest authority now has protected
transaction-bound HTTP evidence for identity, RBAC, disabled-tenant behavior,
exact asset/tenant scope, idempotent replay and key conflict, history reads,
semantic audit, forced-RLS/service-only table access, and rollback. Web
adoption remains closed; all asset-maintenance flags and tenant lists are
false/empty.

Validation: database plus HTTP canaries 2/2; root API 173/173 files and
751/751 tests, shared 54/54 files and 323/323 tests; typecheck 5/5, lint 2/2,
production build 82/82 pages; disposable 117-migration PostgreSQL/Redis lane
and API integration 39/39 files and 55/55 tests, zero skips. No hosted or
paid action.

## M3.242 Change Request protected HTTP canary (2026-08-10)

The existing `change_request.create` Nest authority now has protected
transaction-bound HTTP evidence for identity, capability denial, disabled
feature behavior, exact opportunity/design-file tenant scope, idempotent
replay and key conflict, design notification, semantic audit, and rollback.
Web adoption remains closed; all Change Request flags and UUID allowlists are
false/empty.

Validation: database plus HTTP canaries 2/2; root API 173/173 files and
751/751 tests, shared 54/54 files and 323/323 tests; typecheck 5/5, lint 2/2,
production build 82/82 pages; disposable 117-migration PostgreSQL/Redis lane
and API integration 38/38 files and 54/54 tests, zero skips. No hosted or paid
action.

## M3.241 Opportunity stage-transition authority (2026-08-10)

The pipeline now has a source-complete, closed-by-default Core authority for
tenant-safe opportunity stage transitions and atomic won-to-Project handoff.
The protected HTTP canary covers strict body and header validation, RBAC,
disabled gates, cross-tenant concealment, KYC, state transitions, replay/key
conflict, SLA clock evidence, semantic audit, atomic conversion, and rollback.
The Web adapter is present but not selected for any tenant.

Validation: focused canary 1/1; root 173/173 files and 751/751 tests; typecheck
5/5, lint 2/2, build PASS; disposable PostgreSQL 17/Redis 7.4.9 lane 117
migrations, database 149/149 suites and 370/370 tests, API integration 37/37
files and 53/53 tests, zero skips; policy guards PASS. No hosted or paid
action.

## M3.240 Won-opportunity project conversion protected local HTTP canary (2026-08-10)

The existing won-to-project authority now has disposable HTTP evidence for
`opportunity.convert`: strict body and capability checks, disabled-by-default
write gating, won-stage validation, tenant/idempotency replay, project and
opportunity atomicity, the twelve-item pre-construction checklist, dependency
SLA clocks, role notifications, semantic/trigger audit coverage, cross-tenant
concealment, and rollback. Web adoption remains unchanged and closed.

Validation: canary 1/1; root 173/173 files and 750/750 tests; typecheck 5/5,
lint 2/2, production build PASS; disposable PostgreSQL/Redis lane 116
migrations with database 149/149 suites and 370/370 tests plus API integration
72/72 suites and 52/52 tests without skips; direct canary rerun 1/1; policy
guards PASS; no hosted or paid action.

## M3.239 CRM opportunity detail protected local HTTP canary (2026-08-10)

The existing opportunity detail authority now has a protected local canary
covering `opportunity.read`, tenant-scoped account/project joins, PPRF and
inspection freshness, design approval counts, open change-request counts,
malformed UUIDs, and cross-tenant concealment. Web adoption remains closed.

Validation: canary 1/1; root 173/173 files and 750/750 tests; typecheck 5/5,
lint 2/2, production build PASS; disposable PostgreSQL/Redis lane 116
migrations with zero skips PASS; policy guards PASS; no hosted or paid action.

## M3.238 CRM accounts protected local HTTP canary (2026-08-10)
## M3.238 CRM accounts protected local HTTP canary (2026-08-10)

The existing CRM account list/detail/KYC read authorities now have disposable
HTTP evidence for identity, `account.read`, `account.kyc_review`, bounded
filters, exact related-record scope, cross-tenant concealment, and rollback.
Web adoption remains unchanged and closed by default.

Validation: protected canary 1/1; root 173/173 files and 750/750 tests;
typecheck 5/5, lint 2/2, production build PASS; disposable PostgreSQL/Redis
lane 116 migrations and zero-skip suites PASS; no hosted or paid action.

## M3.237 Project command-center read authority (2026-08-10)

The project detail command center now has a bounded Nest read authority with
exact tenant/project scope across tasks, documents, variation decisions,
punch-list items, deliveries, and latest progress. The Web adapter validates
scope and response shape; adoption remains disabled by default and the direct
query is retained for rollback.

Validation: shared 2/2; Web Core client 3/3 and project-query tests 11/11;
protected API canary 1/1; root 173/173 files and 750/750 tests; typecheck,
build, and lint PASS; disposable PostgreSQL/Redis lane 116 migrations,
database 149/149 suites and 370/370 tests, API 33/33 files and 49/49 tests,
zero pending/skips, stable schema SHA-256. No hosted or paid action.

## M3.236 Project read/list protected local HTTP canary (2026-08-10)

The existing Nest project read/list authority now has protected disposable
HTTP evidence for identity, viewer access, cross-tenant concealment, bounded
limits, deterministic filters/order, search, and tenant-safe totals. Web
adoption remains disabled by default.

Validation: canary 1/1; root 173/173 files and 750/750 tests; typecheck, build,
and lint PASS; disposable PostgreSQL/Redis lane 116 migrations, database
149/149 suites and 370/370 tests, API integration 66/66 suites and 49/49
tests, zero pending/skips, stable schema SHA-256. No hosted or paid action.

## M3.235 Project-comment read authority (2026-08-10)

The project comments page now has a reviewed Core read adapter with strict
tenant/project scope, bounded pagination, deterministic ordering, and
fail-closed response validation. The selector is disabled by default and the
direct query remains the compatibility path.

Validation: shared read 2/2; API controller 6/6; protected HTTP canary 1/1;
Web client 7/7; root 173/173 files and 750/750 tests; typecheck, build, and
lint PASS; disposable PostgreSQL/Redis lane 116 migrations, database 149/149
suites and 370/370 tests, API integration 66/66 suites and 49/49 tests, zero
pending/skips, stable schema SHA-256. No hosted or paid action.

## M3.234 Project-comment protected local HTTP canary (2026-08-10)

The closed project-comment create/delete seam now has disposable HTTP
evidence: real identity/capability guards, tenant/project isolation, mention
resolution, idempotency replay/conflict, request correlation, audited create
and delete, terminal disabled-tenant behavior, and transaction rollback. Web
adoption remains disabled and the persisted role matrix is unchanged.

Validation: canary 1/1; disposable PostgreSQL/Redis lane 116 migrations,
database 149/149 suites and 370/370 tests, API integration 66/66 suites and
49/49 tests, zero pending/skips, stable schema SHA-256. No hosted or paid
action.

## M3.233 Notifications protected local HTTP canary (2026-08-10)

The closed notification read-state seam now has disposable HTTP evidence:
real identity/capability guards, tenant and recipient isolation, bounded
ordering, request-id propagation, strict malformed-input rejection, audited
read-state updates, terminal disabled-feature behavior, and transaction
rollback. Web adoption remains disabled and the persisted role matrix is
unchanged.

Validation: canary 1/1; disposable PostgreSQL/Redis lane 116 migrations,
database 149/149 suites and 370/370 tests, API integration 64/64 suites and
48/48 tests, zero pending/skips, stable schema SHA-256. No hosted or paid
action.

## M3.232 Today protected local HTTP canary (2026-08-10)

The closed Today read seam now has disposable HTTP evidence: real identity and
capability guards, tenant/current-assignee filtering, cross-tenant exclusion,
project expansion behavior, strict query rejection, request-id propagation, and
transaction rollback. Unsupported roles fail closed at the capability boundary
in a test-only principal; the persisted role matrix remains unchanged.

Validation: canary 2/2; disposable PostgreSQL/Redis lane 116 migrations,
database 149/149 suites and 370/370 tests, API integration 62/62 suites and
47/47 tests, zero pending/skips, stable schema SHA-256. Web selector remains
disabled; no hosted or paid action.

## M3.231 Today/Project Command Center read authority (2026-08-10)

Nest now owns a bounded, read-only Today contract with server-time Manila
boundaries, tenant/assignee-scoped tasks, and an explicit project-context
expansion. All persisted ERP roles receive `today.read`; project context still
rechecks the existing `project.read` capability. Web selection is disabled by
default and requires an exact tenant canary allowlist.

Validation: shared Today 2 tests; API Today 5 files/8 tests plus standalone API
173 files/749 tests; Web Today client 3 tests plus Web 110 files/759 tests;
API/Web typecheck, root lint/build, and the disposable zero-skip
PostgreSQL/Redis lane pass. Concurrent root `pnpm test` was load-sensitive
(8 unrelated HTTP test timeouts); standalone rerun passed. No hosted/provider
write or paid action.

## M3.230 Hosted Supabase reconciliation refresh (2026-08-10)

Read-only inventory confirms target project `aqqrtkmtcsfkbyyqxowv` is healthy
PostgreSQL 17.6.1 with 55/116 migrations applied; ordered pending suffix is 61
files through `20260810120000_project_comment_delete_fk_tenant_preservation`.
Hosted Cortex has 3 vendor nodes and 0 material nodes; newer authority tables
are absent. Security advisors: 14 findings; performance advisors: 253 findings.

Parity manifest and audit docs refreshed. No hosted SQL, migration repair,
provider setting, deployment, data, Storage, or paid action. Hosted release is
not approved; clone/backup/replay/diff/rollback/owner/spend gates remain open.

## M3.229 Multi-business master-data universal search (2026-08-10)

Vendor and material catalog records are now searchable through the shared
Universal Search contract, Nest Core registry, Web fallback, and command
palette. Tenant scope and the existing Cortex role matrix are preserved:
procurement/commercial/SD-PM-PE can search; finance and sales do not gain these
node types. Results use safe existing Purchase Orders and Material Items links.

Validation: shared-types 50/50 files and 315/315 tests; API 2/2 files and 6/6
tests; Web 3/3 files and 21/21 tests; package/root typecheck, lint, test, and
build pass; all repository guards pass; disposable database 149/149 files and
370/370 tests plus API 30/30 files and 45/45 tests pass with zero skips and
stable schema dumps. No hosted provider or paid action.

## M3.228 Disposable zero-skip data/API release gate (2026-08-10)

Local migration and integration integrity is verified for the current commit:
PostgreSQL 17.10/Redis 7.4.9; 116 migrations; database 149/149 files and
370/370 tests with no skips; Nest API 30/30 files and 45/45 tests; identical
schema dumps before/after at SHA-256
`4FCC37BD3D4BE7B40F108812C7E57D30BC25806E4D7F71D10E8FDE8665C3FDD2`.
Hosted providers and production remain unverified.

## M3.227 Controlled upload browser runtime and UX hardening (2026-08-10)

The real local login and project Documents journey now proves visible
preparing/uploading/finalizing progress, controlled signed-object upload,
terminal Core-unavailable messaging, and no unexpected provider traffic.
The upload hook renders progress outside the long async transition; the
Documents subnav contains tablet-width overflow.

Validation: disposable PostgreSQL 17.10/Redis runtime; Playwright 1/1; one
sign, one object PUT, one completion; zero unexpected Storage requests; zero
console/page errors; ARIA attachment; desktop/tablet/mobile screenshots; <=1
pixel responsive overflow. No hosted DB, Supabase, Vercel, Railway, or paid
action.

## M3.226 E2E typecheck baseline cleanup (2026-08-10)

Existing Cortex and smoke E2E request headers now narrow required environment
values explicitly. Full `apps/web/e2e/tsconfig.json` typecheck passes; browser
runtime still requires disposable local auth/Web/Core services.

Validation: E2E TypeScript PASS; no provider or paid action.

## M3.225 Controlled upload-flow browser fixture (2026-08-10)

Fixture source covers local-only sign/upload/complete interception, progress,
terminal Core warning, unexpected Storage rejection, request payloads, and
console/page-error assertions. Runtime browser evidence is pending; default
run intentionally skips unless explicitly enabled with a disposable local
authenticated runtime.

Validation: Playwright registered one skipped test. Full E2E typecheck now
passes after M3.226. No provider or paid action.

## M3.224 Provider-neutral document Storage contract (2026-08-10)

CAD parser now uses a server-only Storage contract with Supabase and compatible
HTTP adapters. Local evidence covers binary parity, bearer forwarding,
structured provider errors, malformed-path rejection, and injected parser
execution. Hosted Storage and browser upload evidence remain open.

Validation: Web 109/109 files and 756/756 tests; disposable lane 116
migrations, DB 370/370 with no skips, API 30/30 files and 45/45 tests. No
provider or paid action.

## M3.223 Disposable protected upload-complete runtime (2026-08-10)

The real Web upload route now has disposable evidence for document recording,
DXF parsing, protected Core HTTP commit, tenant-scoped exact totals, and
terminal Core failure with zero compatibility-writer scope rows. Storage and
session are bounded test doubles; hosted provider and browser evidence remain
open.

Validation: 116 migration replay; database 370/370 with no skips; API
integration 30/30 files and 45/45 tests; no provider or paid action.

## M3.222 Disposable parser-to-Core HTTP parity (2026-08-10)

The real Web DXF parser and server-only adapter now cross a real protected Nest
HTTP route in disposable PostgreSQL. Evidence covers 401 protection,
authenticated identity, exact parser result/count/totals, idempotent replay,
document-owned replacement, tenant isolation, no draft BOM, audit, and
rollback. Storage is a bounded test double; hosted upload/provider/browser
evidence remains open.

Validation: 116 migration replay; database 370/370 with no skips; one focused
parser-to-Core integration passed. No provider or paid action.

## M3.221 Disposable CAD Core replay integrity (2026-08-10)

Core CAD replay now has disposable evidence for exact worker-contract result
parity, 65,000-cent totals, document-scoped replacement, idempotent replay,
zero draft BOMs, cross-tenant denial, and transaction rollback.

Validation: 116 migration replay; database 370/370 with no skips; focused CAD
integration 1/1; schema hashes equal. Actual Web parser HTTP runtime,
protected browser, hosted, and paid evidence remain open.

## M3.220 CAD Web/Core response identity parity (2026-08-10)

The Web CAD adapter verifies Core document, project, and tenant identity before
accepting a commit result. Schema-valid mismatches return terminal `502` and
cannot fall back to a Web scope writer.

Validation: focused Web CAD/route 17/17; root tests (shared 315, API 740, Web
752), lint, typecheck, 82/82-route production build, provider-spend, and diff
checks pass. No hosted or paid action occurred.

## M3.219 Protected CAD HTTP boundary (2026-08-10)

CAD evidence commit HTTP coverage now exercises real authentication,
membership, capability, idempotency, and strict request authority rules. Core
is not invoked for missing bearer, missing membership, insufficient role, or
caller-supplied tenant/actor authority fields.

Validation: focused controller/protected 7/7; root tests (shared 315, API
740, Web 749), lint, typecheck, 82/82-route production build,
provider-spend, and diff checks pass. No hosted or paid action occurred.

## M3.218 Project-comment tenant-preserving delete evidence (2026-08-10)

Project-comment create/delete evidence now retains required tenant identity
when the comment target is deleted. Column-scoped PostgreSQL nulling clears
only `comment_id`; idempotent result and audit evidence remain tenant-scoped.

Validation: migration contract 2/2; disposable migration replay 116/116;
database 370/370 with no skips; API integration passed; schema hashes equal;
root tests (shared 315, API 736, Web 749), lint, typecheck, 82/82-route
production build, boundary, workflow-reference, provider-spend, and diff
checks pass. No hosted or paid action occurred.

## M3.217 CAD parser-to-Core canary boundary (2026-08-10)

CAD parsing now emits strict evidence without Web persistence. Exact-tenant
selection commits through Nest Core; no selected-Core failure reaches the
compatibility writer. Auto-BOM remains compatibility-only pending separate
Core parity.

Validation: parser 2/2, upload route 10/10, adapter 4/4; root tests (shared
315, API 736, Web 749), lint, typecheck, production build (82/82 routes),
boundary, migration, workflow-reference, provider-spend, and diff checks
pass. Disposable replay, protected browser, and hosted provider evidence
remain open. No hosted or paid action occurred.

## M3.216 Web-to-Nest CAD evidence adapter (2026-08-10)

The Web server now exposes a closed exact-tenant adapter to the existing Nest
CAD evidence commit authority. Worker document identity/count are validated
before fetch; Core owns the official scope transaction, idempotency, totals,
and audit. The upload/parser route remains compatibility-authoritative and no
canary is approved.

Validation: adapter 4/4; root tests (shared 315, API 736, Web 745), lint,
typecheck, production build (82/82 routes), Web DB-boundary, migration
files-only, workflow-reference, provider-spend, and diff checks passed.
Parser parity, disposable PostgreSQL/RLS replay, protected browser proof, and
hosted/provider evidence remain open. No hosted or paid action occurred.

## M3.215 Core-owned DocuSeal webhook transaction (2026-08-10)

DocuSeal completion now has a strict, secret-authenticated Nest transaction
for exact canary tenants: portal-token lookup, tenant-matched BOM lock,
optional signed-document evidence, duplicate replay suppression, and audit.
The Web route remains the default and preserves notification delivery; no
hosted canary or provider action is approved.

Validation: focused shared/API/Web contracts and typechecks passed; root
tests, lint, production build (82/82 routes), Web DB-boundary, migration
files-only, workflow-reference, provider-spend, and diff checks passed.
Disposable PostgreSQL/RLS replay and protected/hosted proof remain blocked by
unhealthy Docker and unavailable release credentials. Both selectors remain
false/empty.

## M3.214 Core-owned notification read state (2026-08-10)

Notification list and mark-read operations now have a strict Nest authority
behind `notification.read`, tenant/user predicates, audit, and an exact UUID
Web selector. The compatibility route remains default and no hosted canary is
approved; Docker/RLS replay, protected browser proof, rollback/readiness, and
spend evidence remain open.

## M3.157 auth-safe semantic-index browser proof (2026-08-07)

Source now has a server-owned access projection and localhost-only browser
gallery for the real Cortex indexing control. Owner/admin visibility, exact-
tenant enablement, closed/wildcard behavior, confirmation, cancellation,
one-command submission, polling, success, terminal failure, desktop/mobile fit,
touch targets, console cleanliness, and zero foreign requests are proven.

Capability remains disabled and this is not a full authenticated route canary.
Managed parity, M3.152 owner mapping, backup/PITR restoration, exact tenant,
spend ceiling, rollback approval, and any required isolated full-session proof
remain unresolved. No hosted provider, database, build, or deployment was used.

## M3.156 disposable semantic-index runtime proof (2026-08-07)

Source-only semantic indexing now has disposable runtime evidence: 104/104
migrations, database 341/341, and API integration 31/31 with zero skips or
pending tests. The local fake-worker lane proves direct browser-table denial,
tenant/permission scope, idempotency, one active job, the 64-node/one-call
ceiling, empty-work zero call, Redis-loss recovery, terminal uncertainty after
reservation, atomic commit, and audit linkage.

Capability remains disabled. Protected browser evidence, managed 104/104
parity, backup/PITR restoration, M3.152 owner mapping, exact-tenant approval,
and a written provider-spend ceiling are unresolved. No hosted database,
provider, build, or deployment was used.

## M3.155 cost-bounded Cortex semantic indexing (2026-08-07)

Source now contains an owner/admin-only `cortex.index.manage` workflow. One
explicit confirmation creates one idempotent, tenant-scoped PostgreSQL job for
at most 64 graph nodes and one Python-worker provider call. BullMQ transports
only job identity; uncertain post-reservation recovery fails terminally. Web
polls status and has no direct sensitive-table write. Legacy browser-driven
embedding is closed by default.

No hosted capability is enabled. Intake, worker, recovery, Web, and legacy
flags are false/empty. Managed database remains last verified 55/104; the new
job migration is source-only and lacks disposable runtime/RLS proof because
Docker was stopped. Full shared/API/Web suites, database static/unit tests,
workspace lint/typecheck, and local production build passed. No provider call,
SQL apply, cloud build, or deployment occurred.

## M3.152 Purchase Order mapping recommendations (2026-08-07)

No hosted ERP capability was enabled. Source now provides a deterministic,
read-only owner-review proposal for duplicate Purchase Orders. Current managed
evidence yields one canonical keep and 11 collision-free renumber suggestions
for the 12 demo records. Proposal remains outside Git, approval is pending,
and version-1 mapping preflight rejects it.

Validation: proposal 4/4, existing mapping 4/4, template 3/3, plus overwrite
and live artifact integrity checks; workspace test/lint/typecheck/build passed.
Managed database remains 55/103 migrations. No SQL, repair, branch, canary,
Vercel/Railway build, provider variable, or deployment was created.

## M3.151 free local managed-suffix replay (2026-08-07)

No hosted ERP capability was enabled. The repository now has a cost-free,
machine-checked path for an explicit session/direct URL plus PostgreSQL 17
dump tooling and a localhost-only restored-snapshot verifier. The existing
public snapshot's isolated clone reached 103/103 migration history, proving
the exact 48-file source suffix can apply after synthetic clone-only duplicate
cleanup.

This does not clear production. Owner mapping remains absent; the public-only
snapshot lacks managed Auth, Storage, vector, and provider catalog surfaces;
and injected integration recorded 218 pass, 11 fail, 108 skip. Verifier output
is permanently explicit: `fullManagedParity: false` and
`releaseReady: false`. Standard source tests, lint, typecheck, and local build
passed. No SQL, hosted dump, deployment, flag, variable, or tenant mutation.

## M3.150 managed parity planning (2026-08-07)

No hosted ERP capability was enabled. Managed project is healthy PostgreSQL
17.6 but remains at 55/103 migrations. The exact 48-file suffix now has a
machine-verified six-batch review manifest. Current release blockers: one
12-row Purchase Order duplicate group; 213 anonymous privilege rows; 209
`PUBLIC` policies; 14 security and 253 performance notices; blocked supported
export; unproved `MIGRATIONS_FAILED` branch state; and missing identity,
recovery, canary, rollback, and spend evidence.

Focused parity verifier 4/4, release-plan 9/9, and duplicate-plan 4/4 tests
passed. Managed branch cost was read as `$0.01344/hour`; no confirmation or
branch creation occurred. No SQL, deployment, variable, flag, or tenant-data
mutation.

## M3.149 Core user-role assignment authority (2026-08-07)

Owner/admin role assignment is available in source through a typed NestJS
command. Core owns tenant and actor derivation, `admin.users`, hierarchy,
expected-role concurrency, idempotency, transaction commit, and semantic
audit. Authenticated clients retain tenant-scoped `users` reads but have no
table- or column-level INSERT/UPDATE/DELETE privileges. Web selection requires
exact-`true` plus UUID allowlisting; all four flags are false/empty.

Validation: 103/103 disposable migrations; database 337/337; API integration
21/21 files; shared 28/234; API 118/516; Web 93/610; typecheck/lint; build
81/81 routes; Actionlint; Gitleaks; controlled-release 5/5; provider-spend
4/4; stable schema; and local production redirect/render proof with no
console or network failure. Managed Supabase was not refreshed or mutated;
its last verified 55 migrations imply a 48-migration gap. No hosted
capability or deployment is approved.

## M3.148 tenant identity RPC hardening (2026-08-07)

Anonymous callers no longer have EXECUTE on `public.auth_tenant_id()` in
source. `authenticated` retains the helper solely for current tenant RLS;
`service_role` retains trusted Core execution. No ERP business capability,
browser table mutation, provider variable, or hosted canary was enabled.

Validation: 102/102 disposable migrations; database 334/334; API integration
27/27; Redis recovery; stable schema hash; serial workspace tests;
typecheck/lint; build 81/81 routes; Actionlint; Gitleaks; controlled-release
5/5; provider-spend 4/4. Source checkpoint
`9c2b64b81b64b91de013d470e3147c3817dab27b` is pushed. Managed Supabase is
still 47 migrations behind source and remains closed.

## M3.147 managed Supabase parity audit (2026-08-07)

Managed project `aqqrtkmtcsfkbyyqxowv` is healthy on PostgreSQL 17, but its
55-migration ledger stops at `20260729233017`; source has 101 migrations and
the Core customer-invoice draft replay table is absent. Managed public tables
are RLS-enabled, but advisors report three RLS tables without policies and
exposed `SECURITY DEFINER` authorization functions. Performance and Postgres
log findings remain open. No hosted write capability is approved.

Evidence is read-only: project/migration/catalog/advisor/log checks passed;
no SQL, provider variable, deployment, or tenant data changed. The capability
matrix remains closed for managed invoice-draft canary until parity,
recovery, identity, audit, and spend gates pass.

## M3.146 Core-only customer invoice draft creation (2026-08-07)

Billing and Procurement invoice-draft callers now use the typed NestJS Core
command. Core owns `finance.issue_invoice`, tenant scope, exact-money
calculation, invoice numbering, idempotency, commit, and audit. Authenticated
clients retain tenant-scoped invoice reads but cannot INSERT/UPDATE/DELETE
`invoices`; the draft endpoint and tenant allowlist remain disabled pending
managed canary evidence.

Validation: focused DB/API/Web tests; serial workspace tests; typecheck/lint;
build 81/81 routes; migration verifier; Actionlint; Gitleaks;
controlled-release 5/5; provider-spend 4/4; disposable PostgreSQL 17/Redis
7.4.9 replay with 101/101 migrations, database 54/54 files and 332/332
tests, API 20/20 files and 27/27 tests, Redis recovery, and identical schema
hash `278B8F024CED178A943B9E22FB14B9CD3BC7AEC3E339269E9DD20969B4B20843`.
Source checkpoint `473eaf1d6a9ec468165520685e2718eeefea5124` is pushed to
`origin/agent-02/third-code-erp-landing`; no hosted provider mutation.

## M3.145 disposable replay hardening (2026-08-07)

Updated the database reproducibility verifier and runtime hardening test to
match the Core-only Cost Entry write boundary. `authenticated` is now
explicitly required to have no Cost Entry INSERT/UPDATE/DELETE privilege;
reads remain tenant-scoped. No Web UI, migration SQL, or hosted provider
mutation occurred.

Validation: disposable PostgreSQL 17/Redis 7.4.9, 100/100 migrations;
database 53/53 files and 329/329 tests; API integration 20/20 files and
27/27 tests; Redis recovery checks; identical schema hash
`18D2840CE47084F159BDF5037F74AE51BD24418EF8F63943096F996509BB6FFC`;
serial workspace tests; typecheck/lint; build 81/81 routes; migration
verifier; Actionlint; Gitleaks; controlled-release 5/5; provider-spend 4/4.
Source checkpoint: `3ca2060332fbda01f56b3044a8cde9e0201af71a`, pushed to
`origin/agent-02/third-code-erp-landing`; remote SHA and clean worktree
verified.

## M3.144 Core Cost Entry restore boundary (2026-08-07)

Added a closed-by-default Core restore command and separate tenant-scoped
restore replay ledger. NestJS requires `cost.record`, locks membership and a
voided manual entry, validates its prior void snapshot, clears void metadata,
writes audit evidence, and returns an exact terminal restore result. No Web
restore UI or hosted SQL/provider mutation occurred; restore flags and
allowlists remain false/empty.

Validation: shared 27/231; database 49/53 files with 188 passed/141 skipped;
API 114/496; Web 92/600; serial Turbo workspace tests; production build
81/81 routes; typecheck/lint, migration verifier (100 files), Actionlint,
Gitleaks, controlled-release 5/5, and provider-spend 4/4 passed. Database
skips require `DATABASE_URL`; the new migration has not received disposable
replay evidence. Source checkpoint: `963ae464ac35f9bc388605bcb641b2f42442ac19`,
pushed to `origin/agent-02/third-code-erp-landing`; remote SHA and clean
worktree verified.

## M3.143 Core-only Cost Entry deletion action (2026-08-07)

The Web Project cost action now routes deletion through the typed NestJS Core
DELETE command. It preserves the existing Cost Table caller, sends a bounded
reason and idempotency key, verifies tenant/Project/entry/manual-void scope,
and revalidates only after a valid result. Direct database deletion and
duplicate Web audit are removed. The API gate remains false/empty; the source
void migration is not applied to hosted Supabase and no Vercel/Railway/provider
mutation occurred.

Validation: focused Web deletion action/client 14/14; Web 92/600; shared
27/230; database 48/52 files with 186 passed/141 skipped; API 114/489; serial
Turbo workspace tests; production build 81/81 routes; typecheck/lint,
migration verifier, Actionlint, Gitleaks, controlled-release 5/5, and
provider-spend 4/4 passed. Database skips require `DATABASE_URL`; disposable
replay remains the no-skip evidence. Source checkpoint:
`ad1d8d2f5e902148cf3805d97232f8273afdc88b`; remote branch and clean worktree
verified.

## M3.140 Core-only Project creation (2026-08-07)

The Web `/projects/new` action requires `project.create` and calls the typed
NestJS `POST /v1/projects` boundary for every official creation. It performs
no direct `users` lookup or `projects` insert, preserves/provisions an
idempotency key, checks the returned tenant, and fails closed on Core errors.
The frontend Project-create selector and allowlist were removed. The API-side
tenant gate remains closed by default; no hosted SQL, Vercel build, Railway
deploy, or provider mutation occurred.

Validation: focused Web Project-create action 5/5; Core client 114/114;
full Web 90 files/587 tests; shared 27/229; database 47/51 files with
183 passed/141 skipped; API 112/480; production build 81/81 routes;
typecheck/lint, migration verifier, Actionlint, Gitleaks, controlled-release
5/5, and provider-spend 4/4 passed. The four database files/141 tests are
the documented `DATABASE_URL`-dependent skips; the prior disposable replay
supplies no-skip evidence. No hosted state changed.
Source checkpoint: `c702bd9edec41cb3a9efd8b490ae5e82a3a04ceb`; remote branch and
clean worktree verified.

## M3.141 Core-only manual Cost Entry creation (2026-08-07)

The Web Project cost action requires `cost.record` and routes manual creation
through typed NestJS Core. It sends integer cents and an idempotency key,
checks returned tenant/Project identity, revalidates only after success, and
does no direct `cost_entries` insert or duplicate create audit. Frontend
create selector/allowlist removed. Cost Entry deletion remains legacy and is
explicitly outside this slice; no hosted SQL, Vercel build, Railway deploy,
or provider mutation occurred.

Validation: focused action 5/5; Core client 113/113; Web 91/591; shared
27/229; database 47/51 files with 183 passed/141 skipped; API 112/480;
production build 81/81 routes; typecheck/lint, migration verifier, Actionlint,
Gitleaks, controlled-release 5/5, and provider-spend 4/4 passed. Database
skips require `DATABASE_URL`; prior disposable replay supplies no-skip
evidence. No hosted state changed. Source checkpoint:
`f9770a015e0c8769010cf08cb4f31f7c26b6f656`; remote branch and clean worktree
verified.

## M3.142 Core Cost Entry void boundary (2026-08-07)

Added a closed-by-default Core DELETE boundary that voids manual entries in a
tenant/project transaction, records actor/audit evidence, and persists a
tenant-scoped idempotency result plus restore snapshot. Cost Entry active
reads exclude `voided_at` rows. Direct Web deletion remains legacy and is not
declared migrated. The source migration is not applied to hosted Supabase;
Vercel/Railway/provider state is unchanged.

Validation: focused API deletion 8/8; shared 3/3; database migration/schema
3/3; Web 91/591; shared 27/230; database 48/52 files with 186 passed/141
skipped; API 114/489; production build 81/81 routes; typecheck/lint,
migration verifier, Actionlint, Gitleaks, controlled-release 5/5, and
provider-spend 4/4 passed. Database skips require `DATABASE_URL`.
Source checkpoint: `476903d934c3c1b65bf50b6075497707b8841248`; remote branch and
clean worktree verified.

## M3.139 self-hosted Core authority evidence (2026-08-07)

The approved disposable WSL lane replayed all 98 repository migrations against
PostgreSQL 17 with Redis 7.4.9, passed the database no-skip gate and Nest API
integration suite, and produced identical schema-before/schema-after SHA256
`6E1CA120B357614D2A9C4CF06F1E306E08210CFB7B11F340A5E2A286D42D1B71`.
Services and the disposable database were stopped after the run. This proves
source/runtime behavior only; it does not prove managed Supabase parity,
backup/restore, hosted identity, or release authorization. No hosted SQL,
Vercel build, Railway deploy, or provider mutation occurred.

## M3.138 retire Project update flag surface (2026-08-07)
## M3.138 retire Project update flag surface (2026-08-07)

Removed the unused `projectWritesUseCoreApi` selector, its Web test branch,
and the `ERP_PROJECT_WRITES_VIA_API`/tenant-allowlist entries from environment
examples. Replaced the old flag-driven cutover runbook with a Core-authority
validation runbook; runtime provider configuration was not changed. Project
updates remain Core-only and fail closed when Core is unavailable. No
migration, hosted SQL, Vercel build, Railway deploy, or provider mutation was
added.

Validation: Core client 115/115; Web action 5/5; serial workspace tests
passed (shared 27/229, database 47/51 files with 141 compatibility skips, API
112/480, Web 89/583); production build emitted 81/81 routes; typecheck, lint,
migration verifier, Actionlint, Gitleaks, controlled-release, and
provider-spend guards passed. Source checkpoint: commit `a978b4f`.

## M3.137 Project update Core cutover (2026-08-07)

The Web Project update action no longer has a direct database or Web-audit
fallback. It reads the tenant-scoped Project through Core to obtain the
optimistic-concurrency token, validates the returned tenant/record scope, and
submits the complete command to NestJS. NestJS remains the only writer: it
rechecks membership/capability, locks membership and Project rows, enforces
status transitions, commits the mutation, and writes semantic audit in one
transaction. Core/API unavailability now fails closed with no write. No
migration, flag, hosted SQL, Vercel build, Railway deploy, or provider
mutation was added; hosted providers and ERP canaries remain closed.

Validation: focused Web action tests 5/5; Core client tests 116/116; serial
workspace tests passed (shared 27/229, database 47/51 files with 141
compatibility skips, API 112/480, Web 89/584); production build emitted
81/81 routes; typecheck, lint, migration verifier, Actionlint, Gitleaks,
controlled-release, and provider-spend guards passed. Source checkpoint:
commit `927a2c3`.

## M3.136 legacy Project update fallback guard (2026-08-07)

The legacy Web Project update action now derives the tenant and actor from
`requireUserProfile`, checks `project.update` before reading the target, and
applies the shared Core Project status-transition table before either the
NestJS path or the direct-database compatibility fallback. Terminal status
reopens are rejected consistently. The fallback still writes directly during
migration, so it is not yet the official transaction authority. No migration,
flag, hosted SQL, Vercel build, Railway deploy, or provider mutation was
added; hosted providers and ERP canaries remain closed.

Validation: focused Web Project action tests 4/4; serial workspace tests
passed (shared 27/229, database 47/51 files with 141 compatibility skips, API
112/480, Web 89/583); production build emitted 81/81 routes; typecheck, lint,
migration verifier, Actionlint, Gitleaks, controlled-release, and
provider-spend guards passed. Source checkpoint: commit `5a44ce8`.

## M3.135 project status state machine (2026-08-07)

Core Project update now enforces explicit status transitions: `lead` may move
to `active`, `on_hold`, or `cancelled`; `active` may move to `on_hold`,
`completed`, or `cancelled`; `on_hold` may resume to `active` or cancel;
`completed` and `cancelled` are terminal and only allow same-state edits. The
check runs after the locked Project read and before mutation/audit. No
migration, flag, hosted SQL, Vercel build, Railway deploy, or provider
mutation was added. The non-canary legacy Web fallback remains a separately
tracked migration boundary.

Validation: shared contract tests 27 files/229 tests; focused Project service
and HTTP tests 22/22; self-hosted PostgreSQL 17.10/Redis 7.4.9 replay applied
98/98 migrations and passed the Project API integration path; serial workspace
tests passed (database 47/51 files with 141 compatibility skips, API 112/480,
Web 89/581); production build emitted 81/81 routes; typecheck, lint, migration
verifier, Actionlint, Gitleaks, controlled-release, and provider-spend guards
passed. Source checkpoint: commit `97c41f8`; hosted providers remain closed.

## M3.134 project-update authority hardening (2026-08-07)

Project updates now recheck the caller's tenant membership and
`project.update` capability inside the same NestJS transaction that locks and
updates the Project. The database-backed role becomes the authorized
principal for tenant predicates, actor context, and semantic audit; denied or
stale role claims abort before the Project row is touched. No migration, flag,
hosted SQL, Vercel build, Railway deploy, or provider mutation was added.

Validation: focused Project service/HTTP tests 21/21; self-hosted PostgreSQL
17.10/Redis 7.4.9 replay applied 98/98 migrations and passed the Project API
integration path; serial workspace tests passed (shared 27/228, database
47/51 files with 141 compatibility skips, API 112/479, Web 89/581);
production build emitted 81/81 routes; typecheck, lint, migration verifier,
Actionlint, Gitleaks, controlled-release, and provider-spend guards passed.
Source checkpoint: commit `5534046`; hosted providers remain closed.

## M3.133 project-create authority hardening (2026-08-07)

Project creation now rechecks the caller's tenant membership and capability
inside the same NestJS transaction that claims idempotency and commits the
project. The membership row is locked with `FOR UPDATE`; the database-backed
role becomes the authorized principal used for actor context, idempotency,
tenant-scoped insert, and semantic audit. A forged or stale role cannot
elevate project creation. No migration, flag, hosted SQL, Vercel build,
Railway deploy, or provider mutation was added.

Validation: self-hosted PostgreSQL 17.10/Redis 7.4.9 replay applied 98/98
migrations and passed the database/runtime integration lane, including the
project-create integration path; serial workspace tests passed (shared
27/228, database 47/51 files with 141 compatibility skips, API 112/478, Web
89/581); production build emitted 81/81 routes; typecheck, lint, migration
verifier, Actionlint, Gitleaks, controlled-release, and provider-spend guards
passed. Source checkpoint: commit `6276d10`; hosted providers remain closed.

## M3.132 asset maintenance due projection (2026-08-07)

Asset operations now have a read-only, bounded due/overdue projection. The
NestJS maintenance authority selects the latest maintenance record per asset
before applying the due window, preserves tenant/project predicates, returns a
window count for pagination, and reuses the existing closed maintenance-read
flag. Shared contracts reject browser tenant identity and bound the watch
window to 365 days/100 rows. Web adds a non-blocking service-watch panel; a
maintenance-read failure never breaks the asset register. No new migration,
hosted SQL, feature flag, Vercel build, Railway deploy, or provider mutation.

Validation: self-hosted PostgreSQL 17.10/Redis 7.4.9 replay and asset
maintenance integration pass; serial package tests pass (shared 27 files/228
tests, database 47/51 files with 141 compatibility skips, API 112/112 files
and 477/477 tests, Web 89/89 files and 581/581 tests); build emits 81/81
routes; typecheck, lint, migration verifier, Actionlint, Gitleaks,
controlled-release, and provider-spend guards pass. The parallel Turbo test
runner still times out seven API HTTP tests under Windows cross-package load;
the serial run is the release evidence. Source checkpoint: commit `be760ed`;
the reviewed branch push was verified.

## M3.131 asset maintenance history (2026-08-07)

Operational asset service history now has an original, append-only source
slice: tenant-safe records, exact-cent cost, date constraints, audit trigger,
and service-only idempotency ledger. NestJS owns closed-by-default list/create
routes; Web has a read/detail surface and a guarded command form. All new
flags/tenant allowlists default closed. Local replay proves 98/98 migrations,
zero-skip database/runtime integration, and no hosted/provider mutation.

## M3.130 dashboard fault isolation (2026-08-07)

Executive dashboard analytics now degrade to the authorized Today view when a
portfolio query fails during an incremental schema rollout. The UI discloses
the degraded state; no zero-valued KPI substitute, tenant-scope expansion, or
transaction path changed. Web tests/build and source gates pass; no provider
release occurred.

## M3.129 self-hosted free database lane (2026-08-07)

The free WSL lane proves 97/97 ordered migrations, PostgreSQL 17.10/Redis
7.4.9 runtime behavior, 51/51 database files with 324/324 tests and zero
skips, Nest integration, and unchanged schema dumps. This is source evidence
only. The pinned Supabase CLI `2.109.1` shadow-database diff still requires
Docker/CI and remains open; hosted Supabase, Vercel, Railway, and ERP canaries
are unchanged.

Status date: 2026-08-07
Source checkpoint: commit `97c41f8` on `agent-02/third-code-erp-landing`
Scope: clean-room construction ERP capability planning and incremental delivery

M3.125 current-state refresh: the source branch contains 97 ordered Supabase
migrations, including the source-only anonymous-grant and policy hardening
baseline. The read-only hosted planner still reports 55/97 migrations, 213
direct `anon` privilege rows, 209 policies containing `public`, one
tenant-scoped duplicate Purchase Order number group, and no configured audit
recovery tenant. These are release blockers; this matrix does not authorize a
hosted SQL apply, Vercel build, Railway deploy, or feature-flag canary.
The current functional source boundary remains: NestJS owns closed-by-default
Purchase Order workflow and delivery/asset authority slices; Web uses exact
tenant/flag selectors and compatibility paths where the Core slice is not
enabled; Python/Cortex stays advisory and cannot finalize ERP transactions.
No provider or hosted database state changed for this refresh.

M3.126 replay update: a fresh disposable PostgreSQL 17.10 database was
bootstrapped and replayed from the 97-file source ledger, then loaded with the
deterministic seed. The verifier passes and database Vitest is 51/51 files,
324/324 tests, zero skips. This is source replay evidence only; the hosted
55/97 ledger, catalog blockers, duplicate Purchase Orders, audit recovery,
rollback, identity, and spend gates remain open.

M3.127 validation update: pinned Supabase CLI `2.109.1` schema-diff attempts
against the disposable replay stopped before inspection because Docker Desktop
Linux engine is unavailable. The CLI gate remains open; no hosted or local
database state was changed by the failed read-only attempts.

M3.128 release-integrity update: the Turbo `test` task now hashes the database,
Redis, and integration expectation environment inputs. A regression contract
prevents cached no-database logs from masquerading as zero-skip coverage.
This changes validation behavior only; no ERP transaction path or provider
state changed.

M3.109 update: protected dashboard render failures now receive a responsive,
branded recovery boundary with retry/navigation and digest-only support
reference. No ERP authority or transaction path changed. Web evidence is
88/570 tests and 81/81 production routes; no provider build or hosted mutation
occurred. Source is pushed to the feature branch by `kurtgav`.

M3.108 update: refreshed hosted parity read-only. Supabase remains PostgreSQL
17.6 at 55/94 migrations with 88 RLS-enabled public tables, 22 forced-RLS
tables, 303 policies, 2 tenants, 13 users, 13 Purchase Orders, 4 invoices,
662 audit rows, 385 Cortex nodes, and 454 Cortex edges. Source-only Asset
Register and delivery-schedule ledger tables are absent. One tenant-scoped
12-record Purchase Order duplicate group and 11 security warnings remain.
Vercel runtime errors/500 logs for `/dashboard` are empty; no provider or
hosted mutation occurred.

M3.107 update: Inventory now has an authenticated UOM editor for display name
and active state. Nest owns the fail-closed, tenant-scoped PATCH authority with
membership/capability recheck, row locks, immutable code/decimal precision, and
semantic audit. Local evidence is shared 29/29, API 452 passed with 26 skipped,
Web 569/569, Next 81/81, and repository lint/type checks. Source is pushed to
the feature branch by `kurtgav`; no provider build or hosted mutation occurred.

M3.106 update: Inventory now exposes per-item policy editing for active catalog
items, reusing the guarded `configureInventoryItem` authority for base UOM and
perpetual tracking. Item identity remains stable and inactive UOMs cannot be
newly assigned. Source commit `7570cda` is pushed to the feature branch;
`origin/main` remains unchanged. Local evidence is 125/125 focused tests,
87/567 full Web tests, and 81/81 production routes. Supabase remains read-only
at 55/94; no provider build or hosted mutation occurred.

M3.105 update: Inventory now provides an authenticated Warehouse edit surface
for name and active state while preserving immutable code/project identity and
the Nest zero-net-stock deactivation guard. Source commit
`e9ee5adb44e3bc2da5cab54af2828065f117f343` is pushed to the feature branch;
local Web evidence is 125/125 focused tests, 87/567 full tests, and 81/81
production routes. No hosted mutation or provider build occurred; Supabase
remains read-only at 55/94.

M3.104 update: the Vercel spend guard scans all workspace package manifests
and GitHub workflow YAML, passes 3/3, and confirms no deploy command or Git
deployment is enabled. No Vercel deployment was created for the current
feature SHA; Supabase remains read-only at 55/94 and Railway readiness remains
healthy. No hosted mutation occurred.

M3.103 update: delivery scheduling for issued Purchase Orders now has a closed
NestJS `POST /v1/procurement/deliveries` authority route with tenant-scoped
idempotent replay, issued-PO locking, in-app notifications, and semantic audit.
The Web form selects Core only for the exact flag/UUID allowlist and has no
direct fallback; all new selectors remain false/empty. Local migration/RLS
proof is 94/94, API 104/449, Web 87/567, and build 81/81. Hosted Supabase is
still read-only at 55/94; no provider build or tenant canary occurred.

M3.102 update: delivery `site_ready -> in_transit` now has a closed NestJS
authority route with tenant/idempotency replay and semantic audit. The Web
action remains compatibility-default with the new exact flag/allowlist empty;
hosted source-suffix reconciliation and canary evidence are still pending.
Local release gates now pass: API 104/445, Web 87/565, reproducibility 93/93,
and isolated Nest/Next production build 2/2 with 81/81 routes. Railway then
performed one automatic backend deployment for the exact pushed commit;
readiness and health are green. No hosted migration or Vercel build occurred.

M3.101 hosted update: Supabase project `aqqrtkmtcsfkbyyqxowv` is healthy on
PostgreSQL 17.6.1 but remains at 55/92 migrations. Source asset migration
`20260806110000_asset_register_foundation` and `public.assets` are absent
hosted, so asset selectors remain false/empty. Security advisors remain 14
notices/11 warnings; no hosted migration, official ERP write, or provider
build occurred.

M3.100 replay update: rollback-only disposable PostgreSQL 17/Redis 7.4.9 proof
now compares direct and Core Asset Register rows across two tenants, Project
joins, pagination/search, audit, forced RLS, and client-role privilege denial.
Verifier coverage includes the asset migration, service-only table, indexes,
and audit trigger. API 17/24, database 49/318, schema hash unchanged, and
92/92 migration verification pass. Source SHA
`8586beb9e53d5fafd2289451eda576ea5b1a1726` is pushed; hosted selectors remain
false/empty and no provider/database write occurred.

M3.99 Web update: Asset Register now has an original Next route over the
closed Core `GET /v1/assets` read projection. It requires `asset.read`, exact
flag/tenant selection, strict response validation, and no direct database
fallback; default selectors remain false/empty. Source SHA
`b7f274ad078965239a9138545a96bd6468b4dcda` is pushed to both refs. Web
87/561 and build 81/81 pass; Vercel remains disconnected with no new build.
Hosted Supabase remains read-only at 55/92 migrations; no official ERP write,
tenant canary, or provider spend occurred.

M3.98 rebrand update: authenticated shell source now uses an accessible `TC`
Third Code ERP mark instead of the leftover `A`. Clean-room branding test,
web 87/559, typecheck, serial lint, and production build 80/80 pass. Source
SHA `a719d2321410c09658faca30c20c6c374f502360` is pushed to both refs. Vercel
Git/build remains disconnected; live UI promotion is unverified by design.

M3.97 hosted parity update: read-only Supabase inspection confirms PostgreSQL
17.6, 55/92 hosted/source migrations, 88 public tables with RLS enabled, and
303 public policies. Counts are 2 tenants, 13 users, 13 Purchase Orders, 4
invoices, 662 audit rows, 385 Cortex nodes, 454 Cortex edges, and zero cash
accounts, cash transactions, or supplier bills; one tenant-scoped PO duplicate
group contains 12 records. Security advisors include 11 warnings and the
selectors remain false/empty. No hosted migration, official ERP write, branch,
Vercel build, or Railway build changed.

M3.96 replay update: disposable PostgreSQL 17/Redis 7.4.9 proof compares the
cash compatibility query with the typed Nest projection across two tenants,
state/direction/date filters, exact-cent totals, and same-tenant joins. 92/92
migrations, 112 database suites/318 tests, and 32 API integration suites/23
tests pass with zero skips. Source SHA
`91ed37570ea57fa456b569d247802cfd996cb9c6` is live on Railway deployment
`133e14b7-c879-4090-8ce1-26d9b42d93ca` (`SUCCESS`/running); readiness/health
are 200 and unauthenticated cash register is 401. Hosted Supabase remains
read-only and Vercel has no new build.

M3.96 update: cash transactions now have a typed, tenant-derived NestJS
`GET /v1/finance/cash-transactions` projection with same-tenant cash-account
and optional counterparty joins, exact-cent register rows, and posted
receipt/disbursement aggregates. API and Next selectors are false/empty by
default; the existing page remains the compatibility path for unselected
tenants and Core failure cannot fall back for a selected tenant. Source SHA
`ddadd2fa3f7c2451dcfc97f53529ba9edba1f3ee` is live on Railway deployment
`fbfc7eb0-4820-4359-a42f-74b3c0351558` (`SUCCESS`/running); readiness/health
are 200 and unauthenticated cash register is 401. No UI, hosted migration,
provider spend, or official ERP write changed. Vercel remains disconnected
with no new build.

M3.95 update: supplier payables now has a typed, tenant-derived NestJS
`GET /v1/finance/payables` projection with Supplier Bill/Vendor/Purchase
Order/Project context, posted disbursement allocation math, exact-cent open
balances, and server-computed aging totals. API and Next selectors are
false/empty by default; the existing page remains the compatibility path for
unselected tenants and Core failure cannot fall back for a selected tenant.
Source SHA `de0b7e1909ec127ec94ec044202f78f44ab8bd4a` is live on Railway
deployment `dcb4579e-5bb5-4661-9896-fc1fd607bd92` (`SUCCESS`/`RUNNING`);
readiness/health are 200 and unauthenticated payables is 401. No UI, hosted
migration, provider spend, or official ERP write changed. Vercel remains
disconnected with no new build.

M3.94 update: customer receivables now has a typed, tenant-derived NestJS
`GET /v1/finance/receivables` projection with posted invoice status scope,
same-tenant Project/Business Account context, exact-cent allocation balances,
and server-computed aging totals. API and Next selectors are false/empty by
default; the existing page remains the compatibility path for unselected
tenants and Core failure cannot fall back for a selected tenant. Source SHA
`f298b61a215ea43753f627010444c488f0c46518` is live on Railway deployment
`bfec3369-dee7-4ed9-9cb7-37f1e71fe9ab` (`SUCCESS`/`RUNNING`); readiness/health
are 200 and unauthenticated receivables is 401. No UI, hosted migration,
provider spend, or official ERP write changed. Vercel remains disconnected
with no new build.

M3.93 update: the general ledger now has a typed, tenant-derived NestJS
`GET /v1/finance/ledger` read projection with posted-entry scope, integer cents,
same-tenant context joins, and an explicit `finance.read` capability. API and
Next selectors are false/empty by default; the existing page remains the
compatibility path for unselected tenants and Core failure cannot fall back for
a selected tenant. Source SHA `c279f61555ba772579fb4091dd3d5884b48af273` is
live on Railway deployment `ac9f3fee-0a54-4bf7-91db-2b6815a3638e`
(`SUCCESS`/`RUNNING`); readiness/health are 200 and unauthenticated Finance
Ledger is 401. No UI, hosted migration, provider spend, or official ERP write
changed. Vercel remains disconnected with no new build.

M3.92 update: Cortex keyword search now has a typed, tenant-derived NestJS
`GET /v1/cortex/search` read projection with an explicit `cortex.search`
capability and server-owned role scope. API and Next canary selectors are
false/empty by default; unselected tenants retain the existing route. Core
failure cannot fall back to a direct database read for a selected tenant. No
UI, hosted migration, provider spend, or official ERP write changed.
Source SHA `cd94e274a6a5cb19f715c73fa96fc717879644cc` is live on Railway
deployment `e9e90045-f907-4f6c-ae49-5fa3dcff3cd9` (`SUCCESS`); readiness/health
are 200 and unauthenticated Cortex search is 401. Vercel remains disconnected
with no new build.

M3.91 update: the operational asset register now has a typed, closed NestJS
`GET /v1/assets` projection with strict bounded filters/pagination, the
`asset.read` capability, verified-principal tenant scope, and same-tenant
Project context. API flags remain false/empty; there is no Web adapter, browser
table access, write authority, hosted migration, or Vercel build. Railway
deployment `f0358fdd-f927-465c-b930-ec68b0baf240` is live on the source SHA;
the next proof is disposable replay and a protected tenant canary.

M3.90 update: the source now defines an operational asset register with
tenant-safe identity, controlled kind/status, assignment constraints, audit,
forced RLS, and service-only access. There is no API/UI authority, hosted
migration, maintenance workflow, or accounting fixed-asset behavior; Railway
deployment `1a072ca0-9267-4a16-aad6-fdc2c7ba83ff` is live on the source SHA,
while the next functional proof is disposable replay and then a closed Nest
read projection.

M3.89 update: direct and grouped Nest Purchase Order header inserts map only
the named tenant/PO unique constraint to a bounded 409 response; raw database
errors and business identifiers are not exposed. Runtime flags remain
false/empty, Supabase duplicate reconciliation is still blocked, Railway is
live on the guarded API SHA, and Vercel remains unchanged.

M3.88 update: Purchase Order creation now has executable service proof for
capability/tenant denial, exact centavo header and line totals, bounded audit
evidence, and exact idempotent replay. Runtime flags remain false/empty;
hosted migration and canary gates remain unchanged.

This matrix is the product scope baseline. It describes business outcomes and
the current Third Code implementation; it is not a source, schema, UI, copy, or
test port from another product. Status is deliberately separated from hosted
release status so local capability work cannot be mistaken for production
authorization.

M3.83 update: runtime Web/API/package text now passes an expanded clean-room
guard for ERPNext/Frappe/ABI Ops/Rework/BuildOps variants. Historical migration
identity remains classified internal provenance. Source SHA `1c5b8de` is active
on Railway; Supabase and Vercel remain unchanged.

M3.82 update: project Audit now has allowlisted action/entity filters and
URL-addressable 25-row pagination. Direct and Core reads share tenant-scoped
filter semantics; Core remains closed by flag/tenant allowlist and redacts
details. Source SHA `e98a03b` is locally validated only; Supabase and Vercel
remain unchanged.

M3.81 update: the existing project Audit page can select the redacted Nest
`GET /v1/audit/activity` projection only behind an explicit environment flag,
tenant allowlist, and capability role. The default direct read remains in
place; no migration or default UI change occurred. Source SHA `e8d993d` is
live on Railway deployment `5a562db0-d682-4d99-adba-0adb20436bc8`. Supabase
and Vercel remain unchanged; stale Railway provider metadata is an operator
review item only.

M3.80 update: the API now exposes a redacted, paginated
`GET /v1/audit/activity` projection over the existing append-only `audit_log`.
It requires the explicit `audit.read` capability, derives tenant scope from the
verified principal, and never returns `diff` payloads. Source SHA `1170b55` is
live on Railway deployment `e62e25b9-7e26-4b59-bb32-35ba524c6ae2`; Supabase
and Vercel remain unchanged. Railway's deployment metadata still carries a
stale `@buildops/web` build-command string even though the file manifest used
the intended API Dockerfile; keep this as an operator follow-up, not as a
permission to change provider settings.

## Status vocabulary

- **Live**: the current application exposes the workflow end-to-end against the
  currently deployed schema.
- **Local**: source and tests exist, but the ordered hosted migration/release
  gates are not clear.
- **Source-gated**: a bounded source/UI seam exists, but explicit runtime
  controls and hosted data gates keep it closed.
- **Adapter**: the existing Next.js path still owns the behavior while a closed
  NestJS authority seam exists for a future canary.
- **Planned**: scope is defined; no production mutation exists.
- **Gap**: a capability is intentionally outside the current source surface.

M3.39 update: project creation remains **Adapter**. The Nest authority seam
now has durable tenant/key idempotency, replay, conflict, rollback, and audit
contracts; the legacy Next Server Action remains default until hosted parity,
provider, and canary gates are complete.

## Construction operating spine

| Outcome | Current source surface | Status | Authority boundary |
|---|---|---:|---|
| Qualify accounts, contacts, KYC, and opportunities | CRM routes, pipeline, account/KYC tables | Live | Next reads; server actions remain legacy authority |
| Turn a won opportunity into a project | Pipeline conversion and project tables | Live | Transactional server action with audit |
| Capture drawings, takeoffs, scope, BOM, and rate cards | BOM routes, CAD worker, evidence tables | Live | Python extracts evidence; official BOM remains server-owned |
| Compare suppliers and dispatch RFQs | RFQ routes, quote workflow, BullMQ/outbox | Live | Nest adapter plus durable outbox |
| Approve and issue Purchase Orders | PO creation and three-step workflow | Adapter | Nest route is closed by tenant flag; legacy path remains for unselected tenants |
| Confirm a supplier response to an issued PO | M3.28 Nest public route, M3.29 protected SCM session minting, M3.30 gated email-link reconstruction, M3.49 read/decision portal | Source-gated | Public token authority, least-privilege read model, session scope/expiry checks, server transaction, explicit decision state |
| Schedule deliveries and prepare a site | Delivery routes and state machine | Local | Nest transition slices, including closed `site_ready -> in_transit`, with tenant-scoped idempotency |
| Inspect and accept/reject delivery | Inspection routes and evidence | Local | Nest transition slices, audit and guarded status changes |
| Receive, transfer, consume, and count stock | Inventory control center and ledger schema | Local | PostgreSQL ledger constraints; Core posting/reversal slices |
| Control budget, commitments, claims, and cost-to-complete | Budget, cost-code, claim, and report routes | Local | Tenant-scoped accounting and project controls |
| Issue, reverse, cancel, and reconcile invoices | Receivables, journals, reconciliation routes | Local | Core finance slices reuse database invariants |
| Package turnover, sign, and continue warranty | Turnover, signature, warranty, and client portal routes | Adapter | M3.27 public signing authority is closed by default |
| Ask questions with cited company context | Cortex search, graph projection, citations | Live | Read-only, tenant/RBAC filtered; AI is advisory |

## Multi-business ERP expansion

| Capability family | Required outcome | Current state | Next proof |
|---|---|---|---|
| Parties and master data | One tenant-safe record for companies, people, vendors, items, accounts, and locations | Partial; construction-first tables exist | Normalize shared party/item conventions without breaking existing FKs |
| Source-to-pay | Request, compare, approve, issue, confirm, receive, match, pay, reverse | Procurement/payables plus closed supplier-confirmation source slices | Hosted parity and link-delivery proof |
| Project controls | Scope, baseline, schedule, progress, commitments, forecast, handoff | Construction spine is present | Reconcile project and financial dimensions across every write |
| Inventory | Perpetual quantity/value ledger, transfers, consumption, counts | Local source slices exist | Disposable Postgres/Redis posting and reversal proof |
| Receivables | Invoice, tax/retention, receipt, reconciliation, reversal | Local finance slices exist | Hosted parity and exact-cent integration canary |
| Compliance and audit | Tenant isolation, capability checks, immutable audit, evidence lineage | Implemented across current slices | Audit-chain recovery with owner-approved tenant input |
| People and work management | Role-aware tasks, approvals, workload, site cadence | Tasks and permissions exist | Keep HR/payroll out of the construction transaction path until discovery |
| Assets and maintenance | Track equipment, warranties, service history, and cost | Operational register plus closed Nest/Web read projection and append-only maintenance history slice; no accounting fixed-asset lifecycle | Hosted parity, then protected tenant read/write canary; defer accounting lifecycle |
| Service and customer success | Portal, issues, warranty, satisfaction, communications | Warranty portal and CNPS are live | Add supplier/customer response loops only after token threat model |
| Reporting and planning | Role-specific Today views, scheduled reports, exports, forecasts | Dashboard, reports, and Cortex context exist | Measure decision latency and data freshness before adding breadth |

## M3.28-M3.49 bounded scope: supplier confirmation

The next implementation slice is intentionally narrow:

1. Add a tenant-scoped supplier-confirmation session with a hashed,
   single-purpose token, expiry, revocation, and an explicit state machine:
   `pending -> accepted | declined | changes_requested`.
2. Add a durable replay ledger keyed by tenant and idempotency key. The replay
   result must include the session, Purchase Order, decision, and response time.
3. Add a closed-by-default NestJS public command. Tenant and Purchase Order
   scope come only from the locked session; the browser cannot submit tenant,
   vendor, status, or actor identifiers.
4. Commit the decision, response metadata, and nullable-actor semantic audit in
   one PostgreSQL transaction. A response never changes delivery, receipt, or
   payment state by itself.
5. At `scm_issue`, optionally mint one pending session using a deterministic
   HMAC-derived token, persist only its hash, associate the source workflow
   request, and put only the session UUID in the supplier outbox.
6. Keep the existing supplier email and Purchase Order UI behavior unchanged;
   link delivery is independently gated, verifies a pending unexpired session,
   and requires its own disposable replay, expiry, revocation, cross-tenant,
   rollback, provider, and spend gates.
7. Add a read-only, least-privilege supplier review page and form. The read
   seam has its own closed-by-default flag and tenant allowlist; Nest remains
   the only authority for recording the response and the page never receives
   tenant, actor, or token-hash fields.

Acceptance is source-level plus a closed Railway runtime seam until the
ordered hosted migration suffix is reconciled. The two source migrations and
route exist; all public and session-minting controls remain false, no Supabase
SQL or public link is active, and the existing notification retry path remains
unchanged.

## Release boundary

Current hosted Supabase is at 55 applied migrations while source contains 90.
The 35-migration suffix must be planned and applied in order as one reviewed
release. Duplicate Purchase Order data, the owner-approved audit-recovery
tenant, disposable database/Redis evidence, clone catalog/data/RLS/audit/
financial reconciliation, rollback, exact provider identity, and spend
controls remain independent gates. Vercel Git stays disconnected to avoid
duplicate or surprise builds. Railway readiness does not clear these gates.

## Source-of-truth references

- [`REWORK_ALIGNMENT.md`](../REWORK_ALIGNMENT.md) — current construction
  workflow mapping.
- [`USER_STORY_INDEX.md`](../USER_STORY_INDEX.md) — route/action/schema index.
- [`ADR-009-clean-room-capability-expansion.md`](../adrs/ADR-009-clean-room-capability-expansion.md)
  — clean-room and incremental-slice decision.
- [`CURRENT_STATE.md`](./CURRENT_STATE.md) — verified runtime boundary.
- [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) — release-gated transaction slices.
