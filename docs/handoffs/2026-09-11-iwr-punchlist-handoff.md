# IWR punchlist handoff

→ Handoff from the QA/QC hold-point lifecycle to the Punchlist workflow.

Inputs:

- Rejected, tenant/project-scoped IWR with immutable findings and rejection reason.
- Optional plan document already belonging to the same tenant and project.
- One or more correction descriptions from the authenticated punchlist manager.

Outputs:

- One immutable `quality_hold_point_punchlist_handoffs` operation record.
- One or more `punchlist_items` linked by `source_handoff_id`.
- Audit event and quality-register status showing the handoff timestamp/actor.

The next workflow is the existing Punchlist status path (`open` → `in_progress` → `for_inspection` → `closed`) and PE sign-off. CAD coordinate pinning and contract-specific warranty terms remain outside this handoff.

Final review: lifecycle controls, tenant/request locking, attribution foreign keys, date validation, and the CX-versus-quality-manager action boundary were reviewed and corrected locally. Provider-backed RLS replay and authenticated browser execution remain release evidence, not inferred from these source tests.
