# Five-company repository turnover audit

Requested: audit errors, bugs, and gaps before selling the full ERP repository to five companies for their own internal use. No application fixes, deployments, or provider mutations authorized by this audit.

Baseline: `b3f8a9bc`, branch `agent-04/production-qa-remediation`; working tree clean at audit start.

Review sequence and ownership:

1. Agent 01 coordinates product scope and the final audit report. Independent buyer installations are the assessment assumption; white-label SaaS is deferred.
2. Agent 12 reviews authentication, authorization, platform ownership, RLS and sensitive-data boundaries, read-only. Returns verified findings and evidence to Agent 01.
3. Agent 05 reviews financial and operational command correctness, read-only, after Agent 12 returns. Returns verified findings and evidence to Agent 01.
4. Agent 03 reviews frontend workflow completion and error states, read-only, after Agent 05 returns. Returns verified findings and evidence to Agent 01.
5. Main agent reviews setup, CI, release and buyer handover evidence and runs safe local checks. Final report distinguishes current checks, source-backed findings, historical evidence, and unverified boundaries.

Reviewers do not edit application files, connect to production data, send messages externally, or execute hosted integration tests. Required reporting artifacts only. No commits, pushes or deployment.

## Review returns

- Agent 12 → Agent 01: seller-bound platform ownership, tender role bypass, upload quota accounting, suspended-tenant portal access. Main reproduced the tender mutation in an isolated database; hosted privileges remain unverified.
- Agent 05 → Agent 01: stale DUPA/BOM aggregates, incorrect cost basis and invoice tax flow, integer quantity limitation, conditional reservation/outbox defects, preview-only approval scope. Main reproduced stale aggregates and zero-margin formula with synthetic rolled-back data.
- Agent 03 → Agent 01: print-route authorization gap, draft statutory-form identity, incomplete initialization, document identity and fallback-policy gaps. Main checked print routes and role guards. Onboarding is classified as an operator/setup gap, not a requirement to build SaaS onboarding.
- Agent 01: consolidated findings in `docs/research/2026-10-11-client-turnover-audit.md`; source-only, reproduced, historical and unverified claims are distinguished. Implementation ownership and acceptance checks are described there; no implementation handoff activated by this audit.
