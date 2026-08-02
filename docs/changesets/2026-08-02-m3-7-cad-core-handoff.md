# M3.7 CAD processing authority handoff

Date: 2026-08-02  
Source commit: `0cfb72a`

## Change

The existing upload flow now has a closed-by-default canary seam for binary
DWG processing. An explicitly allowlisted tenant can submit the job to the
Nest document-processing API and poll an authenticated status proxy. Core
rejection or unavailability returns `processing-unavailable`; the Next legacy
CAD writer is never used after selecting the core path. Other tenants and
formats retain the compatibility behavior.

## Safety boundary

No schema migration or hosted provider mutation is included. Keep the Next
selector and all API-side processing/evidence/worker/draft-BOM gates disabled
until the hosted planner clears and the demo-tenant release evidence exists.
Python remains a signed, read-only evidence provider and cannot approve or
finalize ERP state.

## Validation

- Focused: 4 files / 36 tests.
- Full Web: 57 files / 342 tests.
- Workspace lint, Web typecheck, and production build: 78/78 routes.
- CI: [run 30738075103](https://github.com/Third-Code-Solutions/ERP/actions/runs/30738075103).
- E2E remains credential-gated; no hosted SQL, deployment, queue, flag,
  provider, or business-data mutation occurred.
