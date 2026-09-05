# Cortex workspace usability repair

## Outcome

Reworks the existing Cortex surface without replacing its data model or assistant
contracts. The screenshot's deletion request was not executed; no records, files,
conversations or graph relationships were removed.

- Graph-first hierarchy, compact live metrics and collapsible knowledge pulse.
- Consistent light workspace using ABI OPS tokens; readable chat and detail panels.
- Detail inspection below the canvas rather than obscuring it; wrapping connections
  and compact context with disclosure. All returned connections and sources are
  available directly, without a self-referential graph link. Keyboard focus returns
  to the inspection trigger.
- Deterministic initial graph spread, settled initial fit, real canvas resize fit,
  label collision/viewport checks, legible minimum nodes and bounded hover tooltip.
- No endless animation loop after the simulation settles. Existing pan, zoom,
  node selection, clustering, fit and canonical navigation remain available.
- Graph/Records controls, collapsed type filters and explicit reset/empty states.
  Phones start with the keyboard-accessible record list and have a jump to chat.
- Graph responses use the existing shared Zod schema; malformed payloads show a
  retry action rather than a broken canvas.
- Assistant paragraphs/evidence lists render as escaped text, never generated HTML
  or arbitrary links. Source citations, saved conversations and server permissions
  remain authoritative. Editing/deletion scope is stated accurately.
- Indexing pause copy is user-facing; provider budget/approval gates unchanged.

## Verification

- Baseline:124 Cortex tests passed before changes.
- PASS: final focused Cortex suite:133 tests across25 files, including graph geometry
  and escaped assistant-answer presentation. E2E TypeScript passed afterward.
- PASS: full web suite:1782 passed, zero failures; two DB-gated tests skipped in
  the ordinary lane, then both passed separately against loopback PostgreSQL.
- PASS: application and E2E TypeScript; focused lint;132 App Router boundaries;
  type-safety/static BUILD OPS invariants.
- PASS: final loopback browser run52.2s, real local PostgreSQL and authenticated
  user-token boundary.320/390/768/1024/1440 widths; keyboard selection/details,
  history/composer,81-node density, filters/fit, malformed/empty response and retry,
  focused project desktop/mobile, all nine fixture sources, bounded chat controls; no console errors,
  no external requests, no semantic indexing requests.
- Visual review: initial screenshots exposed a dark hint background, mobile filter
  height, narrow focus-title column and chat control clipping; corrected and rerun.
- Initial harness failed because its stale fixture required service-role profile
  reads; current Auth correctly uses the user's token. Fixture updated accordingly.
  Another old assertion required a fontshare request, but current globals no longer
  load it. Replaced with a stricter zero-external-request assertion.
- One intermediate browser run interrupted for layout refinements; not reported
  as passed. Type-check/dev-server generated-file race reran successfully after
  stopping dev. Prettier is not installed; no dependency added to run it.
- PASS: final root `pnpm lint` with zero warnings; final web `pnpm build`, including
  type validation and102 static pages, after the source-disclosure refinement.
- PASS: pinned gitleaks8.30.1 staged diff scan; no leaks found. `git diff --check`
  passed. No formatter pass claimed because Prettier is not installed.

## Scope / release

No database migration, paid service, credential change or backend mutation added.
No claim of complete business-workflow or external AI delivery certification.
UI implementation is local until a separately recorded release exists. Prior
production9a6b87816499 is unaffected. Rollback is a code-only revert.
