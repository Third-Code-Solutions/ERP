# Approval route preview

## Scope

- Added `GET /v1/process/approval-route-preview` as a read-only, tenant-scoped diagnostic for a supplied PHP-centavo amount.
- Added strict shared query/result contracts with `preview_only` and `configured_rules_only` markers.
- Match active amount bands using `bigint` comparisons; report unconfigured, no-match, incomplete, ambiguous, and matched routes without selecting an approval rule.
- Preserve deterministic sequence and rule ordering; non-contiguous sequence numbers are valid.

## Verification

- API process service/controller tests — passed, 23 tests.
- Shared process-SLA contract tests — passed, 8 tests.
- API typecheck — passed.
- Shared-types typecheck — passed.
- `git diff --check` — passed.

The local runtime is Node 24.16.0 while the repository declares Node 22.x; checks were run with pnpm engine-strict disabled and emitted the expected engine warning.

## Deliberate non-scope

This endpoint is hypothetical configuration diagnostics only. It does not create approvals, mutate purchase orders, write audit events, activate delegated approvals, or claim to be the signed ABI amount-routing policy. The existing approval-create command still has no amount field.
