# Cortex operational record context

## Outcome

Sixteen authenticated operational detail-route families now receive the same
permission-aware Cortex context surface. One route resolver owns source mapping;
one dashboard-layout integration owns presentation.

## Covered routes

- CRM accounts and opportunities.
- Invoices and progress claims.
- Cash transactions, journals, supplier bills, and bank statements.
- Stock movements and stock receipts.
- Deliveries, RFQs, and purchase orders.
- Variation orders, punchlist items, and warranty tickets.

Project detail remains excluded because it already renders Cortex context.
Collection, create, edit, print, portal, malformed, and unsupported paths
render nothing.

## Security and compatibility

- Existing dashboard path RBAC runs before context rendering.
- Existing Cortex entity API derives authenticated tenant and current role.
- Source/type mismatch and forbidden records retain non-enumerating 404.
- No browser database access or transaction authority was added.
- Existing record pages contain no new Cortex query or business logic.
- Cash transaction citations now open exact detail records.

## Validation

- Focused tests: 55/55 pass.
- Root lint and typecheck: pass.
- Root tests: 334 pass; 132 writable-database-gated checks skip.
- API and Web production builds: pass.
- Web static generation: 77/77.
- Local health/readiness: 200/200.
- Unauthenticated record/entity boundaries: login redirect/401.
- Browser 1440/768/390: target heights 32/32/44px, visible focus, no overflow.

## Rollback

Revert the route resolver, layout injection, wrapper component/style, cash route
correction, tests, and spec together. No schema, data, Auth, Storage, queue,
provider, or backend rollback is required. If later deployed, promote the
retained last-known-good Vercel artifact.
