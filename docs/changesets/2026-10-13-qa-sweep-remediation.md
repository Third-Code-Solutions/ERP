# 2026-10-13 — QA sweep remediation (pompompurin review)

Source: latest review/QA sweep by `pompompurin` (Hermes task board) for
Third Code ERP.

## Fixed

1. **CI FAIL — Security Scan → "Audit production dependencies"**
   (run `38310322245` on `main`; the sweep counts 3 of 12 recent runs red).
   The failing push (`a07c1dfd`, `ci: notify Discord channel on deploy status`)
   changed nothing but workflow files — newly published advisories
   `proxy-addr` (critical), `shell-quote` (critical) and `source-map-js` (high)
   reddened the audit. Cleared via pnpm overrides (`proxy-addr@2.0.8`,
   `shell-quote@1.11.0`, `source-map-js@1.2.2`) plus `next@15.5.27`,
   `sharp@0.35.5` and removal of the stale `argparse` override.
   Verified against this lockfile: `pnpm audit --prod --audit-level low` →
   clean (exit 0); full-graph `pnpm audit` (the second audit in ci.yml) →
   exit 0 with "1 high (1 ignored)" — the deliberately waived `braces`
   advisory.

2. **WARN — landing `/` clipped containers (3, incl. a hero one)** and
   **8 tap targets below the 24px minimum** (both reproduced exactly at
   1280×720, and re-measured after the fix):
   - `.heroRail`/`.heroMeta` now wrap (`flex-wrap: wrap; row-gap: 6px`)
     instead of clipping at narrow widths.
   - `.featureGrid` desktop rows changed from
     `minmax(270px, 0.95fr) minmax(250px, 0.8fr)` to content-sized
     `minmax(270px, auto) minmax(250px, auto)`. The fr rows computed to
     347px against 396px of `featureCardTrust` content, so
     `overflow: hidden` clipped ~49px (sweep's "clipped container"
     findings). The ≤700px media query already used auto rows; the desktop
     base rule was the outlier.
   - `.footerLinks a` gets `display: flex; align-items: center;
     min-height: 24px` (8 links measured 18px tall).
   - The landing contract test (`abi-ops-landing.test.ts`, "keeps readable
     hero sizing and responsive layout safeguards") now pins the new
     `minmax(270px, auto) minmax(250px, auto)` rows plus the wrap and 24px
     tap-target safeguards, replacing the stale `minmax(270px, 0.95fr)`
     expectation it carried.

3. **WARN — login tap target**: the "Create an account" link (`auth-link
   auth-link-strong`) measured 18px; the base `.auth-link` rule in
   `apps/web/src/app/globals.css` now enforces the 24px minimum. It is the
   only violation on `/auth/login` (the 16px checkbox is a label-wrapped
   control, not a link target).

4. **WARN — no `.github/dependabot.yml`**: added weekly npm updates
   (minor/patch grouped to keep the PR queue short; majors individual) and
   github-actions updates for the SHA-pinned workflows.

5. **INFO — no `SECURITY.md`**: added the security policy (private
   vulnerability reporting flow, supported line, secrets handling).

6. **INFO — no `CODEOWNERS`**: added default owners
   (`@kurtgav @ncmatcs @thirdcodekurt`, `.github/` for CI/security).

7. **INFO — no declared `e2e.yml`**: added
   `.github/workflows/e2e.yml` (`workflow_dispatch` + weekly schedule)
   mirroring the trusted-PR `e2e` job in ci.yml. It is skipped (not failed)
   while no isolated E2E target is configured and fails loudly once one is
   configured incompletely.

## Verified

- `pnpm audit --prod --audit-level low` → clean; full-graph `pnpm audit` →
  exit 0 (only the waived `braces` advisory).
- Landing/login measurements re-taken in the live DOM at 1280×720 before and
  after the CSS fixes.
- Full PR CI gate (typecheck, lint, build, unit, db, actionlint, security)
  runs on the accompanying pull request before merge.

## Remaining (owner action, not code)

- ~33 open stale agent PRs (31 conflicting, all 60–240 commits behind
  `main`) plus fully-merged remote branches: rebase/close/prune decision is
  with the owners; merged-out branches are pruned as housekeeping.
- The sweep's own `e2e` SKIP (credentials missing) and dependabot-alerts
  `403` SKIP are sweep-runner token/permission issues, not repo defects —
  the repo's E2E variables/secrets are configured (green "E2E Tests
  (trusted PR)" on the #122 merge run).
