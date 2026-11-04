# Definition of Done — ERP modules

A module is done only when every gate below passes and the evidence (command + output tail, or link) is in `docs/erp/reports/<slug>.md`. "Done except…" is not done.

| Gate | Requirement | Evidence |
|---|---|---|
| G1 Spec | Spec follows `SPEC_TEMPLATE.md`, domain review has no open BLOCKING items, approved by user (or `--auto`) | Spec path + approval note |
| G2 Build | Production build succeeds | Command output |
| G3 Types | Typecheck: 0 errors; no new `any` / ts-ignore without written justification | Command output |
| G4 Lint | 0 errors; warning count not higher than on main | Command output, before/after counts |
| G5 Unit + integration | All pass; every worked example is a test; domain-logic files ≥ 90% line coverage; authz, cross-tenant and illegal-transition negatives present for every endpoint | Command output, coverage summary |
| G6 E2E | One passing e2e test per acceptance criterion | AC → test table |
| G7 Security | No open Critical/High findings; RLS/tenant isolation tests pass; no High/Critical vulns in production dependencies (or documented, time-boxed exception) | Security section of report |
| G8 Review | Code reviewer verdict APPROVE (no BLOCKING items) | Review section of report |
| G9 Data | Migration is reversible; DB rebuilt from zero locally + seed + full suite passes | Command output |
| G10 Docs | Spec, plan, report, BACKLOG and STATE updated; feature flag and default state documented; user-facing strings i18n-ready | File list |
| G11 Clean-room | No OpenConstructionERP code, SQL, schema names, UI copy, i18n keys, assets or data in the diff | Reviewer + orchestrator grep note |
| G12 Hygiene | No `console.log`, commented-out code, unrelated changes, or secrets; conventional commits explaining why; PR ≤ ~400 meaningful lines per task | Diff stat |

## Fix-loop policy
- Spec is the tiebreaker between code and tests. Tests are never weakened to pass.
- Max 3 review/fix loops per module, then stop and escalate with unresolved items listed.

## Always stop and ask
- Money math or permission semantics are ambiguous.
- A migration drops, renames or retypes populated data.
- A new paid service or heavy dependency is needed.
- A module needs CAD/BIM/OCR/ML infrastructure.
