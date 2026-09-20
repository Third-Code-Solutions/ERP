# Retained-history user suspension

## Outcome

The workspace admin user-management flow no longer physically deletes an Auth
account or `users` row. The legacy `deleteUser` server-action name remains only
as a compatibility alias to the safe suspension command.

Suspension now:

- requires a bounded reason (with a compatibility default for old callers);
- blocks the target Auth account with the existing provider admin API;
- preserves the tenant user row, foreign-key references, and immutable audit history;
- writes `account_status = suspended`, reason, actor, and timestamp metadata;
- commits the status row and `status_change` audit event in one transaction, and
  compensates the Auth ban when that local outcome cannot be confirmed;
- prevents self-suspension, non-owner suspension of an owner, and removal of the
  last active admin/owner.

The management UI now labels this action “Suspend this user” and explains that
history is retained and access can be restored by a workspace owner.

## Verification

- Focused admin action suite: 20 tests passed.
- Full Web/API/shared suites and hosted CI remain required for this follow-up.
- No migration, dependency, production data, or production environment changed.
