# M3.168 Cortex provider request/response protocol

## Outcome

Added an original, provider-neutral, versioned request/response contract around
the existing Cortex budget and completion authority. Production dispatch stays
unavailable. No hosted or paid action occurred.

## Changed files

- `apps/api/integration/cortex-assistant-generation.database.integration.spec.ts`
- `apps/api/integration/cortex-assistant-provider-budget.database.integration.spec.ts`
- `apps/api/src/cortex/cortex-assistant-generation-completion.spec.ts`
- `apps/api/src/cortex/cortex-assistant-generation-completion.ts`
- `apps/api/src/cortex/cortex-assistant-generation.processor.ts`
- `apps/api/src/cortex/cortex-assistant-generation.state.ts`
- `apps/api/src/cortex/cortex-assistant-provider-budget.service.spec.ts`
- `apps/api/src/cortex/cortex-assistant-provider-budget.service.ts`
- `apps/api/src/cortex/cortex-assistant-provider-execution.service.spec.ts`
- `apps/api/src/cortex/cortex-assistant-provider-execution.service.ts`
- `apps/api/src/cortex/cortex-assistant-provider.adapter.ts`
- `apps/api/src/cortex/cortex-assistant-provider-protocol.ts`
- `apps/api/src/cortex/cortex-assistant-turns.service.ts`
- `apps/web/src/lib/branding-clean-room.test.ts`
- `packages/database/src/__tests__/cortex-assistant-provider-protocol.test.ts`
- `packages/database/src/schema/cortex-assistant-provider-budget.ts`
- `packages/shared-types/src/erp-api/cortex-assistant-provider-budget.test.ts`
- `packages/shared-types/src/erp-api/cortex-assistant-provider-budget.ts`
- `packages/shared-types/src/erp-api/cortex-assistant-provider-execution.test.ts`
- `packages/shared-types/src/erp-api/cortex-assistant-provider-execution.ts`
- `packages/shared-types/src/index.ts`
- `scripts/ci/run-wsl1-database-lane.ps1`
- `supabase/migrations/20260808120000_cortex_assistant_provider_protocol.sql`
- `docs/architecture/CURRENT_STATE.md`
- `docs/architecture/TARGET_STATE.md`
- `docs/architecture/MIGRATION_PLAN.md`
- `docs/architecture/DECISIONS.md`
- `docs/operations/WORK_LOG.md`
- `docs/operations/NEXT_ACTIONS.md`
- `docs/changesets/2026-08-08-m3-168-cortex-provider-protocol.md`

## Validation

- Shared 264/264; API 605/605; Web 676/676; Python 8/8.
- Database 362/362; API integration 36/36; migrations 110/110.
- Schema hash before/after:
  `923B227DB420320E184A26D5ECC4EF2BE79AE4F9E5D98C9B5CFA1BE77FCFE498`.
- Lint, typecheck, production build, spend/release guards, workflow checks,
  secret scan, and diff hygiene passed.

## Rollback

Close all provider/generation gates, reconcile open attempts, and preserve the
forward-only provider ledger and linked completion evidence. Do not down-migrate
or repoint settled provenance.
