# Legacy BOM signing-link hardening

## Outcome

Legacy portal tokens created with the historical `dev-sub-*` DocuSeal marker can
no longer lock a BOM or trigger the award handoff. The public legacy route now
shows a recovery message and hides the approval action. New canvas signing
sessions remain the production-capable path.

## Verification

- PASS — `pnpm --filter @third-code-erp/web exec vitest run "src/lib/operations/integrations/docuseal.test.ts"` (4/4).
- PASS — `pnpm --filter @third-code-erp/web typecheck`.
- PASS — `pnpm --filter @third-code-erp/web build` (80 routes).
- NOT RUN — live legacy-token browser mutation; no controlled hosted token was
  available and production writes remain gated.

No hosted database write, deployment, commit, or push was performed.
