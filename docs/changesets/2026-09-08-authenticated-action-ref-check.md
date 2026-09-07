# Authenticated workflow action reference check

Production promotion run `34152528809` failed before provider deployment when
the unauthenticated GitHub tag checks received HTTP 403 responses and reported
the pinned action references as missing. Independent authenticated reads proved
that all four pinned tags exist.

The verifier now uses the existing GitHub Actions token when supplied, applies
a ten-second request timeout, distinguishes a genuine 404 from API
unavailability, and remains fail-closed for every non-200 response and request
error. The token is available only to dedicated action-reference verification
steps in the production and self-hosted workflows. Existing `contents: read`
permissions are unchanged.

Regression tests cover the authorization header, token-absent requests, the
all-success path, 404, 403, network errors, and timeouts. The PR workflow runs
the tests without requiring a token; protected production and self-hosted
verification run the tests and the authenticated live checks.

Verification:

- PASS — seven mocked tests on the required Node 22.23.2 runtime.
- PASS — production authentication-proof contract test on Node 22.23.2.
- PASS — authenticated live resolution of all four pinned tags.
- PASS — actionlint 1.7.12.
- PASS — `git diff --check`.

No action pin, workflow permission, dependency, provider resource, credential,
database, or application behavior changed. Rollback is a code revert; no data
recovery is involved.
