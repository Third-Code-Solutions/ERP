# Trusted preview E2E handoff — 2026-08-18

## Scope and ownership

1. **Agent 03 — Next.js App Router / E2E configuration**
   - Supplies Playwright's optional Vercel automation-bypass header solely
     from `E2E_VERCEL_PROTECTION_BYPASS_SECRET`.
2. **Agent 13 — CI/CD & Ops**
   - Requires the secret in the trusted-PR workflow, keeps the target branch
     bound, and reruns the gate only against the disposable preview tenant.

## Handoff evidence

- Preview deployment: `dpl_EPM2SkM8YyYLW2B5rKQ6yA8m8xgN`, ready in `icn1`.
- `/api/health` and `/api/ready` passed against that deployment.
- GitHub contains the required named E2E variables and secrets; values were
  neither read back nor recorded here.
- The PR must remain unmerged until a new CI run reports the trusted E2E job
  green with a non-skipped Playwright report.

## → Handoff to Agent 13

Reason: push the workflow/configuration change, validate the protected preview
from GitHub Actions, then proceed to normal PR checks and the canonical
production workflow only after the full PR is green.
