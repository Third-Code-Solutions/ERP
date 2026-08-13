# M3.230 — Read-only Supabase reconciliation refresh

Refreshed hosted parity evidence for project `aqqrtkmtcsfkbyyqxowv` without
executing SQL or changing provider state.

- Target healthy: PostgreSQL 17.6.1, `ap-northeast-2`.
- Hosted ledger: 55 rows, head `20260729233017`.
- Source ledger: 116 files, head `20260810120000`.
- Ordered pending suffix: 61 migrations.
- Cortex snapshot: 3 vendor nodes, 0 material nodes.
- Advisor snapshot: 14 security findings, 253 performance findings.

Updated `managed-supabase-parity-plan.json` and required architecture/
operations/research records. Hosted apply remains blocked pending backup/clone,
isolated replay, catalog/data/RLS/function diff, rollback, owner, and spend
evidence. No Supabase, Vercel, Railway, or paid action occurred.
