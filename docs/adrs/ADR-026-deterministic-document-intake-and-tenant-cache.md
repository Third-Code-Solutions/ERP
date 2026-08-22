# ADR-026: Deterministic document intake and tenant-scoped cache

- Status: Accepted
- Date: 2026-08-19
- Owners: Third Code Solutions Inc.

## Context

ABI OPS receives spreadsheets, schedules, PDFs, site images, drawings, and
DWG/DXF files. The existing non-CAD upload path can invoke a generative-provider
visual extraction function, which makes basic file reading depend on a provider
key, quota, and nondeterministic result. The requested workflow must read files
without a hidden AI dependency while preserving the PRD-mandated, separately
review-gated AI CAD evidence feature.

## Decision

Build a deterministic intake pipeline with explicit parser capabilities.

1. CSV and Excel (XLS/XLSX/XLSB) use structured local parsing. PDF uses
   text-layer extraction and page metadata. DXF/DWG remains in the isolated
   CAD worker using its existing deterministic conversion/evidence path.
2. Images and scanned PDFs use an explicitly configured local OCR adapter only
   when it is available. It produces text and confidence evidence, not inferred
   quantities, pricing, scope assignments, or semantic AI output. If it is not
   installed or a file cannot be read, the result is a typed
   `OCR_UNAVAILABLE` or extraction error; there is no remote-model fallback.
3. Results are stored or reused only through a tenant-scoped cache keyed by
   `(tenant_id, content_sha256, extractor_kind, extractor_version)`. Cached
   payloads are immutable private objects in the documents storage bucket,
   retain source/provenance metadata, and cannot be looked up across tenants.
4. Deterministic extraction returns evidence and review candidates. It never
   writes a priced BOM line or bypasses the validated takeoff-import pipeline.
5. The existing optional AI CAD auto-draft remains an explicit separate
   producer. It keeps its provenance and validation gate; deterministic intake
   neither removes it nor silently invokes it.

## Consequences

- Basic parsing remains available without `OPENAI_API_KEY`, provider quota, or
  an outbound model request.
- Parser output is reproducible for a fixed parser version and can be cached
  safely within one tenant.
- A dependency or local OCR runtime is justified only through this ADR and
  must be pinned, licensed, virus-scanned where applicable, measured for file
  size/time limits, and covered by explicit failure-mode tests.
- "Read everything" means extract the observable text, workbook cells,
  tables, image OCR text, and CAD entities/evidence. Deterministic parsing
  does not claim human-level interpretation of ambiguous drawings or scans.
- The intake runtime uses pinned `@napi-rs/canvas` solely to rasterize a
  textless PDF page in-process before the pinned, bundled English Tesseract
  model performs local OCR. It enforces page, pixel, source-size, and output
  limits; no page bytes, OCR request, or document content are sent to a
  provider. The runtime uses the pinned current SheetJS Community Edition
  archive from its official CDN because the public npm `xlsx` registry release
  is obsolete and cannot safely parse legacy BIFF workbooks.

## Rejected alternatives

- A hidden OpenAI fallback: violates the no-provider requirement and obscures
  cost/availability failure.
- Cross-tenant hash cache: leaks whether another tenant uploaded a document
  and can expose its extracted content.
- Automatically creating priced BOM lines from text: violates the PRD's
  unresolved-review and pricing controls.
