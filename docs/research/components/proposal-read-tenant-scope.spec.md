# Proposal workspace tenant-scoped reads

## Outcome

Keep the proposal overview and client change-request log safe for a multi-
tenant ERP. A valid opportunity ID is not sufficient authorization for its
related rows; every read repeats the authenticated tenant predicate.

## Contract

- The opportunity and account join are constrained by `profile.tenantId`.
- PPRF submissions, site inspections, design files, and change requests each
  include both `opportunity_id` and `tenant_id` predicates.
- A change-request design-file join is tenant-constrained, so a cross-tenant
  foreign key cannot leak a design name into the log.
- The slice remains read-only. Existing server actions keep ownership of
  change-request writes, design locks, audit events, and BOM generation.

## Evidence

Source changes are limited to the two proposal server-rendered pages and the
canonical user-story index. Proposal action tests pass 2/2; the Web suite,
workspace lint/typecheck, diff check, and production build are required before
push. Authenticated browser proof remains separate when local Supabase DNS is
unavailable.

## Boundaries

No migration, schema, RLS, Storage, Nest authority, Railway setting, or Vercel
deployment changes. This closes a query-level isolation gap without guessing
at hosted data or bypassing provider release gates.
