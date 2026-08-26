# Release-candidate trial hardening

## Scope

- Replace the invalid `app_metadata.tenant_invite_v1` trigger contract with a
  server-created, hash-only, expiring one-use invitation intent validated from
  an opaque token in raw user metadata.
- Make the two ADR-028 platform-global tables explicitly server-only,
  forced-RLS, and append-only where applicable.
- Cover all 13 canonical roles in navigation, API role assignment, seeded
  test-account metadata, and the authenticated role-matrix test.
- Keep the role-account seeder and authenticated Playwright matrix on one
  canonical, deterministic identity manifest.
- Add `/book-demo` public intake and `/owner` platform-owner test coverage,
  including real-browser anonymous-route verification.
- Add no-skip reporting and V8 coverage gates for the affected Web, API,
  database, and shared-authorization release paths.
- Preserve the production CSP while documenting the separately tested,
  loopback-only local Supabase Realtime prerequisite for authenticated browser
  verification.

## Evidence

- Isolated PostgreSQL 17 replay: 438 database tests executed without skips;
  platform owner schema coverage: 100% statements, branches, functions, and
  lines (4 tests).
- The same disposable WSL lane executed 79 API integration tests and 2 Web
  database-integration tests without skips. The final isolated Web database
  integration run adds 3 owner/demo action tests (5 total), proving actual
  persistence and matching platform-audit records. The isolated unit reports cover
  974 Web, 806 API, and 396 shared-types tests, also without skips.
- The build-operations invariant suite has 15 passing tests, including
  standalone later-migration client-grant, client-policy, and RLS-weakening
  rejection cases.
- Web release coverage: 11 tests, 95.54% statements/lines, 70.27% branches,
  and 100% functions. Core API release coverage: 10 tests, 87.9%
  statements/lines, 71.69% branches, and 100% functions. Shared
  authorization coverage: 6 tests, 100% across all measures.
- Isolated Chromium browser checks passed for public demo intake and
  anonymous owner-console redirect, as well as the existing public landing
  candidate checks.

## Release status

**Local YES-GO for the controlled trial candidate.** The direct-SQL invitation
evidence was superseded by a real local Supabase Auth Admin API suite, which
passed all 16 invitation/self-signup cases with zero skips. This proves the
ADR-030 server-created, one-use invitation-intent path rather than the invalid
legacy `app_metadata` marker path.

The normal production build, lint, typecheck, no-skip, and invariant gates
passed. The production-mode authenticated Playwright matrix also passed for all
13 canonical roles after the tested, validated local loopback CSP path enabled
disposable Supabase Realtime without changing the production CSP source set.

This is local/disposable release evidence only. No deployment, production user
creation, production tenant write, provider configuration change, or
production-provider verification occurred.
