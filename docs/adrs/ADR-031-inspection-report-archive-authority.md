# ADR-031: Inspection report archive authority and recovery

- Status: Accepted for implementation under the approved WO-12 delivery scope
- Date: 2026-09-13

## Decision

Core owns a focused authenticated archive command identified by opportunity and
inspection IDs. It derives tenant and actor, revalidates active authority and
`site_inspection.submit`, then locks opportunity before inspection. Existing
`pdf_document_id` is the durable one-official-report receipt; validated replay does
not upload again. No schema or dependency is added.

Render from canonical stored findings, submission timestamp, original inspector
and persisted photo links. Branding/project details represent archive-time context,
not an invented historical snapshot. Reuse the existing pure HTML renderer through
a shared package subpath; retain Web import compatibility and print behavior.

Immutable content-addressed private upload is bounded and verified. Document
insert, inspection link and semantic audit commit in one transaction while active
authority locks remain held. Failed upload cannot create an official document;
post-upload rollback may leave private bytes. Retries verify matching stored bytes,
never overwrite or remove an uncertain object. Concurrent calls create one official
document/link/audit. This does not promise exactly one physical upload.

Web delegates on initial submission and exact submission replay. Confirmed findings
remain successful if archiving fails. A scoped repair control exposes explicit retry
after navigation or draft cleanup. No second Web persistence authority remains.

## Limits and release

No automatic worker authority, report version history or provider-admin deletion
protection is introduced. Retained orphan bytes require separate safe reclamation.
Core and Web must release together with the private Storage credential configured;
existing backup/migration gates remain. HTML remains print-ready HTML, not a claim
of native PDF generation.
