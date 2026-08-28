# Disposable Supabase containment repair handoff

**Date:** 2026-08-28
**Owner:** Agent 01 — Product/PRD Guardian
**Status:** documentation-only; **production NO-GO remains unchanged**.

## Recorded decision

Added
[`docs/handoffs/2026-08-28-disposable-supabase-containment-repair.md`](../handoffs/2026-08-28-disposable-supabase-containment-repair.md)
to route the fresh fail-closed local Supabase containment defect.

The Node 22 local-gate record proves that the disposable stack published Kong,
PostgreSQL, Studio, Inbucket, and Analytics on wildcard IPv4 and IPv6 bindings
for ports 54321, 54322, 54323, 54324, and 54327 despite the attempted loopback
network option. The Auth Admin API test was correctly not executed, and the
short-lived stack was torn down with zero matching resources/listeners. This is
not a successful Auth proof.

## Strict handoff sequence

1. Agent 12 defines the actual-binding, secret-handling, and fail-closed
   containment contract from current official Supabase/Docker evidence.
2. Agent 13 repairs only a repository-scoped disposable harness, proves actual
   loopback-only binding for every exposed service, and performs targeted
   zero-residue cleanup.
3. Agent 04 runs the real ADR-030 Auth Admin API proof with zero skips and no
   direct-SQL/placeholder substitute, then verifies targeted teardown.
4. Agent 12 independently reviews actual bindings, secret containment,
   zero-skip evidence, and zero residue for the exact candidate SHA.

## Boundaries retained

- No code, PRD, schema/migration/RLS, provider, production, deployment,
  billing, runner, UAC, firewall, host ACL, Docker Desktop setting, or local
  account/service mutation was made.
- No broad Docker/Supabase cleanup, relaxed binding check, skipped Auth proof,
  stale result, or direct-SQL Auth substitute is permitted by the handoff.
- Required current sources are linked in the handoff; the implementing owner
  must refresh them, capture CLI/engine versions, and verify exact CLI flags
  with installed command help before acting.
- Existing hosted CI/security, production-parity/environment/recovery, and
  ABI O-01/O-14 plus fractional-quantity/DUPA blockers remain independent
  **NO-GO** release gates.

## Verification

- **PASS:** documentation links resolve internally and all ownership stages,
  acceptance conditions, prohibited actions, targeted-teardown requirements,
  and production NO-GO conditions are explicit.
- **NOT RUN:** Docker/Supabase commands, technical harness repair, Auth proof,
  security review, provider operations, production parity, and deployment.
