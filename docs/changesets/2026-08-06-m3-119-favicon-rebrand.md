# M3.119 — align browser favicon with Third Code ERP identity

## Change

- replaced the legacy single-letter favicon mark with a `TC` mark
- added a product-brand regression test for the browser icon

## Validation

- `pnpm --filter @thirdcode/web test --run src/lib/branding-clean-room.test.ts`
- full local release gates remain required before any provider action

## Release boundary

No Supabase, Storage, Vercel, Railway, tenant-data, or billing-setting write
occurred. Feature branch only.
