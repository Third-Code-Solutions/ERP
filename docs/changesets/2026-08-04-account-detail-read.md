# M3.63 — CRM account detail read handoff

## Scope

- Add a strict Nest `GET /v1/crm/accounts/:accountId` detail graph.
- Scope the account, contacts, KYC artifacts/documents, opportunities, and
  projects to the verified tenant principal.
- Cap child collections at 200 and calculate the opportunity total with a
  separate tenant-scoped count.
- Keep the Next adapter and page canary-disabled; direct server-side reads are
  still the compatibility path.

## Verification

- Shared types: 16 files / 172 tests.
- API: 65 files / 326 tests (serial bounded Vitest run).
- Web: 76 files / 492 tests.
- Workspace typecheck and lint; Nest build; Web 80/80 production build;
  `git diff --check`.
- GitHub commit: `c4fb282f` (`success`).
- Railway deployment: `abedf9fd-1785-4b8f-b4f7-00436466b708` (`SUCCESS`).
- Live API: `/ready` 200 with PostgreSQL/Redis, `/health` 200, unauthenticated
  collection/detail reads 401.
- Supabase `aqqrtkmtcsfkbyyqxowv`: read-only; 55 hosted migrations vs 87 in
  source.
- Vercel: zero deployments in the spend-audit window; no build/deploy run.

## Rollback and open gates

Leave `ERP_ACCOUNT_READS_VIA_API=false` and its tenant allowlist empty, or
redeploy the prior successful Railway source. No database migration or hosted
data repair occurred. Do not enable a protected canary until supported
Supabase backup/export, dependent/audit export, owner-approved duplicate-PO
mapping, disposable PostgreSQL 17 replay, protected browser proof, rollback
evidence, and an explicit spend cap exist.
