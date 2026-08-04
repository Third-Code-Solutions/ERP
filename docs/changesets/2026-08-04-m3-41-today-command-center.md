# M3.41 — Read-only Today Command Center

## Outcome

Third Code ERP now has a calmer authenticated operating view: Today summary,
assignee-scoped work queue, policy-gated project context, and explicit Cortex
handoff. It is an original surface built from existing repository conventions;
no vendor code, text, schema, or branding was copied.

## Source

- Checkpoint: `ab905091ada2f7db927e6cf4c2de687ee2010194`
- Files: dashboard query/page, Today component/CSS/test, viewer role E2E
  assertions
- Database/provider state: unchanged; no hosted SQL, Storage, Railway
  variable, Vercel build, or Vercel Git change

## Evidence

- Focused Today tests: 2/2
- Web suite: 62 files / 440 tests
- Lint, typecheck, `git diff --check`, Next build: 78 routes
- Browser MCP: viewer desktop/mobile, zero overflow, executive surfaces
  absent, Cortex handoff, zero console errors
- CLI Playwright: skipped; configured Chromium executable is not installed

## Release boundary

Push once and verify exact GitHub/Railway release and readiness. Keep the
Supabase 55-row hosted prefix, all mutation flags, and Vercel Git/spend gate
unchanged. No Vercel deployment is authorized by this source slice.
