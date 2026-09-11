---
kind: patch
area: e2e
summary: Rotate bounded browser contexts during the complete production route audit
---

The complete production route audit now rotates its anonymous and authenticated
browser contexts after a bounded batch of routes. Authenticated batches restore
the same controlled session storage state, so the audit still renders every
route and preserves the existing authorization, guard, console, page-error, and
deployment-revision assertions.

This releases page-scoped fetch and realtime resources that can survive long
sequences of full navigations in a single Chromium context. It does not change
application routes, data access, authentication behavior, or production data.

Local production E2E verification is not available in this workstation because
the repository dependency tree is intentionally incomplete and the workstation
Node runtime is 24.x; CI remains the authoritative Node 22 verification.
