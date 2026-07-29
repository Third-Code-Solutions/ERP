# Cortex Relationship List Specification

## Outcome

Show why a record is connected to another record inside the existing Cortex
panel. Keep the feature read-only, source-grounded, tenant-scoped, role-scoped,
and navigable to canonical ERP detail pages.

## Data contract

- Reuse the existing tenant-scoped Cortex context pack.
- Keep the existing record-type authorization gate before context retrieval.
- Pass the current role's node-type scope into context retrieval.
- Return at most 12 relationship rows.
- Each row contains:
  - edge ID and canonical edge type;
  - direction (`out` or `in`);
  - human-readable directional label;
  - graph origin and confidence;
  - the already role-filtered neighbor citation.
- Never accept tenant, role, relationship, or destination data from the client.
- Missing, forbidden, cross-tenant, and unsupported records keep the existing
  non-enumerating 404 response.

## Directional labels

| Edge type | Outgoing | Incoming |
| --- | --- | --- |
| `owns` | Owns | Owned by |
| `assigned_to` | Assigned to | Assigned work |
| `member_of` | Member of | Has member |
| `part_of` | Part of | Contains |
| `derived_from` | Derived from | Source for |
| `bills` | Bills | Billed by |
| `supplies` | Supplies | Supplied by |
| `pays` | Pays | Paid by |
| `blocks` | Blocks | Blocked by |
| `depends_on` | Depends on | Required by |
| `mentions` | Mentions | Mentioned by |
| `scheduled_for` | Scheduled for | Scheduled item |
| `approved_by` | Approved by | Approves |
| `superseded_by` | Superseded by | Supersedes |
| `references_doc` | References | Referenced by |

Unknown edge types use the bounded label `Connected`.

## Interface

- Existing grounded summary remains first.
- A `Connections` section appears only when relationships exist.
- Each relationship row shows:
  - directional relationship label;
  - neighbor record type and title;
  - origin as secondary metadata.
- Navigable citations use the canonical Cortex route registry.
- A non-navigable citation renders as static content, never as a broken link.
- Existing source chips remain after the relationship list.

## Visual behavior

- Reuse the existing white Cortex panel, navy information color, neutral border,
  six-pixel corner radius, and restrained 160ms interaction timing.
- Desktop/tablet: two-column relationship grid.
- Mobile at 640px and below: one-column grid.
- Every relationship target has a minimum height of 44px.
- Long labels truncate without horizontal overflow.
- Keyboard focus uses the existing visible two-pixel navy outline.
- No new image, icon, animation, dependency, landing section, or bento cell.

## Accessibility

- Relationship collection is a semantic list labelled `Connections`.
- Link labels state the relationship, record type, and record title.
- Static rows keep readable text but do not enter the tab order.
- Text does not rely on color alone to communicate meaning.

## Acceptance criteria

- Directional labels are correct for outgoing and incoming edges.
- Unknown edges fail safely to `Connected`.
- Only role-filtered neighbor citations are returned.
- Relationship count is bounded to 12.
- Existing response fields and 404 behavior remain compatible.
- Relationship links use canonical record routes.
- Desktop, tablet, and mobile layouts have no horizontal overflow.
- Lint, typecheck, tests, production build, and local browser verification pass.
