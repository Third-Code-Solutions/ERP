# M3.123 - Read-only catalog security gate

## Scope

Make the database release planner expose the hosted security findings that
must stop a migration or provider release. This is source-only and read-only.

## Changes

- Added `analyzeSecurityCatalog` to the database release-plan library.
- Added catalog checks for direct `anon` table privileges and any policy role
  set containing `public`.
- Added JSON/human-readable security evidence and release blockers.
- Broadened the disposable verifier's public-policy check to role-array
  containment.
- Added blocked/green unit coverage.

## Evidence and boundary

- Focused planner tests: 9/9 pass.
- Full Turbo tests: 4/4; typecheck; TS-only lint; production build: 2/2;
  migration verifier; Actionlint; Gitleaks; controlled-release tests: 5/5;
  spend-guard tests: 4/4.
- Configured Supabase read-only planner: 55/97 migrations, 213 direct anon
  privilege rows, 209 public-role policies; release blocked.
- No hosted SQL, tenant-data write, provider setting, build, or deployment.

## Next action

Run the full local gates, push only the reviewed feature branch, and keep
Supabase/Vercel/Railway closed until the clean replay, backup, duplicate-PO
mapping, audit-recovery, rollback, identity, readiness, security, and spend
gates are green.
