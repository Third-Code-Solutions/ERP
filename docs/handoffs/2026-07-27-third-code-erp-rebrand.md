# Third Code ERP rebrand and public landing handoff

## Sequence

1. **Agent 01 — Product/PRD Guardian**
   - Record Third Code ERP as product brand.
   - Preserve construction vertical and multi-business extension.
   - Keep tenant-specific company names as tenant data, not platform identity.
2. **Agent 02 — UX/UI Layout Architect**
   - Define public landing tokens, states, responsive layout, accessibility.
   - Add original project-owned hero art and marketing component styles.
3. **Agent 03 — Next.js App Router Engineer**
   - Replace root redirect with public landing route.
   - Add metadata, structured data, robots, and sitemap.
4. **Agent 15 — GTM/Rollout**
   - Provide clear sign-in and guided-setup actions.
   - Add Vercel page analytics and named, non-personal CTA events per ADR-010.
5. **Agent 13 — CI/CD & Ops**
   - Verify typecheck, tests, build, CSP, mobile/desktop runtime, and release readiness.
   - Block database pushes until `docs/research/DATABASE_MIGRATION_RECOVERY.md`
     reaches its definition of done.

## Shared invariants

- No third-party ERP/work-management source, assets, trademarks, UI copy, or
  identifiers.
- Existing authenticated routes and tenant isolation remain unchanged.
- Search results must pass the same role policy as their destination and every
  database query must be tenant-constrained.
- Motion respects reduced-motion preferences and does not hide content.
- Public claims describe implemented capabilities or are framed as product direction.
