# M3.2 — Purchase Order workflow seam

Date: 2026-08-02
Source commit: `fa3c20a`

## Scope

- Route draft submission, PM approval, and Commercial approval through the
  existing Nest workflow command for explicitly allowlisted tenants only.
- Preserve current direct Server Action behavior while the flag is closed.
- Carry stable browser retry keys for each supported workflow action.
- Leave SCM issuance and rejection unchanged until Nest state and notification
  parity exists.

## Verification

- Web tests: 54 files / 325 tests passed.
- Workspace typecheck and lint passed.
- Production build passed: 78/78 routes.
- Actionlint, gitleaks, workflow-reference checks, and diff checks passed.

## Release boundary

Source-only. No hosted Supabase SQL, Railway/Vercel deployment, provider
setting, feature flag, queue, or business-data mutation was performed. Hosted
release remains `review_required` due migration drift, duplicate Purchase
Order data, and missing audit-recovery tenant selection.
