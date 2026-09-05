# ADR-029: Bounded Railway promotion and unchanged artifact verification

- Status: Proposed for normal PR review
- Date: 2026-09-05

## Evidence

Production workflow 33952673118 passed release and migration gates, uploaded
the reviewed API snapshot, then hung after Railway reported SKIPPED because
no watched API inputs changed. The live API remained on its successful prior
artifact. This matches upstream [Railway CLI issue 787](https://github.com/railwayapp/cli/issues/787).
The hanging workflow was canceled before CAD or Vercel deployment.

## Decision

Use the same pinned CLI with detached upload and bounded polling of the exact
project, environment, service, and uniquely labeled upload. SUCCESS is a new
deployment. SKIPPED is **not** a new deployment and may only retain the prior
artifact if all of the following are proven:

- The predecessor is still the active successful deployment.
- Its source SHA is provided by Git metadata or the workflow's full-SHA label.
- Every container source/configuration input is unchanged in Git.
- Railway build/deployment manifests, config path, and root directory match.
- The live health/readiness endpoint succeeds.

Any missing source identity, changed input/config, unhealthy endpoint, unknown
status, or concurrent promotion fails closed. Failed and sleeping deployments
cannot be treated as skipped successes. A missing predecessor Git object also
fails; production checkout retains full history. Polling is capped at 20 minutes.

The workflow still runs every existing source, migration, health, authenticated
role, CAD, and password-proof gate. The repository watch list gains the missing
Dockerfile inputs `packages/ai/**` and `.npmrc`; no existing watch path is removed.
No database, authentication control, or approval rule is changed. Reports distinguish
`deployed` from `retained-identical`, including active deployment IDs and source
SHAs; they do not claim a new backend artifact when no backend inputs changed.

## Consequences and rollback

The unchanged API can remain on its already verified artifact during a web-only
release without causing an infinite CLI wait. New CLI uploads carry full source
identity for later comparisons. An older unlabelled CAD artifact cannot pass
the retention branch. Dockerfile input coverage is regression-tested.
Rollback remains promotion of known prior provider artifacts; schema restoration
is not part of this change. If this helper fails, investigate its explicit state
rather than bypassing its checks or accepting a SKIPPED status as deployed.
