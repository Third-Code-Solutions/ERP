# M3.6 Cortex external-model privacy boundary

Source commit: `08f1315`

## Change

Cortex now redacts common direct identifiers before semantic embedding or
external chat completion. Graph prompt context and every conversation turn use
the same deterministic policy. Query audit evidence records started/completed
phases, model/fallback outcome, stable prompt/response hashes, and redacted
previews instead of raw user text.

## Verification

- Focused Cortex route/redaction tests: 10 passed.
- Full Web suite: 55 files / 332 tests passed.
- Web typecheck passed.
- CI run `30736912185` passed all executable jobs, including clean Postgres
  17/Redis reproducibility, Nest transaction/container smoke, and production
  build. E2E remains credential-gated.
- No database migration or hosted/provider mutation.
- Landing UI and public clean-room branding were unchanged.

## Release boundary

The source candidate is not a hosted release. The controlled planner remains
`review_required` until the pending migration ledger, duplicate Purchase Order
mapping, audit evidence, and `AUDIT_RECOVERY_TENANT_ID` are resolved.
