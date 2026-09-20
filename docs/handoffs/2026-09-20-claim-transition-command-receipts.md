# Claim transition command receipts

## Sequence

1. Shared contract: command union, canonical payload and strict receipt/result.
2. Core controller/service: admission, locking, transition rules, linked
   document/invoice scope, atomic update and replay receipt.
3. Web adapter: stable request identity, Core response scope validation,
   unchanged-command retries and existing notification/revalidation behavior.
4. API/Web tests, full CI and release evidence.

## Boundary

The Core service owns claim status mutations and semantic audit receipts. The
Web adapter owns presentation errors, notifications and cache refresh only.
