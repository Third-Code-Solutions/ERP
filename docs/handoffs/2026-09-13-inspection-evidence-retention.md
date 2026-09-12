# Retain committed inspection evidence during document deletion

## Requirement and observed gap

PRD WO-12 requires findings permanently attached to their opportunity. Current
`site_inspection_photos.document_id` foreign keys cascade on document deletion;
`site_inspections.pdf_document_id` can be detached. Core and legacy Web document
deletion retain claim/KYC evidence but do not check either inspection reference.
Deleting the official document can subsequently remove its private Storage file.

This slice retains committed inspection photos and archived reports through both
existing application deletion paths. It does not authorize deletion of any real
evidence, introduce a new deletion path or claim protection against provider-admin
Storage operations. Base: PR #82, `d2b9661a`; its hosted CI is separately pending.

## Contract and ordered ownership

1. Agent 01/main records this bounded handoff.
2. Luna owns new focused PostgreSQL integration proof and the existing Core
   document-delete unit test. Reproduce photo and report deletion before source
   changes. Test both actual Core and legacy Web deletion, retained database/audit
   state and no Storage cleanup. Preserve unreferenced deletion. Use only the
   explicitly synthetic loopback PostgreSQL lane; no hosted data or Storage calls.
3. Agent 05/main adds tenant-bound photo/report reference checks after the locked
   document read and before destructive effects in Core document deletion.
4. Agent 03/main mirrors the guard and user-readable retained-evidence response in
   the legacy Web action. No feature/capability expansion or cleanup on rejection.
5. Astra independently reviews the complete deletion/reference race, including
   concurrent report/photo attachment and existing receipt replay. Main verifies
   and integrates any required correction; agents never edit the same files.
6. Main runs focused regression, types, build and applicable CI gates; records the
   changeset and pushes through a PR. Existing production recovery gates remain.

Expected denial: `Document is attached to an inspection and cannot be deleted`.
The check must occur under the document update lock so an already-committing
attachment is observed after waiting; do not acquire parent inspection locks in
the deletion path. Photo/report evidence and historical audit rows stay intact.

## Required cleanup race correction

Astra identified that replayed successful delete receipts and delayed cleanup can
remove re-uploaded objects at reused inspection paths, bypassing new reference
checks. Follow-up review confirmed any same-project document can be attached, and
object paths can be shared or reused. Agent 03/main suppresses all physical cleanup
on both document deletion paths, including receipt replay. Private
unreferenced bytes remain until generation-fenced reconciliation is implemented;
no orphan deletion job is introduced. Unreferenced document records can still be deleted.
Agent 03/main also makes deletion confirmation copy truthful about retained files.
This does not close the separate report archive insert/link transaction gap or
claim protection against provider-admin Storage deletion.
