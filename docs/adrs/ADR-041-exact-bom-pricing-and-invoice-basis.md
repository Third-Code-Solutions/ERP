# ADR-041 — Exact BOM pricing and invoice basis

Status: accepted for local remediation, 2026-10-11. Implements PRD money/quantity invariants and resolves audit findings 3–6; actual tax-policy approval remains an external acceptance gate.

## Monetary contract

Separate direct construction cost, selling value excluding VAT, VAT and contract value including VAT. DUPA H remains the VAT-inclusive unit selling rate used by the BOQ, as required by the PRD. It must never be stored or summed as direct cost. Compute parent cost, selling value, VAT, contract value and margin from the correct top-level lines inside the same transaction as a price/quantity change. Attached child material rows cannot be counted twice. Margin excludes output VAT. Use exact integer/rational arithmetic and half-up centavo rounding, including fractional quantities; reject overflow explicitly.

Maintain persisted centavo snapshots for the tax component and pricing interpretation. Existing manual/legacy tax-exclusive pricing must be explicitly distinguishable from newly reconciled DUPA-inclusive prices. No formula may infer tax by adding a fixed percentage to an already tax-inclusive TCV. Invoice progress allocation uses the BOM's explicit basis and snapshots VAT separately. Retention and withholding reduce collectible receivable, not the recorded selling value; the ledger must reconcile subtotal plus VAT to collectible, retention and withholding. Apply the same basis to signed-BOM down-payment drafts. Rates and basis are persisted/configurable; existing defaults are compatibility policy, not a statutory certification.

## Quantity contract

Construction quantities support at most four decimal places. A lossless widening from the legacy integer column to an exact decimal column is allowed in a new forward migration, preserving all existing values, IDs, foreign keys and history. Existing API numeric quantity inputs can remain compatible if normalized to a bounded decimal representation and converted to exact scaled integers before any monetary multiplication. Never round unsupported precision silently. Rendering, manual entry, takeoff import and downstream procurement must preserve the quantity or reject an unsupported target explicitly; they cannot truncate it.

## Historical and concurrency boundaries

Do not reprice approved, signed, locked, issued or posted documents in a migration or shared rate-card refresh. New columns may describe known semantics without changing historical totals; ambiguous legacy records must require an explicit reviewed revision before new billing, rather than silently changing an existing contract. Draft recomputation can be repaired automatically under a parent BOM lock. All callers use one authoritative aggregate boundary; concurrent edits cannot leave a partially updated parent. Issued invoice immutable terms and reversal controls from ADR-012 remain intact.

## Proof and recovery

Regression cases: fractional 0.1 and 12.5 quantities; PRD worked DUPA example; material/rate edit updates line and parent atomically; direct cost differs from VAT-inclusive selling price; mixed manual/DUPA lines; no double VAT; invoice debits equal credits; rollback restores the old draft on failure; signed snapshots remain unchanged; concurrent draft edits retain correct totals. Migration replay preserves existing integer quantities. A rollback must not narrow decimal quantities after fractional values exist; keep the schema and roll application logic forward, or restore a verified pre-change backup into a separate target.
# Independent review follow-up

Existing approved/locked BOMs cannot transition back to draft; revision creates a
new BOM identity/version. Direct Auth/Data API writes to BOM, DUPA and shared crew
pricing tables are denied; existing audited Web server actions and Core commands
remain the write authority. This prevents Viewer approval and pricing bypasses.
Invoice prints use captured issuer identity after reversal and display the stored
withholding rate and ADR-041 allocation basis. Legacy rates remain unverified.
