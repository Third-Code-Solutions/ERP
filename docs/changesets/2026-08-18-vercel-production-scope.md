# Vercel production scope repair — 2026-08-18

## Status

**PRE-CI.** Repairs the guarded production workflow after release run
`32137528268` reached the Vercel step and failed before any web deployment.

## Root cause

The workflow supplied the Vercel dashboard slug as `--scope`. Vercel CLI
requires the team ID; the repository's linked Vercel project records that ID
as `orgId`.

## Change

- Set `VERCEL_SCOPE` in the canonical production workflow to the linked Vercel
  team ID. No application, database, API, or worker behavior changed.

## Verification plan

- Run workflow-focused lint and action-reference checks locally.
- Require a fresh PR CI run, then merge through GitHub.
- Re-dispatch the canonical production workflow on the resulting `main` SHA.
