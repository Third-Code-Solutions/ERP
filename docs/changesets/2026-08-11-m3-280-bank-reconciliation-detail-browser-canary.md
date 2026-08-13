# M3.280 - Bank-reconciliation detail browser canary

Date: 2026-08-11
Status: source-only, locally verified; no production cutover

## Scope

Extended the existing local Playwright loopback proof to navigate from the
reconciliation register to a seeded draft statement detail route. The harness
records the detail Core request separately from the register request.

## Evidence

- Detail response rendered the statement heading, imported-file provenance,
  line-by-line proof, both seeded descriptions, and `0 / 2` match progress.
- The proxy recorded the exact tenant-scoped detail path, session bearer, and
  UUID request ID.
- Browser proof: 1/1 PASS with authenticated local PostgreSQL/Nest/Next,
  desktop/mobile overflow checks, zero console errors, and blocked external
  requests.
- Web/API typecheck, lint, full workspace tests, API build, Actionlint,
  Gitleaks, provider-spend guard, and `git diff --check` PASS.

## Safety boundary

The detail selector remains closed outside the disposable canary tenant. No
hosted Supabase SQL/object, Vercel/Railway deployment, provider setting,
credential, or paid action changed.

## Next action

Review the remaining reconciliation action writers (auto-match, line
match/unmatch, reconcile, void) for separate idempotent Core authority seams.
