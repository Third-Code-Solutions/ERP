# Manual cost entry command integrity

Scope: preserve the existing Core create/void authority, manual-cost rules and
idempotency contract while making mounted financial input and result handling
truthful. No accounting policy, schema, tax or posting behavior changes.

1. Main/Agent03 reproduces mounted-action defects: fractional-cent rounding,
   calendar-date normalization, unbounded exception text and committed results
   reported as failures when refresh throws.
2. Astra/Agent05 found current lifecycle and actor-bound replay gaps. It owns
   the create/deletion Core services and their unit/actual-Postgres regressions,
   preserving atomic audit and historical hashes. Shared restore authorization
   is verified as part of this bounded change. No schema changes.
3. Main/Agent03 owns Web actions and existing Core-client wrappers. Luna owns
   existing cost form/table callers, page scope props and dedicated browser tests,
   with scoped receipts, exact uncertain commands and lifecycle fencing.
   Cost-entry UI wiring belongs to this explicit bounded handoff; no new shared
   primitives or design-system changes are assumed.
4. Main verifies action regressions, relevant existing Core tests and browser
   create/void/retry/permission paths, then records a changeset and opens a PR.
   Agent13 handoff: main adds the dedicated credential-free browser spec to the
   existing CI job; no gate or deployment target changes.

Luna independently audits the separate PRD scheduling requirement; that audit
does not edit this slice. Production recovery and migration gates remain intact.
