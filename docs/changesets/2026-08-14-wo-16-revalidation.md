# WO-16 — Permit and mobilization revalidation

## Status

PARTIALLY VERIFIED. Source-level permit, duration-profile, audit, tenant
boundary, and four-return mobilization checks pass. Live database replay and
authenticated browser mutation proof remain unavailable in this environment.

## Changed

- Corrected the global permit list and permit staleness sweep to join projects
  on both `id` and `tenant_id`.
- Preserved the existing additive permit/mobilization migration and the
  database-enforced start gate; no permit type, duration band, or external
  return was fabricated.

## Verification

- WO-16 static contract gate: PASS.
- JavaScript syntax checks: PASS for the changed gate and existing sweep/page
  modules.
- Live PostgreSQL migration and RLS replay: NOT RUN; Docker daemon/Supabase CLI
  are unavailable.
- Authenticated permit status, escalation, and mobilization browser flow: NOT
  RUN; no provisioned local Auth tenant is available.

## Release boundary

No hosted migration, production data write, deployment, commit, or push was
performed.
