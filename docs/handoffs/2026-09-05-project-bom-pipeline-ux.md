# Projects, BOM Builder and Pipeline usability repair

## Contract

Improve the three requested workspaces, including entry pages and connected
editor/navigation controls. Keep existing ABI OPS tokens, data authority,
tenant boundaries, monetary pricing, approval and retirement rules. No new
provider, subscription billing, production mutations or deployment this turn.

## Sequential ownership and plan

Single operator: Agent03 Projects presentation and navigation; then Agent10 BOM
index/editor; then Agent11 Pipeline board/list and filters. Agent02 review of
existing tokens only (no new shared primitives). Agent05 contracts unchanged.

1. Inspection: complete. Projects lacks useful record hierarchy/mobile browsing;
   BOM index mixes versions in financial totals and advertises unverified pricing;
   pipeline lacks search/filter/keyboard card actions and its old list omits stages.
2. Implementation: complete for the documented UX slice. Responsive workspaces, truthful counts/copy,
   accessible controls, clear empty/filter states and canonical navigation.
3. Verification: tests, final production build, and browser checks passed at 320/768/1440.
   Coverage and limitations are recorded in the matching changeset.
4. Changeset, commit and PR. Explicitly distinguish local from deployed.

Acceptance: no page-level horizontal overflow, accessible search/status/view
controls, no fake totals, no invalid project links, no lost source navigation;
existing mutation validation preserved. No claim of whole-ERP certification.

Rollback: revert this code-only feature branch; no data rollback needed.

## Production release handoff

User authorized deployment after PR42. Agent10 restores the exact formatting
expected by the existing WO-08A source contract (approval predicate unchanged),
then hands off to Agent13 for passing CI, normal PR merge and the guarded
production workflow. No migrations or provider-control bypasses are authorized.
