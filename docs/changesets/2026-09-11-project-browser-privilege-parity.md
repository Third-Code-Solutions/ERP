# Project browser privilege parity

- Keep the CI-only Supabase grant fixture aligned with the production project-retirement boundary: authenticated clients can read projects but cannot insert, update, or delete them.
- Extend the CI grant assertion so a future fixture change cannot silently reopen direct browser project mutations.
- No production migration change was needed; the existing controlled project-retirement migration already revokes project DML from `anon` and `authenticated`.
