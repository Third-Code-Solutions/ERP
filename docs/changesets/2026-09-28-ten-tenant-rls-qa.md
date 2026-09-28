# Ten-tenant RLS QA probe

- Tightened the foreign-project insert assertion to require PostgreSQL authorization error `42501` instead of treating every database error as a security pass.
- Added a rollback-only matrix with ten synthetic tenants, one project and two departmental users per tenant. Each user must see exactly its own project among the ten candidates, and each foreign-project insert must be denied with `42501`.
- Verified against a disposable local PostgreSQL 17 replay at migration head `20260928110100`: focused RLS suite 6/6 passed, database package typecheck passed, and targeted ESLint passed. The probe left zero tenant and project rows.

This proves the project-table database boundary for the tested roles on the local schema. It does not prove Core API behavior, every ERP table, live ten-company capacity, or an end-to-end departmental handoff.
