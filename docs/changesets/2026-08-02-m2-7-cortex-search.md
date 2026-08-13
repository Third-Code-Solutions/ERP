# M2.7 Cortex source-grounded search

## Scope

- Add tenant- and role-scoped `GET /api/cortex/search` keyword retrieval.
- Validate Cortex node type/ref-table pairs before returning a source link.
- Add debounced graph-toolbar results for titles and summaries.
- Keep typing search provider-free: no embedding or LLM call per keystroke.
- Escape PostgreSQL ILIKE wildcard characters in shared Cortex retrieval.

## Safety

- Tenant and role come only from the authenticated server profile.
- Search is read-only; it cannot approve or finalize ERP transactions.
- Hosted SQL, flags, provider settings, deployments, and business data remain
  unchanged until the controlled release planner is clear.

## Validation

- Focused Cortex/search/graph/search-policy tests: 22/22.
- Web tests: 306/306.
- Database tests: 116 pass; 137 explicit environment-gated skips.
- Workspace typecheck, serial lint, `git diff --check`, and Next production
  build pass.

CI run `30712546507` passed all executable jobs on commit
`6d55248110e630ed01c16f903972c8d52ff70af2`; E2E is skipped by explicit hosted
credential gating.

## Release gate

Source candidate requires CI evidence and a fresh controlled-release planner
result. Existing hosted blockers remain: seven pending migrations, one
tenant-scoped 12-record Purchase Order-number duplicate group, and missing
owner-approved `AUDIT_RECOVERY_TENANT_ID`.
