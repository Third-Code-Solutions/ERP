# Asset Register Page Specification

## Outcome

Provide a searchable, tenant-scoped, read-only register for equipment,
vehicles, tools, and fixtures. Keep the page useful during staged rollout while
the hosted asset schema and protected tenant canary are still pending.

## Data contract

- Reuse the shared `AssetListQuery` and `AssetListResult` contracts.
- The page may read through `GET /v1/assets` only when
  `ERP_ASSET_READS_VIA_API=true` and the authenticated tenant UUID is in
  `ERP_ASSET_READS_VIA_API_TENANT_IDS`.
- The Core adapter sends the authenticated bearer token and a request ID, then
  validates the response with `assetListResultSchema`.
- Do not pass tenant IDs, roles, or authorization decisions from browser input.
- Do not import the database client or query tables from the page.
- API errors, invalid responses, timeouts, and disabled flags fail closed. There
  is no direct database fallback and no write command on this surface.

## Filters and table

- Search by asset tag, name, serial number, or manufacturer.
- Filter by the shared asset kind enum and the three supported statuses:
  `active`, `maintenance`, and `retired`.
- Preserve sort, order, page, and bounded limit in the Core request.
- Show asset tag/name, kind, status, project or location, serial/model, and
  commissioned date.
- Show page and total-record context; pagination is query-string based and
  does not mutate state.

## Visual behavior

- Reuse existing finance page, filter, KPI, status, table, and empty-state
  tokens. No new landing section, image, animation, or dependency.
- Keep the header compact and operational: title, custody context, read-only
  status, and an inventory link.
- Maintain dense table behavior with readable secondary metadata. Long values
  may wrap or truncate within existing table rules; page width must not grow.
- At narrow widths, filters and table content must remain usable without
  horizontal page overflow.

## Accessibility and authorization

- Require the existing `asset.read` capability before rendering the route.
- Use semantic form labels, table headings, status text, and pagination links.
- The route is visible to roles already granted `asset.read`; it exposes no
  create, edit, delete, assign, maintenance, or accounting action.
- Disabled rollout state explains the gate without revealing tenant data.
- Invalid filters state that no database query was issued.

## Acceptance criteria

- Default flags are false/empty in both environment examples.
- Exact lowercase `true` plus an exact UUID allowlist is required for Core use.
- Focused adapter and navigation tests pass.
- Web lint, typecheck, test, production build, and spend guard pass.
- Hosted Supabase remains unchanged until schema parity, backup/catalog review,
  RLS/audit verification, and a protected browser canary are complete.
