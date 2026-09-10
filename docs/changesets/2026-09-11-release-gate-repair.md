# Release-gate repair

The release branch now records the eleven source-only Supabase migrations in
the managed-parity plan without claiming that they were applied to a hosted
database. The dependency graph is pinned to patched `next`, `sharp`,
`@xmldom/xmldom`, `multer`, and Vitest versions so the production and complete
dependency audits are clear.

Verification: the parity unit/consistency checks pass locally and
`pnpm audit --prod --audit-level low` and `pnpm audit --audit-level low` report
no known vulnerabilities.
Hosted migration, provider deployment, and authenticated production E2E remain
guarded by the protected promotion workflow.

The finance payables and receivables HTTP canaries now derive overdue/current
fixtures from the captured UTC test day, keeping aging assertions deterministic
as the calendar advances without changing production clock behavior or HTTP
timeouts.
