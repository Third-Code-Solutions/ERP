# Production demo tenant boundary handoff

## Scope and order

1. Agent 12 / security: resolve the exact `buildops-e2e` tenant, verify all eleven fixed role profiles are active and the configured project is active under that tenant before protected production browser tests, and recheck profile status and project boundaries before magic-link and matrix use. Fail the workflow if the preflight is skipped.
2. Agent 13 / release owner: review the protected workflow change, confirm the production environment's project variable points to the dedicated demo project, run the release gate on the exact candidate SHA, and inspect the preflight and browser reports. No production target or data was changed in this handoff.
3. Agent 03 / browser owner: retain existing role and schedule assertions and evaluate any live failures in the protected run. The local contract suite proves only boundary behavior against mock read responses.

## Handoff

→ Handoff to Agent 13 / release owner. Reason: the local E2E guard and workflow step are implemented but have not run with protected production credentials. Inputs: `E2E_DEMO_TENANT_SLUG=buildops-e2e`, the protected production `PRODUCTION_E2E_PROJECT_ID` variable, and the new preflight test. Expected output: review, exact-target verification, and a protected release execution report before any client demo claim.
