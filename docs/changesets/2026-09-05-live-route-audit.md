# Complete live route inventory and portal copy

## Changes

- Add an opt-in, explicitly targeted browser audit covering every page on disk.
  It distinguishes render verification, guard-only coverage, missing controlled
  records, access denials, and runtime/navigation failures. It does not claim
  mutation or end-to-end workflow coverage from page rendering.
- Inventory all HTTP handlers and probe anonymous GET boundaries. Mutation-only
  handlers are explicitly NOT RUN by this read-only suite.
- Generalize the shared client portal title/footer: project and warranty links
  are no longer mislabeled as BOM links. Keep robots exclusion unchanged.
- Repair the Railway CLI SKIPPED-build hang with bounded explicit status
  polling. Retention of an unchanged existing artifact requires source/config
  equivalence and health, and is reported separately from a new deployment.
  See ADR029; every existing release gate remains in place.
- Add the API Dockerfile's previously unwatched `packages/ai` and `.npmrc`
  inputs to Railway's watched paths. Test watched-path coverage against all
  compared container inputs so future AI package changes cannot silently skip
  API deployment. This configuration change requires a new API artifact.

## Evidence

The baseline sweep against the previous live release reproduced missing entry
pages, invalid UUID failures, and print hydration errors already addressed by
PR33. The Inngest handler separately returned HTTP500; runtime logs identify
missing `INNGEST_SIGNING_KEY`. No signature check was weakened. Production
Resend configuration is also absent; DocuSeal is optional because the code has
an in-app canvas signing path, whose positive live behavior remains unverified.

Portal-copy regression: PASSED (1 test). The initial test harness used classic
JSX without a React global; corrected using the repository's existing Vitest
setup pattern, then reran successfully. Full web typecheck, normal repository
lint, actionlint, pinned action references, type-safety scan, and all131route
boundaries: PASSED. Full web rerun: 1,738 PASSED, two database-dependent tests
SKIPPED in this local lane. The first full run had one unchanged XLSX-import
timeout; rerun passed that case in523ms without changing its timeout/assertions.
Initial file-targeted lint command returned ignored-test-file warnings; the
repository's normal lint command then passed, without disabling any lint rule.

Railway state-machine regressions: six PASSED. Read-only evaluation of actual
SKIPPED deployment2022637c and successful predecessor f526b445 proved identical
container source/configuration. Production run33952673118 was canceled after
its release/migration gates passed and CLI hang was reproduced; CAD/Web were
not reached. Final PR CI, resumed production deployment, and complete fresh
route-by-route report remain pending.

## Reproduce

From `apps/web`, provide `PLAYWRIGHT_BASE_URL` explicitly and the existing
controlled-role E2E credentials through the approved secret environment. Never
print or save session cookies. Set `PLAYWRIGHT_JSON_OUTPUT_NAME` to a local
ignored artifact path, then run:

```sh
pnpm exec playwright test e2e/complete-route-audit.spec.ts --project=chromium --workers=1 --reporter=line,json
```

JSON attachments record beginning/end revision for pages. Results spanning a
promotion must be rerun against a stable revision. Portal tokens are never
enumerated and missing controlled records do not count as working detail flows.
