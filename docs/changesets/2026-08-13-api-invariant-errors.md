# API invariant error contracts

## Scope

Hardened procurement transaction invariants and authenticated-principal
resolution at NestJS API boundary.

## Change

Impossible post-write states in RFQ quote/catalog/price-history workflows now
throw typed `InternalServerErrorException` responses instead of raw
`Error` instances. Missing authenticated principal context now returns a typed
401. Expected client conflicts and not-found cases remain unchanged.

## Verification

- API tests: 53/53 PASS.
- API typecheck: PASS.
- Nest API build: PASS.
- No database or hosted provider state changed.
