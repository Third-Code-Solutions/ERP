# M3.165 Cortex provider budget authority

## Outcome

Added a disabled-by-default, Nest-owned provider cost reservation authority.
No provider, hosted database, or deployment action occurred.

## Changes

- Strict reserve/dispatch/settle/release contracts using integer micros.
- Forced-RLS, service-only PostgreSQL policy and attempt ledgers.
- Immutable tenant/job/attempt identity and explicit database state machine.
- Request and UTC-day ceilings serialized on the exact policy row.
- Exact idempotent replay and audited state changes without prompt content.
- Global false-by-default gate plus exact-tenant allowlist.
- Unit, migration, database integration, and clean replay coverage.

## Validation

- Shared: 260/260.
- API: 589/589.
- Web: 676/676.
- Python advisory worker: 8/8.
- Database: 354/354, zero skips; full API integration passed.
- Migrations: 108/108 clean replay.
- Schema reproducibility: matching SHA-256
  `ED239E894DF4109848F2EFC991F041217DE955880C4CF6092ECF029CEB966E74`.
- Workspace lint, typecheck, Nest build, and Next production build passed; 82
  pages generated.
- Spend guard 4/4, controlled release 5/5, Actionlint, pinned workflow refs,
  Gitleaks across 548 commits, and diff hygiene passed.

## Rollback

Keep `ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_ENABLED=false`, keep the tenant
allowlist empty, and do not seed a provider policy. Do not down-migrate an
applied production ledger. Stop reserve/dispatch and terminalize any existing
reservation through Nest before removing source integration.

## Release boundary

Source-only. No Vercel/Railway build or deploy, hosted Supabase operation,
provider/AI/image call, credential addition, paid resource, or Vercel Git
reconnection.
