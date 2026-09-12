# Core-only user role workflow

## Scope and rationale

Role changes must use the Core authority hardened in PR #73. The legacy Web fallback bypasses transaction-time lifecycle checks, and the current form creates a fresh request ID on each retry. Replace only the role editor/action path; password reset, deletion and retained-history suspension are separate unfinished work.

## Ownership and contract

1. Agent 05 reviews/hardens only `assignUserRoleThroughCoreApi` and its focused adapter tests: validate request and response binding; distinguish rejected requests from unknown commit outcomes. Do not claim a network timeout means no write occurred.
2. Agent 03/main owns `updateUserRole` and its action tests: strict target/expectedRole/requestId validation, current tenant permission gate, Core-only command, no direct SQL fallback or best-effort role audit. Pass the exact client request ID and expected role; do not reread and silently replace a stale expected role or bypass replay when the desired role already appears current.
3. Frontend owner edits only the role section of `manage-user-panel.tsx` and a new credential-free browser spec: freeze command and key through uncertain retries, prevent editing an unresolved request, distinguish known rejection from unknown outcome, keep role/owner/self semantics and accessible responsive states. Leave password/delete flows unchanged.
4. Main independently reviews, runs focused/action/browser/type checks, integrates required CI browser coverage and records the changeset.

Action contract: FormData fields `user_id`, `role`, `expected_role`, `client_request_id` (UUID). Result is `{ ok: true, role }` or `{ ok: false, error, outcome: 'rejected' | 'unknown' }`. Only a matching `ok: true` is a success. Unknown outcomes retain exact command/key for retry, including after subsequent rejected retries: those rejections describe the retry, not whether the original request committed. A known rejection of a request that has never been uncertain permits refresh/review; never silently convert an unresolved command into a new request.

## Release boundary

Keep existing tenant rollout gates, but disabled Core routing must reject without a Web database write. Before production promotion, verify Core role-write gates for every intended tenant; otherwise this route is unavailable rather than unsafe. This slice is not permission to widen canaries or change provider configuration. Inherited PR stack and database/Storage recovery holds remain. No new dependencies or hosted mutations are required.
