# Production route-audit page lifecycle

## Change

- The complete route audit now closes each route page after its assertions so
  page-scoped fetches, realtime clients, and navigation state cannot leak into
  the next template.
- Context rotation remains bounded and authenticated storage is restored for
  every replacement context.
- A navigation timeout receives one strict route-local retry in a fresh context;
  the route still fails when the fresh attempt cannot complete, and no body or
  controlled record identifier is retained in the report.

## Verification

- Local verification: pending CI confirmation on Node 22 after the production
  route audit is dispatched.
- The preceding production promotion run failed only at
  `/procurement/vendors/performance` after three identical navigation/timeout
  attempts; this change targets the observed page-lifecycle boundary without
  weakening render, runtime, authorization, or console assertions.
