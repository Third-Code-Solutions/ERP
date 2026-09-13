# Weekly progress durable commands

Implement ADR-035 after the current-authority slice at 9b8123a0. No new dependency
or schema migration; preserve non-Core canary flows and all unrelated features.

## Ownership and sequence

1. Agent 01 (main): ADR and this fixed handoff before code.
2. Agent 05 (Astra): own shared weekly contracts/tests, Core weekly service/unit
   and controller tests, the controller's UUID scope comparison, and all weekly PostgreSQL suites. Add receipt
   contracts and canonical payload serialization first; report the fixed exports.
   Add actual-PG failing regressions before implementation, then durable receipts,
   legacy recognition, canonical cutoff and database clock enforcement. Existing
   historical-clock fixtures must be rewritten to prove actual production rules,
   never skipped or weakened. Keep PR #92 lifecycle and contention proofs.
3. Agent 03 (main): new weekly-command-actions.ts plus action tests; existing
   weekly Core transport/client tests; page mounting and page tests; old actions
   reject outdated Core callers instead of generating replacement request keys.
   Do not change legacy non-Core command semantics in this slice.
4. Frontend owner (Luna): existing weekly form/ledger and their tests. New Core
   actions use explicit tenant/actor/project scope and immutable request keys.
   Always-mounted, scope-keyed controls must preserve unresolved commands through
   permission/read-result changes. Preserve the existing non-Core form behavior.
   Start after main supplies the exact Web action/props contract.
5. Browser owner (Luna, disjoint test file): mounted production components/CSS
   and real Chromium exercise both command flows, unknown-to-retry behavior,
   stale scope/permission/read results, dirty data, keyboard and four widths.
   Start after frontend contract is fixed; no application edits in this lane.
6. Main: independent review, final focused tests/types/lint/browser evidence,
   browser CI integration, changeset, push draft PR and verify hosted CI.

Disjoint lanes may proceed against the fixed contract, never concurrently edit
the same file. No production write, merge, migration, copy or release until the
existing production recovery and coordinated-deployment gates are satisfied.

## CI repair handoff

CI run 34773797693 exposed scope-replacement ordering races in the existing
budget and XML browser fixtures. Main (Agent 13) owns the narrow test-harness
repair in those two specs and the new weekly spec: await an effect acknowledgement
of the React commit before delivering a prior-scope result. Keep assertions,
scope keys, component state preservation and production rendering unchanged.
No sleeps, retries, skipped tests or production-code changes are authorized by
this test repair. Independent Astra review confirmed the missing commit barrier.
