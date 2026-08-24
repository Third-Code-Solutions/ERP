# RBAC entitlement matrix decision required

## Status

Blocked only for the remaining **business-policy** changes; the technical
direct-route and page-level authorization remediation is implemented.

## Evidence

The active capability policy currently grants `account.read` and
`opportunity.read` to every one of the 13 roles. The executive dashboard also
currently grants analytics to ten roles.

`apps/web/REFACTOR.md` §2 describes a narrower nine-role matrix:

- Accounts: Admin, Sales, Commercial, SD / PM / PE, Finance, and CX.
- Opportunities: Admin, Sales, Commercial, Design, SD / PM / PE, Finance, and
  Procurement.
- The dashboard/navigation section scopes CRM and Pipeline to Sales, Admin,
  and Management, but does not define Management or map the legacy Owner,
  Estimator, and PM roles.

The current PRD is silent on the final role-to-domain matrix. Selecting either
source changes access to commercial and customer data and cannot be inferred
safely.

## Decision required

Product ownership must approve the authoritative role grants for:

1. Account and opportunity reads, including whether Safety, CX, and Viewer may
   see pipeline values and client identities.
2. Executive dashboard analytics, including TCV, GP, forecasts, rep identity,
   and alerts.
3. Legacy `owner`, `estimator`, and `pm` behavior relative to the nine-role
   matrix.

After approval, update the central capability policy and run the 13-role
authenticated browser matrix against seeded non-production identities.
