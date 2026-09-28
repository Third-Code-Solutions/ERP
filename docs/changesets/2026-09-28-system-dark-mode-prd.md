# System dark mode product contract

## Outcome

Advanced `docs/PRD.md` to v1.5 and recorded light/dark appearance for the authenticated tenant workspace and Platform Control. The contract covers an accessible toggle, a saved browser cookie, light fallback, and separation from public portals and print layouts.

## Verification

- Reviewed the PRD version and change log, current theme control, and both authenticated layout changes.
- `git diff --check` for these documentation files is the local formatting gate.
- Browser route coverage and implementation checks belong to the integration handoff; this documentation does not assert they passed.

## Scope

No prior MVP criteria, ten-company release findings, tenant boundaries, or refactor invariants were changed.
