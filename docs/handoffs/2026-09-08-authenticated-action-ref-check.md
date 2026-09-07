# Authenticated action-reference release handoff

Agent 13 repaired the production release gate that classified unauthenticated
GitHub API 403 responses as missing action tags. The implementation is on
`agent-13/authenticated-action-ref-check` from the exact failed-release base
`c0e454605ed38d582bb107df8835dd29ef1390a0`.

Review inputs are `scripts/verify-workflow-action-refs.mjs`, its Node test,
`package.json`, and the three workflows that execute the regression test or
live verifier. The protected production workflow now exposes `github.token`
only to the dedicated read-only check. No permission expansion is present.

Expected next output: independent review, normal PR CI, merge to `main`, then a
fresh guarded production promotion. The failed run made no provider changes,
so provider rollback is unnecessary. A subsequent promotion must still pass
all ordinary database, deployment, health, authenticated E2E, recovery, and
password-rotation gates.

→ Handoff to Agent 13 / release owner. Reason: review and guarded promotion.
Inputs: this branch, mocked transport evidence, authenticated tag evidence, and
failed run `34152528809`. Expected output: green PR checks and a fully green
protected production run at the reviewed merge SHA.
