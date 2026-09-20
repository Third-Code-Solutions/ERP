# Gitleaks public identifier cleanup

## Changes

- Redacted nonessential public Railway API-service and deployment-trigger
  identifiers from the release blocker while preserving the deployment-coupling
  evidence.
- Retained only exact historical commit/file/rule/line fingerprints in
  `.gitleaksignore`; no detector, path, or rule was weakened.

## Verification

- `node scripts/run-gitleaks.mjs` — PASS (Gitleaks 8.30.1, 2,060 commits,
  no leaks).
- `pnpm --config.engine-strict=false test:production-ci` — PASS (10/10).
- `git diff --check` — PASS.

No provider mutation or production deployment was performed.
