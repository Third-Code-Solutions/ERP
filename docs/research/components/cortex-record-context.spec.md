# Cortex Record Context Specification

## Overview

- Target files:
  - `apps/web/src/components/cortex/cortex-route-context.tsx`
  - `apps/web/src/lib/cortex/record-route.ts`
  - `apps/web/src/app/(dashboard)/layout.tsx`
- Interaction model: route-driven loading, then click-driven record navigation.
- Live reference: existing Cortex panel CSS from
  `https://thirdcode-erp.vercel.app/`, inspected at 1440px on 2026-07-29.
- Product outcome: operational detail pages expose Obsidian-like backlinks and
  source context without duplicating business logic inside each page.

## Route contract

Match only an exact supported detail route with UUID path segments:

- `/crm/accounts/:id` -> `accounts`
- `/crm/opportunities/:id` -> `opportunities`
- `/invoices/:id` -> `invoices`
- `/claims/:id` -> `progress_claims`
- `/finance/cash/:id` -> `cash_transactions`
- `/finance/journals/:id` -> `journal_entries`
- `/finance/payables/:id` -> `supplier_bills`
- `/finance/reconciliation/:id` -> `bank_statements`
- `/inventory/movements/:id` -> `stock_movements`
- `/inventory/receipts/:id` -> `stock_receipts`
- `/procurement/deliveries/:id` -> `delivery_schedules`
- `/procurement/rfqs/:id` -> `rfqs`
- `/purchase-orders/:id` -> `purchase_orders`
- `/projects/:projectId/vos/:voId` -> `variation_orders`, using `voId`
- `/punchlist/:id` -> `punchlist_items`
- `/warranty/:id` -> `warranty_tickets`

Do not match collection, create, edit, print, portal, Project-detail, or
unsupported routes. Project detail already owns an inline Cortex panel.
Trailing slash is accepted. Malformed and non-UUID IDs fail closed.

## Authorization and data behavior

- Dashboard layout first applies existing route authorization.
- Context panel uses existing `/api/cortex/entity/:refTable/:refId`.
- API derives tenant and current role from authenticated profile.
- Missing, cross-tenant, mismatched, and forbidden records remain the same
  non-enumerating 404.
- Browser receives no database credential and performs no official mutation.
- One route parser owns mapping; individual pages contain no Cortex query or
  business logic.

## DOM structure

- Dashboard main content.
  - Existing page content.
  - Route-context wrapper with `data-cortex-record-context`.
    - Existing `CortexEntityPanel`.
      - Cortex heading and Graph tag.
      - Loading, empty, error, or grounded summary state.
      - Canonical citation list.

## Computed visual reference

Existing live panel at 1440px:

- Panel background: `rgb(255, 255, 255)`.
- Panel border: `1px solid rgb(232, 232, 234)`.
- Panel radius: `8px`.
- Panel padding: `18px`.
- Panel shadow:
  `rgba(15, 23, 42, 0.05) 0px 1px 2px 0px`,
  `rgba(15, 23, 42, 0.04) 0px 1px 1px 0px`.
- Title: `14px`, weight `600`, line-height `21px`,
  `rgb(64, 64, 64)`.
- Focus outline: `2px solid rgb(43, 84, 129)`.
- Wrapper separation: `24px` above the panel.

Current source citation target:

- Desktop/tablet minimum height: `32px`.
- Mobile at 640px and below: `44px`.
- Wrapping enabled; no horizontal overflow.

## States

- Loading: existing three-line skeleton with status announcement.
- Empty: “Not in the knowledge graph yet.”
- Error: bounded Cortex availability message with alert semantics.
- Loaded: deterministic grounded summary plus source count and links.
- Keyboard: canonical links remain in tab order with visible two-pixel outline.

## Responsive behavior

- Desktop 1440px: panel fills available dashboard content width.
- Tablet 768px: same single-column panel; citation chips wrap.
- Mobile 390px: wrapper remains full width; citation targets are at least
  44px; no horizontal overflow.

## Motion and assets

- No new image, icon, animation, dependency, bento cell, or landing motion.
- Existing 160ms citation hover/focus transition remains authoritative.
- Reduced-motion behavior remains unchanged.

## Acceptance criteria

- Every exact supported route returns the expected source table and record ID.
- Every collection, nested unsupported, malformed, and Project-detail route
  returns no context.
- Every configured source table exists in the canonical Cortex registry.
- Cash transaction citations open exact detail records.
- Layout renders at most one route-context panel.
- Existing Project detail and Cortex graph behavior remain unchanged.
- Lint, typecheck, tests, production build, local runtime, and
  1440/768/390 browser checks pass before release.
