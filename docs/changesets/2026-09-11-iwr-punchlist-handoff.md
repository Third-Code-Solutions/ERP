# Rejected IWR → punchlist handoff

## Change

- Added a Core-owned, tenant-scoped handoff for rejected QA/QC IWRs.
- One immutable handoff can create one or more punchlist items and snapshots the IWR number, findings, rejection reason, and optional project plan document.
- The source IWR is locked after handoff; accepted IWRs and repeated/different handoffs are rejected.
- Added replay protection with a tenant/request unique key and a transaction advisory lock, composite tenant/project foreign keys, RLS denial policy, database audit trigger, and punchlist source provenance.
- Added the quality-register action panel with correction-per-line entry, plan-document validation, retry-safe request identity, and linked-source status messaging.
- Kept the transition controls capability-gated when the punchlist panel is visible, so CX can create linked work without receiving an unauthorized quality-state action.

## Verification

- Shared contract tests: PASS.
- Database migration contract tests: PASS.
- Core quality/punchlist service and protected-controller tests: PASS (18 tests).
- Web Core client and server-action tests: PASS (10 tests).
- API and Web typechecks: PASS.
- Full shared-types/API/Web test lanes: PASS (447 + 300/160 skipped + 988 + 1,078/2 skipped); Web was run directly with the Node 22 engine override because the host is Node 24.

## Boundary

Plan coordinates/viewport pinning are not inferred; the supported evidence is an immutable plan reference plus an optional tenant/project-validated document ID. Existing Punchlist status/sign-off workflow remains the owner of subsequent work.
