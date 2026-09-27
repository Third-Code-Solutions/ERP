# Canvas BOM signing and award transaction

## Change

The Web canvas signing action now locks a tenant-owned BOM only while its
current status is `approved`. It creates the signed-BOM award handoff in the
same database transaction as the signature document, session stamp, BOM lock,
and audit event. A failed handoff rolls back those database writes and removes
the uploaded signature object. Contract, variation-order, and COC signing
paths are unchanged.
Public canvas and legacy BOM portal signatures record a null audit actor for
the external signer rather than attributing that act to an internal approver;
the award operation selects a tenant user separately for required ownership
foreign keys.

## Verification

- PASSED — focused canvas signing unit tests, 10/10 on Node 22.23.2, including
  approved-BOM award dispatch, draft-BOM denial, and failed-award cleanup.
- PASSED — Web TypeScript check (`tsc --noEmit`).
- PASSED — focused source and test ESLint (`--no-ignore --max-warnings=0`).
- PASSED — `git diff --check` for the changed signer and test files.
- NOT RUN — browser signing journey and disposable database/Storage integration
  for this Web action. No hosted data or Auth sessions were changed.

## Handoff

→ Agent 05 and Agent 13. The feature-flagged Core canvas signing authority and
Core DocuSeal webhook still lock a BOM without creating the award handoff.
They require equivalent approved-BOM and atomic award behavior, or an explicit
fail-closed release boundary for BOM signing, before signed-BOM automation can
be described as complete. The production authority selection and a controlled
synthetic signing rehearsal remain unverified.
