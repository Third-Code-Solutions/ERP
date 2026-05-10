# BuildOps ERP — Sequential Loop Runbook
# Mode: safe | Pattern: sequential
# Started: 2026-05-09

## Stop Conditions
- All Phase 0 + Phase 1 implementation complete and verified
- External blocker (missing Supabase credentials, etc.)
- Explicit user halt

## Loop Iterations

### Iteration 1 — Repo + Monorepo Foundation
- [ ] git init
- [ ] pnpm workspace setup
- [ ] turbo.json
- [ ] Root package.json
- [ ] apps/web: Next.js 15 + App Router
- [ ] packages/config: shared tsconfig, eslint, tailwind
- [ ] Verify: pnpm install, tsc --noEmit, pnpm build

### Iteration 2 — Database Schema (Drizzle + Supabase)
- [ ] packages/database: Drizzle schema
  - tenants, users, projects, opportunities
  - documents, scope_items, boms, bom_line_items
  - purchase_orders, invoices, audit_log
- [ ] RLS policy SQL files
- [ ] Verify: drizzle-kit generate

### Iteration 3 — Auth Shell + Protected Routes
- [ ] Supabase client setup (server + browser + admin)
- [ ] Middleware auth guard
- [ ] (auth)/login and signup pages
- [ ] (dashboard)/layout.tsx with auth check
- [ ] Env validation (t3-env or manual)
- [ ] Verify: typecheck

### Iteration 4 — App Shell + Navigation
- [ ] Topbar component
- [ ] Sidebar navigation
- [ ] Dashboard layout shell
- [ ] shadcn/ui primitives
- [ ] Tailwind config
- [ ] Verify: build

### Iteration 5 — Executive Dashboard
- [ ] KPI cards (TCV, GP, Won, Active Deals, Coverage Leads)
- [ ] Per-rep scorecard table
- [ ] Stage distribution table
- [ ] Recent activity feed stub
- [ ] Verify: typecheck + visual smoke

### Iteration 6 — Projects Module
- [ ] projects list page + CRUD
- [ ] project detail tabs (Overview, Scope, BOM, Documents, Billing, Audit)
- [ ] Server Actions for mutations
- [ ] Verify: typecheck

### Iteration 7 — Pipeline Module (Coverage + Conversion)
- [ ] Coverage table page
- [ ] Conversion kanban/table page
- [ ] Stage transition logic + audit logging
- [ ] Filters + sorting
- [ ] Verify: typecheck

### Iteration 8 — Domain Logic + Tests
- [ ] TCV / GP / margin calculations (integer cents)
- [ ] Weighted pipeline calculation
- [ ] BOM line totals + markup
- [ ] Zod validation schemas
- [ ] Unit tests for calculations
- [ ] Verify: vitest run

### Iteration 9 — Audit Log + Security
- [ ] Append-only audit_log schema confirmed
- [ ] Hash chaining utility
- [ ] Mutation wrappers that log
- [ ] Security review: RLS, XSS, CSRF, secrets
- [ ] Verify: security checklist

### Iteration 10 — Final Verification + Docs ✅ COMPLETE
- [x] pnpm install clean
- [x] lint
- [x] typecheck (full) — 0 errors
- [x] vitest — 64 tests pass
- [x] build — 22 routes compile cleanly
- [x] Write NEXT_STEPS.md — already existed with Phase 2-4 detail
- [x] Write .env.example — apps/web/.env.example

### Phase 1 Stub Pages Completed (Post-Iteration 10)
- [x] /invoices — real DB query, status badges, KPI strip (outstanding/collected/overdue)
- [x] /purchase-orders — real DB query, vendor join, KPI strip, delivery dates
- [x] /bom — real DB query, TCV/GP/margin table, all BOM statuses
- [x] /procurement — vendor directory + recent POs two-column layout
- [x] /reports — pipeline summary, stage breakdown table, closed deal metrics, ops summary
- [x] /settings — fixed pcab_license_no → pcab_license, plan → bir_tin type errors

## Phase 0 + Phase 1: DONE ✅
All 22 routes build. Typecheck clean. 64 unit tests pass.

## External Blockers Tracker
(none yet)

## Quality Gate
Each iteration: typecheck must pass before moving to next.
Final: full build must succeed or blocker documented.
