# Inspection draft ownership and durability

The user requested completion without repeated routine permission prompts. This
WO-12 slice closes device-draft ownership and false persistence acknowledgements;
it does not waive hosted recovery gates or claim all offline inspection work done.

## Ordered ownership

1. Agent 03 (Luna reproduction tests, then explicit handoff to main for implementation): replace opportunity-only draft access
   with actor/tenant/opportunity-bound, validated persistence. Resolve writes only
   after transaction commit; surface failure without deleting legacy evidence.
2. Agent 03 (main integration): bind server-derived identity into the inspection
   form, isolate mounted state by identity, render truthful save/recovery states,
   and preserve upload receipts and exact submission retries.
3. Browser verification: prove real IndexedDB reload, identity separation, failed
   persistence, partial uploads and submission recovery with synthetic fixtures.
4. Independent review: inspect security and durability boundaries before release.

Review identified three required follow-ups within this slice: stop old mounted
instances before additional remote effects, persist immutable pending submission
contents for exact retries, and check expected owner at authenticated submission
and photo-upload boundaries. Agent 03/05 (Astra) owns those two Web boundaries and
their tests; main owns form integration. Expected owner is a precondition, never
authorization. Agent 13 (main) wires the browser suite into existing CI gates.

Work occurs on separate files until the helper contract is handed back. No
database schema, provider settings, production data or Storage objects are changed.
Existing optional server contracts remain compatible; updated callers always send
expected owner and verify scoped acknowledgements. Test endpoints use synthetic
localhost fixtures and do not establish hosted provider or all-role evidence.

## Acceptance

- Another actor or tenant cannot load a previous user's draft through the form.
- Unscoped legacy drafts are not silently attributed, exposed, or erased.
- Saved status follows IndexedDB transaction completion, never request success.
- Disabled/full storage produces an actionable warning, not a saved claim.
- Reload preserves photo bytes, confirmed document receipts and submission ID.
- Removing a selected photo also removes its receipt from the next submission.
- In-flight submission freezes its payload and edits cannot alter exact retries.
- Existing server authorization and idempotency remain authoritative.

Release remains pending the existing production database recovery requirements.

## Local completion evidence

- 142 focused Web tests passed without skips on Node 22, including draft storage,
  server-action ownership, upload ownership and existing photo adapter behavior.
- 34 real Chromium tests passed without skips: 15 inspection draft cases plus 19
  adjacent offline RFI regressions. Four responsive widths and keyboard input were
  exercised; screenshots were inspected.
- Full Web/application/E2E type checks, source ESLint, ten workflow invariant
  tests and Actionlint passed. Independent Astra review found no required defects.
- Explicit online-only mode preserves operation when IndexedDB is absent. It
  never claims a device save; corrupted, blocked or conflicted storage cannot
  activate this fallback. Unknown requests remain frozen in memory.

Remaining release gates are unchanged: four unapplied hosted migrations,
verifiable backup/Storage recovery and isolated restore/rehearsal evidence.
