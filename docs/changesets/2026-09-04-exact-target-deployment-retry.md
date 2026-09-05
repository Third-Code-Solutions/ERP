# Exact-target deployment retry

Confirmed the user-supplied Vercel and Railway URLs against authenticated provider
metadata. Retried main CI security scanning (attempt4): FAILED, npm audit request
timeout. No new deployment started; previous provider artifacts remain active.

Diagnosed the pinned audit client's legacy npm endpoint. Investigated native
pnpm11.21.0 as an audit-only candidate under proposed ADR028. The application
lockfile/package manager stayed unchanged. Current-endpoint positive/negative
diagnostics also stalled, so the candidate is NOT verified or wired into CI.

Only evidence, proposed tooling decision and sequential handoff documentation
changed. No new feature, dependency, workflow, database, provider config or
production release. The deployment remains BLOCKED on real audit evidence.
