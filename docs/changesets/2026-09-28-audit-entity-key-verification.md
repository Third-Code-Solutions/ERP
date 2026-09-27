# Audit hash verification for numeric row identities

- Aligned both read-only audit planners with the current audit trigger: hash the stored `entity_key` when present and fall back to `entity_id` for older rows.
- Added a regression test for a numeric `cortex_provenance` identity whose derived UUID differs from its original row key.
- Read-only verification against the dedicated demo tenant: 3,529 rows, zero predecessor-link mismatches, zero hash mismatches, and zero unknown hash profiles. The controlled release planner returned `clear` for the checked providers and database at verification time. No audit entries were changed.
