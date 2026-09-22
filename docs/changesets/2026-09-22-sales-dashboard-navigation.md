# Sales dashboard navigation

## Outcome

- Dashboard project-margin and risk-signal links now resolve through the registered route policy for the current role.
- Sales users retain dashboard metrics and are directed to the permitted project overview instead of forbidden cost or BOM routes.
- Roles authorized for the original deep route retain the exact cost or BOM destination.
- Coverage-lead copy now describes the initial pipeline stage without exposing a persisted stage name.

## Verification

- Focused component and navigation-policy tests cover Sales fallbacks and Owner deep links.
- Web TypeScript and focused production-file ESLint passed under Node 22.
- Updated the dashboard contract gate to require the authenticated role on both dashboard navigation components; its previous exact JSX assertion rejected the new required prop.

## Handoff

→ Handoff to Agent 13 for release integration and live Sales dashboard verification. No provider or production mutation was performed here.
