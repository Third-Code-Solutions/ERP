# WO-12 large-photo transport

Base: PR84 dfa77ff1. ADR032 defines the additive direct Core transport.

1. Main Agent01 records the decision and ownership before implementation.
2. Luna Core lane owns inspection-photo service/controller and new upload guard,
   interceptor, helpers and tests, plus DocumentsModule registration. It reuses
   existing authority transaction and introduces no SQL/schema/provider changes.
3. Luna Storage lane owns inspection-photo.storage.ts and its tests only, adding
   bounded immutable upload before existing full verification.
4. Main Agent03 owns Web metadata route, browser upload adapter/form and tests;
   main Agent13 owns any CI inclusion and observability operation registration.
5. Astra reviews authority, credentials, request bounds and retry behavior.
6. Main integrates, verifies actual PostgreSQL/HTTP/browser behavior and CI, writes
   the changeset and pushes. Production remains gated on recovery and credentials.

Separate lanes may run concurrently only on their exclusive files. Core consumes
Storage `upload(command, bytes): Promise<void>` followed by existing `verify`.
Storage upload returns only after accepted immutable creation or verified duplicate
classification; uncertain outcomes throw and preserve private bytes for exact retry.
