# M3.139 - Self-hosted Core authority evidence

Date: 2026-08-07
Provider state: unchanged

## Evidence

- WSL PostgreSQL 17 and Redis 7.4.9 lane passed;
- all 98 repository migrations replayed from zero;
- database no-skip gate passed;
- Nest API integration suite passed;
- schema-before/schema-after SHA256 matched:
  `6E1CA120B357614D2A9C4CF06F1E306E08210CFB7B11F340A5E2A286D42D1B71`;
- cleanup stopped the disposable services and database.

## Boundary

This is source/runtime evidence only. It does not prove managed Supabase
catalog/data/RLS parity, backup/PITR restore, hosted Auth identity, audit
recovery, provider readiness, or spend authorization. No hosted SQL/data,
Vercel deployment, Railway deployment, feature flag, or tenant record changed.
