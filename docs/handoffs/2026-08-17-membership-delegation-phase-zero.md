# Membership and delegated-approval Phase 0 handoff — 2026-08-17

## Scope

This handoff implements only the safe foundation established by ADR-022. It
does not enable multi-tenant sessions, delegate an approval, seed ABI policy,
or change an existing foreign key/RLS authority path.

## Ordered work

1. **Agent 01 — Product/PRD Guardian:** completed ADR-022. The authoritative
   business blocker remains PRD O-03: the signed ABI Delegation-of-Approval
   matrix.
2. **Agent 04 — Schema Lead:** add an additive dormant membership/delegation
   migration and matching Drizzle schema. Backfill each current user to a
   default membership; preserve `users` as the live source of authority.
3. **Agent 12 — Security/DevSecOps:** verify RLS default-deny and tenant-safe
   foreign keys on a disposable database. No authenticated client CRUD policy
   may be added in this phase.
4. **Agent 05 — API & Backend Logic:** no implementation in this phase. A
   future Core-only evaluator requires ABI O-03 plus a separate handoff.

## Guardrails

- No change to `auth_tenant_id()`, JWT claims, session tenant selection, or
  existing `approvals`/`approval_rules` authority.
- No direct browser access to the new tables.
- No downstream foreign-key repoint, `users.tenant_id` removal, or commercial
  approval default is in scope.
- Use a rollback-only disposable database test; do not reset shared local or
  hosted databases.

## Current transition

→ Handoff to Agent 04. Reason: ADR-022 authorizes only the additive dormant
schema foundation. Inputs: ADR-007, ADR-022, PRD O-03/WO-15, and the existing
`users`, `approval_rules`, `approvals`, RLS, and audit contracts. Expected
output: a migration and schema with no activated cross-tenant authority.
