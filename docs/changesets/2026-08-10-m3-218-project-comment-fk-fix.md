# M3.218 - Project-comment tenant-preserving delete evidence

## Outcome

Deleting a project comment no longer attempts to null the required tenant
identity in retained create/delete workflow evidence. Only nullable
`comment_id` references are cleared; replay and audit rows remain scoped.

## Changed

- Added forward migration
  `20260810120000_project_comment_delete_fk_tenant_preservation.sql`.
- Added database migration/schema contract regression.
- Documented the PostgreSQL composite-FK failure and correction.

## Evidence and limits

Disposable PostgreSQL 17/Redis 7.4.9 replay passed 116/116 migrations,
370/370 database tests with no skips, API integration, and equal
schema-before/after SHA-256
`4FCC37BD3D4BE7B40F108812C7E57D30BC25806E4D7F71D10E8FDE8665C3FDD2`.
Root tests, lint, typecheck, production build (82/82 routes), boundary,
workflow, spend, and diff checks passed. No hosted SQL, deployment, provider,
or paid state changed. Protected browser and hosted release proof remain open.
