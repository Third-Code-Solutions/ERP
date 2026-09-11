# ADR-027: Platform-owner administration boundary

- Status: Accepted
- Date: 2026-09-04
- Owners: Third Code Solutions Inc.

## Context

ThirdCodeERP has tenant-scoped operational data and a separate, restricted
platform administration surface. Platform ownership is not a tenant role: the
owner must be able to inspect tenant lifecycle, provision users, review global
security evidence, and manage integrations without turning a browser request
into a tenant-wide database bypass.

The platform owner assignment and its privileged audit evidence therefore have
different cardinality and retention semantics from tenant records. An owner
assignment is a single global identity binding, while a platform audit event is
global evidence that may reference (but must not be owned by) a target tenant.
Adding a nullable or synthetic `tenant_id` to either table would make a global
fact appear tenant-owned and would invite incorrect tenant-RLS assumptions.

## Decision

The following tables are approved as the only additional global tables:

1. `platform_role_assignments` contains the single active
   `platform_owner` identity binding. It is fixed to the verified owner email,
   uses an immutable user id, and is constrained to at most one active role.
2. `platform_audit_events` is append-only global evidence for platform actions.
   Its optional `target_tenant_id` identifies the tenant affected by an event;
   it is not a row-visibility or ownership column.

Both tables remain server-owned control-plane data:

- Row-level security is enabled and forced.
- `anon` and `authenticated` receive no table or sequence privileges and an
  explicit deny policy rejects direct browser access.
- Reads and writes are available only through the guarded platform service,
  which verifies the exact provider identity, active account, sole active
  assignment, recent authentication for mutations, and structured audit
  evidence.
- The platform audit table cannot be updated or deleted; compensation and
  denial are represented by new events.
- Every other application table, including platform support sessions and user
  invitations, remains tenant-scoped and must declare `tenant_id NOT NULL`.

The build-ops migration invariant scanner mirrors this decision with an
explicit allowlist containing `tenants`, `platform_role_assignments`, and
`platform_audit_events`. A new global table requires a new ADR and an explicit
allowlist change; it may not be added by changing the scanner rule generally.

## Consequences

- Platform authority cannot be confused with a tenant role or a selected tenant
  header.
- Global evidence can correlate cross-tenant operations while retaining the
  affected tenant as an auditable reference.
- The control-plane tables require server-side tests for force-RLS, browser
  privilege denial, owner uniqueness, and append-only behavior rather than a
  tenant-isolation test that would assert a column they intentionally do not
  have.
- Accidental creation of another global table fails the build-ops invariant
  gate until its security and ownership decision is reviewed.

## Rejected alternatives

- Adding `tenant_id` to the owner assignment: the assignment is the authority
  that spans tenants, so assigning it to one tenant would be misleading and
  could make a tenant policy appear to grant platform power.
- Adding a mandatory `tenant_id` to global audit events: the event describes
  the actor and target; a nullable `target_tenant_id` already preserves the
  target relationship without changing global retention and access semantics.
- Relying on application code without RLS or browser privilege revocation:
  control-plane data must remain default-deny if a query or credential is
  misrouted.
