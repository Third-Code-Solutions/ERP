# Weekly progress current-authority admission

## Scope

Close the transaction-time lifecycle gap in Core weekly capture and WAR locking.
The request guard checks lifecycle before entering the service; the service must
not rely on that earlier snapshot while writing immutable progress evidence.
Preserve current commands, results, capabilities, replay/version ordering and
cutoff behavior. No new schema, dependency, billing rule or UI change.

## Ordered ownership

1. Agent 05 / test owner: reproduce suspended actor, inactive tenant and changed
   role admission against synthetic PostgreSQL. Prove denial preserves periods,
   progress evidence and append-only audit history. Add contention proof for
   actor, tenant, project and audit locks, and retain historical-clock success
   cases. Own only the new integration test file.
2. Agent 05 / service owner: after the regression is observed, admit current
   actor and capability under SHARE NOWAIT, then active tenant SHARE NOWAIT.
   Acquire the canonical tenant audit-chain lock before project FOR UPDATE
   NOWAIT in both commands. Bound lock waiting. Preserve existing business
   behavior and public errors; own the service and its existing unit tests.
3. Main: independently inspect the diff and run focused integration, unit,
   controller, type and lint gates; record the changeset and push a draft PR.
   Owners may inspect disjoint files concurrently but implementation follows RED.

## Explicit remaining work

This slice does not repair overwritten capture request identities, Web-generated
retry keys, lock retry durability, canonical cutoff binding or UI unknown-result
handling. Those require a separate end-to-end command contract. Read admission
and legacy non-Core writers are not covered by this mutation-only change.

Production remains held by the existing database recovery and coordinated-release
gates. No hosted mutation, merge, migration application or data copy is included.
