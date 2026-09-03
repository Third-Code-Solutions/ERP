# Route-only production release

User direction: choose the safer release and deploy to Vercel and Railway.
The platform feature remains in draft PR32; no migration or platform authority
change belongs to this release. Work sequentially in this isolated checkout.

1. Agent01: scope this release to schema-compatible route repairs from PR32.
2. Handoff to Agent03: extract UUID, pipeline/navigation, project selectors,
   document, report and print/portal fixes with their tests. Exclude platform,
   authentication and account-settings changes. Existing tenant controls remain.
3. Handoff to Agent13 after route checks: run unchanged release gates, confirm
   157/157 production migration parity, push a separate PR, then promote the
   reviewed main SHA to exact existing Railway Core/CAD and Vercel projects.

Acceptance: route regressions, lint, types/build, CI and live health/revision plus
authenticated production E2E pass. No production database writes/migrations or
restoration tasks. Rollback is promotion of the prior Vercel deployment and
redeployment of prior Railway releases; no database rollback is needed.
