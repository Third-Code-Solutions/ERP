# Sales workflow repair — 2026-09-22

## Objective and evidence

Repair the live Sales walkthrough on `thirdcode-erp.vercel.app`, starting from
`acc67ab875b0d8568c7ba47325ab2d6e55bbe945`. Preserve tenant isolation, Finance
and Commercial approvals, existing records, and append-only audit evidence.

Observed: stage transition disabled for the demo tenant; October 16 closing date
displayed as October 15; canonical Lead omitted from dashboard active totals and
Sales scorecard; Cortex mixed Amihan's account with an unrelated opportunity;
Sales-visible BOM navigation redirected to forbidden. The Amihan sample record
is `fac9f074-4acc-477e-a5ff-fc728ec8ae82`; do not create duplicate demo records.

## Ordered ownership and handoffs

1. Agent 08: correct Cortex entity-specific retrieval and citations, with focused
   regression coverage. No permission expansion or invented provider answers.
2. Agent 05: correct date handling and lifecycle aggregation contracts; verify
   stage-transition authorization and KYC guards before enabling live writes.
3. Agent 03/09/11: integrate safe route navigation, date presentation, canonical
   pipeline metrics and useful empty states, with UI checks.
4. Agent 13: verify exact deployed source, provider identities, release gates and
   rollback; deploy verified changes and rehearse the existing Sales record.

Work is sequential across implementation owners. The coordinating agent may
inspect release configuration while a bounded implementation is running. No two
agents edit the same files. Each handoff records changes, checks and remaining
limitations. Approval gates are not removed to make the walkthrough pass.

## Status

Agent 05 shared calendar-date and persisted lifecycle helpers are complete.
Focused shared regressions passed (2/2); existing Core stage/conversion guards
passed (101/101). Hosted migration ledger includes both transition and conversion
authority migrations. Exact baseline SHA CI passed PostgreSQL reproducibility
and all 522 protected API integration cases without skips.

→ Handoff to Agent 03/09/11. Consume `manilaCalendarDate` and the shared
`*_OPPORTUNITY_STAGES` arrays in the affected Sales views and aggregations.
Keep Finance, KYC, and BOM permissions intact. No production change yet.

Agent 03/09/11 integration is complete. Pipeline and opportunity detail dates
now use Manila calendar semantics; BOM/project tabs respect registered route
permissions and the existing pre-won gate. Dashboard KPIs, alerts, scorecards,
and stage distribution aggregate canonical plus legacy stages, rep lookup is
tenant-scoped, and terminal-only reps remain visible. Focused tests passed
(60/60), Web TypeScript passed, and focused production-file ESLint passed.

→ Handoff to Agent 13. Reason: the bounded Web integration is locally verified.
Inputs: `docs/changesets/2026-09-22-sales-presentation-readiness.md` and the
worktree diff. Expected output: exact-source/provider validation, release gates,
deployment, and live Sales walkthrough evidence. No production change yet.
