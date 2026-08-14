# Authenticated live dashboard evidence blocker

## Status

BLOCKED BY TEST IDENTITY. Anonymous production routing is verified, but
authenticated dashboard feature parity cannot be claimed without an
authorized test identity or an owner-approved authenticated browser state.

## Current evidence

- `https://thirdcode-erp.vercel.app/dashboard` redirects anonymous requests to
  `/auth/login`.
- The live login page renders as `Sign in | ABI OPS`.
- Isolated browser check recorded zero console errors, zero console warnings
  and zero failed requests on the redirected route.
- `/api/health` and `/api/ready` return HTTP 200.

## Required unblock evidence

Provide one of:

1. an authorized disposable production test identity with the required role
   matrix; or
2. an owner-approved Playwright authentication state containing no unrelated
   personal sessions.

Then run protected browser checks for dashboard, CRM, BOM, procurement,
projects, finance, permits, portals, Cortex and role-denied routes. Do not use
service-role SQL or inspect personal browser credentials as a shortcut.
