# Cortex semantic index control

## Observed production control

- Route: `/cortex`.
- Admin-only button label: `Build semantic index`.
- Production observation on 2026-08-07: enabled, no confirmation, no
  `aria-disabled`, 12px text, 44px height at 390 x 844.
- Browser behavior in source: up to 80 sequential requests; each request can
  embed 64 records. A single click can therefore request up to 5,120 records.
- No production action was triggered during reconnaissance.

## Original replacement behavior

1. Admin selects `Index up to 64 records`.
2. Accessible confirmation dialog opens.
3. Dialog states: at most 64 records; at most one external embedding-provider
   call; the action is not an approval of any ERP transaction.
4. `Cancel` closes without a request.
5. `Approve 1 provider call` creates one durable job with one idempotency key.
6. Client polls that job only until `succeeded` or `failed`.
7. No browser loop creates another job. Another batch requires a new explicit
   confirmation.

## States

- Disabled rollout: noninteractive `Semantic indexing paused` with an exact
  tenant gate controlled on the server.
- Idle: `Index up to 64 records`.
- Confirmation: modal alert dialog; focus-safe cancel and confirm actions.
- Queued: `Index queued`.
- Processing: `Indexing up to 64 records`.
- Success: `Indexed N records`.
- Failure: concise bounded error; no provider details or secrets.

## Responsive and accessibility contract

- Preserve existing `cortex-tool-btn` styling and Cortex page layout.
- Minimum 44px controls on desktop and mobile.
- Dialog remains within 24px viewport gutters at 320px width.
- `role="alertdialog"`, labelled title, described cost disclosure, Escape and
  cancel close, status announced via `aria-live="polite"`.
- No continuous animation; reduced-motion users see no motion dependency.

## Cost and authority contract

- Fixed request: `{ "maxNodes": 64, "costConsent": true }`.
- One POST per confirmation. One provider call maximum per job.
- PostgreSQL owns job state. Redis carries only job ID. Python receives only
  bounded embedding text and never commits or approves ERP transactions.
- Browser has no direct write path to graph or job tables.
- Rollout defaults closed. Legacy direct embedding endpoint defaults closed.
