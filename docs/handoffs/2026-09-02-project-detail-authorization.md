# Project-detail authorization handoff

## Finding and impact

The project overview and several project sub-routes authenticate and tenant-
scope a project but do not apply the checked-in domain-read policy before
querying or rendering BOM/commercial, procurement, invoice, cost, audit, or
client-access data. Hiding a tab is not sufficient because deep links remain
callable. This is a P1 confidentiality defect.

## Existing policy authority

Do not add roles, capabilities, aliases, or new permission semantics.

- Base project and opportunity detail: `project.read` and `opportunity.read`.
- BOM/commercial detail: existing universal-search `bom` policy.
- Cost/budget detail: `budget.read`.
- Invoice/billing detail: `finance.read`.
- PO commitment detail: existing universal-search `po` policy.
- Delivery signal: existing universal-search `delivery` policy.
- Audit detail: `audit.read`.
- Client portal access: `admin.users`.
- Tenant boundary: authenticated profile `tenantId` on every query.

The unresolved Viewer breadth requirement remains `NEEDS DECISION` only where
it conflicts with the central registry. This workflow follows the checked-in
registry and does not broaden a sensitive grant.

## Acceptance criteria

1. The overview verifies `project.read` and keeps every project/opportunity
   query tenant/project scoped.
2. BOM, PO, invoice, and delivery queries are skipped entirely when their
   existing domain policy denies the caller.
3. Financial-health cards render only from granted query results; budget
   variance requires both BOM and PO access, and no placeholder reveals a
   denied domain.
4. Overview quick links and shared project tabs omit BOM, Cost, Billing, Audit,
   and Access when their respective policies deny the caller.
5. The audit shortcut and delivery signal in the command center follow the
   same policy and denied signal branches issue no database query.
6. Direct URLs fail closed before sensitive queries for BOM (including Togal),
   Cost/Budget, Billing, Audit, and Access.
7. Existing mutation controls remain governed by their existing action
   capabilities; this workflow does not broaden write authority.
8. Automated tests enumerate all thirteen roles for the navigation and
   overview-domain policy, plus representative direct-route denial tests.
9. Focused tests, Web TypeScript, source lint, production build, and isolated
   browser checks record allowed and denied behavior with no unexpected
   console or network error.

## Sequential ownership

1. Principal Agent 3 is the sole application-source editor. Re-read the repo
   bootstrap and Agent 03 section, implement the smallest cohesive correction,
   and add focused regression coverage.
2. Principal Agent 4 independently reviews query short-circuiting, all-role
   policy outcomes, direct deep-link denial, tenant predicates, and gates.
3. Principal Agent 5 verifies supplied roles in an isolated browser after QA
   is green. No data mutation or deployment is authorized by this handoff.

Production deployment remains blocked by ADR-020 until reviewed `main` and all
protected release checks are green.

## Closeout

- Principal Agent 3 implemented the central project-detail access projection,
  server-filtered tabs and quick actions, independently gated overview reads,
  fail-closed sensitive routes, and regression coverage for every role. The
  budget save path was also hardened after review exposed integrity edge cases:
  tenant/draft/BOM validation, a locked draft snapshot, guarded writes, stable
  inserted-line reconciliation, and exact affected-row checks now run inside
  the transaction.
- Principal Agent 4 returned `GO` with no in-scope P1/P2 confidentiality or
  integrity finding. Direct-route denial, all-role policy projection, tenant
  predicates, mutation capabilities, and budget transaction safeguards passed
  independent review.
- Principal Agent 5 verified all eleven supplied identities. The full browser
  matrix passed 66/66 sensitive direct-route assertions. A final denial-only
  rerun passed 32/32 routes: each rendered the workspace-record not-found state
  with no protected marker, recovery boundary, dashboard-render diagnostic,
  console error, page error, or request failure.
- Focused tests passed 108/108 across sixteen files. Complete Web and E2E
  TypeScript, full Web source lint, production build (89/89 static pages), and
  diff checks passed.
- Strict status remains `PARTIAL`: `estimator` and `pm` browser identities are
  unavailable, and the database-backed budget trigger could not be exercised in
  the local QA lane. No production deployment was performed.

Pull request: [#17](https://github.com/Third-Code-Solutions/ERP/pull/17),
stacked on project-chat PR #16.

→ Handoff to the Finance database-reproducibility workflow. Reason: the
repeatable payables and receivables integration assertions currently fail the
protected database gate and skip CI build/E2E. Inputs: PR #15 run
`33634034468`, failing expectations at payables line 425 and receivables line
325. Expected output: reproduced root cause, smallest policy-consistent fix,
green database-reproducibility gate, and no accounting-boundary weakening.
