# Cortex entity retrieval repair

## Outcome

- Prioritize meaningful entity-name terms over generic question language.
- Rank direct graph matches by matched term count, then recency.
- Prefer a matching account as the entity anchor, then place its current,
  tenant- and role-scoped graph relations before weaker direct matches so its
  canonical opportunity cannot be crowded out.
- Return explicit no-relevant-context output for a specific entity miss;
  recent-record fallback requires broad wording with no entity-specific terms.
- When an account anchors retrieval, discard weaker direct non-account matches;
  retain linked records and additional matching accounts for disambiguation.
- Apply the same retrieval behavior to deterministic fallback, legacy Web chat
  prompts, and queued Core assistant generation evidence.

## Verification

- `pnpm --filter @third-code-erp/database test -- src/cortex/retrieve.test.ts`
- `pnpm --filter @third-code-erp/database exec vitest run src/cortex/retrieve.test.ts src/cortex/graph-entity-matches.test.ts`
- `pnpm --filter @third-code-erp/api exec vitest run src/cortex/cortex-assistant-generation.processor.spec.ts`
- `pnpm --filter @third-code-erp/web test -- src/app/api/cortex/chat/route.test.ts`
- `pnpm --filter @third-code-erp/database typecheck`
- `pnpm --filter @third-code-erp/api typecheck`

No provider calls, deployment, schema changes, dependency changes, or permission
expansion were made.
