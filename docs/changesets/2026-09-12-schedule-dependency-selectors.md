# Schedule dependency selectors — integration

Replace raw parent/predecessor identifiers with named, searchable task choices across all project schedule pages. Preserve stored links, assigned owners and retry-safe creation. Existing server mutation validation remains authoritative; the new lookup is read-only.

## Integration boundary

- The server action requires schedule-management permission. Core independently checks current membership and project-read access.
- The authenticated, uncached Core client validates the query and response schema, requested project, row scope, selected identity, dependency kind/level, page/limit and excluded self.
- No migration, dependency, commercial-spine change or production-data write is introduced.

## Verification

- PASSED: 17 new Core-client/action tests, including cross-project response rejection, current-selection resolution, permission denial, malformed filters and network failure.
- PASSED: seven existing schedule action/client tests.
- PASSED: shared schedule dependency contract tests (strict query bounds, literal search input, option/result shape and selected-task separation).
- PASSED: Core schedule controller/service tests (17 tests), including read capability enforcement, higher-level parent and same-level predecessor predicates, self exclusion, wildcard-safe literal search and incompatible selected-task resolution.
- PASSED: API and shared-types TypeScript checks; focused production-file ESLint.
- NOT RUN: disposable PostgreSQL schedule integration proof; `DATABASE_URL` and `ERP_API_INTEGRATION_EXPECTED=1` were not configured in this environment. The proof covers 101 same-level candidates, page-boundary selection, literal `%`/`_` search, foreign selected-id isolation and forged membership.
- Test files are excluded by repository ESLint policy and verified with Vitest/TypeScript instead.
- Independent Astra backend/client review found no remaining required defects in the additive query and authenticated client/action scope. A test incorrectly treating Viewer as unable to read was corrected; Viewer read permission remains intact.
- Production role-matrix assertions now open authorized task forms and require successful named-choice loading without mutation. These assertions are not yet recorded as executed against production.
- PASSED: final focused Web suite, 32 tests across six schedule/action/client files. UI tests cover native control rendering, option retention and hierarchy helpers; the existing Node JSX test convention supplies React explicitly.
- PASSED: isolated real-Chromium interaction proof using the actual register and mock read/write actions: no closed-editor requests, search/selection beyond the first 100 tasks, search Enter does not submit a valid form, failed lookup preserves selection, pagination preserves selection, level changes reset pagination and require explicit correction of incompatible links, verified creation resets/rotates identity, and an uncertain creation retries with an identical payload/identity. No browser runtime errors on the final run.
- PASSED: edit browser proof for selected label resolution, explicit Clear, close/reopen draft retention, pinned revision and owner across an external refresh, and rejected-save draft retention.
- PASSED: successful plan save followed by an external clean-snapshot refresh updates native name/date/labour inputs together with the revision. A subsequent edit submits the newer coherent snapshot. Independent re-review confirmed this fix and the Clear dirty-tracking fix; no remaining required findings in the reviewed slice.
- PASSED: no horizontal overflow at 320, 500, 768, 1024 and 1440px; desktop/mobile screenshots inspected. Dependency controls stack below 768px and align at the top on desktop.
- PASSED: final Web TypeScript (including all configured E2E type projects), focused API/Web production-file ESLint, repository type-safety contract and diff whitespace check.
- CI, PostgreSQL execution and production deployment remain pending at this checkpoint.

## Release and recovery

Use the existing ADR-020 protected production promotion workflow only after green CI and review. No database rollback is needed for this additive read endpoint/UI change. If live verification fails, restore the prior known-good Vercel/Railway release or revert this slice through a reviewed PR; preserve business data.

## Backend contract

- Added the authenticated, read-only `GET /v1/projects/:projectId/schedule/dependency-options` contract and implementation. Core rechecks current membership, `project.read`, and tenant/project scope; parent choices are higher schedule levels, predecessors share the requested level, and the excluded task is never returned.
- `selectedTaskId` is resolved independently from the paged/search-filtered rows, but remains bounded to the authorized tenant/project and is suppressed when it is the excluded task.
- Search uses parameterized `strpos` predicates so `%` and `_` remain literal characters; pagination is deterministic through level, task code, name and id ordering.

## UI behavior

- Named native selects replace UUID entry in create/edit forms. Choices load only for opened editors; search is debounced and stale responses ignored. Current selections remain available independently of page/search results.
- A changed schedule level never silently drops an existing link. Visible validation asks the user to clear or replace an incompatible dependency.
- Dirty plan edits retain the loaded revision and owner during background refresh, so the existing server version check protects newer data. Clear callbacks explicitly mark the draft dirty.
- Accepted clean snapshots reset native form controls together with controlled dependency fields before adopting the new revision.
- No whole-application UX sign-off is implied. Existing indirect predecessor-cycle validation remains a separate server-integrity gap outside this additive lookup/UI slice.
