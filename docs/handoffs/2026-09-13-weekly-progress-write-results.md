# Weekly progress write-result repair

Scope: reproduce and repair the Core weekly-progress create/update/lock response mapping against actual PostgreSQL. Preserve existing contracts; no hosted mutation.

1. Agent 05: add actual-PostgreSQL regression coverage before changing the service. Prove committed create, second capture, and WAR lock return valid results; check tenant rejection and locked-evidence immutability.
2. Agent 05: replace unsafe write-result casts with explicitly aliased, typed RETURNING fields. Run focused unit, integration, type and lint checks.
3. Independent review: inspect proof and scope. Record remaining retry, cutoff and lifecycle-admission gaps without claiming they are repaired here.
4. Agent 13: push a draft PR after local gates pass. Existing stack recovery hold remains; no production deployment or migration is authorized by this handoff.

Known follow-up work: historical capture request identities are overwritten; Web retries generate new keys; lock retries use optimistic refresh semantics; cutoff binding and fresh lifecycle admission require separate verified work.

## Evidence-driven schema handoff

The actual PostgreSQL guard test additionally proved locked linked evidence can
be modified: `guard_progress_update_against_war_cutoff` compares lowercase strings
against uppercase PostgreSQL `TG_OP`. This is a material data-integrity defect,
not an optional refactor. Do not weaken or skip its failing regression.

→ Handoff to Agent 04. Correct only the existing operation-name comparisons in
a new forward migration, including the same defect in
`guard_project_weekly_progress_mutation`, preserving guards, triggers, RLS and contracts. Add
local actual-PG proof for locked evidence UPDATE/DELETE and late INSERT/UPDATE
into a locked week. Assert exact database error codes/messages and unchanged
state. Inspect and follow repository migration conventions and rollback safety;
never roll back by deliberately restoring the bypass. No hosted application.

→ Handoff to Agent 05 / independent review after local schema verification.
Complete the response mapping proof against the repaired schema, then record
the migration's recovery/roll-forward limits in the changeset and draft PR.
