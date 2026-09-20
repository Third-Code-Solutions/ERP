# Proposal sidebar shell

## Outcome

Reorganized the authenticated ABI OPS navigation into the cleaner proposal
hierarchy: Home, Preconstruction, Project Delivery, Commercial, and Closeout.
The rail now uses a narrower navy shell, compact icon rhythm, readable section
labels, gold outlined active states, and a consistent collapsed mobile mode.

Existing route slugs, role filtering, prefetch behavior, sign-out behavior,
and the ABI OPS brand identity remain intact. Settings is now a normal
role-filtered navigation item, and the existing project takeoff entry is
discoverable as `Takeoff`; neither change adds a new authorization path.

The dashboard quick-access ordering retains its role-specific priorities after
the navigation reorder. Hidden controlled-rollout Assets remain hidden.

## Verification

- PASSED: `git diff --check`.
- PASSED: focused navigation and role-dashboard suites (55/55 tests).
- PASSED: full Web Vitest suite (2,591 passed, 2 skipped across 302 files).
- PASSED: `pnpm --config.engine-strict=false --dir apps/web lint`.
- PASSED: `pnpm --config.engine-strict=false --dir apps/web typecheck`.
- Node 22.x is the repository target; local checks used Node 24.16.0 with
  pnpm engine strictness disabled.

## Recovery

Reverting this changeset and the sidebar/navigation files restores the prior
Workspace/Operations/Finance/Admin grouping. No database, migration, API, or
production environment was changed.
