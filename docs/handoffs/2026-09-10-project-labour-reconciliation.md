# Handoff — project labour reconciliation

The normalized schedule now exposes planned-versus-captured labour minutes as
an auditable read projection. Existing schedule mutations and Last-Planner
commitments are unchanged. Any future labour-cost or payroll integration must
provide an ADR-backed source of rates, privacy boundary, reconciliation owner,
and idempotent external contract before it is added.
