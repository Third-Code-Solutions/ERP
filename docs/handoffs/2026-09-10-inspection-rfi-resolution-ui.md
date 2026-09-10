# Inspection RFI resolution UI handoff

Sequential ownership for the bounded inspection-RFI slice:

1. Agent 05 — Core/shared contracts and resolve/reopen service completed in `docs/changesets/2026-09-10-inspection-rfi-resolution-api.md`.
2. Agent 12/04 — direct authenticated `site_inspection_rfis` UPDATE bypass closed by additive RLS/ACL migration in `docs/changesets/2026-09-10-inspection-rfi-resolution-authority.md`.
3. Agent 03 — existing inspection proposal route now consumes the Core register and transition commands in `docs/changesets/2026-09-10-inspection-rfi-resolution-ui.md`.
4. Pending release verification — disposable PostgreSQL RLS/privilege replay, Core transaction/concurrency checks, browser keyboard/error journeys and all demo-role E2E.

## Scope boundaries

- No new schema/table for this bounded workflow.
- No full project RFI correspondence, response history, attachments, submittals, transmittals or CDE.
- Existing inspection intake and open-RFI creation are preserved; resolution/reopen is Core-authoritative.
- Direct database writes from the browser were not added.
