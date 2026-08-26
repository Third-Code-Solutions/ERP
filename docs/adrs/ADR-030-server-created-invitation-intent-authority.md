# ADR-030: Server-created invitation intents are the only invitation authority

- Status: Accepted (amended 2026-08-27 after live GoTrue transaction-order proof)
- Date: 2026-08-27
- Owners: Product/PRD Guardian, Supabase/Drizzle Schema Lead, API & Backend Logic, Security/DevSecOps
- Supersedes: the `tenant_invite_v1` `app_metadata` authority described by the 2026-08-27 invitation-provisioning migration. It does not supersede ADR-022's one-home-tenant model.

## Context

ADR-022 deliberately keeps the active runtime model to one home tenant per
user. An invited account must therefore create exactly one `users` profile and
default membership in the inviter's existing tenant; it must never fall through
to self-signup and create another tenant.

The first controlled-trial remediation treated a server-written
`app_metadata.tenant_invite_v1` object as the trigger's invitation authority.
That premise is false for the real local Supabase Auth Admin API path. A
disposable, isolated Auth proof created all 13 role accounts with
`auth.admin.createUser` and observed that the `auth.users` `INSERT` trigger ran
before the supplied `app_metadata` had persisted. The trigger consequently saw
no marker and followed the self-signup branch, provisioning a new admin tenant
for every seeded account. Direct database-insert tests did not reproduce the
Auth API ordering and are insufficient evidence for this contract.

The follow-up GoTrue proof established that this is not a timing race that a
deferrable trigger can repair: `app_metadata` is applied in a later committed
transaction. An `auth.users` `INSERT` trigger cannot observe the legacy marker
at all on this path. An implicit ``no token means self-signup`` fallback would
therefore continue to turn every stale legacy invitation into an orphan tenant.

Relying on an Auth-internal metadata write order is not an authorization
boundary. Moving tenant ID, role, or inviter fields into browser-controlled
metadata would be worse: it would make a caller-selected tenant authority.

## Decision

### 1. Authorize invitations through a server-created database intent

Introduce a tenant-scoped, server-only invitation-intent record. It is the
sole authority for an invited account and contains, at minimum:

- the invited tenant ID;
- one canonical role from the existing role enum;
- the authenticated inviter's user ID;
- a normalized, bound invitee email address;
- a SHA-256 (or stronger) hash of a cryptographically random, at least
  256-bit opaque token, never the plaintext token;
- a creation timestamp, a non-null expiry timestamp, and revocation/consumption
  state; and
- the created and consumed Auth user IDs where applicable.

The server action creates this record only after it has derived the inviter,
tenant, and allowed role from the authenticated server-side session. It must
not accept a tenant ID or inviter ID from a browser as authority. An intent is
valid for at most 24 hours; any shorter, explicitly configured lifetime is
permitted. A retry/unknown-outcome path must be idempotent and must not leave a
second usable intent for the same created Auth account.

### 2. Discriminate the two provisioning paths in `raw_user_meta_data`

The `auth.users` trigger accepts exactly two provisioning forms that are
present at insert time:

1. `raw_user_meta_data.provisioning_mode = 'self_signup_v1'` with no invitation
   token creates the caller-owned self-signup tenant and matching admin profile.
   This is a benign, versioned discriminator rather than tenant, role, or
   inviter authority. A browser may set it because self-signup already creates
   only that caller's new tenant.
2. `raw_user_meta_data.provisioning_mode = 'tenant_invitation_v1'` with the
   reserved `raw_user_meta_data.tenant_invitation_token_v1` carries a valid
   invitation. The server supplies both fields to `auth.admin.createUser`.
   The token is an opaque lookup key, not a tenant, role, or inviter claim. The
   trigger hashes it and looks up the matching intent under a lock.

The trigger must reject—not self-provision—any missing or unknown
`provisioning_mode`, a mode/token mismatch, or an invitation-shaped input that
is malformed, unknown, expired, revoked, already consumed, or bound to a
different normalized email. On a valid intent it must atomically claim the
intent, record the Auth user ID, create the existing-tenant profile and default
membership, and produce the required audit entries. An error anywhere in that
transaction, including audit insertion, must roll back the Auth user insertion,
the profile/membership writes, and intent consumption.

The trigger must remove the consumed opaque token from persistent user metadata
within the same transaction before it can be returned to a client. It must use
a hardened `SECURITY DEFINER` implementation and an empty/explicit search path.

### 3. Retire the metadata-marker authority and implicit fallback

`raw_app_meta_data.tenant_invite_v1` is no longer an invitation authority.
GoTrue does not make it visible to the insert trigger, so the trigger must not
attempt to inspect it or rely on a deferrable constraint. Instead, the absence
of either exact raw-user-metadata provisioning form is a deterministic rejection.
This makes a stale server action or seed script—which supplies only the old
marker—fail visibly rather than self-provisioning an orphan tenant.

The browser self-signup route must explicitly send `self_signup_v1`; the
server invitation action and seed script must explicitly send
`tenant_invitation_v1` plus a valid opaque token. No tenant-switching or
multi-tenant session behavior is introduced.

### 4. Keep the intent and audit paths server-only and append-only

The invitation-intent table has `tenant_id NOT NULL`, enabled and forced RLS,
foreign-key indexes, no grants or policies for `public`, `anon`, or
`authenticated`, and no browser database client path. Only trusted server code
and the narrowly scoped trigger may create, consume, revoke, or inspect an
intent. The token value or hash must not be written to application logs,
structured audit diffs, error messages, or browser responses.

The audit actor for profile and membership creation is derived from the locked
intent's stored inviter, never from metadata supplied with the Auth request.
Intent creation, revocation, and consumption must each yield immutable audit
evidence containing only the identifiers and action metadata required to
explain the authority transition. Existing `audit_log` append-only behavior is
unchanged; no historical audit row may be updated or deleted.

## Alternatives considered

### Keep `app_metadata.tenant_invite_v1`

Rejected. The isolated real Auth Admin API proof demonstrates that the
`auth.users` insert trigger cannot observe the marker at the required time.
The design therefore creates orphan tenants despite passing direct SQL tests.

### Put tenant, role, and inviter in `raw_user_meta_data`

Rejected. User metadata is caller controlled. Even a shape-valid payload would
allow tenant or role selection outside server authority.

### Use a signed metadata payload only

Rejected. It retains dependence on metadata transport and creates key rotation,
replay, revocation, and audit-correlation responsibilities that a one-use,
locked database intent already handles. A lookup token makes the database the
source of truth and supports immediate revocation.

### Create the profile after Auth account creation in application code

Rejected. It leaves a partial Auth account if the profile, membership, or audit
write fails, and it cannot make provisioning atomic with the Auth insert. The
database trigger must remain the single atomic provisioning point.

## Verification requirements

The release gate must use the actual disposable Supabase Auth Admin API, not
only direct inserts into a simulated `auth.users` table, and prove all of the
following:

1. a self-signup with exactly `provisioning_mode = 'self_signup_v1'` and no
   invitation token creates exactly one new tenant and its matching admin
   profile;
2. a valid intent for every canonical role creates a profile and default
   membership in the existing inviter tenant and creates no tenant;
3. missing/unknown provisioning modes, mode/token mismatches, forged,
   malformed, unknown, expired, revoked, reused, and email-mismatched
   invitations fail closed, create no profile or tenant, and consume no
   unrelated intent; a legacy-only `app_metadata` invitation is specifically
   proven to take this rejection path through the real Auth API;
4. a valid intent is consumed exactly once despite concurrent/retried requests;
5. an invalid cross-tenant inviter or a role outside the enum cannot create an
   intent or an account in another tenant;
6. intent/profile/membership audit entries identify the stored inviter, expose
   no token material, and reject update/delete attempts; and
7. RLS and grants deny every client role direct intent-table access while the
   trusted trigger/server flow remains functional.

Existing 13-role browser verification may resume only after this Auth API proof
and its database-backed invariants are green, and after the local-only CSP
precondition in the associated handoff permits the disposable Supabase Realtime
loopback origin without changing production CSP. The old direct-SQL invitation
tests remain useful structural regression tests but cannot constitute release
evidence by themselves.

## Local verification evidence

On 2026-08-27, the real disposable Supabase Auth Admin API suite passed all 16
invitation and self-signup cases with zero skips. The normal production build,
lint, typecheck, no-skip, and invariant gates also passed. The authenticated
Playwright matrix then passed in production mode for all 13 canonical roles,
including the local Realtime CSP path. This satisfies the local controlled-trial
release evidence for this decision; it does not constitute a deployment or
production-provider verification.

## Consequences

- The existing 20260827120000 migration is historical and must not be edited;
  a new additive migration replaces the trigger authority path.
- The browser self-signup route, user-management server action, and seed script
  must be updated together. Any stale `app_metadata`-marker caller or an
  unversioned self-signup fails visibly rather than silently creating a tenant.
- The invitation token is a short-lived capability but cannot authorize a
  tenant alone: its database record, email binding, state, expiry, and locked
  one-use claim are all required.
- This decision preserves ADR-022's single-home-tenant session authority and
  does not create a browser tenant switch, direct client database privilege, or
  cross-tenant membership capability.
- The disposable role-matrix browser target requires a separate, Agent 12-owned
  CSP exception for one validated loopback Supabase Realtime origin. That
  exception is test/local-only, contains no tenant authority, and must never
  change production's hosted-Supabase `connect-src` policy.
- It is a release-blocking correction. No YES-GO may claim invitation or
  role-matrix readiness until the real Supabase Auth API test suite passes.
