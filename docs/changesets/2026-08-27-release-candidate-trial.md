# Release-candidate trial hardening

## Scope

- Replace application-side invitation provisioning with the trusted,
  server-owned `tenant_invite_v1` Auth-trigger contract.
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

Local implementation and disposable-database evidence are complete. The
authenticated 13-role browser matrix is intentionally not claimed complete:
this workspace lacks an explicitly identified isolated E2E base URL, test
user credentials, project ID, and role-matrix authorization. CI now fails
closed if those trusted-PR inputs are absent. No deployment was requested or
performed.
