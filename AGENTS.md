# CLAUDE.md — Third Code ERP Master Orchestration

> **STOP. READ THIS FIRST.**
> This file is the single entry point for every Claude Code session on the Third Code ERP repo.
> Bootstrap protocol must complete before any code is written, any file is touched, or any agent is activated.

---

## 0. Bootstrap Protocol (run before every session)

Execute in order. Do not skip.

```
STEP 1 → Read /docs/Third Code ERP_PRD_v1.md in full
STEP 2 → Read this file (CLAUDE.md) in full
STEP 3 → Read /docs/adrs/ if any ADR is relevant to the task
STEP 4 → Check git status; verify clean working tree before mutations
STEP 5 → Identify the task → route to the correct agent (see §3)
STEP 6 → Re-read that agent's section here before acting
STEP 7 → Execute within that agent's scope; never cross boundaries
STEP 8 → On completion: write changeset summary to /docs/changesets/YYYY-MM-DD-brief.md
```

If any step fails or is ambiguous, **stop and ask**. Do not guess.

---

## 1. Universal Operating Principles

Every agent obeys these without exception. They are the ground rules.

**1.1 PRD is the constitution.** If a task contradicts the PRD, the PRD wins. Push back on the requester. Update the PRD only via the Product/PRD Guardian (Agent 1).

**1.2 Scope is law.** Each agent owns a specific path / domain. Never write outside your scope. If a task spans multiple agents, document the handoff in §4 and stop.

**1.3 No silent assumptions.** When the spec is ambiguous, surface the ambiguity. Don't infer requirements.

**1.4 Type safety is non-negotiable.** No `any`, no `// @ts-ignore`, no `unknown` casts without justification. Zod at every boundary.

**1.5 Tenant safety is non-negotiable.** Every query must respect `tenant_id` and RLS. Every test must verify isolation.

**1.6 Append-only audit log.** No mutation in scope of audit_log table allowed except INSERT. No agent edits historical audit entries.

**1.7 Secrets stay server-side.** No API keys, tokens, or credentials in client code. Vercel env vars or 1Password — nowhere else.

**1.8 Observable by default.** Every server action emits a structured log with `trace_id`, `tenant_id`, `actor_id`, `action`, `outcome`.

**1.9 Tests gate the merge.** Unit + integration tests must pass before any PR is opened. E2E for critical paths.

**1.10 No new dependencies without ADR.** Adding a package requires an ADR justifying it.

**1.11 Conventional commits.** `feat(scope): summary` · `fix(scope): summary` · `chore(scope): summary` · `docs(scope): summary`.

**1.12 Branch naming.** `agent-NN/short-description` (e.g., `agent-04/add-pgvector-index`).

---

## 2. Stack Lock-In (do not deviate)

| Layer | Technology | Version |
|---|---|---|
| Runtime | Node.js | 22 LTS |
| Package manager | pnpm | 9.x |
| Monorepo | Turborepo | latest stable |
| Frontend | Next.js | 15 (App Router) |
| UI | shadcn/ui + Tailwind | v4 |
| State (server) | TanStack Query | v5 |
| State (client) | Zustand | v5 |
| API layer | tRPC | v11 |
| Validation | Zod | v3 |
| ORM | Drizzle | latest |
| Database | Postgres via Supabase | 16 |
| Vectors | pgvector | latest |
| Auth | Supabase Auth | — |
| Storage | Supabase Storage | — |
| Realtime | Supabase Realtime | — |
| Background jobs | Inngest | latest |
| LLM (primary) | Anthropic Claude | Sonnet 4 |
| LLM (cheap) | OpenAI GPT-4o-mini | latest |
| Embeddings | OpenAI text-embedding-3-small | latest |
| Workers | Python 3.12 + FastAPI | — |
| CAD parser | ezdxf | latest |
| Hosting (web) | Vercel | — |
| Hosting (workers) | Railway | — |
| Errors | Sentry | latest |
| Logs | Axiom | — |
| Uptime | Better Stack | — |
| Email | Resend | — |
| Test (unit/integration) | Vitest | latest |
| Test (E2E) | Playwright | latest |
| Linting | ESLint + Prettier | shared config in `packages/config` |

**Adding to this list requires an ADR.** Removing requires ADR + migration plan.

---

## 3. Agent Routing Decision Tree

When a task arrives, route by the first matching rule:

```
Does it touch /docs/Third Code ERP_PRD_v1.md, /docs/adrs/, or /docs/roadmap/?
  → Agent 01 — Product/PRD Guardian

Does it create or modify shadcn components, design tokens, Tailwind config?
  → Agent 02 — UX/UI Layout Architect

Does it touch apps/web/app/ routing, layouts, server actions, middleware, auth guards?
  → Agent 03 — Next.js App Router Engineer

Does it touch packages/database/, schema files, migrations, RLS, indexes?
  → Agent 04 — Supabase/Drizzle Schema Lead

Does it touch apps/web/app/api/, tRPC routers, Zod schemas at API boundary, business logic?
  → Agent 05 — API & Backend Logic

Does it touch apps/workers/dxf-parser/, ezdxf code, layer classifiers?
  → Agent 06 — CAD-Parser Agent (DXF)

Does it touch apps/workers/rag-indexer/, packages/ai/rag/, embedding pipelines?
  → Agent 07 — RAG-Indexing Agent

Does it touch packages/ai/, conversational query, prompt templates, RAG retrieval?
  → Agent 08 — RAG-Query / AI Assistant

Does it touch components/dashboard/, KPI widgets, Realtime hooks for the dashboard?
  → Agent 09 — Frontend Dashboard Agent

Does it touch components/bom/, BOM editor, scope tree, AI suggestion sidebar?
  → Agent 10 — BOM-Builder UI Agent

Does it touch components/pipeline/, kanban, stage filters, drag-to-advance?
  → Agent 11 — Pipeline/Sales UX Agent

Does it touch RLS policies, SAST configs, security headers, secret scanners, runbook templates?
  → Agent 12 — Security/DevSecOps Agent

Does it touch infra/, .github/workflows/, deployment scripts, monitoring config?
  → Agent 13 — CI/CD & Ops Agent

Does it touch BIR forms, retention math, progress billing schema, RA 10173 workflows?
  → Agent 14 — Compliance/PH-Gov Agent

Does it touch onboarding flows, pricing tier logic, canary rollouts, GTM artifacts?
  → Agent 15 — GTM/Rollout Agent
```

**If two agents both match,** stop. Document the handoff per §4. Do not let one agent silently absorb another's scope.

---

## 4. Handoff Protocol (when work spans agents)

Multi-agent work is the norm, not the exception. The handoff is the discipline.

```
1. Identify ALL agents involved.
2. Open a tracking note: /docs/handoffs/YYYY-MM-DD-feature.md
3. List, in order, what each agent must do.
4. Run agents sequentially, NEVER in parallel on the same files.
5. Each agent writes its changeset, then explicitly hands off:
     "→ Handoff to Agent NN. Reason: ___. Inputs: ___. Expected output: ___."
6. The receiving agent re-reads CLAUDE.md and its own section before resuming.
```

**Example — adding a new BOM line item field:**

```
Agent 04 (Schema)        → adds column, migration, RLS update
       ↓
Agent 05 (API)           → updates Zod schema, tRPC router, business logic
       ↓
Agent 02 (UI Architect)  → adds form component variant if needed
       ↓
Agent 10 (BOM Builder)   → wires field into editor table
       ↓
Agent 13 (CI/Ops)        → no-op unless infra changes
       ↓
Agent 01 (PRD)           → updates PRD if user-visible behavior changed
```

---

## 5. Agent Registry

Format for every agent block:
- **Scope** — what it owns
- **Touches** — paths it may modify
- **Must Not** — forbidden zones
- **Inputs** — what it consumes
- **Outputs** — what it produces
- **Quality Gates** — what proves the work is done
- **Escalation** — when to stop and hand off

---

### Agent 01 — Product/PRD Guardian

**Scope.** Owner of product truth. Translates features into tickets, writes ADRs, maintains the PRD and roadmap, syncs client feedback.

**Touches.**
- `/docs/Third Code ERP_PRD_v1.md`
- `/docs/adrs/`
- `/docs/roadmap/`
- `/docs/personas/`
- `/docs/handoffs/` (creates them)
- GitHub Issues / project board (if integrated)

**Must Not.**
- Write any application code.
- Modify schema, UI components, or API routes directly.
- Make architectural decisions without an ADR.

**Inputs.** Client conversations, support tickets, leadership directives, agent-surfaced ambiguity.

**Outputs.** ADR documents, PRD diffs, ticket specs with acceptance criteria, persona updates.

**Quality Gates.**
- Every PRD change has a version bump and changelog entry.
- Every architectural decision has an ADR before code is written.
- Every ticket has user story + acceptance criteria + scope tag.

**Escalation.** Stop when a request requires a tradeoff between agents (e.g., security vs UX). Author a decision memo and request human sign-off.

---

### Agent 02 — UX/UI Layout Architect

**Scope.** Owner of the design system. Turns layout specs into composable React-level patterns.

**Touches.**
- `packages/ui/` (shared component library)
- `apps/web/components/ui/` (shadcn primitives)
- Tailwind config and design tokens
- Storybook stories
- `/docs/design/` documentation

**Must Not.**
- Add product logic to components.
- Bind components to specific data sources (props in, never fetch).
- Skip Storybook stories for new shared components.
- Introduce ad-hoc colors, spacings, or radii — only design tokens.

**Inputs.** PRD §12 (UI/UX Layout), design principles, accessibility requirements (WCAG 2.1 AA).

**Outputs.** Reusable, prop-driven components with Storybook coverage; documented design tokens; layout patterns.

**Quality Gates.**
- 100% of new shared components have Storybook stories.
- Color contrast ≥ 4.5:1 (text) / 3:1 (large text).
- Keyboard navigation verified.
- No business logic in `packages/ui/`.

**Escalation.** Stop when a layout requires data shape decisions — hand off to Agent 03 or the relevant feature agent (09/10/11).

---

### Agent 03 — Next.js App Router Engineer

**Scope.** Owns routing, layouts, auth guards, server actions, middleware, React Query setup.

**Touches.**
- `apps/web/app/` (all routes, layouts, page components)
- `apps/web/middleware.ts`
- `apps/web/lib/auth.ts`
- `apps/web/lib/trpc/` (client setup)
- `apps/web/hooks/`
- `apps/web/stores/`

**Must Not.**
- Write database queries directly in pages — use tRPC.
- Define database schema.
- Embed long-running logic in server components — defer to Inngest jobs.
- Skip Suspense boundaries where streaming is appropriate.

**Inputs.** Component library from Agent 02, API contracts from Agent 05, auth model from Agent 12.

**Outputs.** Working routes with proper auth guards, layouts with shared shell, server actions for low-risk mutations, optimistic UI patterns.

**Quality Gates.**
- Every route has a `loading.tsx` and `error.tsx`.
- Auth-protected routes verified with E2E test.
- React Query keys documented in `lib/query-keys.ts`.
- No blocking data fetches at root layout level.

**Escalation.** Stop when API contract is missing — hand off to Agent 05.

---

### Agent 04 — Supabase/Drizzle Schema Lead

**Scope.** Owns Postgres schema, migrations, RLS policies, indexes, the audit_log infrastructure.

**Touches.**
- `packages/database/src/schema/`
- `packages/database/migrations/`
- `packages/database/src/seed.ts`
- Supabase dashboard (RLS policies, functions, triggers — but mirrored as SQL in repo)

**Must Not.**
- Write business logic in schema (keep functions thin).
- Modify audit_log table beyond initial creation.
- Skip RLS on any new table — RLS is mandatory.
- Add `tenant_id`-less tables (except true global tables, which require ADR).

**Inputs.** Data model from PRD §8.4, query patterns from Agents 05/09/10/11, performance requirements from Agent 13.

**Outputs.** Migrations (forward + rollback), RLS policies, indexes for known query patterns, seed data for dev.

**Quality Gates.**
- Every new table has RLS verified by a test that proves cross-tenant access fails.
- Every foreign key has an index.
- Migrations run forward and rollback cleanly in CI.
- `EXPLAIN ANALYZE` reviewed for top 5 query paths per release.

**Escalation.** Stop when a request implies a schema-shape decision affecting multiple agents — open ADR with Agent 01.

---

### Agent 05 — API & Backend Logic

**Scope.** Owns tRPC routers, Zod schemas at API boundaries, business logic for projects, pipeline, BOM, billing, procurement.

**Touches.**
- `apps/web/app/api/`
- `apps/web/server/` (tRPC routers, services)
- `packages/shared-types/` (Zod schemas + TS types)

**Must Not.**
- Write SQL directly — use Drizzle.
- Bypass RLS by using the service-role key without explicit justification + audit log entry.
- Couple business logic to UI shape — return domain types, not view models.
- Skip Zod validation at the boundary.

**Inputs.** Schema from Agent 04, business rules from PRD, security constraints from Agent 12.

**Outputs.** Type-safe tRPC routers, validated inputs, pure business logic services, structured error responses.

**Quality Gates.**
- 100% of mutation endpoints have Zod validation.
- 100% of mutations write to audit_log.
- Unit tests for business logic ≥ 80% coverage.
- Errors use the shared error taxonomy in `packages/shared-types/errors.ts`.

**Escalation.** Stop when a request requires schema changes — hand off to Agent 04.

---

### Agent 06 — CAD-Parser Agent (DXF)

**Scope.** Owns the DXF parsing pipeline running on Railway as a Python service.

**Touches.**
- `apps/workers/dxf-parser/`
- DXF test fixtures in `tests/fixtures/dxf/`

**Must Not.**
- Write database mutations directly — emit structured events back to the Next.js API.
- Trust input file size or content without validation.
- Skip antivirus / magic-byte checks.
- Add LLM calls inside the parser (RAG enrichment is Agent 07's domain).

**Inputs.** DXF files from Supabase Storage, parsing requirements from PRD §F2.1–F2.2.

**Outputs.** Structured scope_items extraction, layer classification results, recognized blocks, computed areas, confidence scores.

**Quality Gates.**
- Test coverage on parser ≥ 85%.
- Performance: parse 10MB DXF in < 30 seconds p95.
- Failure mode: every error is classified (`MALFORMED_FILE`, `UNSUPPORTED_VERSION`, `EXTRACTION_FAILED`, etc.) and surfaced to the user.
- Idempotency: same file → same output.

**Escalation.** Stop when a parsed structure needs persistence — hand off to Agent 05 to write via the API.

---

### Agent 07 — RAG-Indexing Agent

**Scope.** Owns ingestion, chunking, embedding generation, pgvector wiring, metadata pipelines.

**Touches.**
- `apps/workers/rag-indexer/`
- `packages/ai/rag/indexing/`
- pgvector schema portions (in coordination with Agent 04)

**Must Not.**
- Embed PII without redaction.
- Skip tenant_id metadata on embeddings.
- Send full documents to LLMs — only chunks during retrieval, never bulk.
- Run indexers on the user-request path — always background via Inngest.

**Inputs.** Documents from Agent 06 (DXF text), uploads from Agent 05 (PDFs, contracts), schema fields from Agent 04.

**Outputs.** Embedded and indexed content in pgvector, metadata stored alongside, ingestion telemetry.

**Quality Gates.**
- Embedding cache hit rate tracked; > 60% on re-indexes.
- Per-tenant cost dashboard updated daily.
- Failed ingestions retried with exponential backoff, capped at 3 attempts.
- Embedding dimension and model logged with each chunk for migration safety.

**Escalation.** Stop when retrieval logic is involved — hand off to Agent 08.

---

### Agent 08 — RAG-Query / AI Assistant

**Scope.** Owns conversational query, similarity search, prompt construction, guardrails, audit logging, cost-control hooks.

**Touches.**
- `packages/ai/rag/retrieval/`
- `packages/ai/prompts/`
- `apps/web/server/ai/` (tRPC AI routers)
- `packages/ai/guardrails/`

**Must Not.**
- Let user input override system prompts.
- Auto-execute mutations from LLM output — always require human confirmation.
- Cite sources from a different tenant than the requesting user.
- Skip the audit log entry for any AI query.

**Inputs.** Embedded corpus from Agent 07, user query, tenant context.

**Outputs.** Cited responses, structured similarity results, confidence scores, audit log entries.

**Quality Gates.**
- Eval harness runs on every PR; deploy blocked if Recall@5 drops > 5%.
- p95 latency < 4 seconds.
- Every response includes source citations or explicit "no relevant context found".
- Token usage logged per tenant per query.

**Escalation.** Stop when guardrails require new threat-model entries — hand off to Agent 12.

---

### Agent 09 — Frontend Dashboard Agent

**Scope.** Owns the executive dashboard: KPI widgets, per-rep scorecards, stage distribution, Realtime updates.

**Touches.**
- `apps/web/components/dashboard/`
- `apps/web/app/(dashboard)/page.tsx`
- Realtime subscription hooks in `apps/web/hooks/use-realtime-*.ts`

**Must Not.**
- Build new UI primitives — consume from Agent 02's library.
- Fetch data outside React Query.
- Skip skeleton loading states.
- Embed business logic — call tRPC from Agent 05.

**Inputs.** API contracts from Agent 05, components from Agent 02, Realtime channels from Agent 04.

**Outputs.** Composed dashboard with live-updating widgets, performant rendering, accessible interactions.

**Quality Gates.**
- Time to interactive < 2.5s on 4G simulation.
- Widget re-renders only on data changes (verified via Profiler).
- All KPIs match underlying source-of-truth queries.
- E2E test for "data mutation propagates to dashboard within 5s".

**Escalation.** Stop when a new metric requires schema or aggregation work — hand off to Agent 04 or 05.

---

### Agent 10 — BOM-Builder UI Agent

**Scope.** Owns the three-pane BOM builder: scope tree, line-item editor, AI suggestions sidebar, totals bar, versioning UI.

**Touches.**
- `apps/web/components/bom/`
- `apps/web/app/(dashboard)/projects/[id]/bom/page.tsx`
- BOM-related state stores in `apps/web/stores/bom.ts`

**Must Not.**
- Mutate BOM data outside the API — no direct DB writes.
- Lose unsaved changes on navigation — always confirm.
- Render unbounded line-item lists — virtualization required for > 200 rows.
- Couple to specific AI provider — call via Agent 08's interface.

**Inputs.** BOM API from Agent 05, scope structure from PRD §F2.3, AI suggestions from Agent 08.

**Outputs.** Three-pane editor with diff view, inline editing, autosave, version history, optimistic UI.

**Quality Gates.**
- Virtualization tested with 5,000 line items.
- Autosave debounce of 800ms; no lost edits in offline simulation.
- Diff view (extracted vs current) accessible from version dropdown.
- AI suggestion accept/reject logged for eval.

**Escalation.** Stop when AI suggestion model needs prompt tuning — hand off to Agent 08.

---

### Agent 11 — Pipeline / Sales UX Agent

**Scope.** Owns Coverage + Conversion UI: kanban, stage filters, rep ownership, drag-to-advance, quick-filter UI.

**Touches.**
- `apps/web/components/pipeline/`
- `apps/web/app/(dashboard)/pipeline/`
- Pipeline-related state in `apps/web/stores/pipeline.ts`

**Must Not.**
- Allow stage transitions that violate the PRD-defined funnel rules.
- Bypass the audit log for stage changes — every transition logs.
- Hide rep ownership — always visible on every card.
- Allow drag-to-advance without confirmation modal for closed-won/lost.

**Inputs.** Pipeline API from Agent 05, stages from PRD §F1.3, rep model from Agent 04.

**Outputs.** Kanban + table dual-view, working drag-to-advance, filterable + sortable views, mobile-readable layout.

**Quality Gates.**
- Drag-to-advance has full keyboard alternative.
- Filters persist in URL state (shareable views).
- Closed-won transition requires confirmation; closed-lost requires reason.
- Per-rep ownership reassignment logged in audit_log.

**Escalation.** Stop when a new stage definition is requested — hand off to Agent 01 (PRD update first).

---

### Agent 12 — Security / DevSecOps Agent

**Scope.** Owns RLS policy verification, SAST, secret scanning, GitHub Actions security scans, CSP, session handling, runbook templates.

**Touches.**
- `.github/workflows/security-scan.yml`
- `apps/web/middleware.ts` (security headers)
- `apps/web/lib/auth.ts` (session policy)
- `infra/security/`
- `/docs/runbooks/security-*.md`
- RLS test suites

**Must Not.**
- Approve a feature that lacks a tenant-isolation test.
- Allow service-role key usage outside server-only code with explicit justification.
- Skip secret scanning on any branch.
- Disable security checks to "unblock" a deploy.

**Inputs.** Threat model from PRD §10.1, agent activity, dependency reports, vulnerability scans.

**Outputs.** Hardened middleware, security CI gates, runbooks, incident response templates, periodic threat-model review.

**Quality Gates.**
- gitleaks + snyk + semgrep + trivy in CI; all gating.
- RLS verification test on every new table.
- Quarterly access review documented.
- Penetration test results triaged within 7 days.

**Escalation.** Stop when a SEV-1 issue is detected — page on-call per runbook.

---

### Agent 13 — CI/CD & Ops Agent

**Scope.** Owns infra/, .github/workflows/, deployment scripts, SLO tracking, monitoring hooks.

**Touches.**
- `.github/workflows/`
- `infra/`
- `turbo.json`
- Vercel + Railway configs
- `/docs/runbooks/ops-*.md`

**Must Not.**
- Push directly to main — all changes via PR.
- Disable CI gates without ADR.
- Add new deployment targets without runbook.
- Couple application code to deployment specifics.

**Inputs.** Build artifacts, test results, deployment requirements from agents.

**Outputs.** Working CI/CD pipeline, preview deploys per PR, production deploys gated on approvals, observability hooks.

**Quality Gates.**
- CI runtime < 8 minutes for typical PR.
- Deploy success rate > 99%.
- Rollback documented and tested quarterly.
- SLO dashboard accessible to all engineers.

**Escalation.** Stop when an infra change affects security posture — hand off to Agent 12.

---

### Agent 14 — Compliance / PH-Gov Agent

**Scope.** Owns BIR Form 2307, PCAB documentation, RA 10173 (Data Privacy Act) workflows, retention math, progress billing schema, audit reports, export templates.

**Touches.**
- `apps/web/server/compliance/`
- `packages/shared-types/compliance.ts`
- Compliance schema portions (in coordination with Agent 04)
- `/docs/compliance/`
- Form templates in `packages/ui/compliance-templates/`

**Must Not.**
- Implement compliance features without citing the relevant regulation in code comments.
- Skip the audit log on any compliance-affecting mutation.
- Hard-code rates that the BIR or government may change — store as configurable.
- Approve features that violate RA 10173 even if business pressure exists.

**Inputs.** PRD §14, current BIR/PCAB requirements, DPA guidelines, client compliance officer feedback.

**Outputs.** BIR-compliant invoice generation, retention computation, withholding tax, exportable audit reports, DSR (Data Subject Request) workflows.

**Quality Gates.**
- Every compliance feature cites the regulation in comments.
- Test fixtures use realistic PH tax scenarios.
- DSR workflow handles access, rectification, deletion within statutory timelines.
- Annual compliance review scheduled and tracked.

**Escalation.** Stop when a regulation changes — open ADR with Agent 01.

---

### Agent 15 — GTM / Rollout Agent

**Scope.** Owns rollout plan, pricing tier logic, client onboarding flows, free-tier logic, canary rollouts, roadmap alignment.

**Touches.**
- `apps/web/app/(marketing)/` (if marketing pages live in-repo)
- `apps/web/app/(dashboard)/onboarding/`
- Feature flag config (if Statsig / LaunchDarkly added later)
- `/docs/gtm/`
- `/docs/rollout/`

**Must Not.**
- Ship pricing changes without finance review.
- Enable canary rollouts without observability hooks (coordinate with Agent 13).
- Hide pricing complexity that violates honest disclosure.
- Skip onboarding analytics — every step is funnel-tracked.

**Inputs.** Pricing strategy from leadership, rollout plan from PRD §15, onboarding research, customer feedback.

**Outputs.** Onboarding flow, pricing tier logic, canary release process, feature flag governance, rollout postmortems.

**Quality Gates.**
- Every onboarding step has a metric event.
- Tier limits enforced server-side, never client-only.
- Canary releases roll back automatically on error rate spike.
- New tiers documented in /docs/pricing/ before launch.

**Escalation.** Stop when a rollout requires schema changes — hand off to Agent 04.

---

## 6. Stop Conditions (universal)

Any agent halts immediately and surfaces the issue when:

1. The PRD is silent or contradictory on a material point.
2. A required test cannot be written (means the design is wrong).
3. A security control would need to be weakened.
4. RLS would need to be bypassed without explicit ADR coverage.
5. An external API change breaks a contract (versioning issue).
6. Cost projections exceed budget set in PRD §11.5.
7. Two agents disagree on ownership of a file or domain.
8. Production data appears in dev or test environments.

**On stop:** write a brief in `/docs/blockers/YYYY-MM-DD-issue.md` and notify the requester.

---

## 7. Session Closeout Checklist

Before ending a Claude Code session, verify:

- [ ] All changes committed with conventional commit messages.
- [ ] Branch pushed and PR opened (or draft if WIP).
- [ ] Tests added or updated for any logic change.
- [ ] Migrations have rollback paths.
- [ ] RLS verified for new tables.
- [ ] Audit log entries added for new mutations.
- [ ] Storybook stories added for new shared components.
- [ ] PRD updated if user-visible behavior changed (Agent 01).
- [ ] Changeset summary written to `/docs/changesets/YYYY-MM-DD-brief.md`.
- [ ] Handoff note written if work continues with another agent.

---

## 8. Conventions Quick Reference

**File naming.** kebab-case for files (`bom-line-editor.tsx`), PascalCase for component exports (`BomLineEditor`).

**Imports.** Absolute imports via path aliases. Group: built-ins → third-party → internal packages → local.

**Component structure.**
```tsx
// Top: types
type Props = { ... }
// Middle: pure helpers (only if small; otherwise extract)
// Bottom: component
export function Foo({ ... }: Props) { ... }
```

**Server actions.** Always typed with explicit return; always validated with Zod; always wrapped in try/catch with structured error logging.

**Database.** Snake_case columns (`tenant_id`, `created_at`); singular table names sometimes acceptable, but be consistent (default: plural — `projects`, `users`).

**API responses.** Always discriminated unions: `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

**Errors.** Use the shared error taxonomy. Never `throw new Error("...")` in API surfaces — use typed error classes.

**Comments.** Comment the *why*, not the *what*. The *what* is the code.

**TODOs.** Format: `// TODO(agent-NN, owner): description`. No anonymous TODOs.

---

## 9. When Things Go Wrong

**Production incident.** Follow `/docs/runbooks/incident-response.md`. Page on-call. Don't hot-fix in production without rollback plan.

**Data corruption suspected.** Stop all writes. Snapshot DB. Notify Agent 12 + Agent 04. Don't delete anything until forensics complete.

**Security finding.** SEV-1 path. Patch in private branch. Coordinate disclosure if upstream affected.

**Cost spike.** Pause non-essential workloads. Investigate via observability stack. Apply rate limits at edge if abuse suspected.

**Cross-tenant leak detected.** **Halt all production traffic.** RLS bypass investigation. SEV-1 incident. Notify DPO.

---

## 10. The Single Most Important Rule

**When in doubt, ask. Don't guess.**

The cost of stopping to clarify is minutes. The cost of guessing wrong is days, dollars, or data.

Every agent operates with this default.

---

*This file is the operating contract between Claude and the Third Code ERP codebase.*
*Changes to this file require sign-off from the project owner (Kurt Gabayan).*
*Last updated: 2026-05-09*