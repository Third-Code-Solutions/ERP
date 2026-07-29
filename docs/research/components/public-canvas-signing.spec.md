# Public Canvas Signing Transaction Specification

## Overview

- **Target files:**
  - `apps/web/src/app/portal/sign/[token]/actions.ts`
  - `apps/web/src/app/portal/sign/[token]/actions.test.ts`
- **Interaction model:** public, token-authorized, one-shot server action
- **Visible UI:** unchanged
- **Authority:** official client signature transaction

## Current defect

The current action performs these operations independently:

1. uploads a signature image;
2. inserts a document row;
3. marks the signing session signed;
4. updates the source record;
5. attempts a separate audit insert using the zero UUID;
6. ignores the audit failure.

Consequences:

- two concurrent submissions can both pass the initial unsigned check;
- partial database writes can survive a later failure;
- source updates do not repeat authenticated session tenant scope;
- a signature can commit without its required entity audit;
- a failed database operation can leave an orphaned Storage object.

## Required transaction

1. Validate signer name and a bounded, structurally valid PNG before external
   or database mutation.
2. Resolve the signing session from the SHA-256 token hash. Tenant and entity
   identity come only from that row.
3. Reject missing, signed, revoked, or expired sessions before upload.
4. Resolve the same-tenant source record before upload.
5. Upload to a collision-resistant object key.
6. Begin one database transaction.
7. Lock the exact signing-session row by ID, tenant, and token hash.
8. Recheck signed, revoked, and expired state after the lock.
9. Insert the signature document.
10. Update the source entity using both entity ID and tenant ID.
11. Update the locked signing session.
12. Insert the entity audit in the same transaction with `actor_id = null`.
13. Commit all database state together.
14. If any transaction step fails, roll back database state and remove the
    uploaded object before returning failure.

## Invariants

- Public users never supply tenant ID, entity type, entity ID, document ID, or
  audit actor.
- `actor_id = null` represents an unauthenticated external signer and satisfies
  the nullable audit foreign key.
- Zero UUID is never used as a fabricated actor.
- Audit failure fails the official signature transaction.
- A concurrent or replayed submission cannot create another document or audit.
- Every source update repeats tenant scope.
- A missing or cross-tenant source returns the existing non-enumerating source
  error.
- Prompt, signer, token, tenant, entity, and Storage identifiers are not logged
  on failure.
- The visible signing form and successful `{ ok: true }` contract remain
  unchanged.

## Signature payload boundary

- Accepted prefix: `data:image/png;base64,`
- Maximum decoded PNG: 512 KiB
- Minimum decoded payload: 300 bytes
- Base64 alphabet and padding must be valid.
- PNG eight-byte signature must match.
- Empty, malformed, non-PNG, oversized, and visually empty payloads fail before
  upload.

## Failure behavior

- Known token-state errors preserve existing messages:
  - `Invalid signing link.`
  - `Already signed.`
  - `Link revoked.`
  - `Link expired.`
- Invalid source preserves `Source entity not found.`
- Storage upload failure returns a bounded Storage failure.
- Database or audit failure returns `Could not record signature. Try again.`
- Storage cleanup failure is logged only as a generic operational warning.

## Validation

- Unit tests:
  - malformed and oversized signatures fail before database/Storage work;
  - successful signing locks and rechecks the session;
  - source and session updates plus nullable-actor audit share one transaction;
  - audit failure returns failure and removes the uploaded object;
  - a concurrently signed locked row creates no document/audit and removes the
    uploaded object;
  - source updates repeat tenant scope.
- Existing invalid public token route remains non-mutating.
- Full lint, typecheck, tests, production build, diff check, gitleaks,
  actionlint, and prohibited-source scan pass.
- Vercel Git remains disconnected; no frontend deployment is created.

## Rollback

Revert the action, tests, specification, and milestone documentation together.
No schema, hosted row, Storage object, provider setting, or deployment rollback
is required for the source-only candidate.
