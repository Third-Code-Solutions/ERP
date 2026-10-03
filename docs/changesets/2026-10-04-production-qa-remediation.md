# Production QA remediation — ABI OPS web + Core API

Source: `docs/qa/2026-10-04-production-qa-unauthenticated.md` and
`docs/qa/2026-10-04-production-qa-authenticated.md`.

## Outcome

### Root cause behind A1, A2, A5 and A7 — the Core API readiness probe never settled

Live evidence (taken during this work):

```
GET https://third-code-erp-api-production.up.railway.app/health -> 200 in 0.19s
GET https://third-code-erp-api-production.up.railway.app/ready  -> no response after 20s (http=000)
GET https://third-code-erp-api-production.up.railway.app/v1/projects -> 401 in 0.13s
```

The API process was healthy and its HTTP pipeline answered; only `/ready` hung.
`REDIS_CLIENT` is built with `lazyConnect: true` and `maxRetriesPerRequest: null`
(`apps/api/src/observability/redis.module.ts`), so `redis.ping()` on an
unreachable Redis queues the command instead of rejecting — the probe never
settles. Railway's `healthcheckPath = "/ready"` therefore never receives a
verdict, and the web tier's fail-closed Core-API calls surface the timeout as
"ERP Core API is unavailable. … was not read." That single defect explains the
non-functional Platform Control console (A1), the unreadable project list on
Takeoff (A2), the green monitoring (A5) and the intermittent dashboard
degradation (A7).

- `apps/api/src/health/health.controller.ts` — every dependency probe is now
  bounded by `Promise.race` against a 2s timer and reports per-dependency
  `ok | timeout | error`, so `/ready` always answers with a verdict. The Redis
  probe reads the client's connection status first, so the common "Redis is
  down" case fails in ~0ms instead of waiting out the timeout. `/health` stays a
  pure liveness check that touches no dependency.
- `apps/api/src/observability/provider-quota.service.ts` — same defect class on
  a user-facing path: `redis.eval` was unbounded, so an AI route would hang
  forever rather than return its intended fail-closed 503. The operation is now
  bounded and the existing `catch` runs.
- `railway.toml` — `healthcheckTimeout` 120s → 15s, with the reason recorded.
- `apps/web/src/app/api/health/route.ts` — the web health check now probes the
  Core API's `/ready` with a 2s bound and reports
  `dependencies.coreApi = ok | timeout | unreachable | unhealthy | not_configured`
  with `ok: false` / `status: "degraded"` when the dependency is down. HTTP stays
  200 for liveness; `?deep=1` opts into a dependency-gated 503 for monitors that
  want it. This is what stops uptime monitoring sitting green through an outage.

**Not yet verified in production:** both fixes need a deploy (Core API on
Railway, web on Vercel). See "Remaining" below.

### A3 — session cookies lacked `Secure`

`packages/auth/src/client.ts` and `packages/auth/src/server.ts` now pass
`cookieOptions: { path: '/', sameSite: 'lax', secure: NODE_ENV === 'production' }`.
`@supabase/ssr` only overrides `maxAge` (see `DEFAULT_COOKIE_OPTIONS`), so `secure`
is honoured. `httpOnly` cannot be set on these cookies: the browser client
refreshes the session from them, which is why the CSP hardening above matters
more than usual here.

### A4 — "Keep me signed in for 7 days" did nothing

Root cause, verified in the installed library (`@supabase/ssr@0.6.1`):
`createStorageFromOptions` and `applyServerStorage` both compute
`{ ...DEFAULT_COOKIE_OPTIONS, ...cookieOptions, maxAge: DEFAULT_COOKIE_OPTIONS.maxAge }`,
so **`cookieOptions.maxAge` is ignored in both the browser and server adapters**
and every session cookie is pinned to 400 days. The checkbox was not wired, and
wiring it through `cookieOptions` would not have worked either.

- New `apps/web/src/lib/session-persistence.ts` records the choice in its own
  cookie pair — `erp-session` (durable record: `session` or `remember.<expiry>`)
  and `erp-session-live` (session-scoped, written without a Max-Age) — and
  decides expiry.
- `apps/web/src/middleware.ts` enforces it: a non-remembered session whose
  browser-scoped cookie is gone, or a remembered session past its seventh day,
  is signed out (auth cookies cleared) and redirected to login. Sessions with no
  record at all — magic link, invitation, password recovery — are deliberately
  left alone, so no other sign-in flow changes behaviour.
- The checkbox now defaults to **unchecked** (2.9), which is the secure default
  and the behaviour the label describes.

### Security hardening (2.1–2.9)

- **2.1** `script-src` no longer carries a bare `https:` or `'unsafe-inline'` in
  production; the nonce + `'strict-dynamic'` policy stands alone.
- **2.2** `https://api.openai.com` removed from `connect-src` (no browser code
  calls it).
- **2.3** `img-src` narrowed to `'self' data: blob: https://*.supabase.co`.
- **2.4** CSP violation reporting added: `report-uri` + `report-to` directives,
  a `Reporting-Endpoints` header, and a new anonymous collector at
  `apps/web/src/app/api/csp-report/route.ts` (size-bounded, extracts only the
  fields an operator needs, never echoes the payload).
- **2.5** `/api/health` and `/api/ready` keep `service` and `revision` on the
  anonymous payload. They are release identity, not secrets: the promotion
  workflow asserts `revision == ${GITHUB_SHA:0:12}` against an anonymous probe
  of both routes (`deploy-production.yml:193–194`) and
  `scripts/verify-production-surface.mjs` asserts `service == 'abi-ops-web'` and
  `ok == true` — and the pipeline deploys *before* it verifies, so gating these
  fields would have failed the release after the new revision was already live.
  The genuinely sensitive value is the raw transport error, which carries the
  internal Core API hostname and driver detail; `detail` is returned only to a
  caller presenting `HEALTH_DETAIL_TOKEN` as a bearer token or `x-health-token`,
  and that token is not provisioned anywhere, so the fail-closed default is
  "never disclose".
- **2.6** Security headers (HSTS included) are now applied to the monitoring
  early-return path and to `/_next/static/*`, which the middleware matcher
  skips — the app-origin policy is consistent with itself.
- **2.7** `poweredByHeader: false`. `X-Nonce` is kept deliberately: it carries
  the same value as the CSP response header, so it discloses nothing new, and it
  is what makes a nonce mismatch debuggable.
- **2.8** `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Resource-Policy: same-origin` on all app responses. COEP is
  deliberately not set — `require-corp` would block Supabase-hosted objects the
  authenticated screens depend on.
- **2.9** covered above (checkbox defaults to unchecked).

### SEO / metadata (3.1–3.4)

- **3.1** The permissive root `robots` metadata is removed, so `/_not-found`
  (which Next.js renders with its own `noindex`) no longer emits both
  `noindex` and `index, follow`. The landing page declares its own `robots`.
- **3.2** Added `apps/web/src/app/favicon.ico` (16/32/48), `apple-icon.png`
  (180×180), and `public/icons/icon-192.png`, `icon-512.png`,
  `icon-maskable-512.png`, so `/favicon.ico` resolves and iOS/Android have real
  icons.
- **3.3** `manifest.ts` now sets `id`, `start_url: /dashboard`, `scope: /`,
  `orientation: any`, and the PNG + maskable icon set.
- **3.4** `robots.ts`: removed `/client` (404s), added `/platform-admin`, kept
  `/portal` (the bare path 404s but `/portal/bom/<token>` is real and must stay
  unindexed) and restored `/pipeline`, which an edit of mine briefly dropped.

### Performance (4.1–4.2)

- **4.1** The hero `Image` is now `priority`.
- **4.2** `images.formats: ['image/avif', 'image/webp']`. The PNG responses
  measured in the audit were fetched with `Accept: */*`; the optimizer returns
  the source format when the client advertises neither, which is expected
  behaviour rather than a misconfiguration.

### Accessibility (5.1–5.2)

- **5.1** `tabIndex={-1}` removed from the password toggle.
- **5.2** `autoFocus` removed from the login, signup, forgot-password and
  update-password forms.

### Functional (6)

- Unmatched `/api/*` paths now answer with the standard JSON error envelope
  instead of the framework's HTML 404 (`apps/web/src/app/api/[...unmatched]/route.ts`).
- A6: the platform-service failure copy no longer tells operators to "refresh the
  directory and audit log" (there is no such control) and no longer leaves the
  outcome ambiguous. `platform-admin-client.ts` classifies timeout vs
  unreachable, states that nothing was read or changed, and returns a reference
  id. Invalid-response handling now says retrying will not help.
- A2/A5: `erp-core-client.ts` logs the real failure — `not_configured`,
  `unauthenticated`, `timeout` or `unreachable` — with a trace id, instead of
  collapsing configuration, authentication and transport failures into one
  sentence. The shared `getCoreApiAccess()` path covers every caller; per-call
  transport logging in the remaining call sites is a follow-up.

## Verification

All of the following ran against the final working tree (Node 22.23.2):

- `pnpm typecheck` — 6/6 packages successful (web runs `tsc --noEmit` plus the
  seven e2e tsconfigs).
- `pnpm lint` — `eslint --max-warnings=0` clean.
- `pnpm test` — 5/5 packages. API 265 files / 1,565 tests; web 313 files passed
  (3 skipped) / 2,652 tests passed (6 skipped).
- `pnpm build` — 2/2 (Next production build + Nest build).
- That production build was served locally with `next start` and probed over
  HTTP, so the findings below are re-checked as behaviour rather than as code:
  - `/api/health` → `{"ok":true,"status":"degraded","service":"abi-ops-web",
    "revision":"…","dependencies":{"coreApi":{"state":"unreachable"}}}` — the
    release-identity fields the pipeline asserts are intact and only the raw
    `detail` is withheld (2.5, A5); `?deep=1` → 503 with `ok:false`;
    `/api/ready` → 503 with `database:"down"` when the database is unreachable,
    and 200 with `database:"up"` otherwise (2.5).
  - `POST /api/broadcast` and `/api/cortex/nope` → 404 `application/json` with
    `{"ok":false,"error":{"code":"NOT_FOUND",…}}` (6, A8).
  - CSP header: `script-src 'self' 'nonce-…' 'strict-dynamic'` — no bare
    `https:`, no `'unsafe-inline'`; `img-src` narrowed to Supabase Storage /
    `data:` / `blob:`; no `api.openai.com` in `connect-src`; `report-uri`,
    `report-to` and `Reporting-Endpoints` present (2.1–2.4).
  - No `X-Powered-By`; `Cross-Origin-Opener-Policy` and
    `Cross-Origin-Resource-Policy` present; `/_next/static/*.js` carries HSTS and
    `X-Content-Type-Options: nosniff` (2.6–2.8).
  - `/robots.txt` lists `/platform-admin` and `/pipeline`, not `/client`.
  - `/favicon.ico` → 200, 940 bytes, valid ICO magic; `/apple-icon.png`,
    `/icons/icon-{192,512,maskable-512}.png`, `/icon.svg` → 200 (3.2–3.3).
  - The 404 page emits exactly one robots meta, `noindex` (3.1).
  - `/auth/login` HTML: remember checkbox present and unchecked, no `autofocus`,
    no `tabindex="-1"` (2.9, 5.1, 5.2).
- New tests: `apps/api/src/health/health.controller.spec.ts` (4),
  `apps/web/src/middleware-session-choice.test.ts` (4),
  `apps/web/src/lib/session-persistence.test.ts` (4),
  `apps/web/src/app/api/health/route.test.ts` (4),
  `apps/web/src/app/robots.test.ts` (3), plus a bounded-quota case in
  `provider-quota.service.spec.ts`.
- `apps/web/src/middleware.test.ts` — 11 existing tests still pass.

## Dependency advisory remediation (`Security Scan` gate)

`Security Scan` is one of the nine `REQUIRED_CI_JOBS`
(`scripts/lib/production-ci-gate.mjs:10`), so a red audit blocks the deploy.
Lowering the audit level or disabling the job is not an option
(`docs/handoffs/2026-09-03-dependency-advisory-remediation.md:49`).

The fixable advisories were resolved by raising existing pins in
`pnpm-workspace.yaml` to the patched upstream releases — no package was added,
and the documented override baseline was extended in place, never replaced:

| pin | from | to |
|---|---|---|
| `minimatch@3>brace-expansion` | 1.1.18 | 1.1.21 |
| `minimatch@5>brace-expansion` | 2.1.4 | 2.1.7 |
| `minimatch@10>brace-expansion` | 5.0.9 | 5.0.12 |
| `multer` | 2.3.0 | 2.4.0 |
| `fast-uri` | 3.1.6 | 3.1.8 |
| `@opentelemetry/otlp-grpc-exporter-base>@grpc/grpc-js` | 1.14.4 | 1.14.5 |

Result: `pnpm audit --prod --audit-level low` → *No known vulnerabilities found*.

One advisory has no fix. `braces` **GHSA-vfj7-8cjw-p6xm** is flagged `<=3.0.3`
with `patched_versions: <0.0.0`; 3.0.3 is the newest published version and the
package has been unchanged since 2024-09-18, so no override can resolve it. It is
reachable only from the root devDependency chain
`eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces`,
and no `@next/eslint-plugin-next` release — through the latest 16.x — drops that
dependency, so there is no upgrade path away from it either. It is absent from
the production graph, which the prod audit confirms clean.

Resolution: a single-advisory waiver — `auditConfig.ignoreGhsas` in
`pnpm-workspace.yaml`, scoped to that one GHSA and documented in place. The audit
level is unchanged, the job still runs, and every other advisory still fails the
gate. After the waiver, `pnpm audit --audit-level low` reports `1 high (1
ignored)` and exits 0.

### `multer` 2.4.0 follow-up — Nest bump

The `multer` pin above (patched for **GHSA-3pph-fpjx-jg34**, a DoS on aborted
uploads, vulnerable `>= 2.2.0, < 2.4.0`) broke
`apps/api/src/documents/inspection-photo-upload.http.spec.ts`: multer 2.4.0
renamed the `LIMIT_UNEXPECTED_FILE` message from `Unexpected field` to
`Unexpected file field`, and `@nestjs/platform-express@11.1.28` matched that
error by message **text**, so the raw `MulterError` escaped as HTTP 500 instead
of the expected 400.

Fixed on the sanctioned path — select the upstream patched release instead of
patching around it: `@nestjs/common`, `@nestjs/core`,
`@nestjs/platform-express` and `@nestjs/testing` **11.1.28 → 11.2.7**, where
`transformException` switches on `error.code` (`isMulterExceptionCode`). The
first release carrying that fix is 11.2.6. No assertion was relaxed, no test
deleted, and no application code changed.

## Remaining — operator actions, not code

1. **Deploy both tiers.** Nothing here changes production until the Core API is
   redeployed on Railway and the web app on Vercel. Until then the Platform
   Control console and Takeoff project reads stay broken.
2. **WAF / Attack Challenge Mode (report §1).** Vercel edge configuration; it
   blocks non-browser clients (link previewers, uptime checks) and is
   intermittent. Decide whether the challenge stays on for the apex origin.
3. **HSTS policy (2.6).** The app origin now sets one policy, but the challenge
   path still serves `max-age=63072000; includeSubDomains; preload`. Choosing a
   single origin-wide policy — and whether to submit for preload — is a Vercel
   dashboard decision.
4. **`X-Matched-Path`** is injected by the platform, not by this repository;
   there is nothing in-repo to remove.
5. **Hero source asset (4.3).** `abi-ops-hero.png` is 1536×1024 and Next caps
   every variant at source width, so it is upscaled above 1536px and on HiDPI.
   This needs a ~2560–3840px replacement asset; no such asset exists in the repo
   and inventing one was not an option.
6. **Login rate limiting (report §6.1).** Sign-in goes from the browser straight
   to Supabase Auth, so this tier has no endpoint to throttle. Per-account
   lockout/throttle has to come from Supabase's auth rate limits or a Vercel WAF
   rule on `POST /auth/login`.
7. **A9 — `POST /auth/login` returns 200 HTML.** Framework behaviour: the login
   page is a React Server Component route, and Next.js serves any page route to
   a POST that carries no `Next-Action` header. Returning 405 would mean
   intercepting every non-API POST in middleware, which risks breaking
   server-action form posts for no security gain. The `/api/*` catch-all
   addresses the part of the finding that affects programmatic clients.
8. **Rotate the QA credentials and the QA session token** used during the audit,
   and delete any plaintext credential paste from the QA session.
9. **`HEALTH_DETAIL_TOKEN` is optional — the deploy does not need it.** It gates
   only the raw transport error in `dependencies.coreApi.detail`. `ok`,
   `status`, `service`, `revision` and the dependency `state` are always on the
   anonymous payload because the promotion workflow and
   `scripts/verify-production-surface.mjs` assert them
   (`deploy-production.yml:193–194`). Set it in the web deployment only if
   monitoring needs the underlying error string; without it probes still get the
   full verdict.

## Limits

- Every fix is verified by unit tests, typecheck, lint, a production build, and
  an HTTP probe of that build served locally — not against the live deployment.
  The production re-test has to happen after the deploy in (1).
- The authenticated E2E paths (Platform Control, Takeoff) were not re-exercised
  with real credentials in this pass; the fixes there are covered by unit tests
  and the fail-closed copy, not by a live walkthrough.
- Two audit items turned out to be inaccurate on re-probe and were not "fixed":
  `/portal` is a real prefix (`/portal/bom/<token>`), only the bare path 404s, so
  its `robots.txt` entry stays; and `/invite` returns 404 rather than the
  reachable page the first pass reported.
- `httpOnly` on the session cookies remains unset by library design (A3); the
  mitigation is the tightened CSP and the session-scoping work above.
