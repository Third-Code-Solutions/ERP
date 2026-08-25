# Exact document-authority selectors

## Scope

Independent review found that public-signing and document-deletion selectors
still accepted the legacy `*` wildcard even though upload issuance treated them
as exact-tenant readiness dependencies. This repair:

- switches both selectors to the existing exact-tenant parser;
- keeps them default-off and case-sensitive for the `true` enable switch;
- trims and deduplicates explicit tenant allowlists; and
- proves `*` cannot satisfy either readiness dependency.

Unrelated legacy Core selectors retain their existing wildcard compatibility.

## Verification

- PASSED: full Web Core-client Vitest, 176 tests.
- PASSED: upload-sign route Vitest, 13 tests.
- PASSED: Web TypeScript check under Node 22.
- PASSED: scoped production-client ESLint and diff check.
- The existing route regressions prove a false downstream authority returns a
  sanitized `503` before Core, database, Storage, or audit calls.

## Handoff

→ Handoff to Agent 04 independent verification. Expected output: real-helper
wildcard rejection plus route no-side-effect evidence, with no mocked selector
assumption accepted by itself.
