# Audit endpoint repair and production release

The user renewed production deployment authorization to the existing Vercel
project and Railway Core production service. Route release PR33 is merged.

1. Agent13 stopped promotion before provider changes because pnpm10.33.0 audit
   repeatedly times out at npm's legacy quick endpoint.
2. Handoff to Agent01: record ADR028 for an audit-only pinned native pnpm client;
   do not change the application's package manager or resolved dependency graph.
3. Handoff to Agent12: verify the native current client audits the unchanged
   lockfile, fails on advisories/errors, and preserves the low severity threshold.
4. Handoff to Agent13: wire both CI audits and the protected production audit,
   run regression checks and full PR CI, merge normally, then deploy and verify.

These scopes are executed sequentially by the same agent. No parallel agents,
database restoration/migration, new provider target or security-gate bypass.

Current handoff: paused at Agent12 verification. The real current-endpoint and
negative-fixture audits did not return results; ADR028 remains Proposed.
Agent13 has not changed CI or deployed any provider. Do not proceed to step4
until real positive and negative audit proof is obtained.
