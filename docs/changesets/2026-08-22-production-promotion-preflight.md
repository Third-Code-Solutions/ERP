# Production promotion preflight — 2026-08-22

## Status

**PARTIALLY VERIFIED.** Production database schema promotion is complete for
the linked ERP Supabase project. Source application promotion is deliberately
pending the protected GitHub pull-request and production workflow.

## Completed

- Confirmed the linked ERP Supabase target is active and healthy.
- Compared local and remote migration ledgers; every historical migration
  matched and exactly three additive migrations were pending.
- Ran a remote `db push --dry-run`, then applied only the three reviewed
  migrations for Structural and Civil normalization and controlled project
  retirement.
- Re-read the remote migration ledger and confirmed all three versions are
  recorded remotely.
- Updated the dated managed-Supabase parity manifest to the confirmed 150/150
  applied linear ledger, with no pending source migrations.
- Passed the full API suite, full Web suite, lint, typecheck, production build,
  static release contracts, local migration/RLS proof, and the isolated
  document-intake Playwright scenario.

## Remaining release gates

- Protected PR CI must run the production data-boundary scan with its protected
  connection and explicitly configured demo-tenant allowlist.
- The production application workflow must deploy the API, CAD worker, and Web
  service, then complete its health and role-matrix smoke checks.
- Project retirement remains safely feature-gated until an approved exact tenant
  UUID is configured; it is not enabled globally by this release.

## Security note

The remote Supabase advisor currently reports warnings for public `vector`,
public callable `SECURITY DEFINER` functions, and disabled leaked-password
protection. They are outside the three applied migrations, but remain
follow-up security work.
