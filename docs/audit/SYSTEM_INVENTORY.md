# System and Connectivity Inventory

- Generated from tracked source at baseline/change worktree: 2026-08-24T10:47:28.973Z.
- Inventory scope: 116 Web pages, 52 Server Action modules, 34 Next API handlers, 133 Nest endpoint decorators, 107 schema modules, 150 ordered SQL migrations.
- Evidence boundary: `BUILT`/`TYPECHECKED` proves static registration only. Runtime, browser, provider and database behavior remains `PARTIALLY VERIFIED` unless cited in the main audit evidence.
- Canonical role/capability matrix: `packages/shared-types/src/authorization.ts`; Web consumes it through `packages/auth/src/server.ts`, Core through `apps/api/src/auth/capability.guard.ts`.

## Web page and route inventory

| Route | Source | Boundary | Loading | Error | Status |
| --- | --- | --- | --- | --- | --- |
| `/auth/login` | `apps/web/src/app/(auth)/auth/login/page.tsx` | UI / LOCAL COMPOSITION | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/auth/signup` | `apps/web/src/app/(auth)/auth/signup/page.tsx` | UI / LOCAL COMPOSITION | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/admin/data-quality` | `apps/web/src/app/(dashboard)/admin/data-quality/page.tsx` | UI / LOCAL COMPOSITION | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/admin/mapping-config` | `apps/web/src/app/(dashboard)/admin/mapping-config/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/admin/material-items` | `apps/web/src/app/(dashboard)/admin/material-items/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/admin` | `apps/web/src/app/(dashboard)/admin/page.tsx` | UI / LOCAL COMPOSITION | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/admin/rate-cards` | `apps/web/src/app/(dashboard)/admin/rate-cards/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/admin/users/[id]` | `apps/web/src/app/(dashboard)/admin/users/[id]/page.tsx` | DIRECT DB COMPATIBILITY | YES | YES | BUILT / PARTIALLY VERIFIED |
| `/admin/users/new` | `apps/web/src/app/(dashboard)/admin/users/new/page.tsx` | UI / LOCAL COMPOSITION | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/admin/users` | `apps/web/src/app/(dashboard)/admin/users/page.tsx` | DIRECT DB COMPATIBILITY | YES | YES | BUILT / PARTIALLY VERIFIED |
| `/assets/[assetId]` | `apps/web/src/app/(dashboard)/assets/[assetId]/page.tsx` | CORE API | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/assets` | `apps/web/src/app/(dashboard)/assets/page.tsx` | CORE API | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/bom` | `apps/web/src/app/(dashboard)/bom/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/claims/[id]` | `apps/web/src/app/(dashboard)/claims/[id]/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/claims/new` | `apps/web/src/app/(dashboard)/claims/new/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/claims` | `apps/web/src/app/(dashboard)/claims/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/cortex` | `apps/web/src/app/(dashboard)/cortex/page.tsx` | UI / LOCAL COMPOSITION | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/crm/accounts/[id]` | `apps/web/src/app/(dashboard)/crm/accounts/[id]/page.tsx` | UI / LOCAL COMPOSITION | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/crm/accounts/new` | `apps/web/src/app/(dashboard)/crm/accounts/new/page.tsx` | UI / LOCAL COMPOSITION | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/crm/accounts` | `apps/web/src/app/(dashboard)/crm/accounts/page.tsx` | UI / LOCAL COMPOSITION | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/crm/kyc-queue` | `apps/web/src/app/(dashboard)/crm/kyc-queue/page.tsx` | UI / LOCAL COMPOSITION | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/crm/opportunities/[id]` | `apps/web/src/app/(dashboard)/crm/opportunities/[id]/page.tsx` | UI / LOCAL COMPOSITION | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/crm/opportunities/[id]/proposal/change-requests` | `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/change-requests/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/crm/opportunities/[id]/proposal/design` | `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/design/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/crm/opportunities/[id]/proposal/inspection` | `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/inspection/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/crm/opportunities/[id]/proposal` | `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/crm/opportunities/[id]/proposal/pprf` | `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/pprf/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/crm/opportunities/new/pprf` | `apps/web/src/app/(dashboard)/crm/opportunities/new/pprf/page.tsx` | UI / LOCAL COMPOSITION | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/crm/opportunities` | `apps/web/src/app/(dashboard)/crm/opportunities/page.tsx` | UI / LOCAL COMPOSITION | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/crm` | `apps/web/src/app/(dashboard)/crm/page.tsx` | UI / LOCAL COMPOSITION | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/dashboard` | `apps/web/src/app/(dashboard)/dashboard/page.tsx` | UI / LOCAL COMPOSITION | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/documents` | `apps/web/src/app/(dashboard)/documents/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/finance/cash/[id]` | `apps/web/src/app/(dashboard)/finance/cash/[id]/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/finance/cash/new` | `apps/web/src/app/(dashboard)/finance/cash/new/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/finance/cash` | `apps/web/src/app/(dashboard)/finance/cash/page.tsx` | HYBRID CORE + DIRECT DB | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/finance/journals/[id]` | `apps/web/src/app/(dashboard)/finance/journals/[id]/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/finance/journals/new` | `apps/web/src/app/(dashboard)/finance/journals/new/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/finance/ledger` | `apps/web/src/app/(dashboard)/finance/ledger/page.tsx` | HYBRID CORE + DIRECT DB | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/finance` | `apps/web/src/app/(dashboard)/finance/page.tsx` | DIRECT DB COMPATIBILITY | YES | YES | BUILT / PARTIALLY VERIFIED |
| `/finance/payables/[id]/edit` | `apps/web/src/app/(dashboard)/finance/payables/[id]/edit/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/finance/payables/[id]` | `apps/web/src/app/(dashboard)/finance/payables/[id]/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/finance/payables/new` | `apps/web/src/app/(dashboard)/finance/payables/new/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/finance/payables` | `apps/web/src/app/(dashboard)/finance/payables/page.tsx` | HYBRID CORE + DIRECT DB | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/finance/receivables` | `apps/web/src/app/(dashboard)/finance/receivables/page.tsx` | HYBRID CORE + DIRECT DB | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/finance/reconciliation/[id]` | `apps/web/src/app/(dashboard)/finance/reconciliation/[id]/page.tsx` | HYBRID CORE + DIRECT DB | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/finance/reconciliation/new` | `apps/web/src/app/(dashboard)/finance/reconciliation/new/page.tsx` | HYBRID CORE + DIRECT DB | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/finance/reconciliation` | `apps/web/src/app/(dashboard)/finance/reconciliation/page.tsx` | HYBRID CORE + DIRECT DB | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/inventory/movements/[id]` | `apps/web/src/app/(dashboard)/inventory/movements/[id]/page.tsx` | UI / LOCAL COMPOSITION | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/inventory/movements/new` | `apps/web/src/app/(dashboard)/inventory/movements/new/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/inventory/movements` | `apps/web/src/app/(dashboard)/inventory/movements/page.tsx` | UI / LOCAL COMPOSITION | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/inventory` | `apps/web/src/app/(dashboard)/inventory/page.tsx` | UI / LOCAL COMPOSITION | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/inventory/receipts/[id]` | `apps/web/src/app/(dashboard)/inventory/receipts/[id]/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/inventory/receipts/new` | `apps/web/src/app/(dashboard)/inventory/receipts/new/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/inventory/receipts` | `apps/web/src/app/(dashboard)/inventory/receipts/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/invoices/[id]` | `apps/web/src/app/(dashboard)/invoices/[id]/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/invoices` | `apps/web/src/app/(dashboard)/invoices/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/permits` | `apps/web/src/app/(dashboard)/permits/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/pipeline/board` | `apps/web/src/app/(dashboard)/pipeline/board/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/pipeline/conversion` | `apps/web/src/app/(dashboard)/pipeline/conversion/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/pipeline/coverage` | `apps/web/src/app/(dashboard)/pipeline/coverage/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/pipeline` | `apps/web/src/app/(dashboard)/pipeline/page.tsx` | UI / LOCAL COMPOSITION | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/process` | `apps/web/src/app/(dashboard)/process/page.tsx` | CORE API | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/procurement/deliveries/[id]` | `apps/web/src/app/(dashboard)/procurement/deliveries/[id]/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/procurement/deliveries/new` | `apps/web/src/app/(dashboard)/procurement/deliveries/new/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/procurement/deliveries` | `apps/web/src/app/(dashboard)/procurement/deliveries/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/procurement` | `apps/web/src/app/(dashboard)/procurement/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/procurement/rfqs/[id]` | `apps/web/src/app/(dashboard)/procurement/rfqs/[id]/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/procurement/rfqs` | `apps/web/src/app/(dashboard)/procurement/rfqs/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/access` | `apps/web/src/app/(dashboard)/projects/[id]/access/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/audit` | `apps/web/src/app/(dashboard)/projects/[id]/audit/page.tsx` | HYBRID CORE + DIRECT DB | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/billing` | `apps/web/src/app/(dashboard)/projects/[id]/billing/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/bom` | `apps/web/src/app/(dashboard)/projects/[id]/bom/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/bom/togal` | `apps/web/src/app/(dashboard)/projects/[id]/bom/togal/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/checklist` | `apps/web/src/app/(dashboard)/projects/[id]/checklist/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/coc` | `apps/web/src/app/(dashboard)/projects/[id]/coc/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/comments` | `apps/web/src/app/(dashboard)/projects/[id]/comments/page.tsx` | HYBRID CORE + DIRECT DB | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/cost/budget` | `apps/web/src/app/(dashboard)/projects/[id]/cost/budget/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/cost` | `apps/web/src/app/(dashboard)/projects/[id]/cost/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/documents` | `apps/web/src/app/(dashboard)/projects/[id]/documents/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]` | `apps/web/src/app/(dashboard)/projects/[id]/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/permits` | `apps/web/src/app/(dashboard)/projects/[id]/permits/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/progress` | `apps/web/src/app/(dashboard)/projects/[id]/progress/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/reports` | `apps/web/src/app/(dashboard)/projects/[id]/reports/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/scope` | `apps/web/src/app/(dashboard)/projects/[id]/scope/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/turnover` | `apps/web/src/app/(dashboard)/projects/[id]/turnover/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/vos/[voId]` | `apps/web/src/app/(dashboard)/projects/[id]/vos/[voId]/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/[id]/vos` | `apps/web/src/app/(dashboard)/projects/[id]/vos/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/projects/new` | `apps/web/src/app/(dashboard)/projects/new/page.tsx` | UI / LOCAL COMPOSITION | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/projects` | `apps/web/src/app/(dashboard)/projects/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/punchlist/[id]` | `apps/web/src/app/(dashboard)/punchlist/[id]/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/punchlist/new` | `apps/web/src/app/(dashboard)/punchlist/new/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/punchlist` | `apps/web/src/app/(dashboard)/punchlist/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/purchase-orders/[id]` | `apps/web/src/app/(dashboard)/purchase-orders/[id]/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/purchase-orders` | `apps/web/src/app/(dashboard)/purchase-orders/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/reports` | `apps/web/src/app/(dashboard)/reports/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/settings` | `apps/web/src/app/(dashboard)/settings/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/tasks` | `apps/web/src/app/(dashboard)/tasks/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/warranty/[id]` | `apps/web/src/app/(dashboard)/warranty/[id]/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/warranty/cnps` | `apps/web/src/app/(dashboard)/warranty/cnps/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/warranty` | `apps/web/src/app/(dashboard)/warranty/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/inspection/[id]` | `apps/web/src/app/(print)/inspection/[id]/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/invoices/[id]/bir2307` | `apps/web/src/app/(print)/invoices/[id]/bir2307/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/invoices/[id]/print` | `apps/web/src/app/(print)/invoices/[id]/print/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/purchase-orders/[id]/print` | `apps/web/src/app/(print)/purchase-orders/[id]/print/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/weekly-report/[id]` | `apps/web/src/app/(print)/weekly-report/[id]/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/` | `apps/web/src/app/page.tsx` | UI / LOCAL COMPOSITION | YES | YES | BUILT / PARTIALLY VERIFIED |
| `/portal/bom/[token]` | `apps/web/src/app/portal/bom/[token]/page.tsx` | EXTERNAL / PLATFORM INTEGRATION | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/portal/cnps/[token]` | `apps/web/src/app/portal/cnps/[token]/page.tsx` | DIRECT DB COMPATIBILITY | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/portal/project/[token]/billing` | `apps/web/src/app/portal/project/[token]/billing/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/portal/project/[token]/documents` | `apps/web/src/app/portal/project/[token]/documents/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/portal/project/[token]` | `apps/web/src/app/portal/project/[token]/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/portal/project/[token]/photos` | `apps/web/src/app/portal/project/[token]/photos/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/portal/project/[token]/progress` | `apps/web/src/app/portal/project/[token]/progress/page.tsx` | UI / LOCAL COMPOSITION | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/portal/purchase-order/[token]/confirmation` | `apps/web/src/app/portal/purchase-order/[token]/confirmation/page.tsx` | UI / LOCAL COMPOSITION | NO | NO | BUILT / PARTIALLY VERIFIED |
| `/portal/sign/[token]` | `apps/web/src/app/portal/sign/[token]/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |
| `/portal/warranty/[token]` | `apps/web/src/app/portal/warranty/[token]/page.tsx` | DIRECT DB COMPATIBILITY | YES | NO | BUILT / PARTIALLY VERIFIED |

## Server Action export inventory

| Source | Exported actions | Boundary | Authorization marker | Status |
| --- | --- | --- | --- | --- |
| `apps/web/src/app/(dashboard)/admin/mapping-config/actions.ts` | `deleteMappingConfig`<br>`upsertMappingConfig` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/admin/material-items/actions.ts` | `deactivateMaterialItem`<br>`upsertMaterialItem` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/admin/rate-cards/actions.ts` | `deleteRateCard`<br>`upsertRateCard` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/admin/users/actions.ts` | `createUser`<br>`deleteUser`<br>`resetUserPassword`<br>`updateUserRole` | HYBRID CORE + DIRECT DB | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/assets/[assetId]/actions.ts` | `createAssetMaintenance` | CORE API | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/bom/[bomId]/portal-actions.ts` | `mintBomPortalToken` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/claims/[id]/actions.ts` | `attachClaimDocument`<br>`cancelClaim`<br>`handoverToFinance`<br>`linkInvoice`<br>`markCertificatePending`<br>`recordCertification`<br>`recordPayment`<br>`rejectClaim`<br>`submitClaim` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/claims/actions.ts` | `createClaim` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/crm/accounts/actions.ts` | `addKycArtifact`<br>`createAccount`<br>`reviewKyc` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/actions.ts` | `addInspectionRfi`<br>`approveWithoutChanges`<br>`getLatestPprf`<br>`logChangeRequest`<br>`markDesignApproved`<br>`markDesignReady`<br>`resolveChangeRequest`<br>`submitInspection`<br>`submitPprf`<br>`uploadDesignFile` | HYBRID CORE + DIRECT DB | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/crm/opportunities/[id]/proposal/kyc-actions.ts` | `updateOpportunityKycTrack` | UI / LOCAL COMPOSITION | AUTH MARKER; PER-ACTION POLICY REVIEW REQUIRED | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/crm/opportunities/new/pprf/actions.ts` | `createPprfIntake` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/finance/actions.ts` | `assignInventorySystemAccount`<br>`assignPayablesSystemAccount`<br>`assignReceivablesSystemAccount`<br>`closeFiscalPeriod`<br>`createCashAccount`<br>`createFiscalPeriod`<br>`createJournalDraft`<br>`createLedgerAccount`<br>`postJournalEntry`<br>`reverseJournalEntry` | HYBRID CORE + DIRECT DB | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/finance/cash/actions.ts` | `deleteCashDraft`<br>`postCashTransaction`<br>`reverseCashTransaction`<br>`saveCashDraft` | HYBRID CORE + DIRECT DB | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/finance/payables/actions.ts` | `deleteSupplierBillDraft`<br>`postSupplierBill`<br>`reverseSupplierBill`<br>`saveSupplierBillDraft` | HYBRID CORE + DIRECT DB | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/finance/reconciliation/actions.ts` | `autoMatchBankStatement`<br>`createBankStatement`<br>`deleteBankStatementDraft`<br>`matchBankStatementLine`<br>`reconcileBankStatement`<br>`unmatchBankStatementLine`<br>`voidBankStatement` | HYBRID CORE + DIRECT DB | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/inventory/actions.ts` | `configureInventoryItem`<br>`createStockReceipt`<br>`createUnitOfMeasure`<br>`createWarehouse`<br>`deleteStockReceiptDraft`<br>`postStockReceipt`<br>`reverseStockReceipt`<br>`updateUnitOfMeasure`<br>`updateWarehouse` | HYBRID CORE + DIRECT DB | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/inventory/movements/actions.ts` | `createStockMovement`<br>`deleteStockMovementDraft`<br>`postStockMovement`<br>`reverseStockMovement` | HYBRID CORE + DIRECT DB | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/invoices/actions.ts` | `cancelDraftInvoice`<br>`issueCustomerInvoice`<br>`reverseCustomerInvoice` | HYBRID CORE + DIRECT DB | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/pipeline/actions.ts` | `advanceOpportunityStage`<br>`createOpportunity`<br>`createOpportunityForAccount` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/procurement/actions.ts` | `advancePoStatus`<br>`assignPoLineCostCode`<br>`commercialApprovePo`<br>`createInvoice`<br>`createPoFromBom`<br>`createPosFromBomGrouped`<br>`createStandalonePo`<br>`createVendor`<br>`pmApprovePo`<br>`receivePoLineItem`<br>`rejectPoApproval`<br>`scmIssuePo`<br>`submitPoForPmApproval` | HYBRID CORE + DIRECT DB | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/procurement/deliveries/actions.ts` | `cancelDelivery`<br>`completeInspection`<br>`markInTransit`<br>`markSitePreparing`<br>`markSiteReady`<br>`recordReceipt`<br>`scheduleDelivery`<br>`startInspection` | HYBRID CORE + DIRECT DB | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/procurement/rfqs/actions.ts` | `awardRfqQuote`<br>`cancelRfq`<br>`completeRfq`<br>`createRfqFromBom`<br>`logQuote` | CORE API | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/access/actions.ts` | `mintCustomerPortalAccess`<br>`revokeCustomerPortalAccess` | DIRECT DB COMPATIBILITY | AUTH MARKER; PER-ACTION POLICY REVIEW REQUIRED | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/actions.ts` | `retireProject`<br>`updateProject` | CORE API | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/billing/actions.ts` | `createInvoice` | CORE API | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/bom/actions.ts` | `addBomLineItem`<br>`approveBom`<br>`createBom`<br>`createProjectLocation`<br>`deleteBomLineItem`<br>`fetchLineSupplierContext`<br>`fetchProjectForecastTcv`<br>`listBomLocationRollup`<br>`listPendingBomGrainReviews`<br>`listPendingBomLocationReviews`<br>`listProjectLocations`<br>`resolveBomGrainReview`<br>`resolveBomLocationReview`<br>`setBomLineLocation`<br>`setLineItemVendor`<br>`upsertDupaForBomLine` | HYBRID CORE + DIRECT DB | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/bom/award-actions.ts` | `awardLockedBom`<br>`reverseAwardHandoff` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/checklist/actions.ts` | `updateChecklistItemStatus`<br>`updateChecklistItemStatusForm` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/coc/actions.ts` | `draftCoc`<br>`recordCocSigned`<br>`sendCocForSignature` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/comments/actions.ts` | `createComment`<br>`deleteComment` | HYBRID CORE + DIRECT DB | NO CANONICAL AUTH MARKER FOUND | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/cost/actions.ts` | `createCostEntry`<br>`deleteCostEntry` | CORE API | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/cost/budget/actions.ts` | `approveProjectBudget`<br>`createCostCode`<br>`createProjectBudget`<br>`rejectProjectBudget`<br>`reviseProjectBudget`<br>`saveProjectBudget`<br>`submitProjectBudget` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/documents/actions.ts` | `deleteDocument` | HYBRID CORE + DIRECT DB | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/opportunities/actions.ts` | `createOpportunity`<br>`transitionStage` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/permits/actions.ts` | `createPermit`<br>`escalatePermit`<br>`recordMobilizationInput`<br>`startMobilization`<br>`updatePermitStatus`<br>`updatePermitStatusForm` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/progress/actions.ts` | `importMasterSchedule`<br>`loadProgressContext`<br>`submitWeeklyProgress` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/reports/actions.ts` | `generateThisWeekReport`<br>`regenerateWeeklyReport` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/scope/actions.ts` | `addScopeItem`<br>`deleteScopeItem`<br>`updateScopeItemCost` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/turnover/actions.ts` | `attachTurnoverDocument`<br>`markTurnoverCompiled` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/[id]/vos/actions.ts` | `createVo`<br>`getVoById`<br>`listProjectVos`<br>`recordVoSigned`<br>`rejectVo`<br>`submitVoForClientSignature`<br>`submitVoForCommercialPricing` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/projects/new/actions.ts` | `createProject` | CORE API | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/punchlist/actions.ts` | `addPunchlistPhoto`<br>`createPunchlistItem`<br>`signOffPunchlistItem`<br>`updatePunchlistStatus` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/settings/actions.ts` | `updateTenantSettings` | DIRECT DB COMPATIBILITY | AUTH MARKER; PER-ACTION POLICY REVIEW REQUIRED | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/tasks/actions.ts` | `completeTask`<br>`triggerDailyGeneration` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/(dashboard)/warranty/actions.ts` | `acknowledgeTicket`<br>`closeTicket`<br>`markTicketInProgress`<br>`mintWarrantyPortalToken`<br>`postTicketMessage`<br>`scheduleTicketRepair` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/portal/bom/[token]/sign-actions.ts` | `loadPortalBom`<br>`recordSign` | DIRECT DB COMPATIBILITY | NO CANONICAL AUTH MARKER FOUND | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/portal/cnps/[token]/actions.ts` | `submitCnpsRating` | DIRECT DB COMPATIBILITY | NO CANONICAL AUTH MARKER FOUND | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/portal/project/[token]/actions.ts` | `logView` | UI / LOCAL COMPOSITION | NO CANONICAL AUTH MARKER FOUND | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/portal/purchase-order/[token]/confirmation/actions.ts` | `submitVendorConfirmationAction` | UI / LOCAL COMPOSITION | NO CANONICAL AUTH MARKER FOUND | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/portal/sign/[token]/actions.ts` | `recordCanvasSign` | HYBRID CORE + DIRECT DB | NO CANONICAL AUTH MARKER FOUND | TYPECHECKED / PARTIALLY VERIFIED |
| `apps/web/src/app/portal/warranty/[token]/actions.ts` | `submitTicket` | DIRECT DB COMPATIBILITY | NO CANONICAL AUTH MARKER FOUND | TYPECHECKED / PARTIALLY VERIFIED |

## Next route-handler inventory

| Route | Methods | Source | Boundary | Authorization marker | Status |
| --- | --- | --- | --- | --- | --- |
| `/api/ai/chat` | POST | `apps/web/src/app/api/ai/chat/route.ts` | DIRECT DB COMPATIBILITY | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/ai/similar-items` | POST | `apps/web/src/app/api/ai/similar-items/route.ts` | DIRECT DB COMPATIBILITY | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/auth/callback` | GET | `apps/web/src/app/api/auth/callback/route.ts` | UI / LOCAL COMPOSITION | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/bom/takeoff-import` | POST | `apps/web/src/app/api/bom/takeoff-import/route.ts` | CORE API | AUTH + CAPABILITY/RBAC MARKER | BUILT / PARTIALLY VERIFIED |
| `/api/bom/togal-commit` | POST | `apps/web/src/app/api/bom/togal-commit/route.ts` | UI / LOCAL COMPOSITION | NO CANONICAL AUTH MARKER FOUND | BUILT / PARTIALLY VERIFIED |
| `/api/bom/togal-import` | POST | `apps/web/src/app/api/bom/togal-import/route.ts` | UI / LOCAL COMPOSITION | NO CANONICAL AUTH MARKER FOUND | BUILT / PARTIALLY VERIFIED |
| `/api/cortex/brief` | GET | `apps/web/src/app/api/cortex/brief/route.ts` | HYBRID CORE + DIRECT DB | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/cortex/chat/jobs/[jobId]` | DELETE, GET | `apps/web/src/app/api/cortex/chat/jobs/[jobId]/route.ts` | CORE API | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/cortex/chat` | POST | `apps/web/src/app/api/cortex/chat/route.ts` | HYBRID CORE + DIRECT DB | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/cortex/conversations/[id]` | GET | `apps/web/src/app/api/cortex/conversations/[id]/route.ts` | HYBRID CORE + DIRECT DB | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/cortex/conversations` | GET | `apps/web/src/app/api/cortex/conversations/route.ts` | HYBRID CORE + DIRECT DB | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/cortex/embed` | POST | `apps/web/src/app/api/cortex/embed/route.ts` | HYBRID CORE + DIRECT DB | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/cortex/entity/[refTable]/[refId]` | GET | `apps/web/src/app/api/cortex/entity/[refTable]/[refId]/route.ts` | HYBRID CORE + DIRECT DB | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/cortex/graph` | GET | `apps/web/src/app/api/cortex/graph/route.ts` | HYBRID CORE + DIRECT DB | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/cortex/search` | GET | `apps/web/src/app/api/cortex/search/route.ts` | HYBRID CORE + DIRECT DB | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/cortex/semantic-index-jobs/[jobId]` | GET | `apps/web/src/app/api/cortex/semantic-index-jobs/[jobId]/route.ts` | CORE API | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/cortex/semantic-index-jobs` | POST | `apps/web/src/app/api/cortex/semantic-index-jobs/route.ts` | CORE API | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/crm/opportunities/[id]/inspection-photos` | POST | `apps/web/src/app/api/crm/opportunities/[id]/inspection-photos/route.ts` | CORE API | AUTH + CAPABILITY/RBAC MARKER | BUILT / PARTIALLY VERIFIED |
| `/api/crm/opportunities/[id]/kyc` | GET, POST | `apps/web/src/app/api/crm/opportunities/[id]/kyc/route.ts` | DIRECT DB COMPATIBILITY | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/document-processing/[jobId]` | GET | `apps/web/src/app/api/document-processing/[jobId]/route.ts` | CORE API | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/documents/[id]` | GET | `apps/web/src/app/api/documents/[id]/route.ts` | DIRECT DB COMPATIBILITY | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/exports/opportunities-csv` | GET | `apps/web/src/app/api/exports/opportunities-csv/route.ts` | UI / LOCAL COMPOSITION | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/finance/reconciliation/import/sign` | DELETE, POST | `apps/web/src/app/api/finance/reconciliation/import/sign/route.ts` | HYBRID CORE + DIRECT DB | AUTH + CAPABILITY/RBAC MARKER | BUILT / PARTIALLY VERIFIED |
| `/api/health` | NO STATIC METHOD EXPORT FOUND | `apps/web/src/app/api/health/route.ts` | UI / LOCAL COMPOSITION | NON-SESSION INGRESS; DEDICATED AUTH REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/inspection/[id]/report` | GET | `apps/web/src/app/api/inspection/[id]/report/route.ts` | DIRECT DB COMPATIBILITY | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/notifications` | GET, POST | `apps/web/src/app/api/notifications/route.ts` | CORE API | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/ready` | GET | `apps/web/src/app/api/ready/route.ts` | DIRECT DB COMPATIBILITY | NO CANONICAL AUTH MARKER FOUND | BUILT / PARTIALLY VERIFIED |
| `/api/search` | GET | `apps/web/src/app/api/search/route.ts` | HYBRID CORE + DIRECT DB | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/upload/complete` | POST | `apps/web/src/app/api/upload/complete/route.ts` | CORE API | AUTH + CAPABILITY/RBAC MARKER | BUILT / PARTIALLY VERIFIED |
| `/api/upload` | POST | `apps/web/src/app/api/upload/route.ts` | UI / LOCAL COMPOSITION | NO CANONICAL AUTH MARKER FOUND | BUILT / PARTIALLY VERIFIED |
| `/api/upload/sign` | POST | `apps/web/src/app/api/upload/sign/route.ts` | DIRECT DB COMPATIBILITY | AUTH + CAPABILITY/RBAC MARKER | BUILT / PARTIALLY VERIFIED |
| `/api/webhooks/docuseal` | POST | `apps/web/src/app/api/webhooks/docuseal/route.ts` | CORE API | NON-SESSION INGRESS; DEDICATED AUTH REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/webhooks/inngest` | NO STATIC METHOD EXPORT FOUND | `apps/web/src/app/api/webhooks/inngest/route.ts` | EXTERNAL / PLATFORM INTEGRATION | NON-SESSION INGRESS; DEDICATED AUTH REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |
| `/api/weekly-report/[id]` | GET | `apps/web/src/app/api/weekly-report/[id]/route.ts` | DIRECT DB COMPATIBILITY | AUTH MARKER; HANDLER POLICY REVIEW REQUIRED | BUILT / PARTIALLY VERIFIED |

## Nest Core endpoint inventory

| Verb | Route | Method | Controller source | Authorization marker | Status |
| --- | --- | --- | --- | --- | --- |
| GET | `/(dynamic controller path)/health` | `health` | `apps/api/src/health/health.controller.ts` | PUBLIC MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/(dynamic controller path)/ready` | `ready` | `apps/api/src/health/health.controller.ts` | PUBLIC MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/(dynamic controller path)/v1/cortex/semantic-index-jobs` | `HttpCode` | `apps/api/src/cortex/cortex-semantic-index.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/(dynamic controller path)/v1/cortex/semantic-index-jobs/:jobId` | `HttpCode` | `apps/api/src/cortex/cortex-semantic-index.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/(dynamic controller path)/v1/document-processing-jobs/:jobId` | `HttpCode` | `apps/api/src/cad/document-processing.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/(dynamic controller path)/v1/documents/:documentId/processing-jobs` | `HttpCode` | `apps/api/src/cad/document-processing.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| PATCH | `/v1/admin/users/:userId/role` | `RequireCapabilities` | `apps/api/src/admin/user-role-assignment.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/assets` | `RequireCapabilities` | `apps/api/src/assets/assets.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/assets/:assetId` | `RequireCapabilities` | `apps/api/src/assets/assets.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/assets/:assetId/maintenance` | `RequireCapabilities` | `apps/api/src/assets/asset-maintenance.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/assets/:assetId/maintenance` | `HttpCode` | `apps/api/src/assets/asset-maintenance.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/assets/maintenance/due` | `RequireCapabilities` | `apps/api/src/assets/asset-maintenance-due.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/audit/activity` | `RequireCapabilities` | `apps/api/src/audit/audit-activity.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/boms/takeoff-import` | `HttpCode` | `apps/api/src/cad/takeoff-import.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/cortex/brief` | `RequireCapabilities` | `apps/api/src/cortex/cortex-brief.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/cortex/chat-retrieval` | `RequireCapabilities` | `apps/api/src/cortex/cortex-chat-retrieval.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/cortex/conversation-context` | `RequireCapabilities` | `apps/api/src/cortex/cortex-conversation-context.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/cortex/conversations` | `RequireCapabilities` | `apps/api/src/cortex/cortex-conversations.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/cortex/conversations/:id` | `RequireCapabilities` | `apps/api/src/cortex/cortex-conversations.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/cortex/conversations/assistant-turns/claims` | `RequireCapabilities` | `apps/api/src/cortex/cortex-conversations.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/cortex/conversations/assistant-turns/complete` | `RequireCapabilities` | `apps/api/src/cortex/cortex-conversations.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/cortex/conversations/assistant-turns/jobs` | `RequireCapabilities` | `apps/api/src/cortex/cortex-assistant-generation.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/cortex/conversations/assistant-turns/jobs/:jobId` | `HttpCode` | `apps/api/src/cortex/cortex-assistant-generation.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/cortex/conversations/assistant-turns/jobs/:jobId/cancel` | `HttpCode` | `apps/api/src/cortex/cortex-assistant-generation.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/cortex/conversations/assistant-turns/jobs/:jobId/result` | `HttpCode` | `apps/api/src/cortex/cortex-assistant-generation.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/cortex/conversations/user-turns` | `RequireCapabilities` | `apps/api/src/cortex/cortex-conversations.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/cortex/entity/:refTable/:refId` | `RequireCapabilities` | `apps/api/src/cortex/cortex-entity.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/cortex/graph` | `RequireCapabilities` | `apps/api/src/cortex/cortex-graph.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/cortex/provider-health` | `RequireCapabilities` | `apps/api/src/cortex/cortex-assistant-provider-health.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/cortex/search` | `RequireCapabilities` | `apps/api/src/cortex/cortex-search.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/crm/accounts` | `RequireCapabilities` | `apps/api/src/crm/accounts.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/crm/accounts/:accountId` | `RequireCapabilities` | `apps/api/src/crm/accounts.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/crm/accounts/kyc-queue` | `RequireCapabilities` | `apps/api/src/crm/accounts.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/crm/opportunities/:opportunityId` | `RequireCapabilities` | `apps/api/src/crm/opportunities.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/crm/opportunities/:opportunityId/change-requests` | `HttpCode` | `apps/api/src/crm/change-requests.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/crm/opportunities/:opportunityId/convert-to-project` | `HttpCode` | `apps/api/src/crm/opportunity-project-conversion.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/crm/opportunities/:opportunityId/stage-transition` | `HttpCode` | `apps/api/src/crm/opportunity-stage-transition.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/documents` | `HttpCode` | `apps/api/src/documents/document-intake.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| DELETE | `/v1/documents/:documentId` | `HttpCode` | `apps/api/src/documents/document-delete.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/documents/:documentId/cad-evidence` | `HttpCode` | `apps/api/src/cad/cad-evidence-commit.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/finance/cash-transactions` | `RequireCapabilities` | `apps/api/src/finance/finance-cash.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| DELETE | `/v1/finance/cash-transactions/:cashTransactionId/draft` | `HttpCode` | `apps/api/src/finance/cash-draft.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/cash-transactions/:cashTransactionId/post` | `HttpCode` | `apps/api/src/finance/cash-transaction-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/cash-transactions/:cashTransactionId/reverse` | `HttpCode` | `apps/api/src/finance/cash-transaction-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/cash-transactions/drafts` | `HttpCode` | `apps/api/src/finance/cash-draft.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/customer-invoices/:invoiceId/cancel` | `HttpCode` | `apps/api/src/finance/customer-invoice-cancel.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/customer-invoices/:invoiceId/issue` | `HttpCode` | `apps/api/src/finance/customer-invoice-issue.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/customer-invoices/:invoiceId/reverse` | `HttpCode` | `apps/api/src/finance/customer-invoice-reverse.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/journals/:journalEntryId/post` | `HttpCode` | `apps/api/src/finance/journal-post.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/journals/:journalEntryId/reverse` | `HttpCode` | `apps/api/src/finance/journal-reverse.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/finance/ledger` | `RequireCapabilities` | `apps/api/src/finance/finance-ledger.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/finance/payables` | `RequireCapabilities` | `apps/api/src/finance/finance-payables.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/finance/receivables` | `RequireCapabilities` | `apps/api/src/finance/finance-receivables.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/finance/reconciliation` | `RequireCapabilities` | `apps/api/src/finance/finance-reconciliation.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/finance/reconciliation/:statementId` | `RequireCapabilities` | `apps/api/src/finance/finance-reconciliation.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/reconciliation/:statementId/auto-match` | `HttpCode` | `apps/api/src/finance/finance-reconciliation-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/reconciliation/:statementId/lines/:lineId/match` | `HttpCode` | `apps/api/src/finance/finance-reconciliation-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/reconciliation/:statementId/lines/:lineId/unmatch` | `HttpCode` | `apps/api/src/finance/finance-reconciliation-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/reconciliation/:statementId/reconcile` | `HttpCode` | `apps/api/src/finance/finance-reconciliation-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/reconciliation/:statementId/void` | `HttpCode` | `apps/api/src/finance/finance-reconciliation-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/reconciliation/import` | `HttpCode` | `apps/api/src/finance/finance-reconciliation-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| DELETE | `/v1/finance/reconciliation/import/storage` | `HttpCode` | `apps/api/src/finance/finance-reconciliation-storage.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/reconciliation/import/storage/sign` | `HttpCode` | `apps/api/src/finance/finance-reconciliation-storage.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/supplier-bills/:supplierBillId/post` | `HttpCode` | `apps/api/src/finance/supplier-bill-post.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/finance/supplier-bills/:supplierBillId/reverse` | `HttpCode` | `apps/api/src/finance/supplier-bill-reverse.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| PATCH | `/v1/inventory/items/:materialItemId/configuration` | `RequireCapabilities` | `apps/api/src/inventory/inventory-item-configuration.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/inventory/stock-movements` | `RequireCapabilities` | `apps/api/src/inventory/inventory-stock-movement-list.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/inventory/stock-movements` | `HttpCode` | `apps/api/src/inventory/inventory-stock-movement-creation.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/inventory/stock-movements/:movementId` | `RequireCapabilities` | `apps/api/src/inventory/inventory-stock-movement-detail.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/inventory/stock-movements/:stockMovementId/post` | `HttpCode` | `apps/api/src/inventory/inventory-stock-movement-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/inventory/stock-movements/:stockMovementId/reverse` | `HttpCode` | `apps/api/src/inventory/inventory-stock-movement-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/inventory/stock-receipts` | `HttpCode` | `apps/api/src/inventory/stock-receipt.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/inventory/stock-receipts/:receiptId/post` | `HttpCode` | `apps/api/src/inventory/stock-receipt.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/inventory/stock-receipts/:receiptId/reverse` | `HttpCode` | `apps/api/src/inventory/stock-receipt.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/inventory/summary` | `RequireCapabilities` | `apps/api/src/inventory/inventory-summary.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/inventory/uoms` | `HttpCode` | `apps/api/src/inventory/inventory-uom.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| PATCH | `/v1/inventory/uoms/:uomId` | `RequireCapabilities` | `apps/api/src/inventory/inventory-uom.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/inventory/warehouses` | `HttpCode` | `apps/api/src/inventory/inventory-warehouse.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| PATCH | `/v1/inventory/warehouses/:warehouseId` | `RequireCapabilities` | `apps/api/src/inventory/inventory-warehouse-update.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/inventory/warehouses/:warehouseId/closeout` | `RequireCapabilities` | `apps/api/src/inventory/inventory-warehouse-closeout.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/notifications` | `list` | `apps/api/src/notifications/notifications.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/notifications` | `HttpCode` | `apps/api/src/notifications/notifications.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/opportunities/:opportunityId/inspection-photos` | `HttpCode` | `apps/api/src/documents/inspection-photo.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/process/approval-rules` | `RequireCapabilities` | `apps/api/src/process/process.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/process/approval-rules` | `RequireCapabilities` | `apps/api/src/process/process.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/process/approvals` | `RequireCapabilities` | `apps/api/src/process/process.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| PATCH | `/v1/process/approvals/:approvalId/decision` | `RequireCapabilities` | `apps/api/src/process/process.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/process/health` | `RequireCapabilities` | `apps/api/src/process/process.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/process/sla-clocks/:clockId/evaluate` | `RequireCapabilities` | `apps/api/src/process/process.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| PATCH | `/v1/process/sla-clocks/:clockId/observe-mode` | `RequireCapabilities` | `apps/api/src/process/process.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/process/steps` | `RequireCapabilities` | `apps/api/src/process/process.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/process/steps` | `RequireCapabilities` | `apps/api/src/process/process.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/process/tasks` | `RequireCapabilities` | `apps/api/src/process/process.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| PATCH | `/v1/process/tasks/:taskId/assignment` | `RequireCapabilities` | `apps/api/src/process/process.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/process/tasks/:taskId/clock` | `RequireCapabilities` | `apps/api/src/process/process.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| PATCH | `/v1/process/tasks/:taskId/status` | `RequireCapabilities` | `apps/api/src/process/process.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/boms/togal-commit` | `HttpCode` | `apps/api/src/procurement/togal-bom-commit.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/deliveries` | `HttpCode` | `apps/api/src/procurement/delivery-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/deliveries/:deliveryScheduleId/cancel` | `HttpCode` | `apps/api/src/procurement/delivery-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/deliveries/:deliveryScheduleId/in-transit` | `HttpCode` | `apps/api/src/procurement/delivery-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/deliveries/:deliveryScheduleId/inspection/complete` | `HttpCode` | `apps/api/src/procurement/delivery-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/deliveries/:deliveryScheduleId/inspection/start` | `HttpCode` | `apps/api/src/procurement/delivery-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/deliveries/:deliveryScheduleId/receipt` | `HttpCode` | `apps/api/src/procurement/delivery-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/deliveries/:deliveryScheduleId/site-preparation/complete` | `HttpCode` | `apps/api/src/procurement/delivery-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/deliveries/:deliveryScheduleId/site-preparation/start` | `HttpCode` | `apps/api/src/procurement/delivery-workflow.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/purchase-orders` | `HttpCode` | `apps/api/src/procurement/purchase-order.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/purchase-orders/:purchaseOrderId/workflow` | `HttpCode` | `apps/api/src/procurement/purchase-order.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/purchase-orders/from-bom` | `HttpCode` | `apps/api/src/procurement/purchase-order.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/purchase-orders/from-bom/grouped` | `HttpCode` | `apps/api/src/procurement/purchase-order.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/rfqs` | `HttpCode` | `apps/api/src/procurement/procurement.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/rfqs/:rfqId/quotes` | `RequireCapabilities` | `apps/api/src/procurement/procurement.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/rfqs/:rfqId/transitions` | `HttpCode` | `apps/api/src/procurement/procurement.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/procurement/rfqs/dispatch` | `HttpCode` | `apps/api/src/procurement/procurement.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/projects` | `RequireCapabilities` | `apps/api/src/projects/projects.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/projects` | `RequireCapabilities` | `apps/api/src/projects/projects.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| DELETE | `/v1/projects/:projectId` | `HttpCode` | `apps/api/src/projects/project-retirement.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/projects/:projectId` | `RequireCapabilities` | `apps/api/src/projects/projects.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| PATCH | `/v1/projects/:projectId` | `RequireCapabilities` | `apps/api/src/projects/projects.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/projects/:projectId/command-center` | `RequireCapabilities` | `apps/api/src/projects/projects.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/projects/:projectId/comments` | `RequireCapabilities` | `apps/api/src/projects/project-comments.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/projects/:projectId/comments` | `HttpCode` | `apps/api/src/projects/project-comments.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| DELETE | `/v1/projects/:projectId/comments/:commentId` | `HttpCode` | `apps/api/src/projects/project-comments.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/projects/:projectId/cost-entries` | `RequireCapabilities` | `apps/api/src/projects/cost-entry-creation.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| DELETE | `/v1/projects/:projectId/cost-entries/:costEntryId` | `HttpCode` | `apps/api/src/projects/cost-entry-deletion.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/projects/:projectId/cost-entries/:costEntryId/restore` | `HttpCode` | `apps/api/src/projects/cost-entry-deletion.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/projects/:projectId/customer-invoices` | `HttpCode` | `apps/api/src/finance/customer-invoice-draft-create.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/provider-quotas/consume` | `RequireCapabilities` | `apps/api/src/observability/provider-quota.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/public/purchase-orders/:token/confirmation` | `view` | `apps/api/src/procurement/public-vendor-confirmation.controller.ts` | PUBLIC MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/public/purchase-orders/:token/confirmation` | `HttpCode` | `apps/api/src/procurement/public-vendor-confirmation.controller.ts` | PUBLIC MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/public/signatures/:token` | `HttpCode` | `apps/api/src/documents/public-signing.controller.ts` | PUBLIC MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/search` | `RequireCapabilities` | `apps/api/src/search/universal-search.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| GET | `/v1/today` | `RequireCapabilities` | `apps/api/src/today/today.controller.ts` | GLOBAL JWT + CAPABILITY MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |
| POST | `/v1/webhooks/docuseal` | `HttpCode` | `apps/api/src/documents/docuseal-webhook.controller.ts` | PUBLIC MARKER | REGISTERED SOURCE / PARTIALLY VERIFIED |

## Data and migration inventory

### Drizzle schema modules

- `packages/database/src/schema/account-kyc.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/accounting.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/accounts.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/asset-maintenance.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/assets.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/audit-log.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/award-handoffs.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/bank-reconciliation.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/bank-statement-auto-match-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/bank-statement-import-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/bank-statement-line-match-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/bank-statement-reconcile-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/bank-statement-void-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/bom-extras.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/bom-line-item-grain-reviews.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/bom-line-item-location-reviews.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/bom-line-items.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/boms.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/budgets.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/business-calendar.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cad-evidence-commit-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cash-draft-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cash-transaction-workflow-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cash.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/change-logs.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/change-request-create-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/construction.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/contacts.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cortex-assistant-generation-jobs.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cortex-assistant-provider-budget.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cortex-assistant-provider-circuit-alert.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cortex-assistant-turn-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cortex-chat.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cortex-conversation-turn-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cortex-semantic-index-jobs.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cortex.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cost-entries.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cost-entry-create-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cost-entry-delete-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/cost-entry-restore-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/customer-invoice-cancel-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/customer-invoice-draft-create-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/customer-invoice-issue-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/customer-invoice-reverse-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/customer-portal-sessions.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/deliveries.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/delivery-schedule-create-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/delivery-workflow-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/design.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/document-delete-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/document-intake-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/document-processing-evidence.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/document-processing-jobs.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/documents.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/dupa-libraries.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/dupas.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/embeddings.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/inventory-masters.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/inventory-movements.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/inventory.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/invoices.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/journal-post-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/journal-reverse-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/notifications.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/opportunities.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/opportunity-kyc-tracks.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/opportunity-project-conversion-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/opportunity-stage-transition-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/po-line-items.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/post-construction.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/pprf.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/pre-con.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/process-sla.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/progress-claims.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/project-comment-create-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/project-comment-delete-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/project-comments.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/project-create-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/project-locations.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/project-retirement-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/projects.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/public-signing-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/purchase-order-create-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/purchase-order-supplier-email-deliveries.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/purchase-order-workflow-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/purchase-orders.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/scope-items.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/signature-sessions.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/site-inspections.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/stock-movement-create-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/stock-movement-workflow-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/stock-receipt-create-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/stock-receipt-workflow-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/supplier-bill-post-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/supplier-bill-reverse-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/supplier-bills.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/takeoff-imports.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/tenant-memberships.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/tenants.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/togal-bom-commit-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/user-role-assignment-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/users.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/vendor-confirmation-requests.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/vendor-confirmation-sessions.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/vendors.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/warranty.ts` — TYPECHECKED / PARTIALLY VERIFIED
- `packages/database/src/schema/weekly-reports.ts` — TYPECHECKED / PARTIALLY VERIFIED

### Ordered Supabase migrations

- `supabase/migrations/20260509164536_initial_schema.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260509164537_rls_policies.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260509164538_audit_triggers.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260509173356_storage_buckets.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260509173415_pgvector.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260510120000_harden_loop.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260510140000_phase14_polish.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260512100000_third_code_erp_ops_phase_0.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260512110000_third_code_erp_ops_phase_2_to_8.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260512120000_third_code_erp_ops_8_stages.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260512130000_third_code_erp_po_approval.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260512140000_signature_sessions.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260513100000_rework_alignment.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260613184358_handle_new_user_auto_provision.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260613192311_cortex_substrate_schema.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260613192346_cortex_substrate_functions.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260613192426_cortex_fix_digest_search_path.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260613192810_cortex_revoke_rpc_execute.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260613193116_cortex_mirror_opportunities_documents.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260613195156_cortex_mirror_execution_core.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260614035348_cortex_nodes_embedding_hnsw_index.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260614044012_cortex_agent_memory.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260614052018_cortex_node_type_expand.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260614052136_cortex_generic_mirror.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260614053117_cortex_generic_mirror_redact_attributes.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260614063911_cost_entries_phase3.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726192929_cortex_cost_security_hardening.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726201606_accounting_ledger_foundation.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726210500_customer_receivables_foundation.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726220000_supplier_payables_foundation.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726225000_cash_allocation_schema.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726230000_cash_allocation_foundation.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726231000_bank_reconciliation_schema.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726232000_bank_reconciliation_foundation.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726233000_inventory_stock_schema.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726234000_inventory_stock_foundation.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726235000_supplier_bill_receipt_match_schema.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726240000_supplier_bill_three_way_match.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726241000_supplier_bill_three_way_posting.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726242000_project_budget_schema.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726243000_project_budget_controls.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726244000_stock_movement_schema.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260726245000_stock_movement_controls.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260727162024_security_advisor_hardening.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260727194749_fix_receivable_mirror_return.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260727194757_fix_cash_posting_alias_resolution.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260727194805_fix_finance_workflow_guards.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260728005112_fix_purchase_order_status_catalog.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260729051205_harden_signup_provisioning.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260729054456_persist_signup_organization_type.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260729115110_cortex_conversation_record_context.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260729152059_rfq_transaction_integrity.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260729153620_close_rfq_browser_writes.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260729162944_rfq_quote_workflow_integrity.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260729233017_notification_outbox_foundation.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260801080000_reconcile_duplicate_purchase_order_numbers.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260801090000_purchase_order_create_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260801100000_purchase_order_workflow_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260801110000_purchase_order_workflow_notifications.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260801120000_stock_receipt_create_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260801130000_cad_evidence_commit_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260801140000_document_processing_jobs.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260801150000_document_processing_evidence.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802090000_change_request_create_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802100000_purchase_order_workflow_scm_rejection.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802110000_purchase_order_supplier_issuance.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802120000_finance_journal_post_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802130000_stock_receipt_workflow_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802140000_delivery_receipt_workflow_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802150000_finance_journal_reverse_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802160000_delivery_inspection_start_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802170000_delivery_inspection_complete_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802180000_delivery_cancel_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802190000_delivery_site_preparation_start_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802200000_delivery_site_preparation_complete_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802210000_supplier_bill_post_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802220000_supplier_bill_reverse_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260802230000_cash_transaction_workflow_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260803090000_customer_invoice_issue_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260803100000_customer_invoice_reverse_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260803110000_customer_invoice_cancel_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260803120000_cash_transaction_draft_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260803130000_document_delete_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260803140000_public_signing_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260803150000_vendor_confirmation_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260803160000_vendor_confirmation_session_minting.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260803170000_purchase_order_supplier_session_payload.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260804090000_project_create_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260805100000_inventory_warehouse_deactivation_guard.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260805110000_stock_movement_create_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260805120000_stock_movement_workflow_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260806100000_cost_entry_create_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260806110000_asset_register_foundation.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260806120000_delivery_in_transit_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260806130000_delivery_schedule_create_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260806140000_togal_bom_commit_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260806150000_opportunity_project_conversion_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260806160000_security_role_baseline.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260807100000_asset_maintenance_history.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260807110000_cost_entry_delete_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260807120000_cost_entry_restore_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260807130000_customer_invoice_draft_create_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260807140000_revoke_anon_tenant_identity_rpc.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260807150000_user_role_assignment_authority.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260807160000_cortex_semantic_index_jobs.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260807170000_cortex_conversation_user_turn_authority.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260807190000_cortex_assistant_turn_authority.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260808090000_cortex_assistant_generation_jobs.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260808100000_cortex_assistant_provider_budget.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260808110000_cortex_assistant_provider_completion_link.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260808120000_cortex_assistant_provider_protocol.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260808130000_cortex_assistant_provider_health.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260808140000_cortex_assistant_provider_circuit_alerts.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260810090000_document_intake_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260810100000_project_comment_create_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260810110000_project_comment_delete_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260810120000_project_comment_delete_fk_tenant_preservation.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260810130000_opportunity_stage_transition_authority.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260811180000_cash_draft_delete_trigger_fix.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260812100000_bank_statement_auto_match_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260812110000_bank_statement_line_match_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260812120000_bank_statement_reconcile_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260812130000_bank_statement_void_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260812140000_bank_statement_import_workflow.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260812150000_bank_statement_storage_source.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260812155000_wo_02_audit_business_calendar.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260812160000_process_sla_engine_foundation.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260812170000_wo_04_bom_grain_classification.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260812173000_wo_05_location_dimension.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260812180000_wo_06_dupa_engine.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260812190000_wo_08_takeoff_importer.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260813110000_rfq_price_history_provenance.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260813130000_wo_11_opportunity_kyc_tracks.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260813150000_wo_12_mobile_site_inspection_media.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260813170000_wo_13_award_handoff.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260813180000_wo_14_allowable_budget_lock.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260813190000_wo_16_permits_mobilization.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260813200000_wo_17_cost_control_v1.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260813210000_audit_missing_tenant_tables.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260813220000_change_request_change_log.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260814120000_wo_12_inspection_sync_idempotency.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260814130000_wo_15_budget_commitment.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260814150000_preserve_users_read_authority.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260815100000_wo_12_site_inspection_access.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260817090000_tenant_membership_delegation_foundation.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260817100000_harden_function_search_paths.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260817110000_explicit_server_only_rls_policies.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260819100000_project_type_structural_civil_enum.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260819100100_project_type_structural_civil_backfill.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED
- `supabase/migrations/20260819110000_controlled_project_retirement.sql` — STATIC ORDER/INVARIANT GATES; DISPOSABLE REPLAY BLOCKED

## Background execution and external boundaries

### Inngest modules

- None found.

### Queue, processor and worker modules

- `apps/api/src/cad/document-processing.processor.ts` — SOURCE REGISTERED / RUNTIME PARTIAL
- `apps/api/src/cad/document-processing.queue.ts` — SOURCE REGISTERED / RUNTIME PARTIAL
- `apps/api/src/cad/document-processing.worker.ts` — SOURCE REGISTERED / RUNTIME PARTIAL
- `apps/api/src/cortex/cortex-assistant-generation.processor.ts` — SOURCE REGISTERED / RUNTIME PARTIAL
- `apps/api/src/cortex/cortex-assistant-generation.queue.ts` — SOURCE REGISTERED / RUNTIME PARTIAL
- `apps/api/src/cortex/cortex-assistant-generation.worker.ts` — SOURCE REGISTERED / RUNTIME PARTIAL
- `apps/api/src/cortex/cortex-assistant-provider-circuit-alert.processor.ts` — SOURCE REGISTERED / RUNTIME PARTIAL
- `apps/api/src/cortex/cortex-assistant-provider-circuit-alert.queue.ts` — SOURCE REGISTERED / RUNTIME PARTIAL
- `apps/api/src/cortex/cortex-semantic-index.processor.ts` — SOURCE REGISTERED / RUNTIME PARTIAL
- `apps/api/src/cortex/cortex-semantic-index.queue.ts` — SOURCE REGISTERED / RUNTIME PARTIAL
- `apps/api/src/cortex/cortex-semantic-index.worker.ts` — SOURCE REGISTERED / RUNTIME PARTIAL
- `apps/api/src/procurement/notification-delivery.processor.ts` — SOURCE REGISTERED / RUNTIME PARTIAL
- `apps/api/src/procurement/notification-delivery.queue.ts` — SOURCE REGISTERED / RUNTIME PARTIAL
- `apps/api/src/procurement/rfq-dispatch.processor.ts` — SOURCE REGISTERED / RUNTIME PARTIAL
- `apps/api/src/procurement/rfq-dispatch.queue.ts` — SOURCE REGISTERED / RUNTIME PARTIAL

### External integration/provider modules

- `apps/api/src/cad/document-processing.storage.ts` — SOURCE INSPECTED / PROVIDER VERIFICATION PARTIAL
- `apps/api/src/documents/docuseal-artifact.storage.ts` — SOURCE INSPECTED / PROVIDER VERIFICATION PARTIAL
- `apps/api/src/documents/public-signing.storage.ts` — SOURCE INSPECTED / PROVIDER VERIFICATION PARTIAL
- `apps/api/src/finance/bank-statement-import.storage.ts` — SOURCE INSPECTED / PROVIDER VERIFICATION PARTIAL
- `apps/web/src/lib/operations/integrations/canvas-sign.ts` — SOURCE INSPECTED / PROVIDER VERIFICATION PARTIAL
- `apps/web/src/lib/operations/integrations/docuseal.ts` — SOURCE INSPECTED / PROVIDER VERIFICATION PARTIAL
- `apps/web/src/lib/operations/integrations/resend.ts` — SOURCE INSPECTED / PROVIDER VERIFICATION PARTIAL
- `apps/web/src/lib/operations/integrations/semaphore.ts` — SOURCE INSPECTED / PROVIDER VERIFICATION PARTIAL
- `apps/web/src/lib/operations/integrations/takeoff.ts` — SOURCE INSPECTED / PROVIDER VERIFICATION PARTIAL
- `apps/web/src/lib/operations/integrations/togal.ts` — SOURCE INSPECTED / PROVIDER VERIFICATION PARTIAL

## Role and permission contract

| Layer | Authority | Evidence/status |
| --- | --- | --- |
| Canonical policy | `packages/shared-types/src/authorization.ts` | 13 roles and capability grants; unit-tested |
| Web server | `packages/auth/src/server.ts` | Supabase identity + `public.users` tenant/role; shared `can()` policy |
| Core API | `apps/api/src/auth/supabase-jwt.guard.ts`, `capability.guard.ts` | Global JWT plus route capability metadata; source/test verified |
| Database | `supabase/migrations/*` RLS policies | Static policy inventory; current provider advisors/disposable replay blocked |

## Interpretation and limitations

- Loading/Error columns mean a boundary exists in the page directory itself. Next.js inherits parent boundaries: the root error boundary and dashboard-group loading/error boundaries cover many rows marked `NO`; absence here is not automatically a missing rendered state.
- This inventory classifies every statically discoverable page, Server Action export, Next handler, and Nest endpoint. Dynamic callback behavior inside generic components is covered per file by `REPOSITORY_COVERAGE.md`, not falsely claimed as browser-verified.
- `NO CANONICAL AUTH MARKER FOUND` is a review signal, not automatically a vulnerability: a route may be intentionally public or delegate authentication. Findings require manual evidence in `FULL_REPOSITORY_AUDIT.md`.
- A route can compile while its provider, migration, queue, browser state, or production registration is unavailable. Those distinctions are retained in `TEST_AND_VERIFICATION_EVIDENCE.md` and `PRODUCTION_DEPLOYMENT_REPORT.md`.
