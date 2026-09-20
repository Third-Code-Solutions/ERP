# Authenticated smoke readiness

## Verified gap

Main source inspection and independent Agent 12 review confirmed that `smoke-console.spec.ts` accepts a successful HTTP response, substantial body text and no errors without proving the final destination remains authenticated. A redirect to a healthy login page can satisfy those checks. Existing route audits already reject this outcome.

## Sequential ownership

1. Agent 12 completed review: require configured origin, non-auth destination, correct requested/canonical pathname and a visible authenticated `main#main-content` landmark. Preserve legitimate `/pipeline/list` to `/pipeline?view=list` redirection, comparing required query values structurally. Do not assume arbitrary redirects are valid.
2. Verification implementation owns `apps/web/e2e/helpers/authenticated-smoke-readiness.ts`, `apps/web/e2e/authenticated-smoke-readiness.spec.ts`, `apps/web/e2e/smoke-console.spec.ts` and its changeset. The smoke and local regression tests must call the same assertion. Prove healthy login redirect, delayed login redirect, wrong destination and absent landmark rejection; prove normal authenticated and explicit canonical destinations succeed. Use loopback fixtures only, no credentials/provider mutations or new dependencies.
3. Main in Agent 13 scope registers the credential-free regression spec in the existing gated browser job, strengthens its workflow contract, and independently verifies the browser regressions, E2E types and CI before release.

## Evidence boundary

Trusted-PR smoke runs against the configured separately managed stable preview. Passing is not candidate-SHA deployment proof, all-role coverage or mutation verification. This correction strengthens an existing gate, without changing production routes or authentication policy.

Branch depends on PR #69, with inherited #68/#67 release recovery holds. No merge or deployment is authorized by this handoff alone.
