# ABI OPS RBAC source summary

## Current authority

The repository has exactly thirteen persisted roles:

| Role | Current route alias | Notes |
| --- | --- | --- |
| `owner` | `admin` | Legacy super-admin; capability rank is above admin. |
| `estimator` | `commercial` | Legacy route alias; capability grants are not equivalent. |
| `pm` | `sd_pm_pe` | Legacy route alias; capability grants are not equivalent. |
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
and consumed by the Web helpers and Nest capability guard. The navigation and
route layer separately folds three legacy roles through
`apps/web/src/lib/operations/nav-config.ts`.

## Source inventory counts

- 118 Next.js page routes after the password slice.
- 104 session/recovery-protected page routes: the prior 102 plus
  `/settings/profile` and recovery-bound `/auth/update-password`.
- 174 explicit HTTP operations: 133 NestJS and 41 Next.js operations.
- 158 HTTP operations are session/capability/recovery protected; 16 are public,
  token/signature controlled, callback/health, webhook, or deprecated.
- 80 central capabilities; 42 are referenced by Nest controller guards.
- 1,352 role/protected-page matrix records: 28 `FAILED`, 32
  `NEEDS DECISION`, 1,071 `NOT TESTED`, 215 `PARTIAL`, and 6 `BLOCKED`.

## Confirmed policy conflicts

### Legacy alias mismatch

`estimator` is routed as `commercial`, but differs from `commercial` on 21
shared capabilities. This creates links that render in navigation and then
fail in the page or API. Concrete examples include `/admin` and `/inventory`.

`pm` is routed as `sd_pm_pe`, but its shared grants differ for `audit.read` and
`precon.override_mobilization`.

Status: FAILED. A product decision is not required to remove accidental
route/action divergence; exact grants still require regression coverage.

### Route catch-all

`canViewPath` returns allowed for paths absent from navigation configuration.
Several dynamic or secondary dashboard routes therefore depend entirely on
page-local checks. Status: PARTIAL.

### Project tabs and audit

All project readers see every project tab, including Access and Audit. The
legacy Audit fallback can expose diffs to roles outside the central
`audit.read` capability. Status: FAILED; high-priority authorization repair.

### Legacy project chat

`/api/ai/chat` and its project-chat UI can assemble BOM margin, invoice, and PO
totals with authentication and tenant scope but no capability-specific data
scope. Status: FAILED; high-priority data-authorization repair.

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
