# Billing milestone navigation and source evidence

## Outcome and boundaries

The existing project billing view requests only 25 milestone rows and offers no
pagination. Its source-linked description has no source links, and its readiness
cell hides every blocker after the second. Complete the existing read-only
milestone → COC → claim → invoice experience without changing certification,
posting, money calculations, tenant authority, or existing invoice controls.

## Ordered ownership

1. Agent 05 (main): verify the existing Core pagination contract; add regression
   coverage and bind successful adapter results to the requested project/page/
   limit. Reject invalid pagination evidence rather than showing another scope.
   No new endpoint, schema or migration.
   Security prerequisite (Astra, API files only): existing Web billing access is
   `finance.read`, but Core currently requires only universally granted
   `project.read`. Verify and align the controller/service with the existing
   finance permission; prove all roles, inactive membership and tenant-negative
   access using synthetic local evidence. This closes an authority mismatch,
   not a new permission grant. No hosted reads of financial records.
2. Agent 03 (main after adapter handoff): project billing route accepts a bounded
   single `milestonePage` query value. Preserve unrelated query parameters in
   pagination links. Invalid filters, empty projects, out-of-range pages and
   unavailable Core results remain distinct; existing invoice records stay
   available. Verify role and tenant boundaries with route tests.
3. Frontend owner (Luna, disjoint component files): existing milestone card gains
   all readiness blockers, claim/invoice source links and project progress/COC
   navigation. Use existing design tokens and accessible, responsive layout.
   Card props: existing `result` plus required `pagination` containing
   `previousHref: string | null`, `nextHref: string | null`, `firstHref: string`.
   Disabled boundary controls must not navigate. Distinguish empty pages from
   a project with no claims; provide first-page recovery.
4. Browser owner (Luna, test file only): real Chromium with production component
   and CSS; verify page navigation, browser history, source link identities,
   complete blockers, empty/error recovery, keyboard access and four widths.
   Controlled fixture responses are not backend or hosted all-role evidence.
5. Agent 13 (main): required browser CI integration, focused and neighboring
   verification, changeset, reviewed draft PR. Retain inherited release holds.

Work on disjoint UI/test files may proceed against the fixed contract while main
completes adapter then route work. Do not edit another owner's files. Record
test failures before fixes; no new dependency or production mutation.
