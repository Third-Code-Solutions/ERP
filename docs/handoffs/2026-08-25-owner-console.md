# Owner console and demo intake handoff

## Delivery contract

- **Goal:** Let the ERP owner create company organizations, inspect
  cross-organization operational analytics, and review public demo requests.
- **Owner boundary:** Only the authenticated Supabase account whose email is
  `kurt@thirdcodesolutions.com` may use `/owner`.
- **Out of scope:** Tenant switching, automatic user invitation/provisioning,
  billing, email notifications, and changing existing tenant RLS.
- **Acceptance:** A public visitor can submit a validated demo request; Kurt
  can review and change its status, create an organization, and see platform
  aggregates. No ordinary tenant administrator can open the owner console.

## Sequential handoff plan

1. **Agent 01 — Product/PRD:** Record the true-global-table exception and
   non-activation of multi-tenant access in ADR-027. Completed.
2. **Agent 04 — Schema:** Add server-only global demo/audit tables, Drizzle
   schema, indexes, and forced RLS. Next.
3. **Agent 12 — Security:** Implement and test the server-only owner allowlist
   and verify no direct client access to the global tables.
4. **Agent 05 — Backend:** Implement validated demo submission, owner review,
   organization creation, aggregate queries, and platform audit writes.
5. **Agent 03 — App Router:** Add public and owner routes with loading/error
   states and protected middleware coverage.
6. **Agent 02 — UI:** Deliver responsive, semantic forms and analytics views
   using existing ABI OPS tokens.

## Boundary note

The current signup trigger creates a tenant for every new Auth user. This work
therefore creates an organization record only; it does not silently add or
move users across tenants. See ADR-027 and ADR-022.
