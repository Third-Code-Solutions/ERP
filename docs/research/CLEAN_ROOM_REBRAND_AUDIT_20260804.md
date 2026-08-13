# Clean-room and rebrand audit — 2026-08-04

## Scope

This audit distinguishes product-facing runtime text from research and
migration provenance. ERPNext/Frappe may be named in clean-room notes because
they are review references; that does not make them part of the Third Code ERP
product. No vendor code, schema, UI, test, or branding was imported.

## Runtime scan

The regression test at
`apps/web/src/lib/branding-clean-room.test.ts` now scans these shipped source
roots: `apps/web/src`, `apps/web/public`, `apps/api/src`, and `packages` text
assets. It rejects case-insensitive `erpnext`, `frappe`, `frappe/erpnext`,
`ABI Ops`, `ABI_OPS`, `ABI-OPS`, and `rework.com` markers. Failures report the
exact offending file rather than aggregating the whole tree into one opaque
assertion.

Result: pass. Product source contains no forbidden legacy/vendor marker. The
existing `Rework-alignment` comments and migration filename remain internal
provenance labels; they are not shipped UI, metadata, or public response text
and are intentionally not renamed because migration history is immutable.

## Live landing evidence

Read-only Playwright inspection of `https://thirdcode-erp.vercel.app/` found:

- title: `Construction ERP with a permission-aware AI brain`
- H1: `Run every project with an AI brain that remembers.`
- canonical: `https://thirdcode-erp.vercel.app`
- one JSON-LD graph script
- no `erpnext`, `frappe`, `ABI Ops`, `ABI_OPS`, `ABI-OPS`, or `rework.com`
  marker in rendered text or HTML at 1440, 768, or 390 CSS pixels
- no horizontal overflow and no console errors at those widths

Vercel was read only. No deployment was triggered, so this evidence describes
the currently served release and does not promote new source to production.

## Follow-up

Keep the runtime regression test in the normal Web suite. If research or
vendor-comparison material is added, place it under `docs/research` or an
explicit migration note, not in user-facing source. Before any frontend
release, repeat the live marker/metadata/browser sweep under the spend gate.
