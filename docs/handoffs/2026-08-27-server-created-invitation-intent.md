# Server-created invitation-intent correction handoff

## Trigger and delivery contract

An isolated local Supabase Auth Admin API run established that
`auth.admin.createUser` persists supplied `app_metadata` after the
`auth.users` `INSERT` trigger executes. The existing
`tenant_invite_v1` marker is therefore invisible to `handle_new_user()` at the
critical point. All 13 disposable role accounts took the self-signup branch
and created new admin tenants. This is a P0 release blocker.

GoTrue applies that app metadata in a later committed transaction, so a
deferrable `auth.users` insert trigger cannot recover the old contract. The
new trigger must accept only an explicit raw-user-metadata provisioning mode:
`self_signup_v1` for the benign caller-owned signup path, or
`tenant_invitation_v1` with a valid opaque token for the invite path. Missing,
unknown, or mismatched modes reject rather than falling back to self-signup.

[ADR-030](../adrs/ADR-030-server-created-invitation-intent-authority.md) is the
accepted authority. It replaces metadata-marker authority with a pre-created,
server-only, expiring and one-use invitation intent. A high-entropy opaque
token is passed only through `raw_user_meta_data` for the trigger to validate
against the database.

## Sequential ownership

Execute in this exact order. Do not run the agents in parallel or let a later
agent compensate for a missing database invariant.

### 1. Agent 04 — Supabase/Drizzle Schema Lead

**Reason:** the trigger, persistence authority, RLS, and atomic claim are
database responsibilities.

**Inputs:** ADR-022, ADR-030, the current
`20260827120000_secure_tenant_invitation_provisioning.sql` migration, the
mirrored `handle-new-user.sql`, the 13-role seed proof, and the existing
invitation provisioning tests.

**Required output:**

1. an additive migration and mirrored trigger SQL that replace the legacy
   `app_metadata.tenant_invite_v1` authority with exactly two insert-time raw
   metadata contracts: `provisioning_mode = 'self_signup_v1'` without a token,
   or `provisioning_mode = 'tenant_invitation_v1'` with the exact
   `raw_user_meta_data.tenant_invitation_token_v1` lookup token;
2. a `tenant_id NOT NULL` invitation-intent table that stores only a hash of a
   cryptographically random token and binds normalized invitee email, tenant,
   role, inviter, expiry, revocation, and one-use consumption state;
3. forced RLS, no direct client grants/policies, foreign-key indexes, and a
   narrowly scoped hardened `SECURITY DEFINER` trigger path;
4. an atomic `SELECT ... FOR UPDATE` (or equivalent) claim which records the
   created Auth user ID, creates the profile/default membership, derives the
   audit actor from the stored inviter, and rolls back all state if any audit
   insert fails;
5. deterministic rejection of legacy-only, missing/unknown/mismatched-mode,
   fake/malformed/unknown/expired/revoked/replayed/email-mismatched inputs,
   with no implicit self-signup fallback; and
6. database tests that use the real disposable Supabase Auth Admin API and
   prove explicit-mode self-signup, all 13 invited roles, legacy-only rejection,
   no orphan tenant, single use, cross-tenant rejection, RLS denial, and
   immutable/token-free audit evidence.

**Must not:** edit old migrations, accept tenant/role/inviter from raw user
metadata, retain plaintext token material, weaken audit immutability, add a
tenantless table, or simulate the Auth insertion with direct SQL as the only
runtime proof.

**Exit criteria:** an isolated Supabase replay and the real Auth API suite pass
with the new trigger; all failures above leave no Auth account, tenant, profile,
membership, or consumed unrelated intent.

**Handoff:**

> → Handoff to Agent 03. Reason: self-signup must identify its benign,
> caller-owned provisioning path explicitly before the new trigger rejects all
> unversioned input. Inputs: Agent 04's accepted trigger modes and real-Auth
> regression tests. Expected output: the browser signup route sends only
> `provisioning_mode = 'self_signup_v1'` with existing non-authoritative profile
> fields, plus route tests; it sends no tenant, role, inviter, or invitation
> token.

### 2. Agent 03 — Next.js App Router Engineer

**Reason:** the browser self-signup route is the only permitted caller of the
benign self-provisioning mode and must be explicit before the trigger's
fail-closed default is enabled.

**Inputs:** ADR-030 and Agent 04's accepted trigger/migration contract. Agent
04's exit criteria are a precondition; do not start this stage before the two
valid modes and rejection behavior exist.

**Required output:**

1. update `apps/web/src/app/(auth)/auth/signup/signup-form.tsx` so its Supabase
   signup call sets exactly `data.provisioning_mode = 'self_signup_v1'` with
   existing non-authoritative profile fields;
2. preserve the route's validation, error, and successful-signup behavior;
3. add/update route tests proving the exact metadata shape and proving no
   tenant, role, inviter, legacy marker, or invitation token is emitted from
   browser code; and
4. run the focused route/type checks plus the disposable Auth self-signup proof
   after the route change.

**Must not:** construct invitation intents in browser code, add direct database
access, expose credentials, choose a tenant/role/inviter, or weaken the
trigger's default rejection.

**Exit criteria:** an ordinary browser signup reaches the intended
`self_signup_v1` database branch, while an unmarked request does not provision
any tenant or profile.

**Handoff:**

> → Handoff to Agent 05. Reason: the server action and seed/API clients must
> create database authority before asking Supabase Auth to insert an invited
> user. Inputs: Agent 04's accepted intent contract and Agent 03's explicit
> self-signup contract. Expected output: a server-only, validated, idempotent
> invitation flow that sends `tenant_invitation_v1` plus only the opaque token
> in user metadata and has no direct profile or membership write.

### 3. Agent 05 — API & Backend Logic

**Reason:** application callers must produce the database-backed authority
without reintroducing a browser-controlled tenant/role or a partial outcome.

**Inputs:** ADR-030, all Agent 04 outputs, and Agent 03's completed explicit
self-signup route/test proof. Agent 04 and Agent 03 exit criteria are
preconditions; do not start this stage before the migration, trigger, and
self-signup contracts exist.

**Required output:**

1. a server-only, Zod-validated invitation service/action that derives the
   authenticated owner/admin, tenant, normalized email, and canonical role;
2. creation of the hash-only intent before `auth.admin.createUser`, using at
   least 256 bits of cryptographic randomness, a maximum 24-hour expiry, and
   idempotent recovery for a timeout or repeated request;
3. Auth creation that supplies exactly
   `provisioning_mode = 'tenant_invitation_v1'` and
   `tenant_invitation_token_v1` in user metadata—never tenant ID, role,
   inviter, plaintext token logs, or the legacy `app_metadata` marker;
4. revocation/cleanup of an unused intent when Auth account creation is known
   to fail, without treating an unknown remote outcome as safely retryable; and
5. unit/integration tests for authorization, normalization, intent creation,
   retry/error behavior, all role values, audit actions, and no client-side
   database/service-role path. The test that matters end-to-end must invoke the
   actual disposable Supabase Auth Admin API.

**Must not:** write profiles or memberships from application code, accept
caller-selected tenant/inviter authority, bypass RLS with browser code, or
weaken the P0 error path simply to seed accounts.

**Exit criteria:** Agent 04's real Auth API database tests plus Agent 05's
server-action/API tests are green; the 13 seeded accounts belong only to their
intended existing tenant; every intent transition has immutable, token-free
audit evidence.

**Handoff:**

> → Handoff to Agent 12. Reason: the production CSP currently blocks the
> disposable local Supabase Realtime endpoint at `ws://127.0.0.1:55321`.
> Inputs: the accepted invitation proof and the local role-matrix harness.
> Expected output: a narrowly validated, explicit local-E2E loopback CSP path
> with regression tests, leaving production CSP unchanged before the role
> matrix runs.

### 4. Agent 12 — Security / DevSecOps Agent

**Reason:** local browser verification needs Supabase Realtime, but adding a
generic local or environment-derived WebSocket origin to a production CSP would
weaken the browser security boundary.

**Inputs:** ADR-030; `apps/web/src/middleware.ts`; the trusted production CSP
tests/configuration; and the disposable local Supabase endpoint used by the
role-matrix harness.

**Required output:**

1. a server-only, explicit local-E2E environment configuration for the
   disposable Supabase origin; it must not use a browser request, a
   `NEXT_PUBLIC_*` variable, or an unrestricted `NEXT_PUBLIC_SUPABASE_URL` as
   CSP authority;
2. URL parsing and a fixed loopback allowlist that accepts only an origin of
   the exact form `http://127.0.0.1:<port>` for a valid TCP port, then derives
   only that exact `ws://127.0.0.1:<port>` Realtime `connect-src` source;
3. a local/test-only CSP augmentation that is absent by default and never
   augments the production or hosted environment CSP. Invalid, remote,
   credentialed, path-bearing, query-bearing, wildcard, or scheme-mismatched
   configuration must fail closed with no added source; and
4. focused middleware/CSP tests proving the valid local source, all invalid
   sources, absence by default, and byte-for-byte unchanged production hosted
   Supabase `connect-src` behavior.

**Must not:** add `ws:`, `http:`, wildcard, arbitrary-host, `localhost` DNS, or
caller-controlled CSP directives; modify tenant/RLS rules; expose a secret; or
make a production deployment depend on the local E2E setting.

**Exit criteria:** the security tests pass and a local browser run can connect
only to the configured `127.0.0.1` disposable Realtime endpoint. Production CSP
regression evidence proves that no local origin is emitted there.

## Security and audit invariants carried through all stages

- ADR-022's one-home-tenant runtime model remains unchanged.
- `tenant_id NOT NULL`, forced RLS, and client-role default denial apply to the
  new intent table; only the trusted server and hardened trigger may act.
- A token is an opaque, one-use, expiring lookup capability; database state is
  the authority. Tokens and hashes never enter logs, audits, errors, or client
  responses and consumed metadata is scrubbed in the Auth transaction.
- Profile, default membership, intent consumption, and their audit events are
  one transaction. No missing/failed audit may be tolerated or repaired by a
  best-effort follow-up.
- `audit_log` and the platform audit remain append-only. Updates or deletes to
  historical evidence are release-gating failures.
- Auth API timing must be tested through the real local Supabase Auth service;
  direct insertion into `auth.users` is supplementary only. No metadata-less
  insert is a valid self-signup path.
- The local role matrix may add exactly one validated loopback `connect-src`
  pair (`http` and derived `ws`) only under the Agent 12 local-E2E contract;
  production CSP must retain its current hosted-only source set.

## Completion evidence and boundary

All four stages completed locally on 2026-08-27:

- the real disposable Supabase Auth Admin API invitation/self-signup suite
  passed 16/16 cases with zero skips;
- the normal production build, lint, typecheck, no-skip, and invariant gates
  passed; and
- the production-mode authenticated Playwright matrix passed for all 13
  canonical roles, including the validated local Supabase Realtime CSP path.

The invitation and role-matrix release blocker is therefore **local YES-GO**
for the controlled trial candidate. This handoff authorized only disposable
local Supabase work. No production user creation, tenant write, provider
configuration change, deployment, or production-provider verification occurred.
