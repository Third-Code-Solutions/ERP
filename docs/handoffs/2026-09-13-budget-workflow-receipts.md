# WO-14 budget workflow receipts

User story: a budget reviewer must receive a truthful, scoped result for submit,
approval, rejection and revision, without duplicate decisions or partially
committed semantic audit. Preserve ADR-018 approval policy and baseline math.

1. Agent01/main records this handoff and acceptance boundary. Prior read-only
   Astra review identified SQL commit before semantic audit, false cache-failure
   messaging, missing revision project binding and stale lifecycle admission.
2. Luna verification lane owns a new actual PostgreSQL mounted-action integration
   suite. Establish RED evidence with synthetic loopback fixtures before fixes;
   cover rollback, refresh warning, scope, current authority, exact retries and
   concurrent review. Do not edit action or UI files.
3. Astra Agent03 owns budget actions.ts and necessary existing action unit tests.
   Validate runtime inputs; current actor/tenant admission, existing project
   advisory lock, scoped budget lock, SQL workflow and semantic audit share one
   transaction. Respect advisory-before-budget ordering and clear workflow
   context. Preserve dual-lane and explicit Owner behavior. Return scoped
   receipts and separate committed success from cache refresh warnings.
4. Luna Agent03 UI lane owns budget-workspace.tsx and component/browser tests,
   after the action contract is agreed. Prevent duplicate/stale-scope requests;
   retain uncertain workflow commands and reconcile exact receipts; distinguish
   final approval from a single lane approval. Preserve editable draft data.
5. Main independently reviews the financial and authorization boundary, runs
   integration/browser checks, wires required CI coverage, records the changeset,
   and pushes a PR. No shared-file parallel edits; no new dependency or migration
   is anticipated. Any proven schema blocker is reported before expanding scope.

Main also owns the budget page and its page test to pass an explicit Owner
override flag. Both-lane capability is not an Owner identity: administrators
must retain distinct-actor approval, while Owner confirmation describes the
existing SQL behavior of filling both remaining lanes.

Final integration handoff: main took ownership of the UI/helper/browser files
after the Luna lane stopped, fixed deferred event reads and stale-command
fencing, and completed integrated Web types, source lint and browser verification.
No parallel edits continued after this transfer.

Acceptance: actual SQL and semantic audit roll back together; wrong-project,
foreign-tenant and inactive authority cannot mutate; exact workflow retries do
not duplicate decisions; concurrent lane approval preserves the existing locked
baseline rules; browser messages follow persisted receipts and refresh failures
cannot turn committed success into failure. Existing draft create/save and cost
code commands are retained, not claimed hardened by this workflow-only slice.
Production promotion retains recovery and migration gates.

Independent follow-up review confirmed the next draft-command boundary:
create/save/cost-code semantic audit still follows the data transaction, and
cache errors can conceal committed results. Draft save also needs payload-bound
request receipts preserving new-line identities and optimistic stale-editor
rejection. Harden those commands in a separate follow-up with actual PostgreSQL
rollback, identity, concurrent-editor and current-authority tests; do not expand
this workflow slice's completion claim to them. Preserve cost-code swaps,
ordering, creation timestamps, BOM access restrictions and integer money math.
