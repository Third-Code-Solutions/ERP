# Provider spend gate

## Summary

The controlled release planner now requires a green static provider spend
guard. The guard keeps Vercel Git deployment disabled and rejects Vercel or
Railway deploy commands in workspace manifests and workflows. Missing spend
evidence blocks release aggregation.

## Validation

- `pnpm test:provider-spend-guard` — 4/4
- `pnpm test:controlled-release-plan` — 5/5
- `node scripts/verify-vercel-spend-guard.mjs` — clear
- live read-only controlled plan — Railway/Vercel readiness 200; database,
  duplicate Purchase Order, and audit gates remain review-required

No provider build/deploy, hosted SQL, Storage, or tenant-data mutation.
