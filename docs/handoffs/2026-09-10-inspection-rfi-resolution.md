# Inspection RFI resolution handoff

## Objective

Complete the existing site-inspection RFI register with a tenant-safe, audited resolve/reopen workflow. This is the first RFI slice only; it is not a full project RFI, submittal, transmittal, or CDE module.

## Sequential ownership

1. **Agent 05 — API/backend:** completed strict shared contracts and Core read/resolve/reopen endpoints. See `docs/changesets/2026-09-10-inspection-rfi-resolution-api.md`.
2. **Agent 12/04 — Security/schema:** completed repository-level RLS/ACL closure for direct authenticated RFI updates and pre-resolved inserts. See `docs/changesets/2026-09-10-inspection-rfi-resolution-authority.md`; live role/RLS replay remains a release gate.
3. **Agent 03 — Next.js:** completed the existing inspection route/client actions with the opportunity-wide register and accessible resolve/reopen controls. See `docs/changesets/2026-09-10-inspection-rfi-resolution-ui.md`.
4. **Browser verification:** run isolated demo-role journeys only; do not mutate ABI production data. Pending.
5. **Agent 01 — Product/docs:** reconcile the bounded WO-12 record and future full-CDE scope. Pending.

## Authority and boundaries

- Reuse existing `site_inspection.submit` capability (`owner`, `admin`, `commercial`) for this initial workflow; do not add a new role policy in this slice.
- Resolution reason is audit evidence only; do not overload the description or invent response history/attachments.
- The limited register uses no new business table; the additive security migration only closes direct client resolution writes. No financial effects, pipeline transitions, SLA side effects, or top-level sidebar module.
- Core derives tenant and actor from the verified principal; browser code never writes the database.
