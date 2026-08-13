# Cortex Conversation Context Protected Review

## M3.196 source-only protected boundary (2026-08-10)

This packet records the disposable HTTP harness for
`GET /v1/cortex/conversation-context`. It composes the real
`SupabaseJwtGuard`, `CapabilityGuard`, controller metadata, strict query pipe,
and a stub context resolver. Synthetic identity and membership data stay in
process; no managed database, Supabase token, browser session, deployment, or
provider is touched.

### Evidence

- Missing bearer is rejected with 401 before identity lookup or context
  resolution.
- A verified identity is joined to its database membership; the resolver sees
  only the membership-derived `userId`, `tenantId`, and role.
- A caller-supplied `tenantId` is rejected with 400 and cannot reach the
  resolver. The fixture uses tenant B membership while attempting tenant A.
- A token without an ERP tenant membership is rejected with 401 before the
  resolver.
- Focused test: 3/3 in
  `apps/api/src/cortex/cortex-conversation-context.protected.spec.ts`.
- Full local lanes: shared-types 286 tests, API 153 files/682 tests, Web 102
  files/697 tests; typechecks/lint; Nest webpack; Next 82-page production
  build; spend, controlled-release, Actionlint, workflow-ref, Gitleaks, and
  diff guards green.

### Release identity and rollback gate

Source evidence does not certify a hosted release. Before any tenant canary,
record the exact Git SHA, API release identity, Web release identity, database
migration state, and readiness/log evidence for the same candidate. The
rollback artifact is the prior known-good Web/API release plus the unchanged
flags and empty tenant allowlists. Rollback means disabling both owner/context
flags, restoring the prior release alias, and verifying the legacy route; do
not reverse or invent a database migration during this read-only slice.

Unresolved external gates: hosted auth/session replay, real cross-tenant
database replay, API/Railway identity, Web/Vercel identity, browser evidence,
and spend approval. Core/Web canaries remain false with empty allowlists.
