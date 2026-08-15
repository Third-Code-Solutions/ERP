# WO-09 blocker — real ABI workbook templates are absent

Date: 2026-08-14

Status: BLOCKED BY SOURCE

The PRD makes O-04 a hard prerequisite for WO-09. The repository does not contain `fixtures/abi/` or the real ABI workbooks needed to define the import contracts for PPRF, SI Report, BOE, Milestone Definition, Project Tracker, Allowable Budget Form, Interim Payment Certificate, and Level 1 Master Schedule.

The existing generic CSV/XLSX takeoff importer is intentionally not reused as a domain-template importer: doing so would invent workbook columns, sheet names, header positions, formulas, or business ownership. No template-specific importer or silent fallback was added.

Required unblock evidence:

1. One representative real workbook for each required template family, with sensitive values redacted without changing sheet/header/formula structure.
2. The owning business unit and version convention for each workbook.
3. A field mapping and rejected-row policy approved against those files.
4. A safe staging database and rollback/restore evidence before importing historical rows.
