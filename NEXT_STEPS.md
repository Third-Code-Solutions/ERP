# BuildOps — Next Steps

**Phase 0 (Foundation) and Phase 1 (Core ERP) are complete.**
All packages typecheck. 64 domain logic tests pass.

---

## Immediate (Before First Pilot Demo)

### 1. Supabase Project Setup
- Create Supabase project at supabase.com
- Run `pnpm --filter @buildops/database generate` to generate Drizzle migrations
- Run `pnpm --filter @buildops/database migrate` against Supabase Postgres
- Apply `packages/database/src/sql/rls-policies.sql`
- Apply `packages/database/src/sql/audit-triggers.sql`
- Create `documents` storage bucket in Supabase dashboard
- Set env vars in `.env.local` (copy from `.env.example`)

### 2. First User / Tenant
- Register a user via `/auth/signup`
- Note the user's Supabase Auth UID from the Supabase dashboard
- Run: `SEED_USER_ID=<uid> SEED_ADMIN_EMAIL=<email> pnpm --filter @buildops/database db:seed`

### 3. Deploy to Vercel
- Connect repo to Vercel
- Set environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
- Confirm middleware auth guard works on the deployed preview URL

---

## Phase 2 — CAD Integration (Weeks 9–14)

### DXF Parser Service (Railway + Python)
- Set up `apps/workers/dxf-parser/` with FastAPI + ezdxf
- File upload endpoint: `POST /api/upload` in Next.js → store in Supabase Storage
- Inngest job triggered on `document.uploaded` event
- Parser extracts: layers, text annotations, block references (FCU, breakers), polyline areas
- Maps extracted entities → `scope_items` table with confidence scores

### Auto-BOM Generation
- BOM builder UI: three-pane layout (scope tree / line editor / AI suggestions)
- Estimator override flow with reason logging
- BOM status state machine: draft → approved → locked

### Suggested Files to Create
```
apps/workers/dxf-parser/src/main.py
apps/workers/dxf-parser/src/parsers/ezdxf_extractor.py
apps/workers/dxf-parser/Dockerfile
apps/web/src/app/(dashboard)/projects/[id]/bom/bom-builder.tsx
apps/web/src/app/api/upload/route.ts
apps/web/src/lib/inngest.ts
```

---

## Phase 3 — Execution Layer (Weeks 15–22)

### Procurement
- PO creation from approved BOM line items
- Vendor selection with saved unit costs
- PO approval workflow (role-gated: PM submits, Admin approves)
- Delivery tracking with partial delivery support

### Progress Billing (Philippine compliance)
- Milestone-based billing with percentage completion
- Auto-compute: gross amount, VAT (12%), EWT (2%), retention (10%)
- BIR 2307 PDF generation
- Invoice numbering with BIR-registered series

### GP Erosion Alerts
- Actual vs. budgeted cost comparison per scope item
- Real-time Supabase Realtime subscription in dashboard
- Alert rail on executive dashboard when project GP drops below threshold

### Suggested Files to Create
```
apps/web/src/app/(dashboard)/procurement/purchase-orders/[id]/page.tsx
apps/web/src/app/(dashboard)/invoices/[id]/page.tsx
apps/web/src/lib/billing-calculations.ts
apps/web/src/components/billing/invoice-pdf.tsx
```

---

## Phase 4 — Intelligence Layer (Weeks 23–30)

### RAG over Historical Projects
- Enable `pgvector` extension in Supabase: `CREATE EXTENSION vector`
- Migrate `embeddings.embedding` column from `text` to `vector(1536)`
- `apps/workers/rag-indexer/`: embed DXF text, BOM items, contracts via OpenAI
- Semantic search endpoint: `POST /api/rag/search`

### AI Estimating Assistant
- Right rail in BOM builder: "Similar past projects suggest…"
- Confidence scores on each suggested unit cost
- Estimator accept/reject per line, logged in audit trail

### Conversational Q&A
- Chat interface on project detail page
- Claude Sonnet for answers with source citations
- Query logging for audit and eval

---

## Technical Debt to Address

| Item | Priority |
|------|----------|
| Replace in-memory rate limiter with Upstash Redis | High (before GA) |
| Add loading.tsx skeleton files for all dashboard routes | Medium |
| Add Playwright E2E tests for critical user journeys | High |
| Add vitest integration tests (with real Supabase test instance) | High |
| Drizzle migration CI check (no schema drift) | Medium |
| Supabase Realtime subscription for dashboard auto-refresh | Medium |
| pgvector migration for embeddings table | Phase 4 |
| MFA enforcement for Owner/Admin roles | Before GA |

---

## Definition of Done (Per Phase)

**Phase 2 done when:** Estimator can upload a DXF, review auto-generated scope items, edit the BOM, and export a PDF quote — in under 4 hours total.

**Phase 3 done when:** PM can raise a PO from an approved BOM, track delivery, and generate a BIR-compliant progress billing invoice.

**Phase 4 done when:** "Find similar past projects" returns accurate suggestions, estimator override rate on AI suggestions is tracked, and eval harness runs nightly with no regressions.
