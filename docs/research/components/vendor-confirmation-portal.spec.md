# Supplier confirmation portal specification

## Overview

- **Target route:** `apps/web/src/app/portal/purchase-order/[token]/confirmation/page.tsx`
- **Supporting action:** `apps/web/src/app/portal/purchase-order/[token]/confirmation/actions.ts`
- **Interaction model:** server-rendered read + click-driven decision form
- **Authority:** NestJS public read/POST routes; Next.js never writes ERP tables
- **Gate:** `ERP_PUBLIC_VENDOR_CONFIRMATION_READ_ENABLED` plus an explicit tenant
  allowlist; all controls default closed

## Product outcome

A supplier opening an issued Purchase Order link sees only the order summary
needed to make a decision, then chooses Accept, Decline, or Request changes.
Decline/request-changes require a note. Retry uses a generated idempotency key;
the Nest transaction remains authoritative and returns a replay-safe result.

## Public response contract

The API may expose only the token-scoped view:

- `sessionId`, `purchaseOrderId`, `poNumber`, `vendorName`, `projectName`
- optional project location, delivery date, and order notes
- exact integer centavo totals: subtotal, VAT, withholding, total
- ordered line items: description, unit, quantity, unit cost, line total
- session state and expiry timestamp

Never expose tenant IDs, internal user IDs, token hashes, workflow request IDs,
audit payloads, or unrelated project/vendor records. Invalid tokens return a
generic not-found response. Expired, revoked, or already-answered sessions do
not render a writable form.

## Visual structure

Reuse the existing Third Code ERP portal shell and its navy/gold contrast. Use
an editorial split at wide widths: order context and line summary on the left,
decision panel on the right; stack one column below 760px. Cabinet Grotesk was
selected by deterministic design-plan sampling for this slice; use the existing
Satoshi portal fallback if the font is not loaded, without changing global
layout tokens.

- Wide heading: maximum three lines; no stamp icon, raw telemetry, or cheap
  meta-labels.
- Summary grid: dense, gapless two-column information cells; line items may
  collapse into a horizontal accordion on narrow screens.
- Decision panel: three high-contrast buttons, visible focus states, note field
  only when needed, and explicit pending/submitted/error states.
- Action copy names the decision and consequence; no ambiguous "Continue" CTA.

## States

1. **Unavailable:** gate absent or API unavailable; show a calm support message,
   never a stack trace or raw token.
2. **Invalid:** generic “link not found” card.
3. **Expired/revoked:** read-only expired card.
4. **Already answered:** read-only decision and timestamp.
5. **Pending:** summary plus decision form.
6. **Submitted:** decision, reference context, and no second mutation.
7. **Validation/error:** note requirement and retry-safe API error copy.

## Responsive behavior

- **1440px:** 12-column editorial split; summary 7 columns, decision 5; line
  table remains visible.
- **768px:** two columns collapse to one, with decision panel after summary;
  controls remain full-width and keyboard reachable.
- **390px:** one column; line rows become stacked cells; totals stay aligned;
  no horizontal overflow.

## Verification

Focused shared-contract, Nest controller/service, API-client, and portal action
tests are required. Build must pass. Runtime proof must confirm closed-gate
behavior and must not require hosted supplier tables while Supabase remains at
55/87 migrations.
