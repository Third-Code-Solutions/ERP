# Core-owned claim transition command receipts

## Outcome

Moved claim lifecycle writes behind the ERP Core transition endpoint. Submit,
certificate-pending, certify, handover, invoice link, payment, rejection and
cancellation now use one strict command union, project-scoped validation and an
atomic append-only receipt. Exact retries replay the original receipt without a
second mutation; uncertain transport outcomes keep the same request identity.

## Changed areas

- Shared claim transition commands, canonical payload hash and receipt/result
  schemas.
- NestJS Core controller/service with active actor admission, claim/project
  locks, state-machine enforcement, certificate/invoice scope checks and
  semantic receipts.
- Web Core client and compatibility actions with scope/hash validation,
  unchanged-command retry IDs, existing notifications and cache refresh.
- Responsive claim transition panel now offers an explicit unchanged-command
  retry after an unconfirmed response.
- ADR, handoff, controller, Web, shared-contract and PostgreSQL integration
  coverage.

## Verification

- Shared contract tests: 3 passed.
- Core protected-boundary tests: 4 passed.
- Synthetic PostgreSQL claim draft + transition integration: 9 passed.
- Web transition/client tests: 19 passed across focused files.
- API and Web typechecks: PASSED.

Production deployment remains gated by the existing encrypted backup/restore
proof and coordinated Core/Web release evidence.
