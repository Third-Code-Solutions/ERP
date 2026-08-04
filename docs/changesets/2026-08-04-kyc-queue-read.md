# M3.64 - CRM KYC queue read handoff

## Scope

- add the strict shared KYC queue read envelope;
- add Nest `GET /v1/crm/accounts/kyc-queue` with `account.kyc_review`;
- enforce tenant-scoped account/artifact predicates, deterministic ordering,
  a 200-row cap, and a separate pending total;
- add a disabled-by-default Next adapter and move the KYC queue page behind the
  exact flag plus tenant allowlist;
- preserve the direct server-side query as the compatibility path.

## Verification

- shared: 16 files / 174 tests;
- API: 65 files / 328 tests, serial bounded Vitest run;
- Web: 76 files / 497 tests; focused adapter/query 89/89;
- database: 41 files, 166 passed and 140 expected integration/RLS/Cortex skips;
- workspace typecheck/lint, API build, Web 80/80 production build,
  `git diff --check`.

## Release evidence

- source commit: `5a5a35a3e64e43aed3ab788d6f1bb7004fbe6609`;
- pushed to `main` and `agent-02/third-code-erp-landing` as `kurtgav`;
- Railway: `fbf64a41-e2df-4ec6-8fd5-e8e3060edf28`, `SUCCESS`, exact SHA;
- live `/ready`: 200, PostgreSQL `ok`, Redis `ok`;
- live `/health`: 200; unauthenticated KYC queue: 401;
- GitHub exact combined status: `success`;
- Supabase `aqqrtkmtcsfkbyyqxowv`: read-only, 55 hosted / 87 source
  migrations, `ACTIVE_HEALTHY`;
- Vercel: zero deployments in the audit window; no build/deploy triggered.

## Rollback and next gate

Leave `ERP_ACCOUNT_KYC_QUEUE_READS_VIA_API=false` and its tenant allowlist
empty, or redeploy the prior successful Railway source. No hosted state
requires repair. Supported Supabase recovery/export, duplicate-PO mapping,
disposable PostgreSQL 17 replay, protected browser evidence, and an explicit
spend cap remain required before a tenant canary.
