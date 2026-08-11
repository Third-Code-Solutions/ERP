# M3.272 - Protected finance-receivables Core HTTP canary

Date: 2026-08-11
Status: source-only, locally verified; no production cutover

## Scope

Added an opt-in HTTP canary around the real Nest customer-receivables
controller, service, JWT guard, capability guard, and transaction-bound
database. The fixture creates two random tenants and issues invoices through
the database-authoritative `public.issue_customer_invoice` function.

## Evidence

- Missing/unknown auth returns 401; a viewer returns 403.
- Invalid date ranges return 400 and a closed selector returns 503.
- Exact centavo totals cover current due, retention, withholding, overdue total,
  overdue count, bounded pagination, account/project filters, and due-date
  ranges.
- A foreign tenant account filter returns no rows under the requesting tenant.
- The outer transaction rolls back and leaves zero matching fixtures.
- Focused protected HTTP canary: 2/2 PASS.
- API unit suite: 174 files / 760 tests PASS.
- Root typecheck, lint, forced tests, production build, provider-spend,
  Web/DB boundary, workflow refs, actionlint, gitleaks, database-release, and
  managed-parity plan gates PASS.

## Defect fixed

Receivables overdue aggregation previously bound a JavaScript `Date` inside a
raw SQL template. The postgres wire driver rejects that value; the service now
binds the equivalent ISO timestamp string. A unit assertion prevents a Date
from returning to raw SQL parameters.

## Safety boundary

The integration suite is opt-in and ran only against disposable local
PostgreSQL with `ERP_API_INTEGRATION_EXPECTED=1`. Production selectors remain
false/empty. No hosted Supabase SQL/object, Vercel/Railway deployment,
provider setting, credential, or paid action changed.

## Next action

Keep `ERP_FINANCE_RECEIVABLES_READS_ENABLED=false` and
`ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS` empty. Add a separate authenticated
browser proof for the real `/finance/receivables` page before any tenant
canary; then require hosted parity, readiness, release identity, rollback,
and spend evidence. Do not apply hosted SQL or trigger provider builds.
