# ABI OPS brand removal

Date: 2026-08-13

## Scope

Removed the legacy product/company identity from
active ERP surfaces and runtime copy. The product-facing names are now:

- `ABI OPS` for the authenticated ERP, portals, print views, emails, reports,
  AI prompts, worker metadata, and operational messages.
- `ABI OPS` for the public marketing surface.
- `Actuate Builders Inc.` as the company/legal identity shown to customers.

The marketing component and hero assets use ABI OPS-aligned internal filenames,
while the public product identity is ABI OPS. Current E2E spec filenames were
also renamed to remove the old product slug.
Local seed fixtures and CI demo-tenant allowlists now use `abi-ops-local`,
and generated weekly-report lockups use the ABI OPS `A` mark.
Added `scripts/verify-abi-ops-brand.mjs` as a source/build contract and wired
it into CI to prevent legacy product or legal copy from returning to active
surfaces.

The contract scanned 1,789 active/build text files after this change.
Live health payloads now identify `abi-ops-web` / `abi-ops-api`, and pipeline
CSV downloads use an `abi-ops-` filename.
Portal page metadata and invalid-token E2E states now retain the ABI OPS
identity and accurately describe inactive links.

## Verification

- PASS — legacy brand search is empty across `apps/web/src`, `apps/api/src`,
  shared package source, workers, Supabase functions, active scripts, seed
  data, and product README/context files.
- PASS — web typecheck.
- PASS — API typecheck.
- PASS — database typecheck.
- PASS — shared-types tests: 122/122.
- PASS — web tests: 332 passed, 2 expected database-environment skips.
- PASS — web production build: 79 routes generated.
- PASS — Supabase Edge Function `deno check` for CNPS sender and SLA checker.
- PASS — public Chromium E2E: 1/1; HTTP 200, metadata, responsive layout,
  no legacy brand text, no console errors, no page errors.
- PASS — production `next start` Chromium E2E after an isolated rebuild: 1/1.
- PASS — built `.next` output contains no legacy brand text.
- PASS — production Chromium E2E asserts the `abi-ops-web` health identity.
- PASS — active marketing component and asset identifiers use the `abi-ops`
  product slug; no `abi-os` implementation references remain in active source.
- PASS — public portal/auth E2E: 7/7 after correcting stale invalid-link
  assertions.

## Deliberate compatibility boundary

The `@third-code-erp/*` package scope, historical deployment evidence,
governance instructions, historical PRD copies, and migration
filenames/comments remain unchanged where changing them would break imports,
deployment identity, migration provenance, or repository operating rules.
Runtime public-origin fallbacks now use localhost and
production must configure `NEXT_PUBLIC_SITE_URL`; CNPS jobs fail closed when no
public origin is configured. No hosted database write or deployment was made.
