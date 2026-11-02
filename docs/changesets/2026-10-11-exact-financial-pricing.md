# Exact financial pricing and fractional procurement

2026-10-11. Local remediation under PRD 1.6 and ADR-041. Sequential scope: Agent 04 schema → Agent 05 business/API/shared types → Agent 10 BOM UI. No commits, provider writes or deployments.

## Implementation

- CLI-generated forward migration `20261011152153_exact_bom_pricing_and_quantity.sql`: exact four-decimal BOM quantities; separate direct cost, selling excluding VAT, VAT and inclusive contract snapshots; authoritative parent aggregation under a BOM lock; draft-only reconciliation; approved/locked history preserved. Shared crew refresh skips approved BOMs. Direct deletion of an analysis is rejected while its BOM line exists; deleting a draft line may cascade normally.
- API and manual entry use bounded decimal-to-scaled-integer arithmetic. DUPA saves explicitly recompute even an empty analysis. Existing Web mutation callers acquire the parent before child writes. Direct child-first SQL can still encounter PostgreSQL deadlock detection and must retry its aborted transaction; it cannot partially commit.
- Invoice drafts and signed-award down payments share one allocation function using explicit selling/VAT snapshots. Retention and withholding reduce receivable without adding VAT again. Persist basis, source BOM and withholding rate; freeze new snapshot fields after issue. Ambiguous legacy BOMs/invoice drafts require an explicitly reviewed replacement before new billing/issue. Historical invoices are not rewritten.
- CLI-generated forward migration `20261011153424_fractional_purchase_order_quantities.sql`: lossless widening of PO quantity and received quantity to numeric; canonical stock micros remain intact. Validate up to six decimals for procurement, synchronize quantity/micros, and derive exact partial receipt quantities. No historical PO repricing or quantity backfill.
- Standalone, single-BOM and grouped-BOM PO creation use exact half-up line totals and sum persisted line amounts. Requisition conversion preserves micros or rejects a numeric representation that would lose precision. PO form accepts fractions; RFQ comparison already preserved numeric fractions. BOM remains bounded to four decimals; existing stock/procurement micros support six.

## Changed application and schema areas

- `packages/database/src/schema/{bom-line-items,boms,invoices,po-line-items}.ts` and the two new migrations above.
- `packages/shared-types/src/bom/{quantity,calculations,index,schemas,takeoff}.ts`; `src/erp-api/{finance,purchase-orders,togal-bom,vendor-confirmation}.ts`.
- `packages/operations/src/signed-bom-award.ts`.
- `apps/api/src/finance/customer-invoice-draft-create.service.ts`; `src/procurement/{purchase-order-creation,togal-bom-commit}.service.ts`; only PO conversion and its quantity import in `src/roadmap/roadmap.service.ts`.
- `apps/web/src/app/(dashboard)/projects/[id]/bom/actions.ts`; `app/(dashboard)/procurement/actions.ts`; `components/bom/{bom-builder,bom-line-row}.tsx`; `components/procurement/create-po-form.tsx`; `lib/operations/{scope-money,purchase-order-money,purchase-order-inputs}.ts`.
- Regression files: database `exact-bom-pricing.database.test.ts`, `inventory-stock-ledger.test.ts`, `customer-receivables.test.ts`, `cash-allocation.test.ts`; shared BOM/takeoff/billing and Togal tests; signed-award test; API PO/Togal unit and invoice/import integration fixtures; Web BOM action and PO money/input tests.

Invoice issue fixtures now explicitly describe their known synthetic components. Existing cash/receivables fixtures retain their asserted amounts and persist the matching 180-bps withholding snapshot; this is fixture policy, not a claim about applicable tax law.

## Verification evidence

Database target exclusively disposable loopback container `erp-abi-ops-remediation-db`, database `erp_turnover_audit` on port 55439. Both forward migrations applied successfully. The first migration's later function refinements were applied separately in the same disposable DB; clean full-history replay remains the release gate.

PASSED:

- `pnpm --filter @third-code-erp/shared-types exec vitest run src/bom/__tests__ src/erp-api/togal-bom.test.ts`: 7 files, 71 tests.
- `pnpm --filter @third-code-erp/api exec vitest run src/finance/customer-invoice-draft-create.service.spec.ts src/procurement/togal-bom-commit.service.spec.ts src/procurement/purchase-order-creation.service.spec.ts`: 3 files, 21 tests before subsequent fractional PO extension.
- `pnpm --filter @third-code-erp/api exec vitest run src/procurement/purchase-order-creation.service.spec.ts src/procurement/rfq-bid-leveling.service.spec.ts --maxWorkers=1`: 2 files, 14 tests after extension, including 0.1 and 12.5 PO totals.
- `pnpm --filter @third-code-erp/shared-types --filter @third-code-erp/database --filter @third-code-erp/operations --filter @third-code-erp/api typecheck`: all passed after fractional production changes. Later DB fixture/test additions have not had another package typecheck.
- Web focused BOM/PO action arithmetic/input run: 3 files, 36 tests. Earlier scope-money/award-automation focused tests also passed.
- Exact pricing DB suite: 8 tests passed, including separate positive GP, mixed manual/DUPA, invoice posting balance, immutable issued snapshots, legacy issue denial, precision rejection, tenant isolation, draft rollback, analysis cascade, concurrent material edits, and parent-first edit versus crew refresh.
- Customer receivables and cash-allocation DB suites passed during the 4-file run; their monetary expectations remain unchanged.
- Inventory suite: 27/28 passed in the contention-affected invocation, including both fractional BOM → PO → partial receipt → reversal cases. The sole existing balanced-journal test timed out at its unchanged 30-second limit; a focused rerun passed (1 passed, 27 intentionally filtered/skipped). Final fixture refinement makes fractional PO header/line amounts foot to the ordered quantity; the two fractional cases need a final rerun after that refinement.
- HTTP invoice draft creation, invoice issue and finance receivables: 3 files/tests passed within the 4-file integration invocation.

FAILED / PENDING:

- The same HTTP invocation's takeoff Web-to-Core test timed out at its unchanged 45-second limit during severe host contention. No timeout was increased. One stale expected unresolved-count value was subsequently corrected from 3 to 2 because 0.1 is now valid; rerun still required.
- Web full typecheck started after production edits and remains running: exec session **46897**. Parent can resume with `write_stdin`. No other verification sessions remain running under this handoff.
- Bounded reruns still required: takeoff Web-to-Core integration; final fractional inventory cases; package typecheck covering latest test additions; signed-award focused unit suite after snapshot fixture updates; changed-file lint; clean migration replay.
- Browser verification of BOM/PO forms NOT RUN. Full build/repository suites NOT RUN by this subagent; main coordinates them.

No known uncorrected financial defect demonstrated by the completed checks. Remaining checks are not treated as green, and this changeset does not certify deployment readiness or jurisdictional tax policy.

→ Handoff to Agent 01/main and subsequent frontend/release reviewers. Inputs: migrations, implementation above, passed focused evidence and outstanding session 46897. Expected output: independent high-risk review, pending reruns, browser journeys and consolidated documentation/release decision.
