# Invitation revocation admission

## Verified risk and bounded scope

The platform service reads an invitation and calls Auth suspension before its database transaction. Concurrent activation can change the invitation to accepted and the user to active before that effect. The stale revocation then disables an active user. The activation function in migration `20260904020000` locks/updates the user before the invitation.

Close this eligibility race without creating a new endpoint, changing retained-history policy or applying a migration. This is a prerequisite, not completion of retained-history suspension or cross-writer last-active-admin protection. Existing provider timeout/compensation limits must remain explicitly reported.

## Sequential ownership

1. Main records the contract and owns an independent real PostgreSQL regression suite.
2. Agent 05/security owner changes only `revokeInvitation` and necessary focused helpers in the platform service, plus focused unit tests. Other platform mutations remain unchanged.
3. Main reviews implementation, runs unit/database/type/CI checks and records the changeset. No hosted writes or real Auth calls are permitted during verification.

## Admission contract

- A preliminary invitation read may locate the candidate user, but never authorizes an Auth effect.
- Inside the existing transaction, revalidate the active platform owner and support context. For bound invitations, lock the candidate user before the invitation with NOWAIT; compare the newly locked invitation's tenant, Auth user ID, status and normalized email to the locked user. Require a still-invited user and a sent invitation. Reject active/disabled/suspended users and accepted/revoked/failed invitations before Auth.
- For an unbound pending invitation, lock the invitation and require it is still pending and unbound; no Auth call.
- Protect the platform-owner binding before any provider effect. Retain locks through the existing provider operation, database updates and atomic audit. Map lock contention outside the aborted transaction to a typed retryable conflict.
- Scope updates to the verified invitation and same-tenant user. On admission rejection, perform neither provider suspension nor provider compensation. Retain existing post-effect compensation behavior only for the exact verified target; do not manufacture success on any error.
- No schema, provider configuration, support permissions or public return contract changes.

## Evidence required

Regression tests must show accepted/active and mismatched targets are rejected before provider calls, stale pre-reads cannot authorize a ban, valid sent/invited and pending/unbound revocations retain existing behavior, and contention returns promptly without durable changes. Real PostgreSQL concurrency must cover activation holding a user lock and revocation holding locks while activation attempts to proceed. Synthetic local fixtures and a fake Auth provider only; preserve append-only audit rows.
