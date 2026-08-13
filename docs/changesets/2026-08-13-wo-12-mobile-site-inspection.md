# WO-12 — Mobile Site Inspection + RFI

## Implemented

- PPRF values now prefill the site inspection report: address, floor area, landlord contact, as-built status, expected start, and scope notes.
- Inspection forms are mobile-first and one-handed: stacked fields, 44px actions, camera capture, image previews, bounded photo count/size, and accessible status/error messaging.
- Field reports persist in IndexedDB while offline. Drafts restore after reload, retain uploaded document IDs, and remain recoverable when Storage or the API is unavailable.
- Camera images upload through a tenant- and opportunity-scoped multipart API. Each image becomes a first-class `documents` row before it can be linked to an inspection.
- Pre-Won inspections and generated reports now persist against `opportunity_id`; `project_id` remains optional until project conversion.
- Inspection, photo, RFI, document, and PDF relationships gained composite tenant foreign keys and runtime RLS coverage.
- RFI creation now verifies that the inspection belongs to the submitted opportunity, closing the cross-opportunity mutation path.

## Verification

- `pnpm --filter @third-code-erp/shared-types typecheck` — PASS
- `pnpm --filter @third-code-erp/database typecheck` — PASS
- `pnpm --filter @third-code-erp/web typecheck` — PASS
- Targeted photo API tests — PASS, 4/4
- Shared-types tests — PASS, 128/128
- Disposable PostgreSQL/Redis lane — PASS, 64 migrations; 59 DB files; 254/254 tests; zero skips; API integration 3/3; schema hash `43E11D967D9F52B2BD3F39EEBA1DC62A6E1819BC51BE37CFE0D0032635D90176`
- Web Vitest — PASS, 143 files; 359 passed; 0 failed; 2 existing PostgreSQL-dependent skips
- Build-ops invariants — PASS
- Audit coverage — PASS, 113/113 tenant-scoped tables
- actionlint — PASS
- gitleaks — PASS
- Production build — PASS, Next.js 15.5.18; 80 routes
- Local Chromium E2E — PASS, 4/4; public branding, authentication, invalid credentials, protected-route redirects
- Direct browser checks — PASS; mobile 390px and desktop 1280px no horizontal overflow, no console errors/warnings, health/readiness HTTP 200

## Release boundary

This is local/disposable-environment evidence only. No hosted Supabase migration or production deployment was performed. Hosted promotion remains blocked by the recorded provider-source divergence and existing hosted production-data reconciliation gates.
