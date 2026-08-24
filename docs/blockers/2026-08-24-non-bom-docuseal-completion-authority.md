# Blocker — Non-BOM DocuSeal completion authority

- Date: 2026-08-24
- Severity: P1 / High
- Status: blocked pending product/API authority decision
- Audit finding: AUD-021

## Verified mismatch

`createSigningSession` supports `variation_order` and `coc`, and their actions
store the resulting DocuSeal submission ID on `variation_orders` and
`certificates_of_completion`. The sole production webhook ingress forwards every
`submission.completed` event to Core. Core's only completion service looks up
`bom_portal_tokens.docuseal_submission_id`; it never queries the VO or COC
tables. No other source consumer calls `recordVoSigned` or `recordCocSigned`.

Therefore a real DocuSeal completion for a VO or COC returns an unhandled result
and cannot attach the durable signed artifact or advance the entity to `signed`.
For a COC, the warranty window and CX notification also do not start.

The final review also found that initiation modeled the provider submission ID
and slug separately but persisted the slug in columns named
`docuseal_submission_id`, while webhook ingress correlates the provider
`submission_id`. That identifier bug is safe to repair independently and is part
of the local remediation; it does not solve the absent VO/COC completion
authority described here.

## Why implementation stopped

The current shared webhook result, notification and audit contract is BOM-
specific. Extending it safely requires an explicit authority and transaction
design for at least three entity types, including:

- globally unambiguous submission lookup and tenant isolation;
- one durable document and idempotency model across BOM, VO and COC;
- exact VO status/audit/notification behavior;
- exact COC warranty-period rule, status, audit and CX notification behavior;
- duplicate/concurrent delivery behavior and database isolation tests;
- provider payload/retrieval and authenticated browser acceptance evidence.

Guessing those transitions inside the existing BOM service would cross product,
API, compliance and schema boundaries and could start a warranty period or alter
a commercial approval from the wrong authority.

## Required decision and acceptance evidence

1. Agent 01/14 confirms the authoritative VO and COC completion semantics,
   warranty rule and notification recipients.
2. Agent 05 defines a discriminated, entity-neutral webhook contract and atomic
   Core transaction; Agent 04 reviews whether submission IDs require an additive
   uniqueness/lookup model.
3. Agent 12 reviews provider authentication, tenant isolation, signed-artifact
   retention and replay behavior.
4. Tests prove BOM/VO/COC success, wrong-tenant IDs, duplicate/concurrent events,
   provider failure, missing artifact and rollback behavior in a disposable DB.
5. The real O-04 provider templates and isolated browser target validate all
   three journeys before release.

Until these conditions are met, DocuSeal must not be presented as a complete VO
or COC signing workflow in production.
