# M3.47 — Proposal read tenant scope

Hardened the proposal overview and change-request log. Related PPRF,
inspection, design, change-request, and account reads now repeat the
authenticated tenant predicate; the optional change-request design join is
tenant-constrained as well. Corrected US-009 in the user-story index from
Dev-stub to Live and mapped its actual `change_requests`/`design_files` tables.

Source checkpoint: `9270919`. Validation: focused proposal actions 2/2, Web 66 files/450 tests, workspace
lint/typecheck, `git diff --check`, and the 79/79-route production build pass.
No hosted SQL/data, Storage, Railway, or Vercel mutation occurred.

Post-push: `5a5e525` is on both target branches. GitHub's Railway check is
successful; Railway skipped the unchanged-API commit and live readiness is
200. Vercel reported zero new deployments. Supabase remains at 55 migrations;
its branch API reports `MIGRATIONS_FAILED` while the last successful migration
log read fails the duplicate-PO preflight with `P0001`. A later logs request
returned `INVALID_ARGUMENT`; no DB release is claimed.
