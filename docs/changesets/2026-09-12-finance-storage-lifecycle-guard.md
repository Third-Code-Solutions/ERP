# Finance Storage lifecycle guard

Both bank-statement signing and cleanup now authorize through the existing authenticated `getUserProfile()` RLS boundary instead of Auth identity plus a privileged tenant/role lookup. The profile boundary requires an active user and active tenant; the route still separately enforces `finance.manage_cash`. Tenant-scoped paths, upload gates, Core routing without fallback, input validation and audit ordering are unchanged.

## Verification

- RED: `pnpm --config.engine-strict=false --filter @third-code-erp/web exec vitest run src/app/api/finance/reconciliation/import/sign/route.test.ts` — 8 failed, 12 passed. With an unavailable active profile but the legacy Auth identity and privileged role row still available, seven cases incorrectly returned 200 and one reached the 503 feature gate. Both methods and all four upload-gate/Core-forwarding combinations were covered.
- GREEN: `pnpm --config.engine-strict=false --filter @third-code-erp/web exec vitest run src/app/api/finance/reconciliation/import/sign/route.test.ts src/lib/auth-profile.test.ts` — 24 passed, no skips. Includes capability rejection for both methods and Core denial without privileged Storage fallback.
- Web `tsc --noEmit` passed. Focused ESLint passed production route source; the test file is ignored by repository ESLint configuration, not independently linted. Existing Next pages-directory warning remains. `git diff --check` passed.
- Main independently strengthened `packages/database/src/__tests__/platform-administration.database.test.ts` and reported 10/10 passing on the local synthetic authority database, plus database types. Actual authenticated own-profile SELECT returns one row while active and zero after user or tenant suspension/disablement. This is real local PostgreSQL lifecycle evidence, separate from the route tests' mocked hidden profiles; no hosted lifecycle mutation was performed.
- Main independently reviewed the complete route/test diff and reran the route, auth-profile and neighboring reconciliation action suites: 36/36 with the JSON no-skips assertion. Independent Web types and production-route lint also passed; the existing Next pages-directory warning remains. Full fresh CI and deployment are not yet verified.

## Boundaries and handoff

No migrations, provider calls, new dependencies or Auth/session changes are included. Existing signed URLs and in-flight operations are not revoked by this route authorization change. Local Node 24/pnpm 10 required the existing engine-strict override; CI Node 22 remains the authoritative runtime gate. No commit, push or deployment was performed by Agent 03.

→ Handoff to Agent 12/13 (main): independently review the route and real database proof, then verify the separate branch through CI. Preserve the KYC release/recovery hold and do not merge this correction into its PR.
