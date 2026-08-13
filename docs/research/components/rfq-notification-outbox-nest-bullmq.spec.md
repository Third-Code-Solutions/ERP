# RFQ Notification Outbox and Delivery Specification

## Purpose

Make automatic RFQ notification intent atomic with RFQ creation and move its
delivery into the NestJS modular monolith and BullMQ. Production automatic RFQ
routing remains disabled.

This is an original workflow specification derived only from this repository's
current behavior and approved target architecture. No external ERP code,
schema, UI, copy, test, documentation, or internal structure is used.

## Existing Behavior to Preserve

When an approved BOM creates a new RFQ, procurement users receive:

- one in-app notification;
- subject `New RFQ awaiting quotes (N item[s])`;
- body `A BOM has been internally approved. Source quotes from suppliers.`;
- link `/procurement/rfqs/<rfqId>`;
- payload event `rfq.created`;
- one `rfq-dispatch` email attempt.

Exact RFQ replay creates no new notification. Manual RFQ creation does not use
this automatic notification flow.

## Transaction Boundary

The official automatic RFQ transaction must:

1. lock and validate the approved tenant BOM;
2. return an existing tenant/BOM RFQ as an exact replay;
3. insert the new RFQ;
4. write the semantic RFQ audit;
5. insert one immutable notification outbox intent;
6. snapshot current same-tenant procurement recipients into delivery records;
7. commit all official state together.

The outbox event key is unique per tenant and RFQ. A replay returns the
existing outbox ID and creates no second intent or delivery.

## Database Contract

### `notification_outbox`

- UUID primary key and tenant scope.
- Unique `(tenant_id, event_key)`.
- Event type `rfq.created`.
- Aggregate type `rfq` and aggregate UUID.
- Strict bounded JSON payload containing only `project_id`, `line_count`, and
  schema version.
- Immutable intent timestamp.
- Tenant-composite identity key.

### `notification_deliveries`

- UUID primary key and tenant scope.
- Tenant-composite parent outbox and recipient references.
- Channel is `in_app` or `email`.
- State machine: `pending -> processing -> delivered | dead_letter`.
- Durable attempt count, bounded last error, provider message ID, timestamps,
  and a maximum-256-character provider idempotency key.
- Unique `(tenant_id, outbox_id, recipient_user_id, channel)`.
- Redis never stores recipient email, subject, body, template data, or
  credentials.

### `notifications`

- Optional tenant-composite `source_delivery_id`.
- One in-app row per source delivery through a unique
  `(tenant_id, source_delivery_id)` key.
- Existing notification read behavior remains unchanged.

Browser roles receive no direct privilege on outbox or delivery tables.
NestJS is the only delivery-state writer.

## BullMQ Contract

- Queue: `notification-delivery`.
- Delivery job: `deliver-notification`.
- Sweep job: `sweep-notification-outbox`.
- Delivery payload version 1 contains only tenant, outbox, and delivery UUIDs.
- Delivery job ID is deterministic from contract version and delivery UUID.
- Five attempts with exponential backoff beginning at one second.
- When `ERP_NOTIFICATION_SWEEP_ENABLED=true`, a single interval scheduler is
  upserted by stable scheduler ID every 60 seconds. It re-enqueues pending and
  stale-processing deliveries so a database commit survives Redis loss or a
  crash before enqueue. The flag defaults to false so this disabled path
  creates no continuous Redis work or provider cost.
- Completed queue jobs are retained for duplicate suppression. Database state
  remains the final idempotency authority.

## Delivery Rules

### In-app

1. Lock the tenant-scoped delivery and validate its outbox and recipient.
2. Move `pending` or stale `processing` to `processing` and increment attempts.
3. Insert the existing in-app notification shape with
   `source_delivery_id`.
4. Mark delivered in the same transaction.
5. Replay returns the existing result without another notification.

### Email

1. Lock and claim the tenant-scoped delivery.
2. Reload RFQ, Project, and recipient data from PostgreSQL.
3. Build bounded Third Code ERP email content server-side.
4. Require server-only `RESEND_API_KEY`, `EMAIL_FROM`, and
   `ERP_WEB_BASE_URL`.
5. Send with `Idempotency-Key: rfq-created/<deliveryId>`.
6. Mark delivered with the provider message ID.

The provider retains idempotency keys for 24 hours. All configured retries and
the one-minute recovery sweep operate inside that window. An identical retry
must use an identical payload; a provider 409 is a terminal configuration or
payload conflict, not a successful send.

## Failure and Recovery

- A delivery error never rolls back or repeats the RFQ transaction.
- BullMQ retries unexpected and provider failures up to five attempts.
- Final failure transitions the exact database delivery to `dead_letter` with
  bounded evidence. The failed BullMQ job remains available for inspection.
- The interval sweep re-enqueues pending rows and processing rows stale for
  five minutes.
- Already delivered or dead-letter rows are no-ops.
- Operators recover by correcting configuration or provider state, then using
  a separately authorized future replay command. This milestone adds no
  browser replay control.

## Compatibility and Cutover

- Existing Inngest producer and notification helper remain unchanged and
  authoritative while automatic Nest routing is disabled.
- `ERP_RFQ_AUTO_DISPATCH_VIA_API`, its tenant allowlist, and
  `ERP_NOTIFICATION_SWEEP_ENABLED` remain unset.
- The new outbox is created only by the disabled automatic Nest transaction.
- No React/UI, Python, Storage, public API response, or Vercel deployment
  changes.
- Manual, quote, and terminal RFQ adapter gates remain independent.

## Acceptance Criteria

- Migration creates validated tenant-composite, uniqueness, state, privilege,
  and RLS boundaries.
- Drizzle schema matches the migration.
- Automatic RFQ creation, audit, outbox, and delivery snapshots commit
  atomically.
- Exact replay creates one RFQ, one semantic audit, one outbox, and one
  delivery per recipient/channel.
- Cross-tenant parent or recipient references fail at the database boundary.
- Queue payloads contain only UUIDs and schema version.
- Deterministic jobs, five-attempt retry, final dead-letter, scheduled sweep,
  Redis restart, and Redis-loss recovery pass against Redis 7.4.9.
- In-app replay inserts one notification.
- Email sends the provider idempotency header and never logs credentials or
  unrestricted business content.
- Missing email configuration fails closed.
- Root lint, typecheck, tests, production build, clean PostgreSQL 17 replay,
  zero-skip database assertions, secret scan, workflow validation, and
  prohibited external-ERP runtime scan pass.

## Rollback

1. Keep automatic RFQ routing disabled.
2. Revert the application source if needed.
3. Leave the forward database migration applied; the new tables and nullable
   notification column are inert without the disabled Nest producer.
4. Do not delete outbox or delivery evidence.
5. Existing Inngest behavior remains authoritative.
