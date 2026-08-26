# ADR-028: Approved platform-global table exception for BUILD OPS invariants

- Status: Accepted
- Date: 2026-08-27
- Owners: Third Code Solutions Inc.

## Context

The BUILD OPS migration invariant requires every application table to declare
`tenant_id NOT NULL`. That rule protects the default tenant-isolation model and
must remain the default for every new table. ADR-027 introduced two narrowly
different records: a public prospect has no tenant before conversion, and
platform-owner actions require an audit trail that is not owned by a customer
tenant.

The existing owner-console migration therefore creates
`platform_demo_requests` and `platform_audit_log` without `tenant_id`. Both
tables are already designed as server-only records: RLS is enabled and forced,
client roles receive no table privileges, and the platform audit table rejects
updates and deletes. The invariant checker currently knows only the historic
`tenants` exception, so it rejects this otherwise intentional migration.

Making the tenant rule broadly configurable, or treating every RLS-protected
table as global, would turn a release blocker into a tenant-boundary bypass.

## Decision

`verify-build-ops-invariants` may exempt only the following exact,
case-insensitive public table names from the `tenant_id NOT NULL` rule:

1. `platform_demo_requests`
2. `platform_audit_log`

The allowlist is a fixed checker constant. It must not accept configuration,
prefixes, glob patterns, comments, aliases, or caller-provided table names.
`tenants` remains the existing root-table exception; this ADR adds no other
global-table class.

Each allowlisted table must fail closed unless the migration source proves all
of the following:

1. Row-level security is both enabled and forced for that exact table.
2. `public`, `anon`, and `authenticated` have no direct table grants. The
   migration must explicitly revoke their access and must not subsequently
   grant it.
3. No RLS policy grants direct access to `public`, `anon`, or
   `authenticated`. A policy without an explicit role is treated as public and
   therefore fails this requirement.
4. `platform_audit_log` is append-only. It must have a row-level `BEFORE
   UPDATE OR DELETE` trigger that invokes a rejection routine, so even trusted
   server paths cannot alter historical audit evidence.

The exception is limited to static migration verification. It does not grant a
client role access, change existing tenant policies, introduce tenant
switching, or authorize service-role use outside the server-only paths recorded
in ADR-027.

## Verification requirements

The checker and its automated tests must prove both approval and rejection:

1. **Positive:** the current owner-console migration passes only when both
   named tables have forced RLS, no direct client grants or policies, and the
   append-only platform-audit trigger.
2. **Negative — scope:** an unallowlisted table without `tenant_id NOT NULL`
   fails, even when its source includes RLS and client-role revocations.
3. **Negative — RLS:** each allowlisted table fails when `FORCE ROW LEVEL
   SECURITY` is absent.
4. **Negative — client access:** each allowlisted table fails when a later
   grant or policy exposes it to `public`, `anon`, or `authenticated`.
5. **Negative — audit immutability:** `platform_audit_log` fails when the
   update/delete rejection trigger or its rejecting behavior is absent.

The database migration contract test remains responsible for asserting the
concrete SQL shape. The invariant test suite must exercise synthetic failing
migrations as well as the existing valid migration so a future edit cannot
expand the allowlist accidentally.

## Consequences

- Tenant-scoped tables continue to require `tenant_id NOT NULL`; no tenant
  model, RLS policy, or client capability is weakened.
- A future platform-global table requires a new accepted ADR and a deliberate
  checker/test change. It cannot inherit this exception implicitly.
- Changes to either approved table's grants, policies, RLS mode, or audit
  immutability are release-gating security changes and require the positive and
  negative invariant tests to remain green.
- ADR-027 remains the product decision for owner-console data; this ADR only
  defines the enforcement boundary needed for release verification.
