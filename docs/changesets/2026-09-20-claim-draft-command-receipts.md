# Claim draft command receipts

## Outcome

Added the first Core-owned claim-draft write path. Existing claim creators keep
the `kyc.create_ar_code` OR `precon.manage_checklist` capability union. Draft
creation now validates exact integer centavos, allocates numeric claim suffixes
past `PC-99999`, and atomically stores an original command receipt in the
append-only semantic audit chain.

## Changed areas

- Shared Zod command, receipt, result and canonical payload contract.
- NestJS Core controller/service with current actor, tenant and non-retired
  project admission, bounded retries and replay/conflict handling.
- Web Core client, server action, compatibility adapter, exact peso parser and
  responsive claim form with unchanged-command retry for unknown outcomes.
- ADR, handoff and database integration coverage.

## Verification

- Shared claim-draft tests: 8 passed.
- Web claim boundary tests: 35 passed (claim amount + command action).
- Synthetic PostgreSQL claim-draft integration: 5 passed.
- Web typecheck: PASSED.
- API typecheck: PASSED.
- Focused ESLint: PASSED.
- `git diff --check`: PASSED (line-ending warnings only).

Production deployment remains gated by the existing encrypted backup/restore
proof and coordinated Core/Web release evidence.
