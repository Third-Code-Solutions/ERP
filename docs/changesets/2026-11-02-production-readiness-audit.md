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

1. **Dependency advisories** (`next` 15.5.28, pnpm overrides, dev-graph
   bumps) landed through PR #129. Versions, audit evidence and the waiver table
   are recorded in
   [`2026-11-04-dependency-audit-remediation.md`](2026-11-04-dependency-audit-remediation.md);
   that changeset is authoritative where the two differ.
2. **`verify-doc-authority` rotted** — PRD moved to v1.5 (dark-mode work) but the
   verifier still pinned v1.4, so `pnpm test:doc-authority` failed. Assertions
   updated to v1.5.
3. **Gates that CI never ran** — doc-authority, roadmap-foundation, type-safety,
   app-router-boundaries, abi-ops-brand and production-surface contract tests
   existed but were not in `ci.yml`; that is how (2) went unnoticed. They are now
   steps in the `Unit Tests` job.
4. **Stale blocker** — `docs/blockers/2026-10-04-core-api-readiness-hang.md`
   marked resolved with live evidence; its mistyped service domain corrected.

## Recorded risk acceptances

The audit waivers (zod, minimatch, deepmerge and the rest), their compensating
controls and their 2026-12-04 expiry are recorded in the 2026-11-04 changeset
above.

## Remaining (owner action, not code)

- **Deploy**: at the time of this audit, production web served revision
  `04b3ac5a6139`. The dependency fixes go live with the production promotion of
  #129.
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
