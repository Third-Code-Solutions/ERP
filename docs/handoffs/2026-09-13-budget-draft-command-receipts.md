# Draft budget command integrity

User story: a budget editor must be able to save and retry without losing line
identities, overwriting another editor, or receiving a failure after a committed
change. Cost-code and initial-budget creation need the same atomic audit and
current-authority boundary. Preserve ADR-018 and the commercial BOM spine.

1. Main/Agent01 records the scope and confirms the command contract after the
   independent financial review. Existing production recovery gates remain.
2. Luna verification lane owns only the new actual PostgreSQL draft-action
   integration spec. First reproduce audit rollback failures for cost-code
   creation, initial-budget creation and draft save. Preserve synthetic fixtures,
   tenant isolation and append-only audit history.
3. Astra reviews the contract and current SQL invariants before implementation:
   canonical advisory-before-budget locking, active authority, durable keyed
   receipts, exact saved-line mapping and optimistic stale-editor rejection.
4. Agent03 implementation must integrate action, page and editor contracts.
   Retain entered values and exact uncertain commands; committed success is not
   reversed by cache failures. Do not change financial calculations or rewrite
   approved budgets. Preserve cost-code swaps, creation timestamps and BOM
   access restrictions.
5. Main verifies real PostgreSQL outcomes, existing workflow regressions, source
   and browser types, rendered journeys, lint and CI before a new PR. Any schema
   change requires an explicit schema handoff; none is assumed.

Ownership is disjoint during reproduction and review. Implementation begins
only after the regression failure is observed. No production data is used in
the local test database and no production migration/deployment is authorized by
passing these local checks alone.

Mobile verification handoff: Agent03/main found the existing 980px line grid
conceals amount fields at 320px. Agent02/main owns a sequential, budget-scoped
responsive CSS adjustment in globals.css; Agent03/main supplies explicit field
labels and reruns narrow/desktop browser checks. No other lane edits these files.
