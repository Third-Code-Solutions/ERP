# Claim-document browser interaction CI

Added a dedicated credential-free Chromium job to the standard CI workflow for the claim-document interaction harness. It runs the named local Vite/React browser spec with a single worker, no retries, bounded timeouts and the existing no-skips report assertion. JSON, failure output and responsive screenshots are retained as a seven-day artifact.

This is a local component interaction gate, not a replacement for authenticated production E2E. It requires no Supabase, Core, Vercel or user credentials and does not modify the production workflow selection.

Verification: six local Chromium tests passed with `pnpm --config.engine-strict=false exec playwright test e2e/claim-document-attach.spec.ts --project=chromium`; Node 22 CI execution remains pending.
