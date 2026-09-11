# Platform global-table invariant exception

- Added ADR-027 documenting the server-only global platform role-assignment
  and platform-audit tables.
- Updated the build-ops invariant scanner with the explicit ADR-027 allowlist;
  all other new tables still require `tenant_id NOT NULL`.
- Added regression coverage proving approved globals pass and unapproved globals
  fail the gate.
- Reconciled the source-only managed-Supabase parity manifest to the added
  migration (157/169 applied, 12 pending); this records source bookkeeping only
  and does not apply SQL to the hosted project.
