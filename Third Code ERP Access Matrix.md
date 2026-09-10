# Third Code ERP Access Matrix

## Cortex UI verification — 2026-09-05

No authorization or mutation capability changed. Final loopback browser verified
anonymous route redirect and graph401, then authenticated user-token profile
access with real local PostgreSQL. Zero external/provider requests. This is not
new hosted authorization evidence; production remains the Settings release below.

## Settings release9a6b87816499 — 2026-09-05

- Settings financial entry points reuse existing finance.read / manage_cash
  capabilities: owner/admin/finance/viewer read, payment action separately gated.
- Integration configuration status requires admin.system_config (owner/admin).
  No credential values returned to the browser; only allowlisted missing names.
- Workspace edit/team management follow existing owner/admin capabilities;
  viewer team list is read-only, other roles receive permission information.
- Notification preferences affect only the authenticated account's presentation.
  Strict Zod validation; authenticated provider user ID checked; no caller-supplied
  actor or tenant. user_metadata never authorizes roles, tenants or business access.
- Local Settings31tests and existing production11-role coverage passed. No schema,
  RLS, financial posting authority or subscription billing changes introduced.


## Live release e8c1b481607c — 2026-09-05

The added `/finance/journals` collection route independently requires an
authenticated profile and `finance.read`, then redirects to the existing
tenant-scoped Finance list. It uses the same Finance read-role policy as the
parent. The independent112-dashboard-template ×13-role inventory and explicit
unauthenticated/capability-denied route tests passed. No tenant, RLS or platform
authority was widened. Production role-access checks passed in release33958563228.
Platform-owner console draftPR32 remains separate and is not claimed live.

Live route sweep records rendered pages separately from guard-only invalid-ID
and invalid-token checks. A guard pass does not prove a positive portal token,
record access, mutation or cross-tenant business flow; see the Route Ledger.

Linked from [[Third Code ERP Control Center]].

Last updated: 2026-09-04T03:56:24+08:00

## Platform Authority Decision

### Current implementation proof — 2026-09-04 resumed run

Platform schema/Core/Web boundary exists locally; production has not been migrated or bootstrapped. Settings exposes the console link only after `is_platform_owner()` returns true; email merely avoids unnecessary lookup and does not authorize. Tenant owner/admin ordinary identities have no assignment and remain denied. Core independently validates every request. Existing-tenant mutations require an opaque browser-cookie context plus actor/tenant/expiry/end checks; global directories and tenant creation do not impersonate a tenant. Suspended tenants may enter maintenance context for reactivation without widening tenant RLS.

Tenant Settings: all authenticated roles may read according to the route policy; only owner/admin see or execute workspace edits. The action validates field bounds and commits the tenant row with audit in one transaction. Other roles are denied before database access. Platform/Settings negative tests and scope details are in [[Third Code ERP Verification Ledger]]. The historical discovery table below is not the current implementation conclusion.

`platform_owner` is not a tenant role and never appears in tenant role assignment. ADR-027 requires all of: provider-verified Auth user UUID, provider-confirmed email, exact normalized `kurt@thirdcodesolutions.com` match, active immutable assignment, active application account, and exactly one active platform assignment. Failure or ambiguity denies. Tenant owner/admin and every ordinary tenant role have no platform authority. Every non-read platform request additionally requires a signed interactive AMR event within15minutes; token refresh/recovery does not renew it. This is not an assertion of immutable Auth-session-ID binding.

Tenant/user lifecycle status is represented additively. `auth_tenant_id()` returns no tenant for a suspended/disabled user or a non-active tenant, so existing tenant RLS policies fail closed. Core guards deny inactive user/tenant requests; lifecycle/API/database tests pass. Production state remains unchanged.

Project Documents: all13tenant roles may read. Viewer cannot upload/delete; all12operator roles use `document.manage`. UI controls and tabs now match the capability/route policy; deletion action independently enforces it. Thirteen-role rendering and owner/viewer browser proofs pass. Operational platform analytics independently denies anonymous and tenant-admin requests and aggregates across tenants only after owner admission (real Core/DB integration).

## Verified Starting Model

- Authentication principal: Supabase Auth immutable user ID mapped to `public.users.id`.
- Active tenant/role source: `users.tenant_id` and `users.role`, used by RLS helpers such as `auth_tenant_id()`.
- ADR-022 membership/delegation tables are Phase 0 foundations only and explicitly do not activate tenant switching or delegated approval.
- `platform_owner`: not found in the initial route inventory; role/schema/service enforcement remains to be searched and classified.

## Initial discovery matrix (superseded by current proof above)

Navigation, page guard, server/API check, RLS, and documented permissions will be compared for every route/action. No role is yet marked verified for platform access.

| Role/capability | Navigation | Page guard | API/service | RLS | Status |
| --- | --- | --- | --- | --- | --- |
| `platform_owner` | Under discovery | Under discovery | Under discovery | Under discovery | Unverified / likely missing |
| Tenant `owner` | Under discovery | Under discovery | Under discovery | Existing tenant authority reported; re-verification required | Unverified |
| Tenant `admin` | Under discovery | Under discovery | Under discovery | Existing tenant authority reported; re-verification required | Unverified |
| Other tenant roles | Under discovery | Under discovery | Under discovery | Existing tenant authority reported; re-verification required | Unverified |

## Required Platform Conclusions

- Whether a genuine platform-owner role exists and is distinct from tenant owner/admin.
- Whether the verified auth identity for `kurt@thirdcodesolutions.com` is the only platform owner.
- Whether any business client can obtain platform access through tenant role/profile/email manipulation.
- Exact platform-owner operations and audit coverage.
- Separation-of-duties/self-approval behavior for approval workflows.
