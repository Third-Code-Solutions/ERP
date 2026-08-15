# WO-09 revalidation — template source boundary

Date: 2026-08-14

Status: BLOCKED

## Evidence

- PASS — the PRD identifies O-04 (real ABI Excel templates) as a blocker for WO-09.
- PASS — the repository inspection found no `fixtures/abi/` directory and no real ABI workbook fixtures.
- PASS — the generic takeoff importer remains producer-neutral and is not presented as a substitute for domain workbook importers.
- NOT RUN — PPRF, SI Report, BOE, Milestone Definition, Project Tracker, Allowable Budget Form, Interim Payment Certificate, and Level 1 Master Schedule importers; their source shapes are unavailable.
- NOT RUN — historical workbook import, rejected-row reporting, and DUPA/library seeding; no safe source files or staging database are available.

## Boundary

The blocker is documented in `docs/blockers/2026-08-14-wo-09-real-abi-templates.md`. No fabricated workbook schema, parser mapping, or data import was added. No migration or data write was performed.
