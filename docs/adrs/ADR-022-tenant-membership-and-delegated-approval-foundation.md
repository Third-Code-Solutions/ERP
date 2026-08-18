# ADR-022: Tenant membership and delegated-approval foundation

**Status:** Accepted — Phase 0 only · **Date:** 2026-08-17<br>
**Owners:** Product/PRD Guardian, Schema Lead, Security/DevSecOps, ABI commercial owner

## Context

The current live authorization shape is deliberately single-tenant per user:
`public.users.id` is the Supabase-auth principal, while `users.tenant_id` and
`users.role` are used by `auth_tenant_id()` and by composite foreign keys such
as `(tenant_id, created_by) -> users(tenant_id, id)`. ADR-007 records that at
least 58 tables rely on this shape. The process/SLA and approval tables also
reference the legacy user identity directly.

The CTO verdict correctly identifies tenant memberships and delegated approval
as an enterprise requirement. It does not, however, supply the ABI
Delegation-of-Approval matrix. PRD O-03 still lacks the approved object types,
amount bands, roles, sequence, escalation, separation-of-duties rules, and
delegation/revocation policy. WO-15 remains blocked by that input.

Changing `auth_tenant_id()`, repointing foreign keys, or allowing a caller to
select a second tenant before those decisions exist would create a
cross-tenant-authorization risk. It would also violate the PRD's additive-only
migration rule.

## Decision

### 1. Separate the concepts, but do not activate the new authority

Phase 0 adds a durable representation without changing any currently active
authorization path:

- `users` remains the compatibility profile and the sole active tenant/role
  source for sessions, RLS, and existing foreign keys.
- `tenant_memberships` records one tenant-scoped role for a user. Existing
  users are backfilled to one active default membership and future legacy user
  creation/role updates keep that default record synchronized.
- `approval_delegations` is tenant-scoped and may reference exactly one
  `approval_rule`. It has no generic "act as me" capability, no active API,
  no UI, and no evaluator.
- Neither table grants a browser client any read or write privilege. RLS is
  enabled and forced, all client grants are revoked, and an explicit
  `deny_direct_client_access` policy rejects `anon` and `authenticated`.
  This is intentional default-deny, not an incomplete client API.

The Phase 0 migration does **not** alter `auth_tenant_id()`, session claims,
`users.tenant_id`, existing RLS policies, the `approvals` foreign keys, or any
workflow's approval decision. A request therefore cannot select an arbitrary
tenant and a delegation row cannot decide, escalate, or approve anything.

### 2. Delegations are constrained records, not authority by implication

A future evaluator may consider a delegation only when all of the following
are true in the same transaction:

1. the delegator and delegate have active memberships in the same tenant;
2. the referenced approval rule is active and matches the final ABI matrix;
3. the time window is open and the grant is not revoked;
4. the delegation is within the final approved amount/object/sequence scope;
5. separation-of-duties and self-approval rules pass; and
6. the decision records both the effective actor and the delegator in the
   append-only audit evidence.

The Phase 0 schema enforces same-tenant composite foreign keys, an exact rule
reference, non-self delegation, non-empty reason, and a bounded effective
window. It does not invent ABI amount bands, role substitutions, escalation,
or an overlap policy. The original delegator's accountability and the exact
approval evidence shape are deferred until ABI approves O-03.

### 3. Staged activation is mandatory

| Phase | Required outcome | Explicitly not allowed |
| --- | --- | --- |
| 0 — foundation | Additive schema, compatibility backfill/sync, RLS default deny, regression proof | Cross-tenant sessions, approval decisions, client CRUD |
| 1 — policy | Signed ABI matrix and an acceptance test set for every band, role, sequence, escalation, delegation, revocation, and separation rule | Guessing policy from existing PO labels |
| 2 — active context | Server-owned active-membership selection, token/session revocation behavior, tenant-switch audit event, tenant-isolation E2E | Caller-supplied tenant headers or client-only switches |
| 3 — workflow | Core-only approval/delegation evaluator with idempotency, locks, audit, and policy conformance tests | Legacy Web fallback for approval decisions |
| 4 — compatibility retirement | Dual-read reconciliation and an approved, separately reviewed plan for every legacy FK/RLS dependency | Bulk FK repointing or removing `users.tenant_id` without measured parity |

The Phase 0 deployment recovery path is to stop before Phase 1 and leave the
new tables inert. There is no automatic destructive down migration; dropping
audited schema objects must be separately approved.

## Consequences

- New legacy users remain one-user/one-active-home-tenant at runtime, while
  the membership projection remains complete enough to validate later data
  migration work.
- Future user-role changes cannot silently make the membership projection
  stale; the compatibility trigger mirrors the legacy role for the default
  membership only. It does not create a second active tenant.
- A delegation is unusable until a Core evaluator and ABI policy are accepted.
  This is a deliberate safety property, not a product limitation hidden in the
  database.
- The current approval tables continue to reference legacy users. No foreign
  key is repointed in Phase 0.
- The design follows PostgreSQL's default-deny behavior through explicit
  rejection policies while retaining server-only access for future controlled
  workflows. See the [PostgreSQL row-security documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
  and [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Verification requirements

Before Phase 0 is considered implemented, prove on a disposable PostgreSQL
target that the migration:

1. backfills a matching default membership for each legacy user;
2. creates a matching membership for a new legacy user and mirrors a later
   legacy role update;
3. rejects cross-tenant delegation links, self-delegation, invalid windows,
   and direct authenticated access; and
4. leaves the existing `auth_tenant_id()` and current approval foreign keys
   unchanged.

Before Phase 1, obtain ABI O-03 and record its owner, effective date, source
file/hash, and approved test cases. No production tenant switch, delegated
approval, or foreign-key migration is authorized by this ADR alone.
