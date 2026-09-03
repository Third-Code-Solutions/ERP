# AI provider authorization and audit boundaries

- Date: 2026-09-03
- Owner: Agent 05 — API & Backend Logic
- Scope: project chat and BOM similar-item API routes only
- Deployment: not performed

## Outcome

- Project chat now requires `cortex.assistant.use` immediately after authentication,
  before request-body parsing or any context, audit, quota, or provider work.
- Project-chat audit evidence remains tenant/actor/project/domain scoped and must persist
  before quota consumption and provider construction.
- Similar-item retrieval now writes a mandatory append-only request audit before provider
  configuration, quota, embedding, or database retrieval. Audit failure returns a private,
  generic HTTP 503 and performs no downstream work.
- Similar-item result/failure metadata is retained in a second append-only `query` audit
  distinguished by `phase: 'result'`. Audit and retrieval logs no longer include raw errors.

## Verification

- TDD RED reproduced Viewer authorization and audit-order failures in project chat and the
  fail-open similar-item audit path.
- Focused route suites passed 28/28 under Node.js 22.23.2.
- Web source typecheck passed under Node.js 22.23.2.
- Focused route ESLint passed with zero warnings.
- Focused `git diff --check` passed.
