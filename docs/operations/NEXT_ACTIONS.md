# Next Actions

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
