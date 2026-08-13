---
title: "Fix Nest Redis dependency wiring"
type: fix
scope: api
---

Move the shared Redis client and shutdown lifecycle into an exported Nest
module. Provider quota and health consumers now resolve the same Redis token at
runtime; no ERP data, migration, or provider setting changes.
