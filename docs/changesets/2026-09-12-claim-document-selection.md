# Claim document selection and retry UX

## Change

- Replace raw document-UUID entry with a labelled, paginated selector for the claim's project documents. Preserve selection across pages and ignore stale responses.
- Use existing form, button and card styles; provide explicit loading, empty, error, retry and success states with keyboard access and responsive layout.
- Route attachment writes through Core, validate returned attachment/request identity and tenant/project/claim/document scope, and scope historical document display joins by tenant.
- Keep the exact command frozen after an uncertain outcome, including when a later retry is rejected by authorization. Only confirmed success clears that uncertainty. A new intent rejected before any uncertain outcome may receive a new request identity.

## Verification

- PASSED: focused action/client/component tests, 16 tests across four files.
- PASSED: six local Chromium interaction tests with zero retries or skips, including pagination, stale responses, loading/empty/error recovery, unknown then rejected then successful retry identity, reset behavior, keyboard traversal and 320/768/1024/1440-pixel layouts.
- Main inspected 320- and 1440-pixel screenshots. These are isolated component renders using application styles and an action bridge, not the authenticated complete claim page.
- PASSED: complete Web source suite, 2,040 tests; its two database-gated tests initially skipped, then both passed in a separate explicit PostgreSQL run against the synthetic 171-migration database. No test was disabled or weakened.
- PASSED: source and E2E TypeScript checks and focused production-file ESLint. Local Node 24 differs from required Node 22 CI; locked-runtime CI remains required.

## Boundary

Not deployed. The credential-free browser test is now a CI Build dependency, but does not replace real-app authentication or live database/Storage verification. The attachment and parent-delete migrations require the existing production recovery gate. Pipeline, certification, existing claim transitions and commercial data are not removed or redefined by this UI change.
