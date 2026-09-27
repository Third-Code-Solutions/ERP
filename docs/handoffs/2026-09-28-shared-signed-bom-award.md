# Shared signed-BOM award handoff

Date: 2026-09-28. Decision: ADR-039. PRD authority: WO-13 and the signed-BOM
atomicity criterion in §12.

1. **Agent 01 — Product/PRD Guardian:** record ADR-039. No change to the
   signed-BOM product rules or PRD is proposed.
2. **Agent 05 — API & Backend Logic:** own the server-only shared operations
   package and Core DocuSeal signing adapter. Move the existing award rules,
   audit and calendar dependencies into caller-transaction functions. The
   approved→locked BOM change, award, token acknowledgement, and semantic
   audit must share the Core transaction. Verify duplicate and rollback paths.
3. **Agent 03 — Next.js App Router Engineer:** switch manual award and portal
   signing to the shared operation. Retain compatibility exports only as
   delegates; preserve current UI results and post-commit refresh behavior.
4. **Agent 13 — CI/CD & Ops Agent:** add internal package checks to CI if the
   workspace graph needs explicit wiring; keep existing gates, then coordinate
   Core/Web release and exact-revision verification.

Do not run Agents 05 and 03 in parallel on the same award files. The Core and
Web implementers should agree on the transaction type and exported API before
editing their respective adapters. Agent 04 has no schema task under this
decision. Agent 12 reviews tenant/audit evidence as part of the release gate.

→ Handoff to Agent 05. Reason: Core and the shared package need one award
authority. Inputs: ADR-039, current Web `runSignedBomAward` and tests, Core
DocuSeal webhook transaction. Expected output: reusable server-side operation
and Core signing that cannot acknowledge a signature without the award.

## Implementation handoff, 2026-09-28

Agent 05 extracted the existing award rules and added Core canvas and DocuSeal
adapters. The Core tests exercise approved status, tenant lookup failure,
duplicate delivery, award-before-token ordering, and failure before signature
acknowledgement. The existing Web module is now a compatibility delegate and
its award tests were moved to the shared package without removing their
commercial assertions. Local type, lint, package, contract, and Core build
checks passed. No hosted data was changed.

→ Handoff to Agent 03. Reason: verify the existing Web manual and portal callers
against the shared export and complete browser signing evidence. Inputs:
ADR-039, `@third-code-erp/operations/signed-bom-award`, the Web compatibility
delegate, and the focused checks above. Expected output: confirmed Web route
behavior, same-transaction signing, and post-commit UI state.
