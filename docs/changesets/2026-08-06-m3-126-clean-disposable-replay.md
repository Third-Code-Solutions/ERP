# M3.126 - Clean disposable PostgreSQL replay

## Scope

- bootstrap a fresh local PostgreSQL 17.10 replay database
- apply all 97 ordered Supabase migrations and the deterministic seed
- verify catalog/security invariants and run database tests with zero skips

## Evidence

- database: `erp_clean_head_20260806_m3125` in `ThirdCodeERP-Test`
- `scripts/verify-database-repro.mjs`: pass, 97/97 migrations
- database Vitest: 51/51 files, 324/324 tests, zero skips
- catalog snapshot: 119 public tables, 303 public policies, 119 RLS tables

## Boundary and rollback

This is disposable source replay evidence. No hosted Supabase, Vercel,
Railway, flag, or tenant-data state changed. Drop only the named disposable
database when the local lane is retired; no production rollback is required.
The pinned Supabase CLI schema-diff/CI artifact remains open.
