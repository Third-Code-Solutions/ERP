# BUILD OPS ERP Refactor Checklist

- [x] Read and reconcile the three authority PDFs into repository execution copies.
- [x] Confirm repository, branch, remote, dirty-worktree boundary, and target Supabase identity.
- [x] Run local unit/API/web, invariant, actionlint, and gitleaks baselines.
- [x] Run read-only hosted migration, table, advisor, audit, and demo-data checks.
- [ ] Obtain authorized production PO duplicate mapping; do not delete or renumber by inference.
- [ ] Reconcile provider-linked migration source with current working source.
- [ ] Close hosted WO-02 audit and business-calendar gates.
- [ ] Implement and verify WO-04 grain classification/review slice locally.
- [x] Implement and locally verify WO-05 location dimension and WO-06 DUPA
  database foundation with vertical acceptance tests.
- [ ] Resolve WO-06 canonical math and rate-owner decisions before WO-07 UI/API.
- [ ] Implement WO-07 through WO-18 in PRD order with vertical acceptance tests.
- [x] Implement and locally verify WO-08 generic takeoff intake and WO-08a CAD
  auto-draft disposition; hosted promotion and authenticated browser proof remain
  blocked by the release gates and E2E credentials.
- [x] Implement and locally verify WO-10 RFQ quote-to-award price history and
  catalog-rate loop; hosted promotion and feature-flag enablement remain blocked.
- [ ] Validate CI, deployment identity, secrets, runtime health, logs, and rollback.
- [ ] Run full local and hosted E2E; report exact PASS/FAIL/BLOCKED evidence.
