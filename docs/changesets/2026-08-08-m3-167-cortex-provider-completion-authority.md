# M3.167 Cortex provider-grounded completion authority

Date: 2026-08-08

## Scope

Bind one official provider-grounded Cortex answer to exactly one settled
provider attempt. Preserve all existing deterministic behavior, public API
compatibility, disabled rollout gates, and the fake-only provider boundary.

## Changed

- Added the internal deterministic/provider completion union. Public results
  can report `provider_grounded`; signed/external completion callers cannot
  select it.
- Returned the exact settled provider-attempt identifier from provider
  execution and carried it through the generation processor.
- Relocked and verified tenant, job, current attempt number, settled success,
  consumed/reserved cost, policy model, claim fence, RBAC, context, and
  citations before the official atomic commit.
- Added nullable tenant-composite provider provenance, one-completion-per-
  attempt uniqueness, provider/deterministic state constraints, insert/change
  validation, and immutability for linked completions.
- Added shared, API, database structural, and real-transaction integration
  coverage for pre-settlement denial, model mismatch, valid completion,
  public-result parsing, and relink rejection.

## Files

- `apps/api/integration/cortex-assistant-generation.database.integration.spec.ts`
- `apps/api/src/cortex/cortex-assistant-generation.processor.spec.ts`
- `apps/api/src/cortex/cortex-assistant-generation.processor.ts`
- `apps/api/src/cortex/cortex-assistant-provider-execution.service.spec.ts`
- `apps/api/src/cortex/cortex-assistant-provider-execution.service.ts`
- `apps/api/src/cortex/cortex-assistant-turns.service.ts`
- `packages/database/src/__tests__/cortex-assistant-provider-completion-link.test.ts`
- `packages/database/src/schema/cortex-assistant-provider-budget.ts`
- `packages/database/src/schema/cortex-assistant-turn-requests.ts`
- `packages/shared-types/src/erp-api/cortex-assistant-generation.test.ts`
- `packages/shared-types/src/erp-api/cortex-assistant-generation.ts`
- `packages/shared-types/src/erp-api/cortex-conversations.test.ts`
- `packages/shared-types/src/erp-api/cortex-conversations.ts`
- `supabase/migrations/20260808110000_cortex_assistant_provider_completion_link.sql`
- Six architecture/operations memory documents plus this changeset.

## Validation

- Shared: 261/261.
- API: 599/599.
- Web: 676/676.
- Python: 8/8.
- Database: 358/358, zero skips.
- Clean migration replay: 109/109; full API integration passed.
- Schema SHA-256 before/after:
  `00D5475628D1ADB9042FE0CBCEDB914875121B8460B6850F8FBFA92D68D62FE5`.
- Lint, typecheck, Nest/Next production build (82 pages), spend 4/4,
  controlled release 5/5, Actionlint, pinned workflow actions, Gitleaks across
  550 commits, and diff hygiene passed.

## Release and rollback

No managed Supabase query/write, Vercel/Railway build or deploy, provider call,
credential, paid resource, or Vercel Git change occurred. All flags remain
false/empty. Rollback closes gates and stops dispatch; do not down-migrate,
delete the provider ledger/link, or repoint a linked completion.

## Next

M3.168 source-only provider-neutral request/response boundary: Nest-owned
bounded redacted envelope, deterministic dispatch identity, opaque receipt,
bounded timeout/error taxonomy, and fake-only retry/cancellation proof.
