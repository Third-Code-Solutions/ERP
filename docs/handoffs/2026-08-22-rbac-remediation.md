# RBAC remediation handoff

## Objective

Close the role-level authorization bypasses identified in the 2026-08-22
dashboard RBAC audit without changing tenant boundaries or granting new business
authority.

## Authority and constraint

`packages/shared-types/src/authorization.ts` remains the active role policy.
The PRD does not define a replacement role-by-role entitlement matrix, so this
changeset must enforce the existing capability grants rather than infer new
commercial permissions. Any future decision to narrow CRM, pipeline, or
executive-dashboard visibility requires a Product/PRD decision first.

## Sequential ownership

1. **Agent 01 — Product/PRD Guardian:** Record the policy constraint and
   follow-up decision required for broad all-role read capabilities.
2. **Agent 12 — Security/DevSecOps:** Add fail-closed route policy and
   regression tests for direct-URL authorization.
3. **Agent 03 — Next.js App Router Engineer:** Apply page-level capability
   checks and capability-filtered project navigation.
4. **Agent 09 / Agent 11 — Dashboard and Pipeline:** Bind analytics and
   pipeline pages to the central capability policy.
5. **Agent 05 — API & Backend Logic:** Keep delivery scheduling authority in
   the central capability policy and server action.
6. **Agent 13 — CI/CD & Ops:** Expand the production role-matrix test to every
   seeded role once deterministic credentials exist for all 13 roles.

## Handoff status

This implementation keeps changes sequential and additive. It does not alter
the Phase 0 single-tenant session model in ADR-022, perform a migration, or
change production identities.
