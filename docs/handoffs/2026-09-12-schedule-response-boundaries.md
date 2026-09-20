# Schedule read-response boundaries

## Verified scope

Read-only scheduling audit and main source inspection found that the Web Core adapters accept shape-valid schedule/labour responses without binding all available project identifiers to the request. Dependency choices bind project/kind/request level but do not validate each row's parent/predecessor level eligibility. Normal Core query scope is already correct; this is fail-closed protection against misrouted or malformed responses, not evidence of an observed cross-tenant leak.

Main confirmed that Core intentionally resolves the existing `selected` dependency outside current level/search/page filters. Apply level eligibility to `rows` only; preserve an out-of-level selected task when its project/requested ID/exclude-self scope is valid. Preserve UUID case-insensitive identity semantics accepted by the existing input contract.

## Sequential ownership

1. Agent 03 owns only the three schedule/list/dependency/labour read adapters in `apps/web/src/lib/erp-core-client.ts`, their existing focused test files, and the corresponding changeset. Inspect Core and shared contracts first, then write RED cases for wrong project and ineligible dependency levels. Preserve legitimate selected-unavailable null results, empty results, pagination semantics and normal successful responses. No mutation, schema, provider or unrelated adapter changes.
2. Agent 05/12 adds dedicated real-PostgreSQL labour reconciliation and schedule ACL/RLS evidence in a new API integration spec. This separate file may proceed alongside the Web-only adapter work. Prove tenant/project filtering, cancelled-task exclusion, captured-minute totals and evidence states, live membership rejection, and direct-client denial. Use the existing disposable loopback test lane and preserve immutable audit fixtures; do not modify services or schema without reporting a reproduced defect and handing off first.
3. Main independently reviews and reruns focused Web tests, database integration, types and source lint. Agent 13 verifies the branch through CI without weakening existing gates or inherited release holds.

## Remaining evidence

The construction audit also identified missing dedicated labour real-database and continuously required authenticated schedule-role browser proof. Those are separate follow-ups, not satisfied by these adapter tests. Do not add explicitly deferred critical-path/resource-leveling/payroll features or treat the older roadmap status text as current completion evidence.

This branch depends on PR #70 and inherits #69/#68/#67. No merge or deployment is authorized by this handoff alone.
