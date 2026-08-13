# ABI OPS internal branding consistency

Date: 2026-08-13

## Scope

Renamed the active marketing component, stylesheet, content module, hero
assets, metadata paths, and exported component to the `abi-ops` product slug.
Added `ABI OS`, `abi-os`, and `AbiOs` checks to the active source/build brand
contract so stale product identifiers cannot re-enter the shipped web artifact.
The contract now scans raw public assets as well as source and build output.
The live production-surface contract also rejects legacy `ABI OS` output when
the former legal name is not present.
Removed two active Supabase Realtime `any` casts from dashboard and pipeline
refreshers; channel registration now uses typed chaining.
Added CI-enforced type-safety scanning for production source; test fixtures
remain isolated from this contract.
Made robots and sitemap metadata routes runtime-dynamic so their canonical
origin follows the configured server origin in local, self-hosted, and hosted
runtime checks rather than a stale build-time port.
Replaced core auth boundary `Error` throws with typed `AuthError` values that
preserve user-safe messages and expose `UNAUTHENTICATED` or `FORBIDDEN` codes.
Added bounded `safeActionError` handling to admin user, rate-card, material,
and mapping actions; full provider/SQL details now remain server-side.
Applied the same bounded error handling to upload signing, document access,
CAD/vision completion, and takeoff import API responses; provider details are
logged server-side only.
Hardened isolated standalone smoke packaging by excluding non-runtime evidence
directories and using bounded .NET cleanup. Runtime smoke passed on port 3094;
Windows left one nested `config` path during disposable-copy cleanup.
Removed stale Turbo test output declaration; root test fan-out now runs without
false `coverage/**` artifact warnings.

## Verification

- PASS - root `pnpm test`: shared-types 130/130, database 112 passed with
  152 environment-gated database skips, API 53/53, web 380 passed with 3
  environment-gated integration skips.
- PASS - root `pnpm typecheck` and `pnpm build`; API build passed and web
  generated 78 routes.
- PASS - isolated standalone smoke on port 3094: health, landing, nonce CSP,
  robots, sitemap, and ABI OPS manifest. Cleanup emitted a Windows access
  warning for one disposable junction tree.

- PASS - live-surface contract unit tests: 3/3, including `ABI OS`-only
  legacy output.
- BLOCKED - public Vercel alias remains on revision `dpl_F1Xo2hfh` with the
  old service identity, `ABI OS` manifest, and legacy landing copy; no deploy
  was authorized or performed.
- PASS - auth typecheck, auth boundary unit test, web typecheck, and full web
  Vitest suite: 380 passed, 3 environment-gated skips.
- PASS - isolated web production build after auth/admin hardening; 78 routes.

- PASS — isolated web production build; 78 routes generated.
- PASS — ABI OPS source/build brand contract: 2/2 tests.
- PASS — active router boundary contract: 111 pages covered.
- PASS — production type-safety contract: active source scan clean.
- PASS — provider-backed local production browser smoke: 4/4 Playwright tests;
  public metadata, responsive layout, auth redirects, security headers, and
  console/page-error checks passed.
- PASS - bounded authorization-error audit: procurement and project-billing
  Server Actions no longer return raw caught error messages; focused web tests
  passed 9/9.
- PASS — local production surface contract against the same runtime.
