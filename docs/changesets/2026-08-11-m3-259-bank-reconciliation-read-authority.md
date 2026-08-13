# M3.259 - Bank reconciliation read authority

Date: 2026-08-11

## Change

Added a rollback-only protected HTTP/DB canary for the existing Core bank
reconciliation read projection:

- two tenant fixtures with Finance/viewer identities;
- JWT and capability guard enforcement;
- strict query and disabled-selector behavior;
- bounded `limit`/`truncated` results and aggregate parity;
- cross-tenant concealment and rollback verification.

No product source or schema change was required. The read path remains
write-free; Python/AI cannot import, match, reconcile, or void bank evidence.

## Evidence

- Focused HTTP canary: 1/1 PASS.
- Reconciliation API unit contract: 4/4 PASS.
- Shared contract: 3/3 PASS.
- Bank-reconciliation database suite: 17/17 PASS.
- API integration: 54/54 files, 68 passed, 2 explicit Redis-restart skips.
- Root typecheck, lint, production build, provider-spend, parity, release,
  Web/DB boundary, workflow-reference, and actionlint gates: PASS.
- Root `pnpm test`: FAILED by the pre-existing invoice-draft service mock
  (`transactionClient.select` undefined); focused reproduction is the same
  failure (172/173 API files, 751/752 tests passed).
- Source commit: `fff90135bb3a96859a589a65a0860e115588dfea`.

## Operational boundary

No hosted Supabase SQL/data, Storage, Railway/Vercel deployment, credentials,
provider settings, or paid action changed. Source parity is 55/118 with 63
pending. Keep `ERP_FINANCE_RECONCILIATION_READS_ENABLED=false`, its tenant
allowlist empty, and the Web selector closed until hosted parity, readiness,
browser, rollback, and billing gates are separately reconciled.
