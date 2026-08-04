---
title: "M3.68: inventory UOM creation command boundary"
status: "implemented"
date: "2026-08-05"
---

Added strict tenant-scoped `POST /v1/inventory/uoms` authority. Nest rechecks
membership and `inventory.manage`, enforces tenant/code uniqueness inside the
transaction, creates the UOM, and writes semantic audit evidence. The Next
adapter is disabled by default behind an exact flag and tenant allowlist;
existing direct Server Action behavior remains the compatibility path.

No Supabase migration, hosted data action, Vercel build/deploy, or provider
setting changed. One controlled Railway deployment verified the exact source
SHA, settled API Dockerfile manifest, readiness, health, and unauthenticated
401 boundary. No additional deploy was triggered.
