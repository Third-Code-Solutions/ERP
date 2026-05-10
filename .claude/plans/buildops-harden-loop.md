# BuildOps ERP — Harden Loop Runbook

| Field | Value |
|---|---|
| Started | 2026-05-10 |
| Mode | safe |
| Pattern | sequential (with parallel read-only audit wave) |
| Stop conditions | (a) typecheck + build clean, (b) all 15 audit lanes report COMPLETE or fixed, (c) e2e smoke passes, (d) commit pushed |

## Why this is harden-not-build

Recent commit history shows Phases 1–4 already have foundational implementations:
- `b7b20c2` Phase 0 + Phase 1 foundation
- `cd5c31a` Phase 2 DXF upload pipeline + parser worker
- `bcf3375` Phase 3 procurement + PO + progress billing
- `8edf164` Phase 4 RAG embeddings + AI BOM suggestions + project chat
- `3d142cc` (just landed) DWG parsing, PH price catalog, design polish, e2e suite

So the loop's job is to find gaps and harden, not to invent new phases.

## Wave A — 15 parallel read-only audit lanes

Each lane runs as an isolated Agent dispatch with a non-overlapping mandate. All read-only.

1. Build/typecheck/lint baseline (run commands)
2. Auth, session, middleware, route guards
3. RLS policies + multi-tenancy enforcement
4. Projects CRUD + sub-tab routing
5. Pipeline (Coverage + Conversion stages)
6. Executive dashboard (KPI cards, scorecard, stage distribution, alerts)
7. Documents pipeline (sign URL, complete, delete, type detection)
8. DXF parser worker (Python, ezdxf, models, route)
9. DWG conversion (libredwg dwg2dxf, fallback paths)
10. Scope extraction + per-document grouping
11. BOM builder + auto-BOM (RAG → catalog → manual fallback)
12. Procurement (PO from BOM, vendors, statuses)
13. Billing (progress, retention, VAT 12%, EWT 2%, BIR 2307)
14. RAG / embeddings / similar-items / project chat
15. Inngest event chain (document/cad.uploaded → cad/parsed → bom/approved)

## Wave B — Triage

Merge findings. Rank: CRITICAL (broken/regressed), HIGH (gap blocks PRD goal),
MEDIUM (polish), LOW (docs).

## Wave C — Fix

Sequential edits by main agent. Write-mode subagents only on isolated files.

## Wave D — Verify

- `pnpm -w typecheck`
- `pnpm -w build` (or just web)
- e2e smoke: `pnpm --filter web exec playwright test --project=chromium e2e/projects-routes-walk.spec.ts`

## Wave E — Commit + DB push gate

Local migrations: `pnpm --filter @buildops/database db:migrate` against the
locally-running Supabase. Remote push: STOP and ask user which env to push to.

## Wave F — Audit report

Final report with:
- PRD G1–G6 goal coverage table
- Phase 1–4 feature checklist
- What was fixed in this loop
- Remaining gaps + recommended next session
