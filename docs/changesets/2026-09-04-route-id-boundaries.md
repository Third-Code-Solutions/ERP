# Route ID validation and print layout repair

Scope: Agent03 page/layout boundaries, Agent04 development-driver lifecycle follow-up, existing real-browser fixture and route coverage notes. No production database/provider mutation or dependency added.

- Reproduced malformed claim URL crashing PostgreSQL UUID parsing in real Next/Core/Postgres fixture.
- Validate UUID-only params with Zod at every detail page and layout before consumption; no reliance on parent-layout execution ordering. Public tokens remain separate.
- Repair invalid print-layout document nesting and scope print CSS to its wrapper.
- Add inventory-driven browser sweeps and21 UUID boundary tests plus print regression. Focused tests, final browser sweeps and typechecks pass.

No push, merge or deployment. See [[Third Code ERP Verification Ledger]] for current evidence.

Browser follow-up: all67 static dashboard routes passed. Seven project tabs had
no main heading; corrected their semantic headings. Removed unsupported form
target from weekly-report server action. Legacy BOM portal no longer embeds a
nonexistent dev-sign route: validated HTTPS destinations open externally, and
unusable slugs show truthful guidance. Eight portal regressions pass. Existing
approval authorization and CSP remain unchanged. Project/portal replays pass.

Final follow-up: project18 and portal10 replays passed; public/auth6 +4 anonymous
guards and valid report printing passed. Full Web suite1771 passed plus2 ordinary
integration skips; those2 were then explicitly executed against disposable local
Postgres and passed. Root lint, Web/E2E/database types,10 database client/config
tests,140-page boundary verifier and changed-source secret scan pass. Optimized Web production build15208 passes, including type validation and final tracing.

Follow-up: browser sweep found development connection exhaustion. A50-reload
regression proved module-local driver pools accumulated. Development/test now
reuse driver pools by full connection configuration while rebuilding ORM schema,
with5 connections maximum and20-second idle release. Production settings remain
unchanged.10 focused tests, database typecheck and rebuilt Core pass; route sweep
reruns pass. Synthetic fixtures were cleaned and audited by verified exact IDs.

Coverage limit: missing-ID/token denial and page rendering do not prove every
populated detail-record mutation, all35 handlers or external-provider workflow.
No assurance of the entire original product prompt or production readiness.
