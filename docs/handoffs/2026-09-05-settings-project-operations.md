# Settings project operations release

## Contract

User: no subscription billing; implement project invoices/payments, integrations
and notifications; merge, push and deploy pending changes. Existing invoice
issuance, receivable balances, cash receipt/allocation and reversal authorities
are reused, not replaced with direct paid-status writes or a payment gateway.
No real payment, new paid service, database restoration or credential rotation.

Acceptance: Settings exposes only role-authorized project finance actions;
existing integration configuration is inspectable without leaking values;
notification display preferences persist for the signed-in account and affect
the real bell; mandatory event generation/delivery remains unchanged. Existing
email/SMS transport still requires configured providers. Do not label merely
present credentials as a verified connection.

## Sequential ownership (single operator)

1. Agent 01: this scope and handoff. No new architecture/dependency/schema.
2. Agent 03: Settings cards, own-account presentation preferences, bell wiring,
   regression and browser tests. Auth metadata is presentation only, never
   authorization; validate it as untrusted input. No tenant selector.
3. Agent 12: review redaction, own-account scope and unchanged mandatory notices.
4. Agent 13: merge passing PRs, run the existing guarded production promotion,
   verify Vercel/Railway revisions and live Settings/finance/notification paths.

Agent 03 → Agent 12: implementation and local browser proof complete. No schema
or delivery authority changed. Validation covers untrusted metadata and rejects
caller identities. Secrets are not returned by integration status. Agent 12
review: own-account Auth client and server-side profile/audit identities retained;
mandatory delivery controls untouched. → Agent 13 for normal PR/production gates.
The only harness configuration change is cold-start budget (120s → 240s);
UI assertions retain their limits and now include both viewport edges.

PRs 38 and 39 passed all CI checks and were merged normally before this branch.
Release rollback is the previous verified provider artifact; no schema changes.
Production email delivery requires RESEND_API_KEY and EMAIL_FROM in each sending
runtime. Integration status reflects Web configuration only unless explicitly
verified externally; no provider credential entry is exposed to browsers.
