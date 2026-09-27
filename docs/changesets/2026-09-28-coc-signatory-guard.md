# COC signatory guard

- Require a tenant-linked opportunity account and a valid email on its primary contact before creating a COC signing session.
- Return an actionable error without changing the draft COC when the signatory is missing or invalid.
- Preserve the existing signing flow for a valid contact and add focused regression tests.

Verification: focused Vitest 4/4 passed; Web typecheck passed. Hosted signing and production handover were not exercised.
