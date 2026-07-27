# Database migration recovery

Status: history parity restored on 2026-07-28; application release still gated
Owner: platform + database
Production mutation authorized: database migrations only; application writes remain disabled

## Finding

The repository and authorized Supabase migration ledgers now match.

- All 44 repository migration versions are recorded on the target.
- No remote-only version exists.
- A deterministic, secret-free `supabase/seed.sql` now exists.
- CI now defines a PostgreSQL 17 fresh-reset/catalog/diff job and fails when a
  database test is skipped. That workflow has not yet run on GitHub.
- Forward migration
  `20260726192929_cortex_cost_security_hardening.sql` closes the audited grant,
  RLS, chat ownership, graph/provenance, audit-chain, and cost-integrity gaps.
  It is applied.
- Forward migration `20260727162024_security_advisor_hardening.sql` fixes the
  audit helper search path and maintenance-helper execution grants.
- Local reset remains unproven on this workstation because Docker Desktop
  reports virtualization unavailable.

Application release remains gated on source publication, clean CI, preview
deployment, real Auth/Redis readiness, and rollback evidence.

## Recovery sequence

1. Back up production and capture a fresh migration/catalog snapshot.
2. Keep all 20 deployed migration files byte-exact. Do not rewrite or squash
   applied history.
3. Compare every missing May migration to the deployed catalog.
4. Mark a version applied only when the complete schema effect is proven
   equivalent; otherwise create a new forward migration.
5. Run the committed deterministic seed during reset.
6. Let the new CI job rebuild a disposable PostgreSQL 17/Supabase database from
   zero; retain its migration-list, test, and diff artifacts.
7. Require every database suite to execute; skipped suites fail the gate.
8. Require an empty schema diff and symmetric local/remote migration lists.
9. Rehearse on a sanitized staging clone.
10. Run only dry-run/history checks against production until explicit release
    approval.

## Forward hardening prepared

The new forward migration:

- revokes client `TRUNCATE`, `TRIGGER`, `REFERENCES`, audit forgery, and
  unneeded DML grants;
- makes graph and provenance writes trigger/server-owned;
- enforces tenant plus user ownership for Cortex conversations and messages;
- serializes provenance and audit hash-chain appends per tenant;
- adds cost amount/quantity checks, role-aware writes, immutable identity
  columns, and tenant-consistent BOM/PO line foreign keys;
- fixes `SECURITY DEFINER` search paths and preserves closed function ACLs.

Read-only production preflight passed: zero invalid conversations/messages,
zero invalid cost-domain values, and zero cost reference orphans. This is not
authorization to apply the migration.

## Definition of done

- All deployed migration timestamps exist in Git. **Passed.**
- Local and remote ledgers are symmetric.
- Fresh reset, second rehearsal, and schema diff pass.
- Database tests run without skips.
- Cross-tenant and same-tenant/different-user RLS tests pass.
- Client roles cannot forge graph/provenance rows or truncate tables.
- Trigger, function ACL, index, audit, and graph reconciliation checks pass.
- Staging reports no duplicate current nodes, dangling edges, or unexplained
  mirror deficit.
