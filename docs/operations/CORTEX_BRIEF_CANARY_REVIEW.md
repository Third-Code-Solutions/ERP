# Cortex brief canary review packet

Status: `review_required` — source-only; no tenant canary is enabled.
Prepared: 2026-08-09.

This packet is an approval checklist, not deployment authority. It does not
authorize a Supabase query/write, Vercel or Railway build/deploy, provider
call, or paid resource.

## Candidate and flags

- Candidate source: `55697564c49cf92a58e7e85016fe4d6ac71f2abe` on
  `agent-02/third-code-erp-landing`; pushed to
  `Third-Code-Solutions/ERP`. It is not deployed.
- API gate: `ERP_CORTEX_BRIEF_READS_ENABLED=false` and
  `ERP_CORTEX_BRIEF_READS_TENANT_IDS=[]`.
- Web gate: `ERP_CORTEX_BRIEF_READS_VIA_API` is not enabled and
  `ERP_CORTEX_BRIEF_READS_VIA_API_TENANT_IDS` is empty/unset.
- A real review must set one exact tenant UUID in both allowlists only after
  all gates below pass. Wildcards are not permitted.
- The Web brief gate uses the exact-tenant helper; `*` is rejected even though
  other legacy Core seams retain their historical generic helper behavior.

## Authority and identity

| Boundary | Required proof |
| --- | --- |
| Browser/Web | Session-derived `getUserProfile()` supplies tenant and role; no tenant or role input from the URL/body. |
| Web seam | `readCortexBrief()` chooses Core or legacy once; selected Core errors return a visible failure and never call the database helper. |
| Nest API | JWT `CurrentPrincipal`, `RequireCapabilities('cortex.search')`, exact API tenant allowlist, and `cortexSearchNodeTypeScope(principal.role)`. |
| Database | `getCortexOperationalBrief()` receives the authenticated tenant and server role scope; no browser DML or provider call. |
| Audit/rollback | Exact deployed Web/API SHA, owner, last-known-good artifacts, and a flag-clear rollback drill recorded before approval. |

## Current evidence

- M3.185 deterministic parity fixture: 4/4. Legacy and normalized Core
  projections match for generated time, stats, freshness, and items.
- Focused gate: Core client 139/139 plus brief-read 4/4; Web typecheck and
  sequential 82-page build pass. Full prior release lane: API 641/641, shared
  277/277, Web 683/683, database
  224 passed plus 143 local credential-gated skips; typecheck, lint, 82-page
  build, spend/release, Actionlint, pinned refs, Gitleaks, diff, and clean-room
  gates passed.
- Brief read is bounded: dashboard limit 8; shared/API maximum 24; Core fetch
  timeout 5 seconds; no retry loop and no AI/provider budget.

## Local release and rollback metadata

- Source candidate is exact and clean locally; the current branch resolves to
  `55697564c49cf92a58e7e85016fe4d6ac71f2abe`.
- Documented retained Web rollback target:
  `dpl_GTDC2eis2Epkrty6USXyAPMNbsGt` from source
  `f24e5603a35571f8dcadd43fc09c64d12646a7d0`. This is a recorded target, not a
  live provider check in this milestone.
- Railway/API last-known-good deployment identity and rollback artifact remain
  unresolved and must be supplied before activation.
- This packet's later documentation commits do not change the application
  candidate; re-review the exact candidate SHA before any hosted action.

## Blocking evidence before one-tenant activation

1. Managed Supabase backup/PITR restore and exact schema/catalog/RLS parity are
   still `review_required` in `MANAGED_SUPABASE_PARITY_PLAN.md`.
2. Supply one approved tenant UUID, expected role matrix, authenticated
   identity proof, and explicit owner approval outside Git.
3. Record the exact Railway API and Web release deployment identities and
   retained rollback artifacts. Source SHA alone is not deployment proof.
4. Run live authenticated checks for every role that can use `cortex.search`:
   allowed tenant data, forbidden node types, cross-tenant denial, malformed
   query rejection, and Core 503 fail-closed behavior.
5. Confirm the spend ceiling and one-request/daily budget in the provider
   spend guard. Keep Vercel Git disconnected and do not create a preview.

## Abort and rollback

Abort on identity/tenant mismatch, role leakage, schema drift, invalid
projection, Core timeout/5xx, unexpected retry, readiness failure, or any
spend-ceiling breach. Clear both Web/API enable flags and tenant allowlists;
retain the last-known-good releases; do not rebuild to roll back. Record the
failed release identity and evidence before any re-review.

Until every blocker is resolved, the packet remains review-only and all flags
stay false/empty.
