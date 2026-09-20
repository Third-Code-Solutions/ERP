# Identity lifecycle response binding

## Scope

The installed Auth SDK transforms HTTP success into a User response without validating identity or lifecycle fields. `PlatformIdentityAdminService.setSuspended` currently checks only `error`. Require a matching user ID and an acknowledged ban state before resolving the existing void promise. A malformed/mismatched response is unconfirmed, not proof that no remote write occurred.

Agent 05/main owns the adapter and focused tests. No caller contracts, provider credentials/configuration, database mutations, remote requests or other identity methods change. Main records independent verification and the required changeset; durable reconciliation remains separate.

## Contract and tests

- Bind the returned UUID case-insensitively to the requested user.
- Ban acknowledgement requires a valid future `banned_until`; unban acknowledgement requires an absent/null field, matching Auth's documented/source-confirmed cleared ban representation. A lingering expired or future ban timestamp does not acknowledge the requested explicit unban.
- Validate timestamps as offset-aware ISO timestamps; reject invalid shapes, unrelated IDs and contradictory state.
- Preserve the server-only SDK call and eight-second timeout. Propagate a generic typed unavailable/unconfirmed error, never raw remote details or a claim of no effect.
- Tests use the real installed SDK with intercepted fetch and synthetic responses only. Cover correct ban/unban, UUID normalization, malformed users/timestamps, opposite state and provider errors.

Sources: Supabase public `updateUserById` documentation and Auth user model/ban implementation, inspected 2026-09-13. This contract does not supply provider operation fencing or prove remote settlement after a timeout.
