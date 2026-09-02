# ABI OPS RBAC source summary

## Current authority

The repository has exactly thirteen persisted roles:

| Role | Current route alias | Notes |
| --- | --- | --- |
| `owner` | `admin` | Legacy super-admin; capability rank is above admin. |
| `estimator` | `estimator` | Distinct route identity aligned to its retained capability/read projections. |
| `pm` | `pm` | Distinct route identity; project audit and mobilization grants remain independently checked. |
| `admin` | `admin` | Workspace administrator. |
| `sales` | `sales` | Sales/BD workflows. |
| `commercial` | `commercial` | Estimation and commercial workflows. |
| `design` | `design` | Design lifecycle. |
| `sd_pm_pe` | `sd_pm_pe` | Service Delivery / PM / PE. |
| `finance` | `finance` | Finance and KYC control. |
| `procurement` | `procurement` | Procurement and PO issuance. |
| `safety` | `safety` | Safety/DOLE lane. |
| `cx` | `cx` | Punchlist, warranty, and CNPS. |
| `viewer` | `viewer` | Requested as read-only across the product; current policy is narrower. |

Evidence:

- `packages/database/src/schema/enums.ts`
- `supabase/migrations/20260509164536_initial_schema.sql`
- `supabase/migrations/20260512100000_third_code_erp_ops_phase_0.sql`
- `packages/shared-types/src/authorization.ts`
- `packages/auth/src/server.ts`
- `apps/api/src/auth/supabase-jwt.guard.ts`

`public.users.role` is the active runtime identity authority. Authorization
capabilities are centralized in `packages/shared-types/src/authorization.ts`
and consumed by the Web helpers and Nest capability guard.
Navigation/direct-route policy preserves all roles; only `owner` inherits the
explicit `admin` super-admin projection.

## Source inventory counts

- 118 Next.js page routes after the password slice.
- 104 session/recovery-protected page routes: the prior 102 plus
  `/settings/profile` and recovery-bound `/auth/update-password`.
- 174 explicit HTTP operations: 133 NestJS and 41 Next.js operations.
- 158 HTTP operations are session/capability/recovery protected; 16 are public,
  token/signature controlled, callback/health, webhook, or deprecated.
- 80 central capabilities; 42 are referenced by Nest controller guards.
- 1,378 role/protected-resource matrix records: 0 `FAILED`, 32
  `NEEDS DECISION`, 1,071 `NOT TESTED`, 265 `PARTIAL`, and 10 `BLOCKED`.

## Confirmed policy conflicts

### Legacy route-policy alignment

`estimator` and `pm` are now evaluated as distinct roles. Estimator retains its
evidenced estimating/procurement reads but no longer sees or directly enters
`/inventory/**` or `/admin/**`; PM retains the prior operational route list.
Only `owner → admin` inheritance remains. All thirteen roles have automated
route-table coverage and all eleven supplied identities passed the read-only
Admin/Inventory production-build browser matrix.

Status: PARTIAL. The access mismatch is repaired, but estimator/PM browser
checks remain blocked because no identities were supplied.

The separate universal-search policy is now aligned to the Material result
destination. Owner, Admin, and Commercial retain Material search; Estimator,
PM, Service Delivery, and Procurement keep all non-Material legacy aliases but
no longer query or receive Material results.

### Material universal search

The shared Web/Core contract now evaluates Material against the exact persisted
role instead of the legacy role aliases. Web skips the Material table before
query construction for denied roles; Core removes Material from the graph scope
before database retrieval. Independent QA verified 234/234 role/type outcomes
with no remaining search destination dead end.

Status: PARTIAL. Automated Commercial-positive and tenant-isolation checks pass,
and live Procurement/Service Delivery negative checks pass. The configured
tenant's Material catalog is empty, so a live Commercial Material hit could not
be verified without mutating fixture data; Estimator and PM identities remain
unavailable.

### Route catch-all

The dashboard layout now fails closed for any path absent from an explicit
99-template route registry. Dynamic parameters match one segment, ancestors do
not authorize descendants, and every registered page has a thirteen-role
outcome derived from its page gate or established read projection. Filesystem,
registry, and independent expected-policy keys must remain exactly equal.
Focused tests passed 63/63; full type, lint, build, secret-scan, and independent
authorization review passed. Viewer, Commercial, Finance, and Sales also passed
an isolated production-build browser matrix covering allowed pages, registered
forbidden redirects, and unknown-path 404 states without protected UI. Status:
PARTIAL until the stacked branch reaches an authorized reviewed environment.

### Project tabs and audit

Stacked PR #17 filters project tabs and guards direct Audit and Access routes
from the existing central policies. Audit BOM and invoice entity discovery is
also skipped when those domains are denied. Status: PARTIAL; automated and all
supplied-role browser checks pass, while two browser identities and the
database-backed budget trigger check remain blocked.

### Legacy project chat

The stacked `agent-05/ai-chat-data-boundaries` branch repairs `/api/ai/chat` by
gating project, BOM, invoice, and PO reads independently with the checked-in
central policy. Denied-domain branches issue no query, context is bounded and
tenant/project scoped, responses are private/no-store, and all thirteen roles
have automated policy coverage. Status: PARTIAL because the provider was
deliberately disabled during browser verification and no data-bearing live
model response was requested.

### Project-detail summaries

Stacked PR #17 gates project overview, Cost/Budget, Billing, Audit, Access,
BOM/Togal, tabs, and quick links by the existing domain policies. Denied BOM,
PO, invoice, delivery, and audit-discovery branches issue no sensitive query;
denied derived metrics and placeholders are omitted. Sensitive deep links fail
closed before database access. Status: PARTIAL under the strict definition of
done; automated tests cover all thirteen roles and all eleven supplied
identities passed browser verification, but `estimator` and `pm` identities and
database-backed budget-trigger execution remain blocked.

### CSV opportunity export

The export endpoint accepts every authenticated tenant user while Reports
navigation is restricted. Status: FAILED; route/API authorization mismatch.

### Viewer semantics

The request defines `viewer` as read-only with visibility across the product.
Current navigation/tests intentionally deny Finance, KYC, invoices, claims,
reports, and Admin. Status: NEEDS DECISION for sensitive Admin/user-management
reads; all mutations remain denied.

## Password-flow result

All thirteen roles now share a role-neutral own-account password flow. Sign-in
links to a real Supabase recovery request, recovery callbacks are redirect-
allowlisted and cryptographically bound to a recent recovery session, and
Settings/Profile requires same-user password reauthentication before updating.
Password material is not written to the application database or evidence files.

Eleven supplied accounts passed real browser sign-in, dashboard rendering,
Settings/Profile rendering, ordinary-session recovery-route denial, and sign-
out. `estimator` and `pm` remain browser-blocked because neither identity is in
the request, seed, or production-role E2E helper.

Strict status remains `PARTIAL`: one real recovery request returned SDK success,
but mailbox delivery/recovery-link completion was unavailable; the guarded
Linux password-rotation lane could not complete its initial browser login. Its
external cleanup process independently verified the original credential after
each attempt, so no demo account remained modified.

## Project-chat result

The legacy project-chat route now validates bounded input before quota, database,
audit, or provider work and applies the existing project/BOM/finance/PO policy
to each database branch. Focused tests passed 21/21, including all thirteen
roles; Web type-check, source lint, production build, and an independent secret
scan passed. Viewer, Finance, and Commercial passed isolated browser/API smoke
checks with the provider disabled. Strict status remains `PARTIAL` until a
reviewed environment can verify a data-bearing live provider response.

## Project-detail result

Project-detail access now projects directly from the central capability and
universal-search registries without changing their grants. Focused tests passed
108/108 across sixteen files, including every role and direct-route query
short-circuiting. Complete Web/E2E TypeScript, full source lint, independent QA,
and the 89/89-page production build passed.

All eleven supplied identities passed login, project list/detail, refresh,
browser history, sign-out, and 66/66 sensitive direct-route assertions. The
final denial-only rerun passed 32/32: the not-found boundary rendered without
protected UI, the prior recovery boundary, or any console/page/request error.
No form, ERP data, AI provider, or production environment was mutated.
