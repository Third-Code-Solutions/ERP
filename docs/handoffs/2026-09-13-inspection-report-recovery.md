# WO-12 inspection report recovery

Base: PR83 d1af6451. Existing archive uploads then separately inserts document and
links inspection; submission replay skips repair. ADR031 defines replacement.

## Ordered ownership

1. Main Agent01 records ADR and handoff; main Agent05 defines shared contracts and
   relocates existing pure renderer with Web-compatible re-export.
2. Luna Core lane owns new inspection-report controller/service and tests plus
   DocumentsModule registration. Uses shared contract and injected Storage adapter.
3. Luna Storage lane owns new inspection-report.storage.ts and tests only; bounded
   immutable verified upload, no secrets/logging/hosted writes. Separate files.
4. Main Agent03 owns Web adapter/actions and repair UI/tests; main Agent13 adds
   its browser test to CI, main Agent05 adds the sanitized archive log operation.
5. Astra independently reviews transaction, authority, retries and Storage proof.
6. Main integrates, verifies PostgreSQL/browser/CI, updates changeset, pushes PR.

No agent edits another lane's files. No schema, new dependency, real data or provider
configuration changes. Production release remains gated on verified recovery.
