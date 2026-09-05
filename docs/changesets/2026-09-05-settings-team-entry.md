# Settings implementation: team-management entry

## Delivery scope

First slice of the screenshot-requested Settings implementation. Agent 03 owns
the page composition and associated tests. Existing user administration already
provides a tenant-scoped directory, account creation and role-management flows;
reuse those destinations instead of building a second membership authority.
ADR-022's inert membership/delegation foundation remains unchanged.

- Owners/admins can open Manage team and Add team member from Settings.
- Viewers can open the existing read-only team directory.
- Other roles see an explicit permission explanation and no team links.
- Workspace Edit is shown only to the owner/admin roles already permitted by
  the server action. Server-side enforcement is unchanged.
- The stale Phase 3 promise is replaced with accurate remaining scope.
- Account creation copy explicitly describes initial-password provisioning,
  not a working email-invitation service.

No new users, roles, provider subscriptions, secrets, database objects, or
production configuration are changed by this slice.

## Verification

- PASS: 30 targeted Settings, profile, user-action and destination tests,
  including all 13 persisted roles, missing workspace and authentication failure.
- Updated the Settings browser test to traverse the team-management entry with
  role-appropriate assertions. Browser execution and production verification
  are NOT RUN for this local slice.
- PASS: web lint and all application/E2E TypeScript checks.
- PASS: full web suite; exact result recorded in the pull request. The two
  default-suite database skips passed separately against existing local
  PostgreSQL (2/2 tests, no schema reset or migration).

## Remaining work

This is not completion of all four Settings roadmap features. Notification
preferences require durable per-user choices connected to actual delivery
consumers, with security/mandatory notices explicitly treated. Integration
configuration requires server-only credential management and verified provider
connections. Billing scope awaits clarification between workspace subscriptions
and construction project billing; do not invent pricing or enable charges.
Email invitations are not implemented. Existing user-management behavior is
reused, not newly certified as a complete team lifecycle.

## Rollback

Revert this page/test changeset. No migration or data restoration is required.
