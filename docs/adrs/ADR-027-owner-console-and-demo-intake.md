# ADR-027: Owner console and global demo intake

- Status: Accepted
- Date: 2026-08-25
- Owners: Third Code Solutions Inc.

## Context

ABI OPS is tenant-isolated by design. Its operational records all retain a
`tenant_id`, and the current active session model intentionally remains
single-tenant per user (ADR-022). The product owner needs a small, platform
level console to provision company workspaces, view cross-organization health,
and review inbound demo interest. A prospective buyer has no tenant before
they submit a demo request, so that request cannot truthfully carry a
`tenant_id`.

## Decision

1. Introduce an owner console under `/owner`, outside the tenant dashboard.
   The route and every owner mutation verify the authenticated Supabase user's
   normalized email against a server-only, fixed allowlist. At launch the only
   permitted address is `kurt@thirdcodesolutions.com`.
2. The owner console has read-only aggregate and organization-level visibility
   across existing tenants. It does not create a tenant-switching mechanism,
   widen tenant RLS, or expose cross-tenant data to browser clients.
3. Add two server-only global tables:
   - `platform_demo_requests` stores public, pre-tenant demo inquiries and
     owner review state.
   - `platform_audit_log` records append-only platform actions, including
     demo submission, demo review, and organization creation.
4. Both tables enable and force RLS, deny direct client access, and grant
   access only to trusted server paths. Public submissions are validated and
   rate-limited by the application server; no anonymous database policy is
   introduced.
5. Organization creation provisions only the tenant record. It deliberately
   does not create an Auth user or a second tenant membership: the current
   signup trigger provisions a tenant per new auth user, and ADR-022 forbids
   silently activating cross-tenant membership or switching behavior.

## Consequences

- Only a verified, authenticated Kurt account can read platform analytics or
  personal data in demo requests. Tenant admins retain no access to these
  platform records.
- An owner-created organization starts with zero users. Provisioning its first
  administrator is a follow-up capability that must reconcile the existing
  signup trigger and ADR-022's single-tenant session boundary.
- Demo inquiries are not tenant data. Their retention, follow-up process, and
  eventual conversion into a tenant require separate operational policy; this
  decision only captures and reviews the request.
- The platform audit trail is append-only and stores only the minimum action
  metadata needed to explain privileged behavior; the request itself remains
  the source of contact details.

## Verification requirements

1. The owner-access helper accepts the canonical owner address and rejects
   close variants and all other addresses.
2. The migration enables and forces RLS, revokes client access, and provides
   no direct `anon` or `authenticated` table policy for either global table.
3. Public demo submission is schema-validated, does not expose database
   credentials, and emits a platform audit event.
4. Owner organization creation and demo status changes re-check owner access
   server-side and emit platform audit events.
5. The owner route renders aggregate data without changing any tenant-scoped
   authorization helper, RLS policy, or foreign key.
