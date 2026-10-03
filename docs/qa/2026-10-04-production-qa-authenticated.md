# Production QA — Authenticated Surface

Target: `https://thirdcode-erp.vercel.app`
Session: `kurt@thirdcodesolutions.com` — role **Admin**, workspace **ABI OPS**
Deployment revision (from `/api/health`): `efa32923c0f0`
Date: 2026-10-04 (MPST) · Browser: HeadlessChrome/154
Companion document: `docs/qa/2026-10-04-production-qa-unauthenticated.md` (21 findings, unauthenticated surface)

Method: authenticated crawl of all 30 sidebar routes (tenant workspace) + all 8 `/platform-admin` routes,
with a persistent instrumented collector (`window.__qa`: `error`, `unhandledrejection`, `console.error/warn`,
wrapped `fetch` ≥400, CSP violations). Every route was fetched twice (nav + `fetch(..., {cache:'no-store'})`)
and the served HTML inspected. Credentials were supplied to the browser through the credential vault only;
no secret value appears in this report.

---

## Summary

| # | Severity | Area | Finding |
|---|---|---|---|
| A1 | **BLOCKER** | `/platform-admin` | All 8 platform routes are non-functional: HTTP 200 + fail-closed "Platform data unavailable" |
| A2 | **BLOCKER** | `/scope` (Takeoff) | "ERP Core API is unavailable. Project list was not read." |
| A3 | **HIGH** | Auth | Session cookies are neither `HttpOnly` nor `Secure` |
| A4 | **HIGH** | Auth | "Keep me signed in for 7 days" is non-functional (400-day cookie either way) |
| A5 | MEDIUM | Observability | `/api/health` reports `ok:true` while two prod surfaces fail |
| A6 | MEDIUM | `/platform-admin` UX | Fail-closed panel instructs "Refresh the directory and audit log" — no such control exists |
| A7 | MEDIUM | `/dashboard` | Intermittent "Executive analytics are temporarily unavailable" |
| A8 | LOW | Metadata | Document titles inconsistently prefixed with a horse emoji |
| A9 | LOW | API shape | `POST /auth/login` without the action header returns 200 HTML, not 405 |
| A10 | LOW | A11y | Remember-me checkbox has no `id` and no programmatic label |
| A11 | LOW | A11y | Password show/hide toggle is `tabindex="-1"` (keyboard-unreachable) |
| A12 | INFO | — | Verified-clean list (nav, console, CSP, empty states) |

Two BLOCKERs mean the product is **partially unusable in production right now**: the entire platform-control
surface is dark, and one tenant screen reads live data through a dependency that is not answering.

---

## A1 — BLOCKER — `/platform-admin` is entirely non-functional

Every platform route returns **HTTP 200** with a fail-closed panel and zero data.

| Route | H1 | Rendered body | Tables | Rows |
|---|---|---|---|---|
| `/platform-admin` | Platform overview | 703 chars | 0 | 0 |
| `/platform-admin/tenants` | Tenants | 708 | 0 | 0 |
| `/platform-admin/users` | Users | 724 | 0 | 0 |
| `/platform-admin/roles` | Roles | 688 | 0 | 0 |
| `/platform-admin/analytics` | Analytics | 1,221 | — | — |
| `/platform-admin/audit` | Platform audit | 788 | — | — |
| `/platform-admin/system-health` | System health | 741 | — | — |
| `/platform-admin/integrations` | Integrations | 726 | — | — |

Visible copy on the overview: heading `Platform data unavailable` under a `Platform overview` H1, plus a
second banner `Support context could not be verified`.

Evidence: `platform_admin_routes.json` (8/8 routes `unavailable: true`, `notFound: false`).
Anti-false-positive checks performed: not a 404, not an error boundary, no redirect loop, no partial data,
identical result on repeat loads hours apart, and identical from both `/dashboard` navigation and direct
URL entry. The gate itself is intact (unauthenticated `/platform-admin` 307s to `/auth/login`).

Impact: tenant-level administration is unreachable. Support/ops cannot see tenants, users, roles, audit or
health. `/platform-admin/system-health` being down means the one page an operator would use to diagnose
this is also down.

## A2 — BLOCKER — `/scope` (Takeoff) cannot read projects

```
Projects unavailable
ERP Core API is unavailable. Project list was not read.
```

HTTP 200, 778 chars, 0 rows. Reproduced on two independent passes and via direct `fetch()`. This is an
explicit dependency failure, not an empty state — contrasted with the other 28 tenant routes, which render
legitimate empty states for this (empty) workspace.

## A3 — HIGH — Session cookies lack `HttpOnly` and `Secure`

Both Supabase session chunks, read from the live browser after a normal login:

```
sb-aqqrtkmtcsfkbyyqxowv-auth-token.0   httpOnly:false  secure:false  sameSite:Lax  expires:2027-11-07
sb-aqqrtkmtcsfkbyyqxowv-auth-token.1   httpOnly:false  secure:false  sameSite:Lax  expires:2027-11-07
```

* `httpOnly:false` is confirmed empirically: the cookie values are visible to `document.cookie` from page JS.
* `secure:false` means the tokens are eligible to be transmitted over plaintext `http://`.
* Inconsistency: the app's own theme cookie (`erp_theme`) **is** `Secure` + `SameSite=Lax` — so the
  lower-level cookie policy is applied elsewhere in the same app.

Impact: any XSS (including third-party script, since the unauth report already flags CSP `'unsafe-inline'`)
becomes full session theft of the access **and** refresh token. QA note: the session token was necessarily
exposed to a headless browser during this test — sign the QA account out / rotate credentials after the run.

## A4 — HIGH — "Keep me signed in for 7 days" does nothing; the stated lifetime is wrong

Controlled A/B, same account, same browser, only the checkbox differed:

| Login | Checkbox | Cookie | Lifetime |
|---|---|---|---|
| 1 | checked | `…auth-token.0/.1`, `session:false` | **400 days** (2027-11-07) |
| 2 | unchecked | `…auth-token.0/.1`, `session:false` | **400 days** (2027-11-07) |

Two defects: unchecking does not reduce the session (no session-scoped / shorter-lived cookie), and the
label's "7 days" contradicts the actual 400-day persistence. A user who deliberately opts out of a
persistent session still gets a ~13-month credential on a shared machine.

## A5 — MEDIUM — Health check is a monitoring blind spot

`GET /api/health` → `200 {"ok":true,"service":"abi-ops-web","revision":"efa32923c0f0",...}` while A1 and A2
are live in the same deployment. The endpoint proves the web tier can serve a static JSON response; it does
not exercise the platform service or the ERP Core API path. Any uptime monitor built on it would report
green through both outages. (The `revision` field additionally publishes the commit SHA — already logged in
the unauthenticated report.)

## A6 — MEDIUM — Fail-closed state offers a control that does not exist

The unavailable panel tells the operator to *"Refresh the directory and audit log."* The only buttons
rendered on any platform route are `Open navigation`, `Search navigation`, `Collapse sidebar` and the theme
toggle — there is no refresh action, and the UI never retries. Recovery instructions that cannot be carried
out turn a fail-closed state into a dead end.

## A7 — MEDIUM — Intermittent dashboard degradation

`/dashboard` once rendered `Executive analytics are temporarily unavailable` (a distinct copy from A2's) and
recovered on the next load; not reproducible afterwards, and not present in the SSR HTML on re-fetch. Likely
the same missing-dependency class as A1/A2 reaching a different code path with a transient failure. Logged
as intermittent, not as a persistent defect.

## A8 — LOW — Inconsistent title branding

Most routes title as `🐴 <Page> | ABI OPS` (e.g. `🐴 Dashboard | ABI OPS`), but `/process` renders
`Process Health | ABI OPS` and `/auth/login` renders `Sign in | ABI OPS` — no emoji. Tab/bookmark/SEO titles
are inconsistent across the app.

## A9 — LOW — Login endpoint answers 200 HTML to a bare POST

`POST /auth/login` without the Next.js server-action header returns the rendered login page (200, HTML)
rather than 405. Same family as the earlier "`/api/*` 404 returns HTML page" finding: server surfaces do not
distinguish API clients. Consequence for this test: it also makes server-side throttling untestable with
plain HTTP probes.

## A10 / A11 — LOW — Form accessibility

* Remember-me checkbox: `<input type="checkbox" name="remember" class="auth-checkbox">` — no `id`, no
  `aria-label`; labelled only by the wrapping `<label>`. Fine for humans, fragile for tooling.
* Password show/hide toggle: `tabindex="-1"` — unreachable by keyboard (re-confirmed on this pass; carried
  forward from the unauthenticated report).

## A12 — Verified clean (authenticated) — no false positives raised

* **Navigation**: all 30 sidebar destinations return 200. (`/closeout` and `/cnps` 404 — but these are *not*
  the shipped links; the real targets are `/warranty` and `/warranty/cnps`, both 200. Reclassified as no
  defect.)
* **Runtime**: zero `error` events, zero `unhandledrejection`, zero `console.error`, zero CSP violations
  across ~30 routes and two full passes.
* **Error boundaries**: never triggered; no React error fallbacks observed.
* **Empty states are legitimate**: this workspace holds no records — `/dashboard` KPIs read ₱0 across
  0 deals with 6 summary rows, and data tables render "No …" empty states. Not bugs.
* **Sign-out works**: clears both session cookies and redirects to `/auth/login`.
* **Theme toggle works and persists**: dark ⇄ light applied to both clicks, persisted via the `erp_theme`
  cookie (`Secure`, `SameSite=Lax`). The newest shipped feature is functional — no defect.
* **Deliberately not claimed**: `nonce=""` on script/style tags is Chrome's nonce-hiding behaviour, not an
  empty CSP nonce — the CSP header itself carries a valid nonce.

---

## Root-cause hypothesis for A1 / A2

Both failures name an external dependency the web app cannot reach, both return 200 with fail-closed copy
(by design), and the deployment's own health endpoint reports healthy. Most likely the production
environment is missing/invalid for the platform-service and ERP-Core API base URLs (or those services /
network paths are down), rather than an auth/role problem: the request is authorised (no 401/403 and the
role gate passed — an unauthenticated request 307s away), and the failure is identical for every route and
markedly consistent. Unproven from outside; needs Vercel env + service-side logs to confirm.

## Untested / blocked

* Cross-tenant RLS isolation — requires a second tenant login.
* Audit-log and mutation flows (approvals, status transitions) — requires a writable production dataset,
  which was out of scope for read-only QA.
* Invite / password-reset token validation and expiry.
* Server-side auth rate limiting — no lockout was observed in the UI after repeated failures, but the
  login endpoint is a server action (see A9), so plain-HTTP throttling probes are invalid; Supabase-side
  limits remain unverified.
* Role-based gating of `/platform-admin` (admin-of-tenant vs platform staff) — cannot be separated from the
  A1 outage with a single account.
