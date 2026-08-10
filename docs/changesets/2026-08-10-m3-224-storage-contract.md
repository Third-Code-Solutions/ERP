# M3.224 - Provider-neutral document Storage contract

## Delivered

- Server-only `DocumentStorage` contract.
- Supabase adapter remains production default.
- Compatible HTTP adapter supports binary downloads, bearer forwarding,
  structured errors, and malformed-path rejection.
- CAD parser accepts injected Storage without changing tenant/Core authority.

## Evidence

- Local HTTP-compatible object stub and parser injection: 6/6 tests.
- Web suite: 109/109 files, 756/756 tests.
- Disposable lane: PostgreSQL 17, Redis 7.4.9, 116 migrations, database
  370/370 with no skips, API 30/30 files and 45/45 tests.
- No hosted provider, deployment, migration, or paid action.

## Follow-up

Controlled Playwright upload fixture remains open. Keep real credentials and
provider traffic out of that fixture.
