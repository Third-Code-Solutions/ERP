# Third Code ERP Route Ledger

## Cortex redesign — local verification 2026-09-05

`/cortex` repaired in isolated release worktree on `codex/cortex-workspace-ux`.
Browser PASS52.2s at320/390/768/1024/1440: graph/list, keyboard details, focused
record, all nine fixture sources, filters/fit, malformed/empty/retry, chat history
and composer. Real loopback Auth/PostgreSQL, synthetic density/source fixtures.
No console errors or external/indexing requests. Not a production route rerun.

## FINAL9a6b87816499 audit — 2026-09-05 19:35 +08:00

PASSED complete-route-audit session59453,2tests4.8min,0skips/failed/flaky.
Stable revision9a6b87816499 before/after.132 page templates:105 rendered,
27invalid-ID/token guards verified; zero console/page errors on direct visits.
35HTTP handlers inventoried:20anonymousGET probes (14auth guards,2publichealth,
4redirect/validation boundaries) and15mutation-only handlers NOT RUN.

Four REVIEW responses checked against current source: missing-code auth callback
redirect307; documents/inspection report/weekly report invalid-ID400 validation.
No positive-record or authorized endpoint behavior implied by boundary checks.
Detailed JSON (ignored, local):
D:/thirdcode/ERP-route-release-20260904/apps/web/e2e/tmp/settings-release-route-audit.json

Real Settings canary separately passed own preference save/reload, bell/manual
refresh and four project financial pages; test preferences restored. Existing
Finance strip removed without changing route/authorization contracts. Prior
React419 missing-record breadcrumb diagnostic remains a separate known defect.


## FINAL live page/handler sweep — 2026-09-05 18:07 +08:00

Release e8c1b481607c stayed stable before/after. Playwright70842 PASSED both inventory tests in5.0min:132 page checks and35 HTTP handler inventory rows.105 page renders and27 invalid-ID/token guards verified; no console/page errors during these direct page visits.20 anonymous GET boundaries probed;15 mutation-only handlers NOT RUN. Four redirect/validation REVIEW outcomes were independently checked against source and auth behavior as documented below.

The separate extended breadcrumb-navigation test FAILED on shared React419 recovery diagnostics after leaving missing-record pages (Cash and Journals); both destination pages nevertheless rendered correctly. This is not erased by the passing direct-page sweep. See Defect Register. Positive missing-record/portal-token and business mutation workflows are not certified by this audit. Draft platform PR32 remains excluded.

### complete-route-audit

| Route template | HTTP | Evidence |
|---|---:|---|
| `/` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/access` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin/data-quality` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin/mapping-config` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin/material-items` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin/rate-cards` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin/users` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin/users/[id]` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin/users/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/assets` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/assets/[assetId]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/audit` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/auth/forgot-password` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/auth/login` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/auth/signup` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/auth/update-password` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/billing` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/bom` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/checklist` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/claims` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/claims/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/claims/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/coc` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/comments` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/cortex` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/cost` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/cost/budget` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/accounts` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/accounts/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/crm/accounts/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/kyc-queue` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities/[id]` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities/[id]/proposal` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities/[id]/proposal/change-requests` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities/[id]/proposal/design` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities/[id]/proposal/inspection` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities/[id]/proposal/pprf` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities/new/pprf` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/dashboard` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/documents` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/cash` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/cash/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/finance/cash/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/journals` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/journals/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/finance/journals/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/ledger` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/payables` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/payables/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/finance/payables/[id]/edit` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/finance/payables/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/receivables` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/reconciliation` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/reconciliation/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/finance/reconciliation/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/inspection/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/inventory` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/inventory/movements` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/inventory/movements/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/inventory/movements/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/inventory/receipts` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/inventory/receipts/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/inventory/receipts/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/invoices` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/invoices/[id]` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/invoices/[id]/bir2307` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/invoices/[id]/print` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/permits` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/pipeline` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/pipeline/board` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/pipeline/conversion` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/pipeline/coverage` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/pipeline/list` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/portal/bom/[token]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/cnps/[token]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/project/[token]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/project/[token]/billing` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/project/[token]/documents` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/project/[token]/photos` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/project/[token]/progress` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/purchase-order/[token]/confirmation` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/sign/[token]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/warranty/[token]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/process` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/procurement` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/procurement/deliveries` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/procurement/deliveries/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/procurement/deliveries/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/procurement/rfqs` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/procurement/rfqs/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/progress` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/access` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/audit` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/billing` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/bom` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/bom/togal` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/checklist` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/coc` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/comments` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/cost` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/cost/budget` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/documents` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/permits` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/progress` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/reports` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/scope` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/turnover` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/vos` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/vos/[voId]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/projects/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/punchlist` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/punchlist/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/punchlist/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/purchase-orders` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/purchase-orders/[id]` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/purchase-orders/[id]/print` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/reports` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/scope` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/settings` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/settings/profile` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/tasks` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/turnover` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/warranty` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/warranty/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/warranty/cnps` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/weekly-report/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |

### http-route-audit

| Route template | HTTP | Evidence |
|---|---:|---|
| `/api/ai/chat` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/ai/similar-items` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/auth/callback` | 307 | REVIEW redirect/validation boundary |
| `/api/auth/recovery-complete` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/bom/takeoff-import` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/bom/togal-commit` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/bom/togal-import` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/cortex/brief` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/chat/jobs/[jobId]` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/chat` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/cortex/conversations/[id]` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/conversations` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/embed` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/cortex/entity/[refTable]/[refId]` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/graph` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/search` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/semantic-index-jobs/[jobId]` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/semantic-index-jobs` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/crm/opportunities/[id]/inspection-photos` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/crm/opportunities/[id]/kyc` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/document-processing/[jobId]` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/documents/[id]` | 400 | REVIEW redirect/validation boundary |
| `/api/exports/opportunities-csv` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/finance/reconciliation/import/sign` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/health` | 200 | PUBLIC GET VERIFIED |
| `/api/inspection/[id]/report` | 400 | REVIEW redirect/validation boundary |
| `/api/notifications` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/ready` | 200 | PUBLIC GET VERIFIED |
| `/api/search` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/upload/complete` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/upload` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/upload/sign` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/webhooks/docuseal` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/webhooks/inngest` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/weekly-report/[id]` | 400 | REVIEW redirect/validation boundary |

Evidence: D:/thirdcode/ERP-route-release-20260904/apps/web/test-results/complete-route-journal-release.json. Original failed5c389 audit remains preserved separately. No credentials, tokens or customer record IDs included.


## Production route audit — 2026-09-05, release 5c38986cd1a7

Follow-up on four REVIEW rows: anonymous requests using valid-shaped synthetic
UUIDs to document, inspection-report and weekly-report handlers all returned401.
The callback without a code returned307 to `/auth/login?error=auth_callback_failed`.
Source inspection matches these validation/auth boundaries. Positive authorized
document/report delivery remains NOT RUN; no customer document links were opened.

Stable revision verified before/after. Original run FAILED its page gate: 2 journal navigation timeouts with a confirmed breadcrumb404. Isolated follow-up returned HTTP200 for both page documents and correct headings, but that does not override the failed audit. Repair underway. All rows below are read-only checks, not end-to-end mutation certification. Missing-record/token positive cases remain NOT RUN. Draft platform PR32 is excluded from this 131-page deployed inventory.

### complete-route-audit

| Route template | HTTP | Evidence |
|---|---:|---|
| `/` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/access` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin/data-quality` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin/mapping-config` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin/material-items` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin/rate-cards` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin/users` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin/users/[id]` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/admin/users/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/assets` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/assets/[assetId]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/audit` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/auth/forgot-password` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/auth/login` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/auth/signup` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/auth/update-password` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/billing` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/bom` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/checklist` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/claims` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/claims/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/claims/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/coc` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/comments` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/cortex` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/cost` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/cost/budget` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/accounts` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/accounts/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/crm/accounts/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/kyc-queue` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities/[id]` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities/[id]/proposal` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities/[id]/proposal/change-requests` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities/[id]/proposal/design` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities/[id]/proposal/inspection` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities/[id]/proposal/pprf` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/crm/opportunities/new/pprf` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/dashboard` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/documents` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/cash` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/cash/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/finance/cash/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/journals/[id]` | 0 | FAILED navigation/timeout |
| `/finance/journals/new` | 0 | FAILED navigation/timeout |
| `/finance/ledger` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/payables` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/payables/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/finance/payables/[id]/edit` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/finance/payables/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/receivables` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/reconciliation` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/finance/reconciliation/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/finance/reconciliation/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/inspection/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/inventory` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/inventory/movements` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/inventory/movements/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/inventory/movements/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/inventory/receipts` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/inventory/receipts/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/inventory/receipts/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/invoices` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/invoices/[id]` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/invoices/[id]/bir2307` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/invoices/[id]/print` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/permits` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/pipeline` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/pipeline/board` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/pipeline/conversion` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/pipeline/coverage` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/pipeline/list` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/portal/bom/[token]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/cnps/[token]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/project/[token]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/project/[token]/billing` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/project/[token]/documents` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/project/[token]/photos` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/project/[token]/progress` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/purchase-order/[token]/confirmation` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/sign/[token]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/portal/warranty/[token]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/process` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/procurement` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/procurement/deliveries` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/procurement/deliveries/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/procurement/deliveries/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/procurement/rfqs` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/procurement/rfqs/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/progress` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/access` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/audit` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/billing` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/bom` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/bom/togal` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/checklist` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/coc` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/comments` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/cost` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/cost/budget` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/documents` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/permits` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/progress` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/reports` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/scope` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/turnover` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/vos` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/projects/[id]/vos/[voId]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/projects/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/punchlist` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/punchlist/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/punchlist/new` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/purchase-orders` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/purchase-orders/[id]` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/purchase-orders/[id]/print` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/reports` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/scope` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/settings` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/settings/profile` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/tasks` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/turnover` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/warranty` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/warranty/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |
| `/warranty/cnps` | 200 | RENDER VERIFIED; mutations NOT RUN |
| `/weekly-report/[id]` | 200 | GUARD VERIFIED; positive case NOT RUN |

### http-route-audit

| Route template | HTTP | Evidence |
|---|---:|---|
| `/api/ai/chat` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/ai/similar-items` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/auth/callback` | 307 | REVIEW redirect/validation boundary |
| `/api/auth/recovery-complete` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/bom/takeoff-import` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/bom/togal-commit` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/bom/togal-import` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/cortex/brief` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/chat/jobs/[jobId]` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/chat` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/cortex/conversations/[id]` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/conversations` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/embed` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/cortex/entity/[refTable]/[refId]` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/graph` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/search` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/semantic-index-jobs/[jobId]` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/cortex/semantic-index-jobs` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/crm/opportunities/[id]/inspection-photos` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/crm/opportunities/[id]/kyc` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/document-processing/[jobId]` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/documents/[id]` | 400 | REVIEW redirect/validation boundary |
| `/api/exports/opportunities-csv` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/finance/reconciliation/import/sign` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/health` | 200 | PUBLIC GET VERIFIED |
| `/api/inspection/[id]/report` | 400 | REVIEW redirect/validation boundary |
| `/api/notifications` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/ready` | 200 | PUBLIC GET VERIFIED |
| `/api/search` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/upload/complete` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/upload` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/upload/sign` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/webhooks/docuseal` | NOT RUN | NOT RUN: mutation-only; inspect dedicated workflow tests |
| `/api/webhooks/inngest` | 401 | AUTH GUARD VERIFIED; authorized behavior NOT RUN |
| `/api/weekly-report/[id]` | 400 | REVIEW redirect/validation boundary |

Evidence: active worktree apps/web/test-results/complete-route-live-release.json. No bearer tokens or customer record IDs retained in this note.


## UUID detail and print route repair — 2026-09-04

All47 UUID-based page templates and the project layout now validate params
before database/Core consumption. This includes nested variation-order IDs;
validation occurs in pages as well as layouts because their rendering may be
concurrent. Invalid IDs resolve to the existing missing-record screen. Public
portal bearer tokens are not UUIDs and retain their separate validation.

The5 print pages share a repaired layout with no nested HTML document and
scoped print styling. No existing authorization or tenant filter was removed.

Evidence: real `/claims/invalid-id` database crash reproduced before repair;
21 UUID boundary tests, all47 malformed-ID browser paths, and print render
regression passed. Valid weekly-report content inside its sandboxed frame and
print-toolbar hiding passed in browser70170. All67 static dashboard pages and
6 public/auth pages plus anonymous guards passed. Project18 and portal10 replay
PASSED (2028 and13497) after heading fixes and exact denial-message corrections.
No production verification is claimed.

The full page inventory is140:111 dashboard,8 platform,5 print,10 portal and
6 public/auth pages. Dashboard includes2 legacy redirects and42 UUID templates.
Positive project coverage is18 pages; the remaining detail templates have
malformed-ID coverage, not proof of every populated-record or mutation workflow.
Existing platform tests cover its8 pages separately. Handler inventory remains35;
page rendering does not claim full provider or handler workflow verification.

## Integration and health route review — 2026-09-04 05:41

`/platform-admin/integrations` and `/platform-admin/system-health` are read-only
owner-console routes. Open Platform Control → Integrations/System health;
inspect configuration, then resolve provider setup outside tenant workflows.
Both use the independently guarded Core endpoints, private/no-store responses,
runtime response validation and inherited loading/error boundaries. A failed
fetch renders unavailable state rather than success. No credentials are returned,
no setup controls perform writes, and no provider probe is claimed.

Resend notification delivery now requires both `RESEND_API_KEY` and `EMAIL_FROM`
to display configured, matching the actual email service. Missing either displays
unavailable. Four regression cases verify absent/key-only/sender-only/complete
configuration, shared health output and redaction. A key-only case failed before
the fix. Supabase Auth SMTP is separate and cannot be inferred from this card.
Provider telemetry remains explicitly uninstrumented. The nine-case browser
suite passed against the rebuilt empty local fixture database (30554,4.9min),
including these routes at1440/768/320. Production remains unchanged and these
routes are not deployed.

Current local verification checkpoint2026-09-04 03:58: Analytics browser9748 passed at1440/768/320 with persisted source values; Reports and owner/viewer Documents browser67010 passed, as did support lifecycle. Final3507unit tests and Web/Core builds passed. Any earlier "running"/"pending browser" statements below are historical; they are superseded for these specific tests only. This does not mark full140route acceptance or production verification complete. All production statuses remain not deployed.

## Platform analytics — route guide `/platform-admin/analytics`

Purpose: let the verified platform operator inspect current population and operational exceptions across tenants. Reach Platform Control → Analytics. This is not a tenant report: every page fetch and both Core endpoints independently require the sole server-assigned, verified immutable owner. Tenant owner/admin/other roles cannot obtain it; read access does not require support mode, and there are no create/edit/approve/delete/export controls here.

Workflow: open snapshot → compare lifecycle counts and operational exceptions → use tenant/user directories for a specific administrative investigation, explicitly select support context before a mutation. The page fetches `/v1/platform-admin/analytics` and `/v1/platform-admin/analytics/operations` with no-store and validated response schemas; each section independently reports errors instead of replacing missing results with zero. It inherits loading/error boundaries. No jobs, storage changes, notifications, approval decisions or business writes are caused by these reads.

| Display | Persisted source and exact calculation |
| --- | --- |
| Tenants | `tenants`: total and each active/suspended/disabled status |
| Users | `users`: total and active/invited/suspended/disabled membership state |
| Projects | `projects`: all records; separate active status AND deleted_at null count |
| Opportunities | `opportunities`: total; open excludes won/lost/closed_won/closed_lost |
| Documents / recorded bytes | `documents`: count and exact decimal-text SUM(size_bytes); metadata only, not physical Storage reconciliation |
| Awaiting / overdue KYC tracks | `opportunity_kyc_tracks`: status pending or in_review; overdue additionally due_at before database now(). Tracks, not distinct accounts; approved/rejected excluded |
| Flagged KYC tracks | Same source, current status flagged |
| Failed document / generation / indexing jobs | `document_processing_jobs`, `cortex_assistant_generation_jobs`, `cortex_semantic_index_jobs`: current status failed per table; not cumulative retry failures or queue-health measurements |
| Privileged failures / denials | `platform_audit_events`: all-time outcome failed/denied counts; not all application exceptions or unrecorded guard denials |

All aggregates deliberately span tenants only behind the platform guard. They refresh on page load, have no subscription or historical interval, and expose generation timestamp in UTC. Overdue uses timestamp-with-timezone comparison, not browser-local date rounding. No metric implies provider availability. Module-adoption trends, normalized revenue, unified approvals, all server-action errors and live worker health remain explicitly unconnected rather than fabricated.

Verification: real Core/disposable Postgres integration proved401/403, cross-tenant document totals/bytes, current failed jobs, KYC pending versus overdue;9 Web response tests reject invalid totals and preserve large integer bytes. API/Web typechecks passed. Browser source-value/responsiveness proof running28101. Local status: implemented, browser proof pending. Production: not deployed. Remaining: hosted evidence, failed-job detail drill-down, full provider/queue telemetry and remaining requested analytics coverage.

Sources: `apps/api/src/platform-admin/platform-administration.{controller,service}.ts`, `packages/shared-types/src/erp-api/platform-administration.ts`, `apps/web/src/lib/platform-admin-client.ts`, `apps/web/src/app/(platform)/platform-admin/analytics/page.tsx`, integration `apps/api/integration/platform-administration.database.integration.spec.ts`.

## Reports — route guide `/reports`

- Purpose/users: review the current tenant's sales pipeline, gross profit, project/BOM status and billed totals. Reach via permitted navigation or Reports URL; dashboard layout enforces the exact role route policy. No platform cross-tenant authority is used here.
- Workflow: open current snapshot, compare pipeline stages, open Dashboard for operational detail, optionally download pipeline CSV. The export control uses `opportunity.export`; Invoices link uses `canViewPath`. No records are created/edited/approved/deleted from this page and no approval/self-approval rule applies.
- Sources/calculation: `opportunities` active five stages aggregate stored TCV/GP/weighted TCV; closed-won/lost are separated. `projects` counts active/completed; `boms` counts approved/locked and sums non-archived TCV; `invoices` sums non-draft/non-cancelled net amounts and separately those marked paid. Every source query filters the authenticated tenant ID. Paid invoice total is explicitly not partial collections or a cash allocation balance.
- Money is selected as text and calculated with BigInt, preserving centavos beyond JavaScript safe integers. Margin uses signed half-up rounding to one decimal; zero TCV yields a dash. Data is an all-time snapshot refreshed on page load, not a live subscription; there is no date/timezone filter to infer.
- Backend: page server queries plus guarded `/api/exports/opportunities-csv`; upstream opportunities/project/BOM/invoice workflows. No storage/jobs/notification mutation from the report. Export remains tenant/capability guarded; ordinary reads create no business audit mutation.
- States: inherited authentication/permission denial and error retry; own responsive skeleton, explicit all-empty notice, actual totals on success, horizontally scrollable stage table. No unimplemented export promises remain.
- Verification: exact-money/margin unit tests2 and Web typecheck passed. Browser report run1145 last-run artifact passed after compaction but final console count unavailable; focused three-case rerun67010 now covers Reports, support and project Documents. Two-tenant report values and CSV exclusion are browser assertions, not merely HTTP200.
- Local: implemented, principal browser path previously passed; current focused rerun pending. Production: unchanged/not deployed. Remaining: full billing/BOM status scenarios, dataset-scale query performance, retired-project reporting policy review, complete error-state browser matrix and hosted proof.

Sources: `apps/web/src/app/(dashboard)/reports/{page.tsx,loading.tsx,report-format.ts,report-format.test.ts}`, `apps/web/src/app/api/exports/opportunities-csv/route.ts`, `e2e/platform-admin-loopback.spec.ts`.

## Project documents — route guide `/projects/[id]/documents`

- Purpose/users: view and manage evidence belonging to a chosen project. Reach Projects → selected project → Documents, or the global document inventory. All actual tenant roles have document read capability; every role except viewer has `document.manage` under the current authorization registry. No role gains platform access.
- Context/boundary: server finds the requested project by both project ID and tenant ID (missing/foreign project returns not found); document list and quota both filter project+tenant. Tabs now use the actual route policy and label the current page. Upload/delete controls are hidden from viewer; the server action independently denies document.manage failures.
- Workflow: inspect quota and evidence, open/download through `/api/documents/[id]` (tenant lookup + short-lived Storage link); operators choose Upload file, review format-specific processing feedback, inspect extracted evidence/candidate BOM, resolve review/unpriced items before further costing. Deletion requires browser confirmation and an idempotency key; action validates UUID/project/tenant and uses configured Core deletion or the existing atomic audited Web path. Only task-owned fixtures may be deleted during verification.
- Inputs: upload hook enforces100MB limit and supported extensions, server performs intake validation; project quota display defaults500MB and derives used bytes from persisted document metadata. File accept is a convenience, not trusted validation. No instant extraction or priced-BOM guarantee remains.
- Persistence/dependencies: `projects`, `documents`, `scope_items` for related deletion, Storage documents bucket; upload hook → intake APIs → deterministic extraction/CAD worker according to format/configuration. Candidate output requires review. Mutations preserve underlying audit/intake/deletion services. No new notification integration was added or claimed.
- States: own/inherited loading/error boundary; explicit empty state with role-appropriate next action; upload pending/progress/status and errors announced accessibly; confirmed delete and bounded errors; scoped open/download buttons; table/tabs horizontally scroll within the page.
- Verification:13 actual-role visibility tests plus7 existing deletion-action tests passed. Browser owner/viewer empty-state checks at1440/768/320 added and running67010. Local implementation amended; full upload/storage/worker end-to-end proof remains a separate provider/fixture lane, not satisfied by this UI test. Production unchanged. Remaining: large list pagination, provider-backed file lifecycle and full error/accessibility matrix.

Sources: `apps/web/src/app/(dashboard)/projects/[id]/documents/{page.tsx,actions.ts,page.test.tsx,actions.test.ts}`, `components/documents/{upload-button,delete-document-button,quota-bar}.tsx`, `components/cad/use-cad-upload.ts`, `packages/shared-types/src/authorization.ts`.

Linked from [[Third Code ERP Control Center]].

Last updated: 2026-09-04T03:10:00+08:00

## Current repaired route guide

### `/settings` — Workspace and account settings

- Purpose/when: review the current organization identity and your own account; maintain company details before producing business documents. Reach it from Settings navigation. `/settings/profile` handles authenticated password changes separately.
- Actors/access: every authenticated tenant role may view under the exact dashboard route policy. Only tenant owner/admin see or execute workspace Edit. A verified platform owner gets a separate console link; an email match alone does not expose it.
- Workflow: Edit → change company name/TIN/PCAB/DPO fields → Save Changes → updated persisted values. Blank optional fields clear old values. Inline editing is keyboard-labelled, focuses Company Name, announces errors, and disables Save/Cancel while pending.
- Inputs: name trimmed1–255 characters; TIN≤20; PCAB≤50; DPO contact≤255; empty optional values become null. Caller cannot supply tenant or actor. No approval workflow applies to these administrative details.
- Service/persistence: existing `settings/actions.ts::updateTenantSettings`; `getUserProfile` supplies tenant/actor; Drizzle locks the matching `tenants` row. Existing `writeAuditLogInTransaction` commits one tenant audit event with the mutation or both roll back. No notifications/provider calls are needed for a workspace edit.
- Upstream/downstream: authenticated tenant profile → tenant company identity → document/company metadata. Platform link additionally calls `is_platform_owner()`; unavailable authority hides the link and never grants access.
- States: inherited dashboard loading/error boundaries; missing tenant has explicit empty state; invalid/denied/save failures produce bounded messages; provider authority failure leaves normal Settings usable.
- Defects/fixes: D-012 atomic audit, optional-field clearing, exact-role Edit visibility, labelled inline form and removal of obsolete Phase3 claims. Added verified navigation to the independently guarded platform console.
- Verification:9 action tests +7 render/authority tests passed. Browser save/clear/two persisted audit events, field focus and tenant-admin console-link denial passed (98159). Local status: implemented and principal workflow verified. Production status: not deployed. Remaining risk: hosted authenticated proof and complete page-state browser matrix.

Source: `apps/web/src/app/(dashboard)/settings/{page.tsx,actions.ts,page.test.tsx,actions.test.ts}`, `components/settings/edit-tenant-form.tsx`, `lib/audit.ts`; browser `e2e/platform-admin-loopback.spec.ts`.

These are local implementations, not deployed production claims. Tenant pages require the authenticated user's tenant and the exact role policy in `nav-config.ts`; platform pages additionally require the independently verified immutable platform-owner assignment.

| Route | What it does / workflow | Local evidence | Production |
| --- | --- | --- | --- |
| `/platform-admin` | Source-backed organization/user/project counts, current support context, recent privileged audit. Select a tenant to begin support and explicitly end it afterward. | Core/Postgres integration and browser at1440/768/320 passed | Not deployed |
| `/platform-admin/tenants` | Search/paginate organizations; create/configure them; confirm lifecycle changes; enter a reasoned/time-bounded support context. | Real directory and support workflow passed; latest pagination rerun pending | Not deployed |
| `/platform-admin/users` | Search users, find an invitation tenant, invite an ordinary tenant role, change role/status, resend/revoke invitation, request password recovery. | Rendering and API guard tests passed; hosted Auth delivery/template still blocked | Not deployed |
| `/platform-admin/roles` | Inspect tenant-role capability assignments. No tenant role grants global access and no UI assigns platform ownership. | Negative role schema and browser checks passed | Not deployed |
| `/platform-admin/analytics` | Read current persisted lifecycle/project/opportunity counts. Missing trends/revenue instrumentation is not fabricated. | Real database/browser checks passed | Not deployed |
| `/platform-admin/audit` | Search/paginate append-only privileged action evidence and trace/target identifiers. | Support actions persisted and displayed; audit-trigger coverage has open gaps below | Not deployed |
| `/platform-admin/integrations` | Shows configuration presence, never secrets. Configured explicitly does not mean live provider health. | Browser rendering passed; live provider checks separate | Not deployed |
| `/platform-admin/system-health` | Shows API/database admission and dependency configuration; uninstrumented provider checks remain labeled. | Real Core/database route admission passed | Not deployed |
| `/pipeline` | Canonical Kanban using the existing opportunity/stage workflow and capability-gated actions. | Focused tests passed; full stage-transition browser audit remains | Existing live site still uses old route contract |
| `/pipeline/list` | Canonical tabular conversion-stage pipeline. Valid project links or CRM opportunity links for unconverted records. | Existing list tests passed | Not deployed |
| `/pipeline/board` | Permanent308 to `/pipeline`, retaining query parameters. | HTTP browser assertion passed after fixing streamed200 behavior | Not deployed |
| `/pipeline/conversion` | Permanent308 to `/pipeline/list`, retaining query parameters. | HTTP browser assertion passed | Not deployed |
| `/auth/accept-invite` | Verify provider invitation session, choose a password, activate only server-owned tenant/role intent. | Missing-link browser state plus auth/DB activation tests; full hosted delivery acceptance remains | Not deployed |

### Project selectors

Each entry explains the required project context, supports tenant-scoped search/pagination, and links to an existing project workspace. Invalid filters, unavailable data, empty results, and role denial have distinct states. All eleven selectors resolved a real disposable tenant project in browser tests; child-workspace full workflows are not implied by this proof.

| Entry | Workspace destination | Purpose |
| --- | --- | --- |
| `/scope` | `/projects/[id]/scope` | Scope and estimate context |
| `/cost` | `/projects/[id]/cost` | Budget, commitments, actual costs |
| `/cost/budget` | `/projects/[id]/cost/budget` | Project budget management |
| `/checklist` | `/projects/[id]/checklist` | Delivery requirements |
| `/progress` | `/projects/[id]/progress` | Progress reporting |
| `/billing` | `/projects/[id]/billing` | Billing and invoices |
| `/turnover` | `/projects/[id]/turnover` | Project handover |
| `/coc` | `/projects/[id]/coc` | Completion certificate evidence |
| `/comments` | `/projects/[id]/comments` | Project discussion history |
| `/access` | `/projects/[id]/access` | Project access controls |
| `/audit` | `/projects/[id]/audit` | Project activity evidence |

The following baseline sections retain the discovery history. The exact source inventory below lists140pages/35handlers; remaining route-family guides and critical end-to-end workflows are incomplete.

## Status Vocabulary

- Implemented and verified
- Implemented but not fully verified
- Partially implemented
- Placeholder or mocked
- Broken
- Missing
- Blocked by external dependency
- Intentionally unavailable

## Inventory Method

Source of truth: `apps/web/src/app/**/page.tsx` for pages and `apps/web/src/app/**/route.ts` plus the NestJS controller surface for supporting APIs. Route groups are removed from public paths; dynamic segment names are preserved exactly. Framework-only files are excluded from the page count but recorded where they materially define loading, error, unauthorized, not-found, or redirect behavior.

Filesystem enumeration against the production-matching source is complete: 119 page routes and 35 Next.js route handlers. Canonical normalization, support-API mapping, and per-route behavioral verification remain in progress.

## Supplied Minimum Routes

All unique routes in the user mandate are required. Project-context aliases will not be invented; each top-level entry will be traced to its real project selector or `projects/[id]` route.

## Discovered Additional Route Families

Initial evidence adds these families to the required ledger because production page files exist:

- Authentication: `/auth/login`, `/auth/signup`.
- CRM opportunities: list, detail, new PPRF, proposal, proposal PPRF, inspection, design, and change requests.
- Project creation/detail and project variation orders.
- Warranty detail.
- Claim and invoice creation/detail/print/statutory print.
- Inventory receipts and movements with create/detail routes.
- Finance ledger, journals, detail/create/edit routes.
- Procurement root and RFQ/delivery detail/create routes.
- Asset register and asset detail.
- Public token portals for BOM, project, project documents/photos/progress/billing, warranty, CNPS, signing, and PO confirmation.
- Print routes for weekly reports and inspections.

Exact entries and classifications will be generated next; no route is yet marked verified.

## Redirect Ledger

| Source | Required destination | Current evidence | Local | Production |
| --- | --- | --- | --- | --- |
| `/pipeline/board` | `/pipeline` | Page file exists; redirect behavior not yet inspected | NOT RUN | NOT RUN |
| `/pipeline/conversion` | `/pipeline/list` | Page file exists; `/pipeline/list` page not found in initial inventory | NOT RUN | NOT RUN |

Confirmed source behavior: `/pipeline` currently redirects to `/pipeline/conversion`; `/pipeline/board` and `/pipeline/conversion` are full implementations. This conflicts with the required canonical contract and is a P2 remediation item.

## Platform Administration

No `/platform-admin` page, navigation entry, server/API surface, persisted `platform_owner` authority, or platform-owner test exists in the production-matching source. All eight required console pages are missing and form a P1 security/product slice:

- `/platform-admin`
- `/platform-admin/tenants`
- `/platform-admin/users`
- `/platform-admin/roles`
- `/platform-admin/analytics`
- `/platform-admin/audit`
- `/platform-admin/integrations`
- `/platform-admin/system-health`

## Missing Top-Level Project Entry Routes

The source has rich `/projects/[id]/...` pages, but these supplied top-level entries are absent and require evidence-backed project selectors rather than invented global workflows: `/scope`, `/cost`, `/cost/budget`, `/checklist`, `/progress`, `/billing`, `/turnover`, `/coc`, `/comments`, `/access`, and `/audit`.

## Per-Route Evidence Template

Each route entry will record: page name; purpose; intended user; when/how to use; required capability; visible actions and action permissions; request/approval rules; workflow; validation; API/action/service; tables/storage; created/updated records; upstream/downstream; notifications; audits; loading/empty/success/error/permission states; implementation class; defects; fixes; tests; local/production status; remaining risk.

## Implemented slices since initial discovery

- Eight platform routes now implemented; database/HTTP authority test passed. Authenticated browser and production status pending.
- Canonical pipeline pages now exist; legacy board/conversion permanently redirect. 111 focused route/action/middleware tests pass. Production redirects not deployed.
- Eleven missing project-entry selectors now exist with tenant-scoped Core search/pagination and destination-equivalent role policy. Fourteen selector render/negative-state tests pass.
- Added invitation acceptance route. Missing-token browser state verified at 320px; managed invitation/email delivery remains unverified.

## Exact source inventory — 2026-09-04

Discovered 140 pages and 35 Next handlers. This is a **static evidence ledger**, not a claim of route-by-route runtime completion. Dashboard policy tests cover every dashboard page against all 13 tenant roles; platform pages use the separate owner boundary. Direct imports/test siblings below are navigation aids, not complete transitive dependency or workflow proofs.

| Route | Kind / boundary | Source | Direct data/action references | Tests / states | Runtime status |
| --- | --- | --- | --- | --- | --- |
| `/` | page; page-local; inspect individually | [source](apps/web/src/app/page.tsx) | `@/components/marketing/abi-ops-content`<br>`@/components/marketing/abi-ops-landing`<br>`@/lib/landing-structured-data`<br>`@/lib/public-origin` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/access` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/access/page.tsx) | `../_project-entry` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/admin` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/admin/page.tsx) | `@third-code-erp/auth` | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/dashboard?error=forbidden`; local test required |
| `/admin/data-quality` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/admin/data-quality/page.tsx) | `@third-code-erp/auth`<br>`@/lib/admin/data-quality-queries`<br>`./data-quality.module.css` | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/admin?error=forbidden`; local test required |
| `/admin/mapping-config` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/admin/mapping-config/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/admin/mapping-config-form` | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/admin?error=forbidden`; local test required |
| `/admin/material-items` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/admin/material-items/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/admin/material-item-form` | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/admin?error=forbidden`; local test required |
| `/admin/rate-cards` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/admin/rate-cards/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/admin/rate-card-form` | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/admin?error=forbidden`; local test required |
| `/admin/users` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/admin/users/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema` | 1 sibling tests; loading inherited/own; error inherited/own | Redirect → `/admin?error=forbidden`; local test required |
| `/admin/users/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/admin/users/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/admin/manage-user-panel` | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/admin?error=forbidden`; local test required |
| `/admin/users/new` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/admin/users/new/page.tsx) | `@third-code-erp/auth`<br>`@/components/admin/new-user-form` | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/admin?error=forbidden`; local test required |
| `/api/ai/chat` | handler; page-local; inspect individually | [source](apps/web/src/app/api/ai/chat/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/ai`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/ai/similar-items` | handler; page-local; inspect individually | [source](apps/web/src/app/api/ai/similar-items/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/ai`<br>`@/lib/audit` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/auth/callback` | handler; page-local; inspect individually | [source](apps/web/src/app/api/auth/callback/route.ts) | `@/lib/auth-recovery-binding`<br>`./redirect` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/auth/recovery-complete` | handler; page-local; inspect individually | [source](apps/web/src/app/api/auth/recovery-complete/route.ts) | `@/lib/auth-recovery-binding` | 0 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/bom/takeoff-import` | handler; page-local; inspect individually | [source](apps/web/src/app/api/bom/takeoff-import/route.ts) | `@third-code-erp/auth`<br>`@/lib/erp-core-client`<br>`@/lib/safe-action-error`<br>`@/lib/operations/integrations/takeoff` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/bom/togal-commit` | handler; page-local; inspect individually | [source](apps/web/src/app/api/bom/togal-commit/route.ts) | Local implementation | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/bom/togal-import` | handler; page-local; inspect individually | [source](apps/web/src/app/api/bom/togal-import/route.ts) | Local implementation | 0 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/cortex/brief` | handler; page-local; inspect individually | [source](apps/web/src/app/api/cortex/brief/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@/lib/cortex/entity-registry`<br>`@/lib/cortex/rbac` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/cortex/chat` | handler; page-local; inspect individually | [source](apps/web/src/app/api/cortex/chat/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/ai`<br>`@third-code-erp/shared-types` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/cortex/chat/jobs/[jobId]` | handler; page-local; inspect individually | [source](apps/web/src/app/api/cortex/chat/jobs/[jobId]/route.ts) | `@third-code-erp/auth`<br>`@/lib/erp-core-client`<br>`@/lib/cortex/citation-header`<br>`@/lib/cortex/response` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/cortex/conversations` | handler; page-local; inspect individually | [source](apps/web/src/app/api/cortex/conversations/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@/lib/cortex/record-context`<br>`@/lib/cortex/response` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/cortex/conversations/[id]` | handler; page-local; inspect individually | [source](apps/web/src/app/api/cortex/conversations/[id]/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@/lib/cortex/rbac`<br>`@/lib/cortex/record-context` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/cortex/embed` | handler; page-local; inspect individually | [source](apps/web/src/app/api/cortex/embed/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/ai`<br>`@/lib/audit` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/cortex/entity/[refTable]/[refId]` | handler; page-local; inspect individually | [source](apps/web/src/app/api/cortex/entity/[refTable]/[refId]/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/shared-types`<br>`@/lib/cortex/href` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/cortex/graph` | handler; page-local; inspect individually | [source](apps/web/src/app/api/cortex/graph/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/shared-types`<br>`@/lib/cortex/entity-registry` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/cortex/search` | handler; page-local; inspect individually | [source](apps/web/src/app/api/cortex/search/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/shared-types`<br>`@/lib/cortex/entity-registry` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/cortex/semantic-index-jobs` | handler; page-local; inspect individually | [source](apps/web/src/app/api/cortex/semantic-index-jobs/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/shared-types`<br>`@/lib/cortex/response`<br>`@/lib/erp-core-client` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/cortex/semantic-index-jobs/[jobId]` | handler; page-local; inspect individually | [source](apps/web/src/app/api/cortex/semantic-index-jobs/[jobId]/route.ts) | `@third-code-erp/auth`<br>`@/lib/cortex/response`<br>`@/lib/erp-core-client`<br>`@/lib/operations/nav-config` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/crm/opportunities/[id]/inspection-photos` | handler; page-local; inspect individually | [source](apps/web/src/app/api/crm/opportunities/[id]/inspection-photos/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/auth/server`<br>`@/lib/erp-core-client` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/crm/opportunities/[id]/kyc` | handler; page-local; inspect individually | [source](apps/web/src/app/api/crm/opportunities/[id]/kyc/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@third-code-erp/shared-types` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/document-processing/[jobId]` | handler; page-local; inspect individually | [source](apps/web/src/app/api/document-processing/[jobId]/route.ts) | `@third-code-erp/auth`<br>`@/lib/erp-core-client` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/documents/[id]` | handler; page-local; inspect individually | [source](apps/web/src/app/api/documents/[id]/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/auth/server`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema` | 0 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/exports/opportunities-csv` | handler; page-local; inspect individually | [source](apps/web/src/app/api/exports/opportunities-csv/route.ts) | `@third-code-erp/auth`<br>`./opportunity-export` | 2 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/finance/reconciliation/import/sign` | handler; page-local; inspect individually | [source](apps/web/src/app/api/finance/reconciliation/import/sign/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/auth/server`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/health` | handler; page-local; inspect individually | [source](apps/web/src/app/api/health/route.ts) | `@/lib/deployment-revision` | 0 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/inspection/[id]/report` | handler; page-local; inspect individually | [source](apps/web/src/app/api/inspection/[id]/report/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/lib/pdf/site-inspection-report` | 0 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/notifications` | handler; page-local; inspect individually | [source](apps/web/src/app/api/notifications/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/shared-types`<br>`@/lib/erp-core-client` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/ready` | handler; page-local; inspect individually | [source](apps/web/src/app/api/ready/route.ts) | `@third-code-erp/database`<br>`@/lib/deployment-revision` | 0 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/search` | handler; page-local; inspect individually | [source](apps/web/src/app/api/search/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/shared-types`<br>`@third-code-erp/database/schema` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/upload` | handler; page-local; inspect individually | [source](apps/web/src/app/api/upload/route.ts) | Local implementation | 0 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/upload/complete` | handler; page-local; inspect individually | [source](apps/web/src/app/api/upload/complete/route.ts) | `@third-code-erp/auth`<br>`@/lib/cad/parse-and-store`<br>`@/lib/erp-core-client`<br>`@third-code-erp/shared-types` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/upload/sign` | handler; page-local; inspect individually | [source](apps/web/src/app/api/upload/sign/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/auth/server`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/webhooks/docuseal` | handler; page-local; inspect individually | [source](apps/web/src/app/api/webhooks/docuseal/route.ts) | `@third-code-erp/shared-types`<br>`@/lib/operations/notifications`<br>`@/lib/erp-core-client` | 1 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/webhooks/inngest` | handler; page-local; inspect individually | [source](apps/web/src/app/api/webhooks/inngest/route.ts) | `@/lib/inngest`<br>`@/lib/inngest-cadence`<br>`@/lib/inngest-warranty`<br>`@/lib/inngest-sla` | 0 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/api/weekly-report/[id]` | handler; page-local; inspect individually | [source](apps/web/src/app/api/weekly-report/[id]/route.ts) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/lib/reports/weekly-report-template` | 0 sibling tests; Handler-local | Implemented source; runtime audit incomplete |
| `/assets` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/assets/page.tsx) | `@third-code-erp/shared-types`<br>`@third-code-erp/auth`<br>`@/lib/erp-core-client` | 0 sibling tests; loading inherited/own; error inherited/own | Placeholder wording detected; inspect |
| `/assets/[assetId]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/assets/[assetId]/page.tsx) | `@third-code-erp/shared-types`<br>`@third-code-erp/auth`<br>`@/lib/erp-core-client`<br>`./actions` | 0 sibling tests; loading inherited/own; error inherited/own | Placeholder wording detected; inspect |
| `/audit` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/audit/page.tsx) | `../_project-entry` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/auth/accept-invite` | page; auth flow | [source](apps/web/src/app/(auth)/auth/accept-invite/page.tsx) | `./accept-invite-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/auth/forgot-password` | page; auth flow | [source](apps/web/src/app/(auth)/auth/forgot-password/page.tsx) | `./forgot-password-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/auth/login` | page; auth flow | [source](apps/web/src/app/(auth)/auth/login/page.tsx) | `./login-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/auth/signup` | page; auth flow | [source](apps/web/src/app/(auth)/auth/signup/page.tsx) | `./signup-form` | 2 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/auth/update-password` | page; auth flow | [source](apps/web/src/app/(auth)/auth/update-password/page.tsx) | `./recovery-password-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/billing` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/billing/page.tsx) | `../_project-entry` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/bom` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/bom/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/checklist` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/checklist/page.tsx) | `../_project-entry` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/claims` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/claims/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/claims/claim-list-table` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/claims/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/claims/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/claims/claim-detail-header` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/claims/new` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/claims/new/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/claims/claim-form` | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/claims?error=forbidden`; local test required |
| `/coc` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/coc/page.tsx) | `../_project-entry` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/comments` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/comments/page.tsx) | `../_project-entry` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/cortex` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/cortex/page.tsx) | `@third-code-erp/auth`<br>`@/components/auth/account-not-provisioned`<br>`@/components/cortex/cortex-brief-panel`<br>`@/components/cortex/cortex-graph-view` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/cost` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/cost/page.tsx) | `../_project-entry` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/cost/budget` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/cost/budget/page.tsx) | `../../_project-entry` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/crm` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/crm/page.tsx) | Local implementation | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/crm/accounts`; local test required |
| `/crm/accounts` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/crm/accounts/page.tsx) | `@third-code-erp/auth`<br>`@/lib/account-queries` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/crm/accounts/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/crm/accounts/[id]/page.tsx) | `@third-code-erp/auth`<br>`@/components/accounts/kyc-review-form`<br>`@/components/accounts/add-kyc-artifact-form`<br>`@/lib/account-queries` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/crm/accounts/new` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/crm/accounts/new/page.tsx) | `@third-code-erp/auth`<br>`@/components/accounts/new-account-form` | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/crm/accounts?error=forbidden`; local test required |
| `/crm/kyc-queue` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/crm/kyc-queue/page.tsx) | `@third-code-erp/auth`<br>`@/lib/account-queries` | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/crm/accounts?error=forbidden`; local test required |
| `/crm/opportunities` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/crm/opportunities/page.tsx) | Local implementation | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/pipeline`; local test required |
| `/crm/opportunities/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/crm/opportunities/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/shared-types`<br>`@/lib/opportunity-queries` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/crm/opportunities/[id]/proposal` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/proposal/sub-nav` | 2 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/crm/opportunities/[id]/proposal/change-requests` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/change-requests/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/proposal/sub-nav` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/crm/opportunities/[id]/proposal/design` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/design/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/proposal/sub-nav` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/crm/opportunities/[id]/proposal/inspection` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/inspection/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/proposal/sub-nav` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/crm/opportunities/[id]/proposal/pprf` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/pprf/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/proposal/sub-nav` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/crm/opportunities/new/pprf` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/crm/opportunities/new/pprf/page.tsx) | `@third-code-erp/auth`<br>`@/components/proposal/pprf-intake-form` | 2 sibling tests; loading inherited/own; error inherited/own | Redirect → `/crm/accounts?error=forbidden`; local test required |
| `/dashboard` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/dashboard/page.tsx) | `@third-code-erp/auth`<br>`@/lib/dashboard-queries`<br>`@/components/dashboard/kpi-cards`<br>`@/components/dashboard/rep-scorecard` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/documents` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/documents/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/ui/icons` | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/dashboard?error=forbidden`; local test required |
| `/finance` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./setup-controls` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/finance/cash` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/cash/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/lib/erp-core-client` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/finance/cash/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/cash/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./cash-actions` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/finance/cash/new` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/cash/new/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`../cash-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/finance/journals/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/journals/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./journal-actions` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/finance/journals/new` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/journals/new/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./journal-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/finance/ledger` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/ledger/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/lib/erp-core-client` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/finance/payables` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/payables/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/lib/erp-core-client` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/finance/payables/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/payables/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./payable-actions` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/finance/payables/[id]/edit` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/payables/[id]/edit/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`../../payable-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/finance/payables/new` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/payables/new/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`../payable-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/finance/receivables` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/receivables/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/lib/erp-core-client` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/finance/reconciliation` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/reconciliation/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@/lib/erp-core-client` | 2 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/finance/reconciliation/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/reconciliation/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@/lib/erp-core-client`<br>`./statement-actions` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/finance/reconciliation/new` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/finance/reconciliation/new/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`../statement-import-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/inspection/[id]` | page; page-local; inspect individually | [source](apps/web/src/app/(print)/inspection/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/lib/pdf/site-inspection-report` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/inventory` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/inventory/page.tsx) | `@third-code-erp/auth`<br>`./setup-controls`<br>`@/lib/inventory-queries` | 2 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/inventory/movements` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/inventory/movements/page.tsx) | `@third-code-erp/auth`<br>`@/lib/inventory-movement-queries` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/inventory/movements/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/inventory/movements/[id]/page.tsx) | `@third-code-erp/auth`<br>`@/lib/inventory-movement-detail-queries`<br>`../movement-actions` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/inventory/movements/new` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/inventory/movements/new/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`../movement-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/inventory/receipts` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/inventory/receipts/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/inventory/receipts/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/inventory/receipts/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`../../receipt-actions` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/inventory/receipts/new` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/inventory/receipts/new/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`../../receipt-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/invoices` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/invoices/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/invoices/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/invoices/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./invoice-status-actions` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/invoices/[id]/bir2307` | page; page-local; inspect individually | [source](apps/web/src/app/(print)/invoices/[id]/bir2307/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./print-button` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/invoices/[id]/print` | page; page-local; inspect individually | [source](apps/web/src/app/(print)/invoices/[id]/print/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./print-button` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/permits` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/permits/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/pipeline` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/pipeline/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/pipeline/pipeline-board` | 2 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/pipeline/board` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/pipeline/board/page.tsx) | Local implementation | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/pipeline`; local test required |
| `/pipeline/conversion` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/pipeline/conversion/page.tsx) | Local implementation | 1 sibling tests; loading inherited/own; error inherited/own | Redirect → `/pipeline/list`; local test required |
| `/pipeline/coverage` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/pipeline/coverage/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@third-code-erp/shared-types` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/pipeline/list` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/pipeline/list/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@third-code-erp/shared-types` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/platform-admin` | page; platform owner | [source](apps/web/src/app/(platform)/platform-admin/page.tsx) | `@/lib/platform-admin-client`<br>`./actions`<br>`./_components` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/platform-admin/analytics` | page; platform owner | [source](apps/web/src/app/(platform)/platform-admin/analytics/page.tsx) | `@/lib/platform-admin-client`<br>`../_components` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/platform-admin/audit` | page; platform owner | [source](apps/web/src/app/(platform)/platform-admin/audit/page.tsx) | `@/lib/platform-admin-client`<br>`../_components` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/platform-admin/integrations` | page; platform owner | [source](apps/web/src/app/(platform)/platform-admin/integrations/page.tsx) | `@/lib/platform-admin-client`<br>`../_components` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/platform-admin/roles` | page; platform owner | [source](apps/web/src/app/(platform)/platform-admin/roles/page.tsx) | `@/lib/platform-admin-client`<br>`../_components` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/platform-admin/system-health` | page; platform owner | [source](apps/web/src/app/(platform)/platform-admin/system-health/page.tsx) | `@/lib/platform-admin-client`<br>`../_components` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/platform-admin/tenants` | page; platform owner | [source](apps/web/src/app/(platform)/platform-admin/tenants/page.tsx) | `@third-code-erp/shared-types`<br>`@/lib/platform-admin-client`<br>`../actions`<br>`../_components` | 0 sibling tests; loading inherited/own; error inherited/own | Placeholder wording detected; inspect |
| `/platform-admin/users` | page; platform owner | [source](apps/web/src/app/(platform)/platform-admin/users/page.tsx) | `@third-code-erp/shared-types/authorization`<br>`@/lib/platform-admin-client`<br>`../actions`<br>`../_components` | 0 sibling tests; loading inherited/own; error inherited/own | Placeholder wording detected; inspect |
| `/portal/bom/[token]` | page; token boundary; verify individually | [source](apps/web/src/app/portal/bom/[token]/page.tsx) | `./sign-actions` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/portal/cnps/[token]` | page; token boundary; verify individually | [source](apps/web/src/app/portal/cnps/[token]/page.tsx) | `@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./actions` | 0 sibling tests; loading inherited/own; error inherited/own | Placeholder wording detected; inspect |
| `/portal/project/[token]` | page; token boundary; verify individually | [source](apps/web/src/app/portal/project/[token]/page.tsx) | `@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/lib/operations/customer-portal`<br>`@/components/customer-portal/portal-empty` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/portal/project/[token]/billing` | page; token boundary; verify individually | [source](apps/web/src/app/portal/project/[token]/billing/page.tsx) | `@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/lib/operations/customer-portal` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/portal/project/[token]/documents` | page; token boundary; verify individually | [source](apps/web/src/app/portal/project/[token]/documents/page.tsx) | `@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@third-code-erp/auth/server`<br>`@/lib/operations/customer-portal` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/portal/project/[token]/photos` | page; token boundary; verify individually | [source](apps/web/src/app/portal/project/[token]/photos/page.tsx) | `@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@third-code-erp/auth/server`<br>`@/lib/operations/customer-portal` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/portal/project/[token]/progress` | page; token boundary; verify individually | [source](apps/web/src/app/portal/project/[token]/progress/page.tsx) | `@third-code-erp/auth/server`<br>`@/lib/operations/customer-portal`<br>`@/components/progress/s-curve-chart`<br>`@/components/customer-portal/portal-progress-summary` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/portal/purchase-order/[token]/confirmation` | page; token boundary; verify individually | [source](apps/web/src/app/portal/purchase-order/[token]/confirmation/page.tsx) | `@/lib/vendor-confirmation-client`<br>`./vendor-confirmation-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/portal/sign/[token]` | page; token boundary; verify individually | [source](apps/web/src/app/portal/sign/[token]/page.tsx) | `@third-code-erp/database/schema`<br>`@third-code-erp/auth`<br>`@/lib/operations/integrations/canvas-sign`<br>`@/components/canvas-sign/signing-form` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/portal/warranty/[token]` | page; token boundary; verify individually | [source](apps/web/src/app/portal/warranty/[token]/page.tsx) | `@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./actions` | 0 sibling tests; loading inherited/own; error inherited/own | Placeholder wording detected; inspect |
| `/process` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/process/page.tsx) | `@third-code-erp/auth`<br>`@/lib/erp-core-client` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/procurement` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/procurement/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/procurement/add-vendor-form` | 2 sibling tests; loading inherited/own; error inherited/own | Redirect → `/dashboard?error=forbidden`; local test required |
| `/procurement/deliveries` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/procurement/deliveries/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/deliveries/delivery-list-table` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/procurement/deliveries/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/procurement/deliveries/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/deliveries/site-prep-panel` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/procurement/deliveries/new` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/procurement/deliveries/new/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/deliveries/schedule-delivery-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/procurement/rfqs` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/procurement/rfqs/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/rfq/rfq-list-table` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/procurement/rfqs/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/procurement/rfqs/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/rfq/log-quote-form` | 0 sibling tests; loading inherited/own; error inherited/own | Placeholder wording detected; inspect |
| `/progress` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/progress/page.tsx) | `../_project-entry` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/page.tsx) | `@third-code-erp/auth`<br>`@/lib/project-queries`<br>`@/components/projects/project-list-controls` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/page.tsx) | `@third-code-erp/auth`<br>`@/components/opportunities/opportunity-panel`<br>`@/components/ai/project-chat`<br>`@/components/cortex/cortex-entity-panel` | 4 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/access` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/access/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/customer-portal/mint-token-button` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/audit` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/audit/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/lib/erp-core-client` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/billing` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/billing/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/billing/create-invoice-form` | 2 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/bom` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/bom/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/bom/bom-builder` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/bom/togal` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/bom/togal/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/bom/takeoff-import-wizard` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/checklist` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/checklist/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/checklist/checklist-item-row` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/coc` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/coc/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./actions` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/comments` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/comments/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/comments/comment-thread` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/cost` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/cost/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@third-code-erp/shared-types/cost` | 2 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/cost/budget` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/cost/budget/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./budget-workspace` | 3 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/documents` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/documents/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/documents/upload-button` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/permits` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/permits/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/permits/create-permit-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/progress` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/progress/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/progress/s-curve-chart` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/reports` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/reports/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./actions` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/scope` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/scope/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/scope/scope-item-controls` | 2 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/turnover` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/turnover/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./actions` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/vos` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/vos/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/vos/vo-create-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/[id]/vos/[voId]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/[id]/vos/[voId]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/vos/vo-approval-actions` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/projects/new` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/projects/new/page.tsx) | `@third-code-erp/auth`<br>`./new-project-form` | 1 sibling tests; loading inherited/own; error inherited/own | Redirect → `/projects?error=forbidden`; local test required |
| `/punchlist` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/punchlist/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/punchlist/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/punchlist/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/punchlist/punchlist-status-actions` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/punchlist/new` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/punchlist/new/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/punchlist/punchlist-form` | 0 sibling tests; loading inherited/own; error inherited/own | Redirect → `/punchlist?error=forbidden`; local test required |
| `/purchase-orders` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/purchase-orders/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/procurement/create-po-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/purchase-orders/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/purchase-orders/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./po-status-actions` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/purchase-orders/[id]/print` | page; page-local; inspect individually | [source](apps/web/src/app/(print)/purchase-orders/[id]/print/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`./print-button` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/reports` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/reports/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/scope` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/scope/page.tsx) | `../_project-entry` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/settings` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/settings/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/settings/edit-tenant-form` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/settings/profile` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/settings/profile/page.tsx) | `@third-code-erp/auth`<br>`@/lib/operations/nav-config`<br>`./change-password-form` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/tasks` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/tasks/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/tasks/task-row` | 1 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/turnover` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/turnover/page.tsx) | `../_project-entry` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/warranty` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/warranty/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/warranty/[id]` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/warranty/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/components/warranty/ticket-message-thread` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/warranty/cnps` | page; tenant + exact role policy | [source](apps/web/src/app/(dashboard)/warranty/cnps/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
| `/weekly-report/[id]` | page; page-local; inspect individually | [source](apps/web/src/app/(print)/weekly-report/[id]/page.tsx) | `@third-code-erp/auth`<br>`@third-code-erp/database`<br>`@third-code-erp/database/schema`<br>`@/lib/reports/weekly-report-template` | 0 sibling tests; loading inherited/own; error inherited/own | Implemented source; runtime audit incomplete |
