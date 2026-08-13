# M3.125 - Capability evidence boundary refresh

## Scope

- align the capability matrix with source SHA `86db0e4`
- record local-versus-hosted evidence boundaries and current release blockers
- update architecture and operations memory only

## Validation

- documentation-only; no application or schema behavior changed
- no hosted SQL, provider setting, build, deployment, flag, or tenant-data write
- required next gate: `git diff --check`, clean-room/branding tests, then the
  normal source test/typecheck/lint/build gates

## Rollback

Revert this changeset and the six memory-document edits. No hosted rollback is
required because no external state changed.
