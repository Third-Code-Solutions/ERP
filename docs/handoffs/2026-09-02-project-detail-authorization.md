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
