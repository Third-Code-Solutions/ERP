# Authenticated smoke readiness

The trusted-PR smoke now calls the same authenticated-readiness assertion exercised by credential-free Chromium regressions. It polls for the configured origin, a non-auth destination, the requested pathname and query values, and a visible `main#main-content` landmark. Trailing slashes are normalized. The sole intentional canonical redirect found in the current smoke inventory is `/pipeline/list` to `/pipeline?view=list`; query values are compared structurally and unrelated extra parameters are permitted. Role-denial redirects are not canonical exceptions.

The existing HTTP, body-content and console/runtime checks remain. The pre-existing short settling delay is not readiness proof: the new bounded destination/landmark assertion must also succeed. A delayed intermediate shell without its authenticated landmark cannot satisfy that assertion.

## Verification

- RED: initially implemented the old body-length-only acceptance in the shared assertion and ran `pnpm --config.engine-strict=false --filter @third-code-erp/web exec playwright test e2e/authenticated-smoke-readiness.spec.ts --project=chromium --workers=1 --retries=0 --reporter=line`. Seven negative regressions failed because readiness incorrectly resolved; three positive cases passed. The healthy login fixture explicitly returned HTTP 200 and more than 100 body characters.
- GREEN: the same command passed 10/10 tests, zero retries/skips, after strengthening readiness. Cases cover healthy and explicitly released delayed login redirects, normal authenticated navigation, canonical navigation and delayed canonical resolution, wrong destination, absent landmark, wrong canonical query, changed requested query and wrong origin. Tests use a random-port loopback HTTP server and a real Chromium browser; no provider identities or credentials are used.
- `pnpm --config.engine-strict=false --filter @third-code-erp/web exec tsc --noEmit -p e2e/tsconfig.json` passed.
- `git diff --check` passed. Local Node 24/pnpm 10 emits the existing engine warning; CI Node 22 is authoritative.
- Main registered the readiness spec alongside claim/KYC interactions in the existing required browser job, retaining one worker, zero retries and JSON no-skips enforcement. The workflow contract now requires all three specs. All 10 invariant/contract tests and pinned actionlint passed.
- Main independently reviewed the shared assertion, fixtures, smoke integration and actual pipeline-list redirect, then ran all three credential-free browser specs together: 26/26 passed with zero retries. The first independent typecheck invocation used a nonexistent `tsconfig.e2e.json`; it was corrected to the repository's `e2e/tsconfig.json` rather than changing configuration.

## Scope and handoff

Only verification code and this changeset were changed by this agent. Main owns workflow registration, workflow-contract verification and independent browser checks. No production UI/authentication behavior, dependencies, providers, commits, pushes or deployments were changed here.

Stable-preview smoke is not candidate-SHA deployment evidence, all-role verification or mutation coverage. These local regressions prove the gate rejects the tested invalid render outcomes; they do not revoke sessions or guarantee that a page can never navigate after readiness succeeds. Existing inherited KYC/claim migration recovery holds remain unchanged.

→ Handoff to Agent 13 (main): register the regression spec in the existing gated browser lane, verify its workflow contract and independently rerun browser/types before CI release review.
