# User deletion and retained audit history

## Verified finding

Discovered during KYC lifecycle verification on 2026-09-12. In the disposable PostgreSQL lane, creating a KYC artifact through Core creates immutable audit evidence. A subsequent privileged physical user deletion fails because `audit_log.actor_id` has `ON DELETE SET NULL`, while append-only rules reject the implied historical audit update. The failed database transaction preserves the user, artifact and audit rows. No audit safeguard was disabled.

Main inspected `apps/web/src/app/(dashboard)/admin/users/actions.ts`: the existing `deleteUser` action calls Supabase Auth admin deletion before deleting `public.users`, then treats the semantic delete audit as best effort. Read-only hosted FK catalog inspection found the audit actor FK but no `public.users` to `auth.users` FK; the code comment claiming a default cascade is not supported by the observed target. Therefore the current ordering can remove the login before a subsequent database deletion fails. This is a source-backed partial-failure risk, not a claim that a real user was deleted. No Auth deletion or business-data query was performed.

## Boundary and requested policy

Do not modify historical audit entries, disable audit rules, repoint foreign keys or test deletion against real users. KYC hardening preserves the current FK lifecycle and tests the actual failed-delete outcome; it does not claim successful physical deletion of audited users.

The user explicitly approved **Use Suspend for users with retained history** on 2026-09-12. Preserve records and immutable evidence; do not infer a separate legal erasure policy or delete their Auth login. This decision does not block local KYC delivery, but the account lifecycle defect remains part of the full ERP completion audit.

## Sequential follow-up

1. Agent 01 records the user's lifecycle decision without inferring a legal erasure policy.
2. Agent 12/05 reviews existing membership suspension authority and deletion safeguards, including tenant scope, last-admin/platform-owner protection, concurrent changes, session behavior, audit atomicity and external partial failures.
3. Agent 03 implements the approved admin UI/action behavior through the appropriate authority, with explicit retained-history messaging. Do not silently relabel a destructive operation or claim external success before it is verified.
4. Agent 13 verifies negative authorization, concurrency, real disposable database effects, browser behavior and failure recovery before release. Do not use real demo users for irreversible deletion tests.
