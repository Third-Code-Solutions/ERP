# Owner console and demo intake

## Outcome

Added a platform-owner console at `/owner` and a public demo-request page at
`/book-demo`. The console is restricted server-side to the confirmed account
`kurt@thirdcodesolutions.com`.

## Delivered

- Platform-wide analytics for organizations, users, active projects, open
  opportunities, demo requests, and recent audit activity.
- Organization provisioning that creates a new tenant with a unique slug.
- Demo-request capture with input validation, consent, bot honeypot, review
  status, reviewer notes, and platform audit events.
- Global platform tables protected by forced RLS; only the server service role
  can access them. Platform audit records are append-only.
- Marketing calls to action now lead to the public demo-request page.

## Deliberate limitation

Creating an organization currently provisions its tenant record only. It does
not invite or attach an initial user because the existing signup trigger creates
a new tenant per user; activating membership provisioning before that trigger is
migrated would create duplicate organizations. ADR-027 records this follow-up.

## Verification

- PASSED: web and database type checks.
- PASSED: web lint, focused owner-route and marketing tests, database migration
  contract tests, type-safety guard, and App Router boundary checks.
- PASSED: browser verification of `/book-demo` at desktop and mobile sizes;
  unauthenticated `/owner` redirects to `/auth/login`.
- NOT RUN: migration application against a Supabase environment, authenticated
  Kurt account flow, and Node 22 production build. Local checks used Node
  24.16.0 with `engine-strict=false`; the repository requires Node 22.

## Deployment

No migration was applied and no environment was deployed.
