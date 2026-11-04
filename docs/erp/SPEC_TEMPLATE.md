# Spec: <Module name> (`<slug>`)

Status: draft | domain-reviewed | approved
Depends on: <slugs>
Feature flag: `erp_<slug>` (default off)

## 1. Problem and outcome
Who has the problem, what they do today, what success looks like (measurable where possible).

## 2. Roles
Roles that touch this module and what each needs from it.

## 3. User stories
`US-<SLUG>-01` As a <role>, I want <capability>, so that <outcome>.
(Keep each story INVEST: small, testable, vertical.)

## 4. Acceptance criteria
`AC-<SLUG>-01` (US-01)
- Given …
- When …
- Then …

Every story has ≥1 AC. Include negative ACs (denied role, invalid input, locked record).

## 5. Data model (our names, concept level)
| Entity | Attribute | Type (money/qty = decimal p,s) | Required | Rules |
Relations and cardinality. What is tenant-owned (everything, unless stated).

## 6. Lifecycle / state machine
States, allowed transitions, who may trigger each, what becomes immutable, how revisions work.

## 7. Permission matrix
| Action | Owner | Admin | PM | Estimator/QS | Site engineer | Accountant | Viewer |
Segregation-of-duties rules (e.g. preparer ≠ approver).

## 8. Calculations
For each: inputs, formula, order of operations, units, rounding point and rule, division-by-zero handling.

## 9. Worked examples (added/verified by domain expert — become test fixtures)
| Case | Inputs | Intermediate values | Expected output |
≥3 per formula: normal, boundary, messy-real.

## 10. Validations and edge cases
Field rules, cross-field rules, empty states, large data volumes, concurrent edits.

## 11. Integrations
Data in from / out to other modules; events emitted; import/export formats.

## 12. Audit
Which actions write immutable audit entries.

## 13. Non-functional
Performance targets (e.g. BOQ with 5,000 lines loads < 2 s), pagination, i18n, accessibility basics.

## 14. Out of scope (Later)
Explicit list.

## 15. Gap vs current implementation (only if module partly exists)

## 16. Open questions

## 17. Domain review
Changes made by the domain expert and why; BLOCKING/ADVISORY items.
