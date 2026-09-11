# Professional UI/UX pass

## Change

- Promoted the restricted platform console to a responsive, route-aware shell
  with active navigation, skip links, table captions/scoped headers, keyboard-
  focusable overflow regions, and explicit loading, error, and empty states.
- Added a shared modal focus lifecycle (initial focus, Tab containment, Escape
  close where appropriate, and focus return) to the command palette,
  notifications, pipeline reason dialogs, project retirement, BOM import,
  supplier grouping, and BOM-to-PO picker flows.
- Kept the pipeline kanban and list views accessible with live stage-transition
  announcements and a keyboard-selectable, dependency-free BOM table window
  for large bills of materials.
- Updated the accessibility log with the follow-up findings and the remaining
  unverified surfaces; no WCAG conformance claim is made.

## Verification

- API full suite: PASS (265 files, 1,994 passed, 2 environment-gated skips).
- Web focused UI suite: PASS (14 files, 69 passed).
- Web typecheck: PASS.
- Web lint: PASS (`--max-warnings=0`).
- `git diff --check`: PASS.
- Hosted browser, RLS, and managed-migration verification: pending the
  protected release workflow.
- Workstation uses Node 24.16.0/pnpm 10.33.0 while the repository pins Node
  22.x; CI remains authoritative for the locked runtime.

## Boundary

No third-party source, schema, UI, dataset, or proprietary asset was copied.
No existing route or pipeline capability was removed.
