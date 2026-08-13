# ABI OPS public brand alignment

Date: 2026-08-13

## Scope

Aligned the public landing page, metadata, structured data, web manifest,
favicon title, FAQ copy, and standalone smoke contract to `ABI OPS`. The
authenticated ERP, client portals, reports, emails, health checks, and AI
surfaces already use `ABI OPS`.

Internal package scopes, deployment identifiers, migration provenance, and
historical evidence remain unchanged because they are compatibility and audit
boundaries rather than user-facing branding.

## Verification

- PASS — active web source contains no `Third Code Solutions` brand copy.
- PASS — public browser contract updated to require `ABI OPS` title, manifest,
  and FAQ.
- PASS — post-change web typecheck, 79-route production build, local
  production Chromium E2E (1/1), and active source/build legacy-brand scan.
- NOT VERIFIED — isolated standalone smoke timed out during its dependency/build
  lane before emitting assertions; the direct production-server E2E passed.
