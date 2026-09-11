# Customer invoice BOM and centavo integrity

## Outcome

- Customer-invoice draft creation now selects only the newest `approved` or
  `locked` BOM when the request omits `bomId`.
- Explicit and default BOM selection share one fail-closed eligibility guard;
  a project without an eligible BOM cannot create a zero-value invoice draft.
- BOM TCV is read as an exact PostgreSQL integer and rejects values outside the
  JavaScript safe-integer persistence range before billing arithmetic runs.
- BOM calculation helpers use BigInt intermediates and half-up rounding for
  centavo and basis-point operations, eliminating floating-point cent loss.
- Invoice creation audit evidence records the selected BOM id.

## Verification

- `pnpm --config.engine-strict=false --filter @third-code-erp/shared-types exec vitest run src/bom/__tests__/calculations.test.ts` — PASSED (35 tests).
- `pnpm --config.engine-strict=false --filter @third-code-erp/api exec vitest run src/finance/customer-invoice-draft-create.service.spec.ts` — PASSED (4 tests).
- `pnpm --config.engine-strict=false --filter @third-code-erp/api typecheck` — PASSED.
- PostgreSQL HTTP integration remains environment-gated and was not run locally.

## Notes

The invoice schema does not yet persist a foreign key to the source BOM. The
selected source is retained in the append-only invoice audit diff so provenance
is available without changing the existing invoice contract.
