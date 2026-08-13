---
title: M3.164 protected Cortex generation browser proof
date: "2026-08-08"
---

## Outcome

Certified the M3.163 asynchronous Cortex handoff through real local Next,
Nest, Redis/BullMQ, provider-free Python, and PostgreSQL. Corrected invalid null
conversation identity on first send and made browser teardown cancellation
start before document destruction with one shared, deduplicated DELETE.

## Validation

- Playwright protected full stack: 5/5.
- PostgreSQL 17.10/Redis 7.4.9: 107/107 migrations; database 349/349 zero-skip;
  full API integration passed.
- Shared 256; API 586; Web 676; Python 8.
- Lint, typecheck, Nest/Next production build with 82 routes, spend 4/4,
  controlled release 5/5, Actionlint, pinned actions, Gitleaks across 547
  commits, and diff checks passed.

## Release and rollback

Source-only. All Cortex gates remain closed; Vercel Git remains disconnected.
No hosted Supabase read/write, Auth/Storage/data mutation, AI/image/provider
call, Vercel/Railway build or deployment, or paid resource occurred. Rollback
is one focused revert of the Web request/cancellation helper and browser
harness; no database rollback is required.
