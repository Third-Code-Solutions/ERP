# Similar-item assistant authorization

- Date: 2026-09-03
- Owner: Agent 05 — API & Backend Logic
- Scope: `POST /api/ai/similar-items` authorization boundary only
- Deployment: not performed

## Outcome

Provider-backed similar-item retrieval now requires both BOM read access and the central
`cortex.assistant.use` capability. Viewer receives a private HTTP 403 before provider
configuration, quota consumption, audit writes, embedding work, serialization, or database
retrieval. Commercial remains covered as an intended allowed operator.

## Verification

- RED: focused route suite produced 5 passes and 1 expected failure because Viewer
  received HTTP 200.
- GREEN: focused route suite passed 6/6 under Node.js 22.23.2.
- Web source typecheck passed under Node.js 22.23.2.
- Focused route ESLint passed with zero warnings.
- `git diff --check` passed for the focused source and test changes.
