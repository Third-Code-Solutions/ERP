# WO-12 offline inspection RFI

## Acceptance and ownership

Preserve the existing inspection/RFI workflow. Implement durable browser drafts
and explicitly submitted RFI commands scoped to actor + tenant + opportunity +
inspection. Only submitted commands auto-sync on reload/reconnect; drafts never
auto-submit. Retain exact key and payload through uncertain responses; clear
only after a validated, matching server acknowledgement and committed local
transaction. Browser storage failure must never be reported as saved.

1. Agent 05 / security review: add expected-owner preconditions to the existing
   RFI server action, preserving current callers and authorization. Compare
   persisted owner IDs with the current server profile before any service call;
   client IDs are preconditions, not authority. Return a scoped acknowledgement
   so the queue can bind confirmation. Test mismatch, malformed owner, missing
   session, unchanged role rules, rejected/unknown responses and refresh failure.
   Preserve the legacy three-argument action; the queued UI must always supply
   the fourth expected-owner precondition. Actual PostgreSQL proof additionally
   exposed inactive actor/tenant admission; repair it within the existing shared
   workflow lock path and verify lock retention, exact replay and audit rollback.
2. Agent 03: pass server-derived owner IDs into the RFI form. Add scoped IndexedDB
   persistence and an explicit draft/queued/syncing/retry/confirmed UI using
   existing design tokens. Keep pending payload immutable, handle unmount and
   scope changes, and preserve records belonging to another owner without
   displaying or submitting them. No generic global queue, service worker,
   external provider, schema migration or new dependency.
   Draft consumption and pending creation must commit atomically; reject stale
   draft writes while a command is pending. Cleanup must not resurrect an
   already-submitted draft, even across tabs, reloads or storage failures.
   Persist an optimistic per-scope revision after cleanup as well: absence of a
   pending record alone cannot reject a delayed old-tab autosave. Snapshot reads
   are atomic; writes compare expected revision, and the UI serializes saves and
   advances its revision only after committed storage acknowledgement.
3. Browser verification: exercise real component + IndexedDB with controlled
   action responses: signal loss, reload, reconnect, same-key retries, malformed
   acknowledgements, storage errors, actor switching, duplicate events and
   responsive keyboard interactions. Keep server transaction/replay proof
   separate from the controlled browser harness; neither is an all-role hosted
   mutation test.
4. Agent 13: integrate credential-free browser tests into the existing CI job
   after implementation and review. Push draft only after applicable local
   checks; retain all inherited release/recovery holds.
   Update the existing WO-12 structural gate for the enqueue/sync/acknowledgement
   split. Preserve the prior mutation checks and add regressions for durable
   enqueue, persisted-owner dispatch, awaited cleanup, connectivity and delayed
   storage reads. Browser behavior, not source structure alone, proves recovery.

Work on disjoint files may run concurrently after the action contract is fixed;
handoff shared files sequentially. Each owner must read applicable instructions.
