# M3.58 — Nest project detail read contract

## Scope

Added a bounded, read-only project detail handoff from the Next compatibility
surface to the Nest modular monolith.

## Source changes

- Added `GET /v1/projects/:projectId` with `project.read` capability and
  authenticated tenant scoping.
- Added a shared camelCase project read schema with ownership metadata.
- Added a disabled-by-default Next adapter and strict returned identity checks.
- Kept the existing direct server-side read as the default compatibility path.

## Gates

- Focused API: 26/26
- Shared types: 15/164 full suite; focused project contract 4/4
- Web: 75 files / 479 tests; focused core/project read 77/77
- API and Web typecheck/build: pass
- Workspace lint and `git diff --check`: pass
- Concurrent full API run: 311/312, one existing procurement controller
  timeout; isolated rerun: 8/8

## Provider boundary

No Supabase SQL/data, Storage, Railway setting, or Vercel build changed.
`ERP_PROJECT_READS_VIA_API=false` and its tenant allowlist stay closed.

## Rollback

Revert the source commit and retain the disabled read flag. No hosted repair is
needed.
