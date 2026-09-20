# Schedule read-response boundaries

Bind the Web schedule, dependency-option and labour-reconciliation Core adapters to the requested project before returning successful data. Schedule task rows must retain the requested project scope, echo the requested page/limit and honor populated level, status and commitment filters. Dependency rows must satisfy the Core eligibility contract: parents are higher-level tasks and predecessors are same-level tasks. UUID comparisons are case-insensitive so valid differently cased identifiers remain accepted.

The dependency `selected` option remains independently resolved: it must match the requested project and requested selected task (and not the excluded task), while an unavailable `selected: null` and an existing selection at another level remain valid for draft-preservation behavior.

Malformed or misrouted 200 responses now fail closed with status 503. No schema, mutation, database, provider or dependency changes are included.

## Verification

- RED: five new pagination/filter mismatch cases failed against the old adapter. GREEN: the agent's focused adapter suite passed 33/33.
- Main independently reviewed the adapter and Core predicates, added empty out-of-range page, excluded selected-task and valid predecessor regressions, then passed 41/41 adapter/selector tests with JSON no-skips validation. Coverage includes wrong schedule project/rows, mismatched pagination/filter echoes, wrong labour project, ineligible parent/predecessor rows, unavailable selections, incompatible selected levels and UUID casing.
- Main independently passed Web types and changed-source lint. The existing Next pages-directory warning remains; local Node 24/pnpm 10 uses the established engine override.
- Dedicated real PostgreSQL labour/schedule evidence is recorded in `2026-09-12-schedule-labour-database-proof.md`: 18/18 combined, then 7/7 final ordered labour tests, zero skips. No service or schema change was required.
- NOT RUN: full Web suite, fresh CI and authenticated schedule browser verification for this candidate. No hosted changes or deployment; inherited recovery gates remain.
