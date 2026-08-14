# Hosted ABI OPS release and E2E blocker

## Current status — public release resolved 2026-08-14

The public deployment blocker is resolved. Vercel deployment
`dpl_3h5R66ZBfZwjKYxYbByVB3ptk7fx` is `READY`, the production alias serves
ABI OPS, and live public/browser health checks pass. Authenticated hosted
feature parity remains separately blocked because no authorized production
test identity was supplied.

## Status

BLOCKED for hosted completion. The local source and production artifact use
ABI OPS, but the public Vercel alias still serves an older release.

## Evidence

- `pnpm test:abi-ops-brand`: PASS, 2/2.
- `pnpm verify:abi-ops-brand`: PASS, 1,799 text files scanned, including raw
  public assets and the built web artifact.
- `pnpm test:production-surface`: PASS, 3/3.
- Read-only `pnpm verify:production-surface -- --url
  https://thirdcode-erp.vercel.app`: BLOCKED.
- Live `/api/health`: HTTP 200, revision `dpl_F1Xo2hfh`, service
  `third-code-erp-web`.
- Live `/manifest.webmanifest`: `ABI OS` for both `name` and `short_name`.
- Live `/`: HTTP 200, no `ABI OPS`, contains `Third Code Solutions` and
  `ABI OS`.
- Authenticated hosted route E2E cannot start because the configured test
  identity returns Supabase `400 invalid_credentials`.

## Required resolution

1. Approve one exact Standard Vercel production build and its current provider
   billing cap before deployment. Vercel Git is disconnected; no deploy or
   alias mutation has been performed.
2. Approve one unused user-controlled email identity for normal hosted signup
   and confirmation. Do not use direct SQL or a service-role provisioning
   shortcut.
3. After both approvals, deploy the reviewed ABI OPS source once, verify the
   exact release identity, public metadata, health/readiness, responsive UI,
   authenticated route E2E, console/runtime errors, and rollback.

No hosted database rows, deployment settings, or production aliases were
changed while capturing this evidence.

Separate read-only Supabase advisor findings are recorded in
`docs/blockers/2026-08-13-provider-advisor-findings.md`; no advisor remediation
SQL was applied.
