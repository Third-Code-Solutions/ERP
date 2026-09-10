# Release-gate repair

The release branch now records the eleven source-only Supabase migrations in
the managed-parity plan without claiming that they were applied to a hosted
database. The dependency graph is pinned to patched `next`, `sharp`,
`@xmldom/xmldom`, and `multer` versions so the high/critical production audit
findings are cleared.

Verification: the parity unit/consistency checks pass locally and
`pnpm audit --prod --audit-level high` reports no high or critical findings.
Hosted migration, provider deployment, and authenticated production E2E remain
guarded by the protected promotion workflow.
