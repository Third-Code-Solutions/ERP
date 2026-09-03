# Production auth proof cooldown handoff

## Agent 03 — Next.js App Router / auth-flow verification

- Evidence: the deployed forgot-password form issued one real
  `POST /auth/v1/recover` per Playwright attempt and rendered an error when the
  provider returned HTTP 429.
- Root cause: earlier authenticated production tests generate magic links for
  the same identity; Supabase applies one per-user email cooldown to both magic
  links and recovery email.
- Change: make the real recovery test non-retriable because it sends email and
  must never be replayed automatically.

→ Handoff to Agent 13. Reason: the deterministic fix requires release-step
ordering. Inputs: provider evidence and the one-shot Playwright contract.
Expected output: run the authenticated role matrix first, then the recovery
proof, then reversible profile-password rotation.

## Agent 13 — CI/CD & Ops

- Isolate the recovery proof from the general Playwright batch.
- Run it after the all-role matrix so the admin identity's earlier magic-link
  activity is outside the provider cooldown.
- Pin `--workers=1 --retries=0` and enforce ordering with a CI contract test.
- Preserve the protected production environment, target checks, database
  fail-closed gates, and provider deployment order.
