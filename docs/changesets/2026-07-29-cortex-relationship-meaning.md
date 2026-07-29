# Cortex directional relationship meaning

## Outcome

Cortex record context now explains why records are connected. Each visible
relationship combines a directional human label, canonical record identity,
origin, and exact authorized destination.

## Security and compatibility

- Existing authentication, tenant, source/type ownership, and role checks run
  before relationship retrieval.
- Relationships derive only from the current role-filtered context pack.
- Missing citations are omitted; unknown routes render static content.
- Response size is bounded to 12 relationships.
- Existing `found`, `summary`, and `citations` fields remain unchanged.
- No database, hosted data, Auth, Storage, queue, backend, or provider change.

## Interface

- Fifteen canonical edge types have original outgoing and incoming labels.
- Unknown edges use `Connected`.
- Desktop and tablet use two columns; mobile uses one.
- Targets are 44px high with visible keyboard focus.
- Long record names ellipsize without page or list overflow.

## Validation

- Focused tests: 11/11 pass.
- Root lint and typecheck: pass.
- Root tests: 341 pass; 132 writable-database-gated checks skip.
- API and Web production builds: pass.
- Web static generation: 77/77.
- Local unauthenticated entity API: 401.
- Browser 1440/768/390: correct columns, 44px targets, visible focus,
  controlled truncation, no overflow, clean console.

## Rollback

Revert the response builder, route extension, relationship component/style,
tests, spec, and documentation together. Existing Cortex summary and source
chips remain functional. No data or provider rollback is required. If later
deployed, promote the retained last-known-good Vercel artifact.
