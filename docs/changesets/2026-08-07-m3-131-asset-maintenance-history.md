# M3.131 asset maintenance history

## Scope

- add tenant-scoped append-only operational asset service history;
- add exact-cent/date constraints, audit trigger, forced RLS, and service-only
  idempotency ledger;
- move list/create authority through closed-by-default NestJS routes;
- add shared contracts and Web asset detail/timeline/form behind exact gates.

## Verification

- shared contract tests: 3/3;
- API focused run: 111 files, 473 tests;
- Web ERP Core client tests: 116/116;
- package typechecks pass;
- self-hosted WSL replay: 98/98 migrations, verifier pass, 20 integration
  files/27 tests, database 51/51 files/324 tests, zero skips.

## Release boundary

No hosted Supabase SQL, Vercel build/deploy, Railway deploy, feature flag, or
tenant-data mutation occurred. Flags default false and allowlists default
empty. Serial full source gates pass; push only the reviewed feature branch.
