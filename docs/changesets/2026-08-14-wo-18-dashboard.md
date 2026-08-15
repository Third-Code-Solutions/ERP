# WO-18 — Management dashboard v1

## Status

PARTIALLY VERIFIED. The dashboard source contract and executive-page wiring
pass. Live tenant data, authenticated browser usability, and President-level
Monday-meeting acceptance remain unverified.

## Changed

- Added the existing tenant-scoped execution-health query to the executive
  dashboard payload and rendered the project margin/exposure section.
- Kept Active Pipeline TCV, Active GP with blended margin, Weighted Pipeline,
  and the closed-won metric; bounded Closed Won FYTD to the current calendar
  fiscal year using the opportunity closing date.
- Exposed project margin delta, cost variance against approved budget, permit
  exposure, unsigned-VO exposure, and SLA breaches by business unit without
  mixing unsigned VO or manual cost-log evidence into posted actual margin.
- Added a focused WO-18 contract gate for metric selection, FYTD bounds,
  tenant scoping, and management-health presentation.

## Verification

- WO-18 static contract gate: PASS.
- WO-17 cost-control contract gate: PASS.
- JavaScript syntax checks: PASS for the changed gate and test.
- Package JSON parse: PASS.
- `git diff --check`: PASS; Git reported only line-ending normalization
  warnings for the dirty working tree.
- Live PostgreSQL query/data verification: NOT RUN; Docker daemon and Supabase
  CLI are unavailable in this environment.
- Authenticated responsive dashboard/browser verification: NOT RUN; no
  provisioned local Auth tenant/browser runtime is available.
- President Monday-meeting acceptance: NOT RUN; this is a human acceptance
  criterion requiring live project data and a reviewer.

## Release boundary

No hosted migration, production data write, deployment, commit, or push was
performed.
