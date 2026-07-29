# Frontend Release Candidate

Prepared: 2026-07-30

Status: source complete; production deployment not authorized.

## Exact release identity

- Retained production deployment:
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`
- Retained production source:
  `f24e5603a35571f8dcadd43fc09c64d12646a7d0`
- Candidate source:
  `20d276c0ca0fd11a315ca0c41cdb7d7e903d4a59`
- GitHub refs:
  `main` and `agent-02/third-code-erp-landing`
- Git identity:
  `kurtgav <kurtgavin.design@gmail.com>`
- Candidate distance:
  43 commits; 167 repository files; 18,636 insertions; 1,159 deletions
- Web distance:
  94 files; 9,925 insertions; 1,013 deletions
- Web composition:
  58 runtime files and 36 test/E2E files

## Risk-domain inventory

| Domain | Runtime files | Main risk | Required production proof |
| --- | ---: | --- | --- |
| Deployment guard | 1 | unintended provider build | Git remains disconnected; no preview |
| Landing and SEO/GEO | 3 | responsive or metadata regression | 1440/768/390, title, canonical, robots, JSON-LD, CTA and interactions |
| Auth and onboarding | 2 | signup path regression | login/signup route and authorized redirect |
| Documents and upload | 5 | tenant or mutation-authority regression | signed upload, document audit, cross-tenant denial |
| Cortex | 25 | scope, citation, navigation, restore, or draft-handoff regression | authorized scope, graph, citations, deep links, search, draft handoff, role denial |
| Shared shell and rate limit | 6 | navigation, responsive, or shared-IP 429 regression | dashboard shell and anonymous/authenticated sequential flow |
| Permission-aware dashboard | 5 | executive data exposure to restricted roles | viewer data path, role-safe links, task counts, 1440/768/390 |
| Universal search | 2 | wildcard fan-out, cross-tenant join, or cache exposure | literal probe, tenant join, RBAC, headers, and command palette |
| Public signing | 1 | replay, partial write, missing audit, or orphaned Storage | controlled new session, atomic rows/audit, replay denial, cleanup |
| RFQ workflow | 8 | tenant bypass, duplicate retry, partial audit, invalid transition, or incomplete coverage | controlled dispatch/quote, replay conflict, state graph, audit, browser-write denial |
| Tests | 36 | release-evidence coverage | unit, route, component, and browser suites |

All 58 runtime files are assigned to one domain above. No unclassified Web
runtime file remains.

## Production prerequisites

- Hosted Supabase is already at the reviewed 54/54 migration baseline.
- The active Railway API is successful deployment
  `733f1197-344a-41d9-ad95-af4fda876242` from docs head
  `cc5733fa98136c500aa2602b9232a6f9ae34df78`, containing candidate source
  `20d276c0ca0fd11a315ca0c41cdb7d7e903d4a59`.
- The disposable PostgreSQL 17 release gate is 236/236 database tests
  with zero skips.
- This frontend activation requires no new database migration, API deployment,
  Railway deployment, Storage mutation, or queue change.
- Vercel environment configuration must remain unchanged.

## Cost controls

- Vercel Git integration is disconnected.
- `apps/web/vercel.json` disables Git-triggered deployment.
- On-demand concurrent builds are disabled. Builds queue one at a time.
- Build machine is Standard: 4 vCPU and 8 GB memory.
- No `$0` build claim is assumed. Recheck the live account estimate and spend
  controls immediately before approval; treat an unverified build as billable.
- Do not create a preview. If explicitly approved, create one manual production
  deployment only.
- Vercel currently has no deployment checks and rolling releases are disabled.
  Manual production verification and the retained instant-rollback target are
  therefore mandatory.

References:

- <https://vercel.com/docs/builds/managing-builds>
- <https://vercel.com/docs/instant-rollback>

## Verified predeployment gates

- `pnpm lint` -- pass
- `pnpm typecheck` -- pass
- `pnpm test` -- 453 application tests pass
- `pnpm build` -- pass; Next generated 77/77 static steps
- Combined authenticated Cortex and public landing browser sequence -- 2/2
  pass at one worker
- Landing responsive proof -- 1440, 768, and 390; no horizontal overflow,
  console error, or page error
- Authenticated viewer dashboard proof -- 1440, 768, and 390; assignee-scoped
  work only, no executive metrics or forbidden links, no horizontal overflow,
  console error, or page error; one-time session revoked globally
- Authenticated viewer search proof -- normal tenant document found; only
  document/task result types visible; `%`, `_`, and backslash literal probe
  returned no hits; private/no-store and Cookie variation confirmed; command
  palette rendered the authorized result
- Authenticated viewer Search-to-Cortex proof -- explicit Ask mode made no
  question-bearing search request; exact question was prefilled and focused;
  final URL contained no prompt; draft storage was removed; no Cortex chat
  request occurred; 1440/768/390 passed without overflow or console/page error
- Public signing proof -- 5/5 transaction tests passed; connected local browser
  rendered the unauthenticated invalid-token state with zero console
  warnings/errors; success-path production proof remains gated on a newly
  created controlled signing session
- RFQ integrity proof -- 26/26 focused Web tests and 12/12 RFQ database
  contract/runtime tests pass; hosted database is 54/54; four quote parent
  constraints are validated; the state trigger is enabled; browser RFQ/quote
  writes are denied; live RFQ/quote counts remain zero
- `git diff --check` -- pass
- gitleaks 8.30.1 -- pass; no leaks
- actionlint 1.7.12 -- pass
- Prohibited external ERP brand/source scan -- zero matches
- Vercel deployments after the retained baseline -- zero

GitHub Actions run `30467875222` could not start a workflow step because the
account reports failed payments or an exceeded spending limit. The local gates
above are the completed evidence; hosted CI is an unresolved external gate.

Latest run `30471712383` has the same external condition: Actionlint failed
before step start and every dependent job has zero executed steps.

## Defects caught before release

The old middleware reused one IP bucket for both authenticated and anonymous
traffic. A busy authenticated session could therefore make a later public
request from the same shared IP fail with HTTP 429. Authenticated users behind
one NAT also shared a bucket.

Candidate `e99b88f` keys anonymous traffic by IP and authenticated traffic by
user identity. Unit coverage proves bucket separation. A single sequential
browser run now passes authenticated Cortex and the public landing page 2/2.

The old dashboard executed executive pipeline, GP, forecast, rep-scorecard, and
alert reads for every authenticated role even though `/dashboard` is available
to roles that cannot access `/pipeline/board`. Candidate `e99b88f` selects the
data loader before any query. Restricted roles receive only tenant- and
assignee-scoped pending task counts plus authorized workspace links.

The old universal search escaped `%` and `_` but not a user-supplied
backslash, omitted tenant predicates on opportunity-account and BOM-project
joins, and did not explicitly prevent caching. Candidate `e99b88f` treats all
three pattern-control characters literally, rechecks joined tenants, keeps
role filtering before query fan-out, and returns private/no-store responses.

The old command palette had only record search. Candidate `e99b88f` adds an
explicit Ask mode without mixing questions into search requests. It moves a
bounded draft through opaque, expiring, one-time same-tab state, keeps prompt
text out of URLs, clears state on consume, prefills Cortex, and never auto-sends.

The old public signing flow used a fabricated zero-UUID audit actor, ignored
audit failure, and wrote document, session, and source independently. Candidate
`e99b88f` validates bounded PNGs, locks/rechecks the one-time session, commits
tenant-scoped official rows plus nullable-actor audit atomically, denies replay,
and compensates Storage on failure.

The old RFQ auto-dispatch flow accepted caller-supplied system tenant authority,
used a fabricated zero-UUID actor, committed RFQ and audit separately, listened
for the wrong approval event, and had no database retry key. Candidate
`f173957` uses a server-only tenant-locked transaction, nullable verified actor,
one-result database constraints, post-commit notification, and no direct
browser mutation privileges.

The old quote flow committed the quote, status change, and audit independently,
trusted browser material identity, had no durable retry key, and allowed direct
completion without a locked full-coverage check. Candidate `20d276c` derives
material from a canonical BOM line, reuses a tenant-scoped submission UUID,
locks every transition, commits official state and audit atomically, and relies
on validated tenant-composite constraints plus a PostgreSQL state machine.

## One-build activation procedure

Requires explicit user approval:

1. Reconfirm the candidate SHA and all gates above.
2. Reconfirm Vercel Git is disconnected and zero newer deployments exist.
3. Trigger exactly one manual production deployment for candidate `20d276c`.
4. Do not trigger a preview, redeploy, or second build while the first is
   queued or running.
5. Confirm READY and the production alias points to the exact new deployment.
6. Verify public landing metadata, structured data, interactions, and
   responsive layouts.
7. Verify authenticated dashboard, Cortex scope, citations, focused graph,
   saved-conversation restore/search, universal search, uploads, controlled
   public signing, replay denial, and authorization denials.
8. Check runtime errors, console output, health/readiness, and exact release
   identity before declaring activation complete.

## Rollback

If production verification fails:

1. Stop further deploy attempts.
2. Use Vercel Instant Rollback to restore
   `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`.
3. Confirm `thirdcode-erp.vercel.app` resolves to the retained artifact.
4. Re-run landing, login, dashboard, and health/readiness smoke checks.
5. Record the failed deployment ID and runtime evidence before another change.

CLI equivalent, not authorized for execution:

```text
vercel rollback dpl_GTDC2eis2Epkrty6USXyAPMNbsGt
```

Instant rollback reuses the retained artifact and does not require rebuilding
the old source. Environment configuration is independent of the artifact, so
its current values must be preserved and rechecked during rollback.

## RFQ quote adapter note

The adapter changes server code but remains inert without its exact flag and
tenant allowlist. Vercel Git stays disconnected. Do not spend a Vercel build
for this milestone; include it only in the next explicitly approved,
consolidated frontend release.
