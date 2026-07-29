# Cortex focused neighborhood

## Outcome

Operational record context can now open the exact record inside a small,
permission-aware Cortex neighborhood. The normal whole graph remains
compatible.

## Contract

- Focus is a complete canonical `refTable` plus UUID `refId`.
- Tenant and role come only from the authenticated session.
- Missing, mismatched, and forbidden focus returns the same 404.
- The server returns one focus node plus at most 80 direct neighbors.
- Tenant and current-row predicates apply to the focus, edges, and joined
  neighbors.
- The browser receives the server-derived focus node ID and cannot select a
  tenant or trusted graph node ID.
- Focus is read-only.

## User experience

- Authorized record panels expose `Open focused graph`.
- Cortex opens the focused record drawer automatically.
- The focus remains highlighted and centered in visible canvas space.
- The UI labels the bounded result as connections shown.
- `Show all records` restores the existing whole graph.
- Tablet/mobile drawers flow below the graph. The shell uses an icon rail on
  narrow screens.

## Verification

- Graph route tests: 6/6 pass.
- Root lint and all-package typecheck: pass.
- Root tests: 356 pass; 132 writable-database-gated cases skip.
- Optimized production build: pass; 77/77 static-generation steps.
- Authenticated connected-database E2E: pass. The test follows the real Project
  backlink, checks invalid focus 400, verifies bounded payload and exact focus,
  clears focus, checks zero console/page errors, and captures 1440/768/390 with
  zero horizontal overflow.
- Gitleaks and actionlint: pass.
- Repository-wide prohibited external ERP source/brand scan: zero findings.
- Vercel: zero new deployments; retained production deployment
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.

## Rollback

Revert this changeset's source and documentation together. No schema, business
data, Storage, queue, provider configuration, or deployed artifact changed.
