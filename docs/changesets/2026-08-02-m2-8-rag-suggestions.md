# M2.8 — RAG suggestion hardening

## Scope

- Harden the existing BOM similar-item endpoint without changing the ERP
  transaction path or triggering a provider deployment.
- Reuse the authenticated session and BOM visibility policy for tenant/RBAC
  enforcement.
- Bound input before an embedding call, return private/no-store responses,
  expose approved-BOM provenance, and fail closed on provider/vector outages.

## Validation

- `pnpm --filter @third-code-erp/web test -- src/app/api/ai/similar-items/route.test.ts`
  — 6/6 passed.
- Full workspace validation and CI remain required before push.

## Release boundary

No Supabase, Railway, Vercel, Storage, queue, provider setting, or business-data
write was performed. Hosted release remains gated by the controlled planner.
