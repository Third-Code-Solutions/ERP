# Standalone brand smoke verifier

## Outcome

VERIFIED COMPLETE for the local standalone smoke scope. The verifier now checks
the current public ABI OS manifest contract instead of the retired Third Code
ERP label.

## Changes

- Replaced brittle compact-JSON text matching with JSON parsing and explicit
  `PSObject.Properties` field reads.
- Added PowerShell-compatible JSON validation for `name` and `short_name`.
- Kept the public contract explicit: both manifest brand fields must equal
  `ABI OS`.
- Updated landing-page smoke to assert `ABI OS`, matching public marketing
  metadata and the manifest.

## Verification

- PASS `pnpm ci:actionlint`.
- PASS clean isolated `scripts/ci/smoke-web-standalone.ps1` run.
- PASS isolated dependency install and Next standalone build: 78 routes
  generated; Node 24.16.0 emitted the repository's existing Node 22.x engine
  warning.
- PASS standalone server startup, `/api/health`, ABI OS landing, nonce CSP,
  robots, sitemap, and ABI OS manifest (`name` and `short_name`).

## Boundary

This smoke proves local standalone packaging and public runtime behavior only.
It does not prove hosted deployment, authenticated production flows, or
Supabase migration readiness.
