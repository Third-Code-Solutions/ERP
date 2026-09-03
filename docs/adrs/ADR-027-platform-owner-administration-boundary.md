# ADR-027: Platform-owner administration boundary

**Status:** Accepted · **Date:** 2026-09-04
**Owners:** Product/PRD Guardian, Security/DevSecOps, Schema Lead, API/Backend, App Router

## Context

ABI OPS currently has one tenant-scoped role per authenticated user. The
`public.users` row supplies `tenant_id` and the tenant `role` enum used by Web,
Core API, and row-level security. A tenant owner or administrator must never
inherit authority over other tenants. ADR-022 also keeps the additive
`tenant_memberships` projection deliberately inactive; using it as an ad-hoc
tenant switch would violate that decision and create a cross-tenant boundary.

The platform operator needs a separate console for tenant lifecycle, user
invitations and account lifecycle, system-wide operational evidence, and
explicit tenant support. The initial and sole authorized identity is the
verified authentication account for `kurt@thirdcodesolutions.com`.

## Decision

### 1. Platform authority is a separate global security principal

`platform_owner` is not added to the tenant `role` enum and is never exposed by
tenant user-management forms or APIs. An additive global
`platform_role_assignments` table binds the literal role to an immutable
Supabase Auth user UUID and a normalized email. Database constraints allow only
the normalized email `kurt@thirdcodesolutions.com` and only one active
assignment.

A request has platform-owner authority only when all checks succeed:

1. Supabase Auth validates the session and immutable user UUID;
2. the provider identity has an email-confirmation timestamp;
3. the provider email, normalized assignment email, and fixed owner email match;
4. the assignment is active and not revoked; and
5. exactly one active `platform_owner` assignment exists.

Missing, ambiguous, stale, or unavailable evidence denies access. Client state,
request email, tenant role, user metadata, URL parameters, and caller-selected
tenant IDs never grant this authority.

### 2. Bootstrap and recovery are controlled operations

A server-only bootstrap command discovers the exact verified provider identity,
requires exactly one match, and creates the single assignment and audit event.
It is idempotent for the same immutable UUID and fails closed for any mismatch or
additional active assignment. It never prints credentials, tokens, or the full
immutable identifier.

No normal UI or tenant API can add, transfer, demote, suspend, revoke, or delete
the platform owner. Adding or transferring platform ownership requires a new,
explicitly authorized security change reviewed under this ADR. Recovery uses
Supabase's authenticated account-recovery flow, then reruns the read-only
bootstrap verification. If the immutable provider UUID changed, ownership is
not silently transferred; a reviewed forward migration and incident record are
required.

### 3. Global records are narrow exceptions to tenant-table rules

Four true-global tables are permitted as explicit exceptions to the normal
`tenant_id NOT NULL` rule:

- `platform_role_assignments` — immutable identity binding;
- `platform_audit_events` — append-only privileged/system event evidence; and
- `platform_support_sessions` — time-bounded, explicit tenant support context.
- `platform_user_invitations` — server-owned tenant/role intent consumed by
  Auth provisioning; invitation email is the only lookup key and never grants
  authority without the provider UUID and confirmation lifecycle.

All enable and force RLS, expose no direct `anon` or `authenticated` table
policy, and are accessed only through narrowly scoped security-definer functions
or server credentials after platform-owner verification. Their update/delete
rules protect identity and audit evidence. Target tenant IDs remain foreign-keyed
where applicable.

### 4. Suspension is authoritative at the tenant boundary

Additive lifecycle status fields are added to `tenants` and `users`. New records
default to `active`; existing records are backfilled as `active`. The
`auth_tenant_id()` helper returns a tenant only when both the current user and
tenant are active. Consequently, a suspended or disabled account loses the
tenant identity used by existing RLS policies. Web and Core guards additionally
return an explicit disabled/suspended denial before business logic.

The only platform owner's provider identity and assignment are protected from
self-suspension, self-disablement, deletion, and role transfer. Suspending a
tenant does not revoke platform-console access because platform authority is
evaluated independently.

### 5. Support context is explicit, server-owned, and temporary

Entering support context requires a selected tenant, a non-empty reason, and a
bounded expiry. The server persists the session and the browser receives only an
opaque, secure, HTTP-only, same-site identifier. Every supported operation
revalidates the session, actor, target tenant, expiry, and platform authority.
The console renders a persistent tenant-context banner and explicit exit action.
No general tenant switching is enabled, and ordinary tenant RLS is not widened.

Implementation contract: Web stores `erp-platform-support` as HTTP-only,
SameSite=Strict, Secure in production, scoped to `/platform-admin`, with the
server session expiry. Only the server forwards its opaque UUID to Core via
`x-platform-support-session`. Core checks actor/target/expiry/ended state under
transaction locks before existing-tenant mutations and before provider calls.
Tenant creation and global read-only directories are platform operations, not
support-context operations. Support may target an inactive tenant for lifecycle
repair; this does not grant tenant-workspace access. A second browser without
the context cookie does not inherit an actor's support mode.

### 6. Platform APIs authorize independently and audit fail closed

Every `/v1/platform-admin/*` or compatibility `/api/platform-admin/*` endpoint
performs its own platform-owner check and validates input with Zod. Cross-tenant
mutations require an explicit target tenant and a trace identifier. Database
state changes and their `platform_audit_events` row occur in one transaction.
Auth-provider operations such as invitation and recovery use compensating
revocation/cleanup when their required database/audit commit fails.

Database state triggers additionally record support and invitation transitions,
including provider-triggered invitation activation, in the global audit only.
These events exclude email, full name and support reason from snapshots. They
are distinct from command-level events. A request trace can correlate several
immutable events; the event primary key, not the trace ID, is unique.

Before the provider creates an invited Auth identity, the platform service
persists a pending invitation and audit event. An Auth trigger consumes that
server-only record before the legacy self-signup provisioner runs, creating the
`public.users` row in the selected tenant instead of creating a new tenant.
Provider-confirmed first use activates that invited account through a
current-user-only security-definer function. Caller-supplied signup metadata
alone can never select a tenant or role.

The Web console repeats the check at middleware and server-render boundaries.
Unauthenticated requests redirect to sign-in; authenticated non-owners receive
HTTP 403; authority-provider outages fail closed with HTTP 503. Responses are
private/no-store and platform data must never enter shared browser or CDN caches.

### 7. Analytics and health remain evidence based

Analytics are derived from real persisted tenant, user, project, opportunity,
document, storage, audit, and job sources. A metric with no reliable source is
shown as unavailable with its missing dependency, never as zero or fabricated
sample data. Integration pages expose configuration presence and health only;
they never return secret values or complete sensitive identifiers.

## Consequences

- Tenant owners and administrators retain exactly their existing tenant-scoped
  roles; they gain no platform authority.
- Platform support does not activate ADR-022 multi-membership sessions or alter
  existing project foreign keys.
- Database and application releases containing this boundary must be ordered:
  additive migration, bootstrap verification/assignment, Core API, then Web.
- Because the production promotion workflow blocks pending migrations when
  recoverability evidence is insufficient, this feature cannot be promoted by
  bypassing that gate. Recovery capability must be proven or the release remains
  blocked.
- Rollback is a code rollback plus an additive forward fix. Global audit evidence
  is never removed.

## Verification requirements

### Recent authentication

Every non-read platform HTTP request requires an interactive authentication event
within 15 minutes. Core reads signed AMR claims only after Supabase Auth verifies
the exact access token and checks the claim subject against that verified identity.
Missing, malformed, future or stale evidence fails closed. Token refresh, invitation,
email change and recovery events do not count as interactive reauthentication.
The console explains the sign-out/sign-in recovery path; read-only access remains
available. This uses the provider's [documented AMR claims](https://supabase.com/docs/guides/auth/jwt-fields).

Before production promotion, prove on a disposable PostgreSQL target and in the
application test suites that:

1. only the exact verified immutable owner identity is authorized;
2. unauthenticated, tenant-owner, tenant-admin, every other tenant role, altered
   request/profile email, suspended identities, and extra assignments are denied;
3. platform APIs deny independently of page navigation;
4. ordinary tenant RLS remains isolated and suspended users obtain no tenant ID;
5. every privileged mutation is atomic with append-only audit evidence;
6. cross-tenant mutation requires a valid explicit tenant/support context;
7. tenant workflows cannot assign `platform_owner`;
8. the sole owner cannot self-delete, self-suspend, self-disable, or self-demote;
9. private/no-store cache behavior and secret redaction hold; and
10. bootstrap is idempotent for the same identity and fails closed otherwise.
