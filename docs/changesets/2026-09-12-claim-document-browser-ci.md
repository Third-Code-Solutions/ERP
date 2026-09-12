# Claim-document browser interaction CI

Added a dedicated credential-free Chromium job to the standard CI workflow for the claim-document interaction harness. It runs the named local Vite/React browser spec with a single worker, no retries, bounded timeouts and the existing no-skips report assertion. JSON, failure output and responsive screenshots are retained as a seven-day artifact.

This is a local component interaction gate, not a replacement for authenticated production E2E. It requires no Supabase, Core, Vercel or user credentials and does not modify the production workflow selection.

The browser contract also verifies a real non-zero focus indicator and keyboard pagination across three pages, including the page 1 → 2 → 1 request sequence, endpoint focus fallback, focus preservation when the user moves to another field, and scope-change cleanup. The pagination focus fix restores the initiating control when it remains enabled, otherwise the enabled opposite control, without stealing focus from a user move or reviving focus after scope changes. Nine local Chromium interactions pass with the CI-equivalent single-worker, zero-retry command; Node 22 CI execution remains pending.
