# Platform-owner threat model

Governing decision: [ADR-027](../../docs/adrs/ADR-027-platform-owner-administration-boundary.md).

## Protected assets

- The immutable Supabase Auth UUID assigned to the sole platform owner.
- Cross-tenant tenant, user, business, operational, and audit data.
- Tenant and user lifecycle controls, invitations, recovery requests, and roles.
- Platform integration configuration presence and health; secret values remain
  server-side.
- Append-only platform audit evidence and explicit support-context records.

## Trust boundaries

1. The browser and all request input are untrusted.
2. Supabase Auth establishes the session UUID and verified-email evidence.
3. Postgres establishes the active platform assignment, sole-owner invariant,
   account/tenant lifecycle state, support-context state, and audit commit.
4. Core API and Next.js server code may use server credentials only after
   rechecking the platform principal. Client bundles never receive those
   credentials.
5. External Auth, email, storage, telemetry, and deployment providers can fail
   independently. Their failure must not degrade into authorization success.

## Abuse cases and controls

| Threat | Required control | Verification |
| --- | --- | --- |
| Tenant owner/admin guesses `/platform-admin` | Separate platform assignment; middleware, server render, and API checks | Every tenant role gets 403 and no platform response data |
| Attacker changes request/profile/user metadata email | Compare provider-verified email and immutable UUID with the constrained server assignment | Altered email tests remain denied |
| A second owner assignment appears | Unique constrained table plus runtime count equals one | Bootstrap and request both fail closed |
| Suspended user retains direct Supabase RLS access | `auth_tenant_id()` returns null unless user and tenant are active | SQL tenant-isolation and suspension tests |
| Arbitrary tenant is supplied to a mutation | Validate explicit target; require current support context where applicable; foreign key the target | Cross-tenant mutation tests with missing/mismatched context |
| Privileged mutation succeeds without evidence | Mutation and platform audit row commit transactionally; provider side effects compensate on commit failure | Fault-injection and rollback tests |
| Sole owner locks out or deletes self | Server and database reject owner suspension, disablement, deletion, demotion, and assignment revocation | Negative mutation tests |
| Platform data is cached for another user | Private/no-store responses and no shared client cache hydration | Header and two-session browser tests |
| Secret values leak through integrations UI/logs | Return configured/unconfigured and bounded health only; redact IDs and errors | Contract tests and browser/network inspection |
| Expired support context remains usable | Opaque server-owned session with actor/tenant/expiry/end checks on every use | Expiry, mismatch, and explicit-exit tests |
| Platform authority service is unavailable | Fail closed with 503; never fall back to tenant role or email alone | Dependency-failure tests |

## Security invariants

- `platform_owner` is absent from tenant role enums and assignable-role lists.
- The fixed owner email comparison is normalized and exact.
- Full provider identifiers, tokens, cookies, and secrets are absent from
  browser payloads, logs, audit metadata, and operational notes.
- Platform audit rows are insert-only. Update and delete are rejected for every
  database role, including accidental server paths.
- Support context never changes `auth_tenant_id()` and never activates dormant
  tenant memberships.
- Any unexpected additional active platform assignment is a P0 authorization
  event: platform access fails closed and production promotion stops.

## Release stop conditions

Do not promote while the platform migration lacks disposable replay and current
target parity, sole-owner bootstrap is unverified, a tenant role obtains any
platform response, suspension leaves RLS access, a privileged mutation can
escape audit, or private/no-store behavior is unproven.
