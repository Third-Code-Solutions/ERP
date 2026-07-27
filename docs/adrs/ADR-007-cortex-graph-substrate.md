# ADR-007: Cortex Graph Substrate

**Status:** Accepted · **Date:** 2026-06-14
**Context:** THIRD_CODE_ERP_IMPLEMENTATION_PROMPT §5 (Better-Than-Obsidian mandate), Appendix B/D (S0.2).

## Context

Cortex (the AI Brain) must reason over a typed, permissioned, fully-trackable
graph of every ERP entity — without becoming a second source of truth and
without ever escaping tenant isolation or RBAC.

## Decision

1. **Derived projection, not a second source of truth.** The ERP tables remain
   canonical. `cortex_nodes` / `cortex_edges` mirror them via `ref_table` +
   `ref_id` pointers. The graph is rebuildable from the ERP at any time.

2. **Kept live by Postgres triggers.** `cortex_mirror_{project,account,user}`
   fire `AFTER INSERT/UPDATE/DELETE` and upsert the corresponding node plus
   machine-derived edges (`project --part_of--> account`,
   `user --owns--> project`). Edges carry `origin` (`canonical|derived|ai`) so
   FK-derived links are distinguishable from inferred/AI ones — no manual
   linking, no dead links.

3. **Mirror triggers are DEFENSIVE.** Each wraps its body in
   `EXCEPTION WHEN OTHERS THEN RAISE WARNING` and returns the row, so a mirror
   failure can **never** break the underlying ERP mutation. Reconciliation is
   handled by the idempotent backfill (`cortex_upsert_*`), which can rebuild the
   graph from the ERP.

4. **Bi-temporal + provenance on everything.** Nodes carry `valid_from/valid_to`
   (business validity) and `recorded_at` (transaction time). `cortex_provenance`
   is append-only and **SHA256 hash-chained per tenant** (same design as
   `audit_log`); history cannot be rewritten.

5. **RLS on every node/edge/provenance row** via `auth_tenant_id()`. The graph
   inherits the exact tenant isolation proven for the ERP tables.

6. **SECURITY DEFINER helpers are NOT REST-exposed.** `cortex_*` functions have
   `EXECUTE` revoked from `anon/authenticated/public` — otherwise a signed-in
   user could call `/rpc/cortex_upsert_node` and bypass RLS WITH CHECK to write
   into another tenant. Triggers and internal calls run as the owner and don't
   need EXECUTE, so mirroring/backfill are unaffected.

## Consequences

- Cortex queries read the graph under the caller's RLS — it can never surface a
  node the human couldn't open. (Phase 4 agents build on this.)
- Provenance verifies **chain linkage** (each `prev_hash` == prior `hash`,
  genesis-rooted). Like `audit_log`, the hash mixes `clock_timestamp()`, so it is
  tamper-evident on linkage/ordering, not content-recomputable. Acceptable and
  consistent with the existing audit design.
- New ERP tables need a mirror trigger + node type to enter the graph. Tracked
  per-slice; today: projects, accounts, users.

## Flagged conflict (raise, don't silently diverge)

The prompt §7 models RBAC as **per-tenant `memberships`** (a user may hold
different roles in different tenants). The existing system + CLAUDE.md PRD §8.3
put `tenant_id` + `role` **directly on `users`** (one user = one tenant). We kept
the existing model (live auth + 58 tables depend on it) and did **not** retrofit
`memberships`. If true multi-tenant membership is required, it is a dedicated
migration slice with an auth refactor — not folded silently into this one.

## Verification

`packages/database/src/__tests__/cortex-substrate.test.ts` (rollback-only):
mirror-on-insert (node + derived edges), tenant isolation for `authenticated`,
gapless provenance chain, cross-tenant write rejected. All green.
