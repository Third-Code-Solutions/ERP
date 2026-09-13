# Reviewed MS Project XML task import

Acceptance and boundaries: ADR-034. Preserve all existing schedule, legacy
progress, labour reconciliation and commercial-spine behavior. O-04/O-09 remain
open; this generic reviewed planning tool does not define company policy.

1. Agent01/main records ADR and this handoff before any dependency or code change.
2. Agent05 contract/parser lane defines bounded Zod preview/commit contracts and
   a deterministic strict XML evidence parser with RED/GREEN unit tests. Agent04
   independently reviews the no-migration semantic receipt and tenant locks.
3. Agent05 Core lane adds preview/commit endpoints and atomic actor-bound audit
   receipts, with synthetic actual-Postgres rollback/isolation/replay tests.
4. Agent03 Web lane adds Core client/actions and preview/mapping/confirmation UI
   using existing design primitives. Unknown commands remain exact and frozen;
   live actor/project context is checked on both sides. Browser proof required.
5. Agent13/main wires focused CI coverage, verifies integrated results, writes the
   required changeset and opens a PR. No production merge/deploy until recovery
   and coordinated release gates pass.

Run dependency/contract/schema-affecting steps sequentially; never edit shared
files concurrently. No source copies, new schema or new paid infrastructure.
