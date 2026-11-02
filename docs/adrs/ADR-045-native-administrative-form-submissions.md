# ADR-045: Native administrative form submissions

Status: accepted for local implementation and verification, 12 October 2026.

## Context

Production browser verification reproduced completed Settings and platform-support
mutations whose revalidated Server Action render never committed. HTTP bodies,
decoded Flight records, action results and module loads completed, while React's
transition remained suspended. An unrelated urgent UI update released the render
without another mutation. Form-state, remount-key and prefetch changes did not fix
the cause. This resembles reported upstream failures in
[Next #96233](https://github.com/vercel/next.js/issues/96233) and
[#97990](https://github.com/vercel/next.js/issues/97990); those reports are not an
accepted upstream diagnosis or a verified framework fix.

## Decision

Use native same-origin POST followed by an explicit 303 redirect and GET for
workspace Settings and platform-administration forms. Keep the existing mutation
authorization, schemas, services, transactions, audit and support-cookie rules.
Extract/reuse command handling rather than duplicating business rules. Fixed
operation and redirect allowlists prevent caller-selected commands or locations.

Route handlers must explicitly enforce same-origin requests and bounded,
URL-encoded form bodies: Server Action CSRF and body-limit protections do not
automatically apply to them. Missing or foreign Origin fails closed. Derive actor
and company authority on the server. Validation/command failures remain visible;
never retry a mutation automatically or turn an uncertain failure into success.
Preserve submit confirmation and pending-state behavior without intercepting the
native submission. Keep secure production cookies and CSP intact.

No dependency downgrade, timer-triggered React render, automatic mutation replay,
framework-internal patch, or general application migration is included. Remove
the unsuccessful diagnostic form-state and cache workarounds.

## Verification and limits

Verify denied origins, malformed/oversized bodies, unsupported operations, fixed
303 destinations and unchanged authorization. Browser checks must prove invalid
input feedback, cleared stale feedback after success, persisted legal details,
support start/end cookies, lifecycle changes and audit evidence. Exercise ordinary
client navigation separately. This transport decision does not establish that all
other Server Action workflows are unaffected; production acceptance must include
their actual critical journeys.
