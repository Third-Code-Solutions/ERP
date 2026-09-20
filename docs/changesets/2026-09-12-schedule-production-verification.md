# Scheduling production verification gate

Production E2E now consumes `PRODUCTION_E2E_PROJECT_ID`, leaving the separate preview `E2E_PROJECT_ID` unchanged. The production repository variable was configured and read back as `11111111-1111-4111-8111-111111111111`, an active project in the verified `buildops-e2e` tenant. The required production browser command enables and includes the existing scheduling role matrix.

The matrix now checks successful HTTP status, authenticated route readiness and the Labour reconciliation heading before existing role-specific controls. Its read-only journey does not create or edit tasks. All 11 seeded roles passed against deployed revision `81393e10a36a` in one grouped test, 37.4 seconds, zero retries/skips, with independent report validation. Auth sessions use existing local-scope cleanup. This is current deployed behavior, not verification of an undeployed candidate or scheduling mutations.

Verification: production workflow contracts 2/2 passed; actionlint passed; E2E TypeScript passed. The contract was observed failing before the production-variable change. No gates were disabled. This workflow has not yet executed as a production release. No application deployment or hosted database/Storage write was performed. Inherited migration recovery holds remain in force.
