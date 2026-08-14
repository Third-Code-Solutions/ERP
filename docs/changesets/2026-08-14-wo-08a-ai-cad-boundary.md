# WO-08A revalidation — AI/CAD draft boundary

Date: 2026-08-14

Status: PARTIALLY VERIFIED

## Source-backed changes

- Shared takeoff validation now owns the duplicate/UOM/division/quantity checks used by the generic importer and the Nest CAD draft producer.
- The document-processing draft-BOM path now creates `cad-ai` drawing/import identity, stores the AI source row and provenance, queues unresolved rows, and writes every AI line as `work_item`, `ai_drafted = true`, `unit_rate_source = 'manual'`, `unit_cost_cents = 0`, and `line_total_cents = 0`.
- The worker's suggested centavo rate remains inside retained evidence payload only; it is not copied into commercial BOM pricing.
- The existing web CAD auto-draft path remains unpriced and vendor/DUPA-preserving, with the same takeoff identity and unresolved queue.
- BOM approval now has a server-side hard gate rejecting any AI-drafted line without a DUPA, in addition to the unresolved queue and UI flagged-line checks.
- The migration trigger remains an additive, idempotent AI no-price guard.

## Verification

- PASS — `pnpm test:wo-08a-contract` (1/1 source gate).
- PASS — `node scripts/verify-wo-08a-ai-draft-contract.mjs`.
- PASS — `pnpm test:wo-08-contract` (2/2 source gates).
- PASS — `node scripts/verify-build-ops-invariants.mjs`.
- PASS — JavaScript syntax checks for the new gates.
- PASS — `package.json` JSON parse.
- PASS — `git diff --check` (only line-ending normalization warnings).
- NOT RUN — Nest/Web Vitest unit and integration suites; the current checkout has no runnable Vitest binary because the frozen dependency install is incomplete.
- NOT RUN — PostgreSQL replay of the AI guard, unresolved queue, and server approval gate; Docker daemon/Supabase CLI are unavailable.
- NOT RUN — browser verification of the CAD upload, review queue, and approval rejection; no runnable app/test dependency lane is available.

## Remaining boundary

Legacy CAD evidence compatibility code still retains the historical `scope_items` source path so existing extraction replay is not silently discarded. No new WO-08A table or foreign key uses that identity, and no destructive cutover was attempted. A separate dependency inventory, backup/restore proof, and staged cutover are required before removing the legacy source. No migration was applied and no production or hosted data was changed.
