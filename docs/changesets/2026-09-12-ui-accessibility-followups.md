# UI accessibility follow-ups

## Scope

- Made dashboard and platform skip-link destinations programmatically focusable.
- Added captions, column scopes, and keyboard-focusable horizontal overflow regions to the documents tables.
- Replaced procurement's fixed two-column layout with a route-scoped responsive grid and aligned its loading state with the vendor and recent purchase-order sections.
- Exposed project and purchase-order form submission errors through alert/live regions and marked pending form state with `aria-busy`.
- Raised normal empty-state and supporting copy from neutral-400 to neutral-500 while retaining neutral-400 for decorative uses.

## Verification

- PASSED: project documents render suite, 13 tests.
- PASSED: E2E TypeScript check and scoped Web ESLint.
- NOT RUN: authenticated procurement mobile browser test; local credentials and a running authenticated test server are unavailable.
- Full Web typecheck and release verification remain pending for the combined release.
