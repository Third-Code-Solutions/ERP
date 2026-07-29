# Cortex grounded citation navigation

## Outcome

Cortex answers now expose visible, canonical record links without changing the
existing plain-text stream. Saved conversations rebuild citation presentation
from current tenant-scoped graph data and current-role permissions.

## Compatibility and security

- Chat response body and content type remain backward compatible.
- The response header contains at most eight bounded citations.
- History trusts only valid stored graph-node IDs.
- Titles, references, Project context, and routes come from live authorized
  graph data.
- Missing, superseded, malformed, cross-tenant, and forbidden citations are
  omitted.
- Navigation derives from the exhaustive Cortex entity registry.

## Validation

- Focused tests: 32/32 pass.
- Root lint and typecheck: pass.
- Root tests: 303 pass; 132 writable-database-gated checks skip.
- Production build: pass; 77/77 static-generation steps.
- Local production health/readiness: 200/200.
- Unauthenticated entity/chat boundaries: 401/401.
- Desktop focus: visible.
- 390px citation targets: 44px; no horizontal overflow.

## Rollback

Revert this changeset's database helpers, chat/history adapters, citation
component, styles, and tests together. Existing message text remains readable.
No database, Auth, Storage, queue, provider, or deployment rollback is needed.
If later deployed, promote the retained last-known-good Vercel artifact.
