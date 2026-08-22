-- ABI project taxonomy: preserve the legacy `mixed` enum value for
-- mixed-version/read compatibility, but introduce the active Structural and
-- Civil value without dropping or rewriting the enum type.
--
-- This is intentionally a standalone migration. PostgreSQL does not permit a
-- newly added enum value to be used safely until the transaction that adds it
-- has committed; the data backfill is in the following migration.
alter type public.project_type
  add value if not exists 'structural_civil';
