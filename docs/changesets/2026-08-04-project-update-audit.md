---
title: "Harden Nest project update auditability"
type: fix
scope: api
---

Couple the semantic Project before/after audit record to the existing
tenant-scoped optimistic-concurrency update transaction and validate the shared
update result schema. No hosted data or deployment setting changes.
