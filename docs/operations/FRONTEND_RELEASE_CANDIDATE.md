# Frontend Release Candidate

Prepared: 2026-07-29

Status: source complete; production deployment not authorized.

## Exact release identity

- Retained production deployment:
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt`
- Retained production source:
  `f24e5603a35571f8dcadd43fc09c64d12646a7d0`
- Candidate source:
  `e53f20d63eb937440c2b29c88c920a543a49a3ef`
- GitHub refs:
  `main` and `agent-02/third-code-erp-landing`
- Git identity:
  `kurtgav <kurtgavin.design@gmail.com>`
- Candidate distance:
  31 commits; 124 repository files; 11,917 insertions; 666 deletions
- Web distance:
  64 files; 5,554 insertions; 525 deletions
- Web composition:
  39 runtime files and 25 test/E2E files

## Risk-domain inventory

| Domain | Runtime files | Main risk | Required production proof |
| --- | ---: | --- | --- |
| Deployment guard | 1 | unintended provider build | Git remains disconnected; no preview |
| Landing and SEO/GEO | 3 | responsive or metadata regression | 1440/768/390, title, canonical, robots, JSON-LD, CTA and interactions |
| Auth and onboarding | 2 | signup path regression | login/signup route and authorized redirect |
| Documents and upload | 5 | tenant or mutation-authority regression | signed upload, document audit, cross-tenant denial |
| Cortex | 22 | scope, citation, navigation, or restore regression | authorized scope, graph, citations, deep links, search, role denial |
| Shared shell and rate limit | 6 | navigation, responsive, or shared-IP 429 regression | dashboard shell and anonymous/authenticated sequential flow |
| Tests | 25 | release-evidence coverage | unit, route, component, and browser suites |

All 39 runtime files are assigned to one domain above. No unclassified Web
runtime file remains.

## Production prerequisites

- Hosted Supabase is already at the reviewed 51/51 migration baseline.
- The active Railway API remains successful deployment
  `5a84fc30-2b4e-46fa-a505-0b1bb393fef4` from source
  `e948223b261b7c335ceaad85e359fec68888e84a`.
- The disposable PostgreSQL 17 release gate remains 224/224 database tests
  with zero skips.
- This frontend activation requires no new database migration, API deployment,
  Railway deployment, Storage mutation, or queue change.
- Vercel environment configuration must remain unchanged.

## Cost controls

- Vercel Git integration is disconnected.
- `apps/web/vercel.json` disables Git-triggered deployment.
- On-demand concurrent builds are disabled. Builds queue one at a time.
- Build machine is Standard: 4 vCPU and 8 GB memory.
- Vercel documents Standard build compute as included at no added build-minute
  charge when on-demand concurrency is disabled. Expected incremental Standard
  build compute charge: `$0`. Other separately metered runtime or data transfer
  usage is outside this build estimate.
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
- `pnpm test` -- 379 application tests pass
- `pnpm build` -- pass; Next generated 77/77 static steps
- Combined authenticated Cortex and public landing browser sequence -- 2/2
  pass at one worker
- Landing responsive proof -- 1440, 768, and 390; no horizontal overflow,
  console error, or page error
- `git diff --check` -- pass
- gitleaks 8.30.1 -- pass; no leaks
- actionlint 1.7.12 -- pass
- Prohibited external ERP brand/source scan -- zero matches
- Vercel deployments after the retained baseline -- zero

GitHub Actions run `30455237294` could not start a workflow step because the
account reports failed payments or an exceeded spending limit. The local gates
above are the completed evidence; hosted CI is an unresolved external gate.

## Defect caught before release

The old middleware reused one IP bucket for both authenticated and anonymous
traffic. A busy authenticated session could therefore make a later public
request from the same shared IP fail with HTTP 429. Authenticated users behind
one NAT also shared a bucket.

Candidate `e53f20d` keys anonymous traffic by IP and authenticated traffic by
user identity. Unit coverage proves bucket separation. A single sequential
browser run now passes authenticated Cortex and the public landing page 2/2.

## One-build activation procedure

Requires explicit user approval:

1. Reconfirm the candidate SHA and all gates above.
2. Reconfirm Vercel Git is disconnected and zero newer deployments exist.
3. Trigger exactly one manual production deployment for candidate `e53f20d`.
4. Do not trigger a preview, redeploy, or second build while the first is
   queued or running.
5. Confirm READY and the production alias points to the exact new deployment.
6. Verify public landing metadata, structured data, interactions, and
   responsive layouts.
7. Verify authenticated dashboard, Cortex scope, citations, focused graph,
   saved-conversation restore/search, uploads, and authorization denials.
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
