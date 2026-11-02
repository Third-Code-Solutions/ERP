# 2026-11-02 — Production-readiness audit (code-side)

Scope: what can be verified and fixed from the repository and read-only live
probes. Provider configuration, hosted data, deploys and GitHub plan/billing are
owner actions and are listed under "Remaining".

## Verified green (this worktree, Node 22.23.0, pnpm 10.33.0)

- `pnpm lint` (max-warnings=0): clean.
- `tsc --noEmit` for shared-types, database, auth, operations, api, web (incl.
  the web e2e tsconfigs): clean.
- Root contract/boundary scripts: production-data-boundary, production-auth-proof,
  production-ci, production-surface, type-safety, app-router-boundaries,
  web-db-boundary, abi-ops-brand, release-identity-plan, controlled-release-plan,
  vitest/playwright no-skips: pass.
- Live (read-only): Core `GET /ready` 200 in 0.19s (`database: ok`, `redis: ok`);
  web `GET /api/health` 200 with `coreApi.state = ok`; web `GET /api/ready` 200;
  HSTS, CSP (nonce + strict-dynamic), X-Frame-Options DENY, nosniff,
  Referrer-Policy, Permissions-Policy present.

## Fixed

1. **Critical — `next` 15.5.27 → 15.5.28** (`eslint-config-next` aligned).
   GHSA-2464-fhr4-w9xw: unauthenticated RCE in the Image Optimization API when
   SVG files are used; GHSA-p3m5-59mp-jv5r: App Router Server Actions DoS. Both
   affect the version currently serving production.
2. **High — pnpm overrides**: `multer` 2.4.0 → 2.5.0 (GHSA-q7qp-rjg7-q26m),
   new `body-parser` 2.4.0 (GHSA-27r3-jxmh-p828), new `systeminformation`
   5.33.19 (inngest OpenTelemetry host-metrics chain; three advisories), `qs`
   6.16.0 → 6.16.1 (GHSA-6pq8-jhm2-2vcw). `packages/auth` carried its own
   `next@15.5.27` devDependency and is bumped too.
   Dev-graph advisories (the second CI audit): `vite` 7.3.5 → 7.3.7, `vitest`
   `^4.1.12` (pulls `@vitest/mocker` 4.1.12), `fast-uri` override 3.1.8 → 3.1.9,
   `@nestjs/cli>glob` override → 14.0.3.
   Result: `pnpm audit --prod --audit-level low` and the full-graph
   `pnpm audit --audit-level low` both exit 0 with the waivers below.
3. **`verify-doc-authority` rotted** — PRD moved to v1.5 (dark-mode work) but the
   verifier still pinned v1.4, so `pnpm test:doc-authority` failed. Assertions
   updated to v1.5.
4. **Gates that CI never ran** — doc-authority, roadmap-foundation, type-safety,
   app-router-boundaries, abi-ops-brand and production-surface contract tests
   existed but were not in `ci.yml`; that is how (3) went unnoticed. They are now
   steps in the verify job.
5. **Stale blocker** — `docs/blockers/2026-10-04-core-api-readiness-hang.md`
   marked resolved with live evidence; its mistyped service domain corrected.

## Recorded risk acceptances (new, in `pnpm-workspace.yaml` `auditConfig`)

| Advisory | Why no fix | Mitigation | Remove when |
|---|---|---|---|
| GHSA-mrhx-c7xc-m3w5 zod DoS (oversized constrained collections) | Fixed only in zod ≥ 4.6.6; repo is on 3.25.76 across 231 files | API JSON capped at 4 MB, Server Actions at 3 MB | zod 4 migration |
| GHSA-g3hv-75wg-m249 minimatch DoS (globparts) | Fixed only in minimatch ≥ 11.0.1, incompatible with `glob@7` required by exceljs → archiver | Patterns are archiver internals, not request input | exceljs/archiver upgrade |
| GHSA-gcqx-w48m-w2h4 deepmerge (low) | No patched release exists | Dev-only: `@nestjs/cli` → fork-ts-checker-webpack-plugin; absent from the production graph | deepmerge patch |

These are owner-reviewable decisions, not silent suppressions; the audit level is
unchanged and every other advisory still fails the gate.

## Remaining (owner action, not code)

- **Deploy**: production web serves revision `04b3ac5a6139`; `main` is ahead
  (dependency audit fixes, 24 px tap targets, this change). The `next` RCE fix is
  not live until a reviewed release runs.
- **Branch protection / required checks** cannot be enabled: the private repo is
  on a plan where the API returns "Upgrade to GitHub Pro". Merge gating is by
  convention only until the plan changes (open P2 from the defect register).
- **Email**: `RESEND_API_KEY` / `EMAIL_FROM` absent — password recovery, invites
  and business notifications do not deliver. A client cannot onboard users
  without this.
- **Recovery**: Supabase PITR disabled; Storage recovery and an isolated restore
  drill are unproven (C-004).
- **Open items from the 2026-09-28 ten-company NO-GO**: intermittent React #418
  hydration flake under the strict production role matrix, ten-company workload
  evidence, BIR 2307 official-template verification, approval delegation is a
  preview only.
- Dependabot `npm_and_yarn` run failed on 2026-11-01; ~33 stale agent PRs.
