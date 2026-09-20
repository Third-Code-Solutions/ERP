# Identity lifecycle response acknowledgements

## Changed

`PlatformIdentityAdminService.setSuspended` now validates the returned user UUID and requested ban state before resolving. A ban requires an offset-aware future timestamp; an explicit unban requires the cleared absent/null representation. Mismatched users, malformed payloads, contradictory states and unexpected SDK exceptions produce a typed unconfirmed error without leaking remote details. The existing server-only request, ban duration, explicit unban and eight-second deadline remain unchanged.

The real installed Auth SDK is used in tests with fetch intercepted; this covers its permissive success transformation, including a null response that throws inside the SDK. No real provider request, configuration or identity change occurred.

ADR-030 records a separate **proposed, not implemented** durable lifecycle design. It explicitly retains open eligibility/quarantine/settlement decisions and does not claim a queue, lease, database generation or provider readback can settle an older remote request.

## Verification

- PASSED RED/GREEN: original focused test run had 14 failures and four passes; response binding resolved those failures. Added null-response regression reproduced one additional failure before its exception mapping was added.
- PASSED: final combined platform run 65/65 with no skips, including 19 new adapter tests, existing platform unit tests, 12 invitation PostgreSQL admission cases and the existing platform database/HTTP scenario.
- PASSED: API typecheck, focused ESLint, whitespace checks and history secret scan (2012 commits, no findings).
- REVIEWED: independent bounded security review found no required corrections in the adapter or proposed ADR; this was source review, not another test run.
- NOT RUN locally: full production build, live Auth mutation or deployment. Local Node is 24.16.0; required CI uses Node 22.

Reports are outside the repository: `erp-identity-lifecycle-red.json`, `erp-identity-lifecycle-null-red.json` and `erp-identity-platform-confirmed.json` in the session temporary directory.

## Boundaries

This validates an acknowledgement, not future provider consistency or durable settlement. Auth-first status updates, provider timeout/compensation reconciliation, the complete retained-history Suspend workflow and cross-writer last-active-admin protection remain unfinished. No migration or effective access policy changed.

Stacked on PR #75 and the inherited release-held stack. Supabase preview capacity and database/Storage recovery prerequisites remain unresolved. Do not promote this slice independently or claim production verification from intercepted-fetch tests.
