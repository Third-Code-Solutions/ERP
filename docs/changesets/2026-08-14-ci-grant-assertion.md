# CI grant assertion repair — 2026-08-14

## Finding

Branch replay `31815625082` observed the intended ACL state—authenticated SELECT
`true`, authenticated INSERT `false`, anonymous SELECT `false`—but the new
assertion failed because PostgreSQL constant-folded `1 / 0` while planning the
`CASE` expression.

## Change

The CI step now selects a boolean and checks the normalized `t` result in Bash.
This keeps the gate fail-closed without relying on planner-dependent SQL errors.

## Verification

- PASS — authenticated-read/DML-revocation values observed in replay logs
- PASS — local Actionlint and invariant tests before this patch
- PENDING — complete CI replay after this patch
