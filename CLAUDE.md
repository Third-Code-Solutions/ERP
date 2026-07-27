# Third Code ERP — Product Requirements Document

| Field | Value |
|---|---|
| **Document** | PRD-CERP-001 |
| **Version** | 1.1 |
| **Status** | Active implementation |
| **Owner** | Kurt Gabayan (CTO) |
| **Contributors** | Masshi Okubo, Colin Buckley, Kenrick Kho |
| **Last Updated** | 2026-07-27 |
| **Classification** | Internal / Confidential |
| **Target GA** | Q4 2026 |

---

## 1. Executive Summary

Third Code ERP is a vertically integrated, multi-tenant operations platform for
Philippine construction firms and adjacent project-driven businesses. The system
ingests CAD drawings, auto-generates Bills of Materials, tracks the deal pipeline
from Coverage to Closed Won, manages per-floor cost execution, and surfaces
real-time GP erosion signals to leadership.

The platform replaces three things that currently exist as disconnected tools: (1) AutoCAD + manual Excel takeoff, (2) generic CRM tools like Rework.com that don't understand construction workflows, and (3) standalone accounting systems with no project visibility.

**Why we win:** Philippine construction firms today operate with zero data continuity between estimating, sales, execution, and billing. Generic SaaS covers only part of the workflow, does not speak Philippine compliance (BIR, PCAB, retention/progress billing), and does not integrate with how estimators consume DXF drawings. Third Code ERP closes that gap with one permission-aware operating graph.

---

## 2. Problem Statement

### 2.1 Current State

A typical Philippine MEP contractor running 10–15 concurrent projects operates in this disconnected workflow:

```
AutoCAD drawing → Estimator reads manually → Excel BOM → Sales pipeline in another Excel
    → Won deal handed to PM → Procurement in third Excel → Billing in QuickBooks → Reconcile manually
```

Each handoff loses fidelity. Every estimator builds their own BOM template. Every PM tracks costs differently. Leadership has no real-time view of pipeline, GP erosion, or which projects are bleeding margin.

### 2.2 Quantified Pain (from client discovery)

| Metric | Current State | After Third Code ERP |
|---|---|---|
| Time to build BOM from drawing | 6–8 hrs per project | 1.5–2 hrs |
| Pipeline visibility lag | Weekly Excel rebuild | Real-time |
| GP erosion detection | At project close (too late) | Real-time per milestone |
| Cross-project intelligence | Zero (every estimate from scratch) | RAG-powered pattern matching |
| Compliance audit prep | 2–3 weeks manual | Continuous + auditable |

### 2.3 Why Existing Solutions Fail

| Tool | Gap |
|---|---|
| Rework.com | Generic SMB ops platform; no CAD, no construction-specific BOM, no PH compliance |
| Procore | US-centric, expensive, doesn't handle PH retention/progress billing |
| Buildertrend | Residential focus, not commercial MEP/fit-out |
| Excel + Google Drive | Current state — the problem |
| Generic ERP (SAP, Oracle) | Overkill, 18-month implementations, no construction workflow |

---

## 3. Goals & Non-Goals

### 3.1 Goals

**G1. CAD-to-Cost Pipeline.** Drop a DXF file → system extracts scope items, generates draft BOM, computes preliminary TCV/GP within 5 minutes.

**G2. Single Source of Truth.** Every project lives in one record from first lead to final billing. No external spreadsheets.

**G3. Real-Time Pipeline Visibility.** Leadership dashboard shows pipeline TCV, GP, stage distribution, weighted forecast — refreshed continuously, not weekly.

**G4. Philippine Compliance by Default.** BIR 2307, retention computation, progress billing, withholding tax on subcontractors, PCAB documentation — built into the schema, not bolted on.

**G5. Cross-Project Intelligence.** Every project completed makes the next estimate faster and more accurate via RAG over historical project data.

**G6. Audit-Ready.** Append-only audit log with SHA256 hash chain. Every cost line, approval, document version traceable.

### 3.2 Non-Goals (v1)

- ❌ Replacing AutoCAD or BIM tools (we consume their output, we don't compete)
- ❌ 3D visualization or BIM clash detection
- ❌ Mobile-first field execution (Phase 3+; v1 is desktop-primary)
- ❌ Replacing accounting software (we integrate with QuickBooks/Xero, not replace)
- ❌ Multi-currency (PHP only in v1)
- ❌ Multi-country (PH-only in v1; SEA expansion is a separate initiative)

---

## 4. Success Metrics

### 4.1 North Star

**Time from blueprint upload to leadership-reviewable estimate.** Target: under 4 hours (from current 1–2 days).

### 4.2 Supporting Metrics

| Tier | Metric | Target | Measured Via |
|---|---|---|---|
| Adoption | DAU / Total Licensed Users | ≥ 70% | Auth logs |
| Adoption | Avg projects in system per active firm | ≥ 8 | DB query |
| Activation | Time to first BOM generated | < 24 hrs from onboarding | Funnel event |
| Engagement | DXF uploads per week | ≥ 5 per firm | Storage events |
| Quality | Estimator override rate on auto-BOM | < 30% | BOM diff tracking |
| Quality | Pipeline accuracy (forecast vs actual) | ±15% at 30-day horizon | Variance report |
| Reliability | API p95 latency | < 400ms | OpenTelemetry |
| Reliability | Uptime | 99.9% | Pingdom + status page |
| Business | Net Revenue Retention | ≥ 110% | Billing system |

### 4.3 Anti-Metrics (Things We Watch, Don't Optimize)

- Number of features shipped (vanity)
- Lines of code (vanity)
- AI tokens consumed (cost, not value)

---

## 5. User Personas

### 5.1 Primary Personas

#### P1. The Estimator — "Marlon"
- **Role:** Senior Estimator, 12 years experience
- **Tools today:** AutoCAD LT, Excel, calculator
- **Daily pain:** Reads 50+ page DXF drawings, manually counts FCUs, manually computes ceiling area per room, builds BOM line-by-line
- **What he wants:** Auto-extracted scope, his trusted unit costs preserved, ability to override anything
- **What he fears:** AI making mistakes he gets blamed for; losing his expertise to a tool

#### P2. The Sales Rep / BDM — "Madine, Zarrah, Home"
- **Role:** Business Development Manager, owns Coverage + Conversion accounts
- **Tools today:** Excel pipeline tracker, email, manual quote-to-PDF
- **Daily pain:** No visibility into which deals the estimator is processing; blind to margin until contract sent
- **What she wants:** Live pipeline, deal velocity signals, weighted forecast
- **What she fears:** Numbers being shared with leadership before she's reviewed them

#### P3. The Project Manager — "Engr. Reyes"
- **Role:** Site PM, runs 3–4 active projects simultaneously
- **Tools today:** Printed BOM, viber group chats, site Excel
- **Daily pain:** Material delivered late, scope creep untracked, billing milestones missed
- **What he wants:** BOM available on tablet at site, real-time PO status, milestone alerts

#### P4. The CFO / Owner — "Mr. Yang"
- **Role:** Founder / CFO, makes go/no-go on every deal above ₱5M
- **Tools today:** Weekly Excel rollup from PMs, gut feel
- **Daily pain:** Always 2 weeks behind on what's actually happening
- **What he wants:** One screen, all projects, GP erosion alerts, weighted pipeline

### 5.2 Secondary Personas

- **P5. Procurement Officer** — needs PO generation from approved BOMs
- **P6. Compliance Officer** — needs audit trail, BIR-ready documentation
- **P7. External Auditor** — needs read-only access to project records during annual audit

---

## 6. User Journeys

### 6.1 Critical Path: Lead to Closed Won

```
Lead created (Coverage)
    ↓ qualified
Move to Conversion → Opportunity Creation stage
    ↓ DXF received
Estimator uploads drawing → Auto-scope extraction runs
    ↓ ~5 minutes
Estimator reviews, adjusts → Approves draft BOM
    ↓
System computes TCV / GP / Margin → Sales rep notified
    ↓
Sales rep reviews → Sends proposal (PDF auto-generated)
    ↓
Stage progresses: Scoping → BOM Submission → Negotiation
    ↓
Won → Project record created → BOM locked → Procurement triggered
    ↓
Execution phase begins
```

### 6.2 Critical Path: DXF Upload to Draft BOM

```
1. User drops .DXF into Project Workspace
2. Background job (Inngest/Trigger.dev) parses via ezdxf
3. Extract: layers, text annotations, block references, dimensions
4. Map to scope_items table:
   - Room labels → scope.location
   - Ceiling heights → scope.spec
   - Equipment blocks (FCU, breakers) → scope.material
   - Polyline areas → scope.quantity
5. RAG query: "find similar past scope items" → suggest unit costs
6. Generate draft BOM with confidence scores per line
7. Notify estimator → review queue
```

### 6.3 Critical Path: Real-Time Dashboard

```
Any data mutation in projects/scope_items/billing
    ↓
Postgres trigger → publish to Supabase Realtime channel
    ↓
Dashboard subscribes via WebSocket
    ↓
React Query invalidates affected queries
    ↓
UI re-renders affected widgets only (no full reload)
```

---

## 7. Key Features (Phased Roadmap)

### Phase 1 — Foundation (Weeks 1–8)

#### F1.1 Authentication & Multi-Tenancy
- Supabase Auth with email/password, Google OAuth
- `tenant_id` on every table, RLS policies enforce isolation
- Role-based permissions: Owner, Admin, Estimator, Sales, PM, Viewer

#### F1.2 Project Workspace
- Create/edit projects with metadata (client, location, project type, value range)
- File storage (DXF, PDF, images) via Supabase Storage
- Comments, activity feed, @mentions

#### F1.3 Sales Pipeline (Coverage + Conversion)
- Coverage table: lead, account, opportunity type, area sqm, expected TCV/GP
- Conversion table: stage, probability, closing date, weighted pipeline
- Stages: Opportunity Creation → Scoping → BOM Submission → Resubmission → Negotiation → Closed Won/Lost
- Stage transitions logged in audit trail
- Per-rep ownership and reassignment

#### F1.4 Executive Dashboard
- KPI cards: Active Pipeline TCV/GP, Closed Won, Active Deals, Coverage Leads
- Per-rep scorecard: Active TCV/GP, GP Margin, Won/Lost, Conv Rate, Weighted Pipeline, Avg Deal Size
- Stage distribution table with TCV/GP per stage per rep
- Closed Won / Lost summary
- Real-time updates via Supabase Realtime

#### F1.5 Document Management
- Upload, version, archive
- Tag by project, type (DXF, contract, BOM, invoice, PO)
- Preview in-browser (PDF, images)

### Phase 2 — CAD Integration (Weeks 9–14)

#### F2.1 DXF Parser Service
- Server-side worker (Railway, Python + ezdxf)
- Extract layers, text, blocks, dimensions, polylines
- Support AutoCAD R12 through 2024 formats
- File size limit: 100MB per upload, 500MB per project

#### F2.2 Auto-Scope Extraction
- Map DXF entities to scope_items
- Recognize standard MEP blocks (FCU, breakers, lighting fixtures)
- Compute area from polylines per room
- Aggregate by floor, room, equipment type
- Confidence scores per extracted item

#### F2.3 BOM Builder
- Draft BOM auto-generated from extracted scope
- Estimator review interface with diff view (extracted vs edited)
- Line-item override with reason logging
- Unit cost library (per material, per labor type)
- Markup rules (project-level, line-level)
- Lock/unlock states tied to deal stage

### Phase 3 — Execution Layer (Weeks 15–22)

#### F3.1 Procurement
- PO generation from approved BOMs
- Vendor management
- PO approval workflow
- Delivery tracking

#### F3.2 Cost Tracking
- Actual vs budgeted per scope item
- Per-floor cost rollup
- GP erosion alerts (threshold-based)
- Variance reporting

#### F3.3 Progress Billing
- Milestone-based billing aligned with PH industry standard
- Retention computation (typically 10%)
- BIR 2307 generation
- Withholding tax on subcontractors
- Sales invoice numbering (BIR-compliant series)

### Phase 4 — Intelligence Layer (Weeks 23–30)

#### F4.1 RAG over Historical Projects
- Embed all DXF text annotations, BOMs, contracts, invoices
- pgvector storage in Supabase
- Semantic search across all firm history
- "Find similar past projects" feature
- "What did we charge for this last time" suggestions

#### F4.2 AI Estimating Assistant
- New blueprint uploaded → AI surfaces 3–5 most similar past projects
- Pre-populates BOM line items with historical unit costs (adjusted for inflation)
- Confidence scores on each suggestion
- Estimator reviews and accepts/rejects per line

#### F4.3 Conversational Query
- Chat interface: "What was the GP margin on Somnus Studios last year?"
- Returns answer with cited source documents
- All queries logged for audit

### Phase 5 — Mobile & Field (Future)

- React Native / Expo app for site PMs
- Offline-first BOM access
- Photo upload tied to scope items
- Barcode/QR scanning for material delivery

---

## 8. System Architecture

### 8.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  CLIENT TIER                                                 │
│  Next.js 15 (App Router) on Vercel                          │
│  shadcn/ui · Tailwind v4 · React Query · Zustand            │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / WSS
┌──────────────────────────┴──────────────────────────────────┐
│  EDGE TIER                                                   │
│  Vercel Edge Functions · Middleware · Auth Guards           │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────┴──────────────────────────────────┐
│  APPLICATION TIER                                            │
│  Next.js Route Handlers · Server Actions                    │
│  Drizzle ORM · Zod validation · tRPC                        │
└────┬────────────┬────────────┬────────────┬─────────────────┘
     │            │            │            │
┌────┴───┐  ┌────┴────┐  ┌────┴────┐  ┌───┴──────────┐
│Supabase│  │ Railway │  │ OpenAI  │  │ Inngest      │
│Postgres│  │ DXF     │  │ Embed + │  │ Background   │
│+pgvect │  │ Parser  │  │ Chat    │  │ Jobs         │
│+RLS    │  │ (Python)│  │ APIs    │  │              │
│+Realtim│  │         │  │         │  │              │
│+Auth   │  │         │  │         │  │              │
│+Storag │  │         │  │         │  │              │
└────────┘  └─────────┘  └─────────┘  └──────────────┘
```

### 8.2 Stack Decisions

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js 15 + App Router | Kurt's standard stack; SSR + RSC for SEO + perf |
| UI | shadcn/ui + Tailwind v4 | Copy-paste components, full control, no lock-in |
| State | React Query + Zustand | Server state + client state, both battle-tested |
| ORM | Drizzle | Type-safe, SQL-first, plays well with Supabase |
| DB | Supabase Postgres | RLS, Realtime, pgvector, Auth, Storage in one |
| Auth | Supabase Auth | Built-in, JWT-based, RLS-aware |
| Background jobs | Inngest | Reliable, observable, TypeScript-native |
| DXF Parser | Railway + Python (ezdxf) | Python ecosystem for CAD is unmatched |
| LLM | OpenAI API + Anthropic Claude API | Multi-provider for resilience |
| Embeddings | OpenAI text-embedding-3-small | Cheap, fast, good enough for retrieval |
| Vector DB | pgvector in Supabase | No extra infra; same RLS model |
| Hosting (FE) | Vercel | Kurt's standard; Next.js optimized |
| Hosting (Workers) | Railway | Long-running Python jobs |
| Observability | Sentry + Axiom + Better Stack | Errors + logs + uptime |
| Email | Resend | Developer-friendly, good deliverability |
| Payments (future) | Stripe | When SaaS billing is enabled |

### 8.3 Multi-Tenancy Model

**Pattern:** Single database, shared schema, tenant-isolated rows.

```sql
-- Every table has tenant_id and is RLS-protected
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  -- ... other fields
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

CREATE POLICY tenant_isolation ON projects
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
```

### 8.4 Data Model (Core Tables)

```
tenants                  users (membership)
   ↓                        ↓
projects ──┬── scope_items ──── boms ──── bom_line_items
           ├── opportunities (sales pipeline)
           ├── documents (DXF, PDF, images)
           ├── change_orders
           ├── purchase_orders ──── po_line_items ──── vendors
           ├── invoices ──── invoice_line_items
           └── audit_log (append-only, hash-chained)

embeddings (pgvector) — references documents/scope_items/boms
```

### 8.5 Audit Log (Hash-Chained)

```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  actor_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- create, update, delete, approve, etc.
  diff JSONB NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL, -- SHA256(prev_hash || row_content)
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- No UPDATE or DELETE permitted; INSERT only
```

---

## 9. Folder Structure

```
third-code-erp/
├── apps/
│   ├── web/                          # Next.js 15 frontend
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/page.tsx
│   │   │   │   └── signup/page.tsx
│   │   │   ├── (dashboard)/
│   │   │   │   ├── layout.tsx        # Auth-protected shell
│   │   │   │   ├── page.tsx          # Executive dashboard
│   │   │   │   ├── projects/
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── new/page.tsx
│   │   │   │   │   └── [id]/
│   │   │   │   │       ├── page.tsx
│   │   │   │   │       ├── bom/page.tsx
│   │   │   │   │       ├── documents/page.tsx
│   │   │   │   │       └── billing/page.tsx
│   │   │   │   ├── pipeline/
│   │   │   │   │   ├── coverage/page.tsx
│   │   │   │   │   └── conversion/page.tsx
│   │   │   │   ├── procurement/
│   │   │   │   ├── reports/
│   │   │   │   └── settings/
│   │   │   ├── api/
│   │   │   │   ├── trpc/[trpc]/route.ts
│   │   │   │   ├── webhooks/
│   │   │   │   │   ├── inngest/route.ts
│   │   │   │   │   └── supabase/route.ts
│   │   │   │   └── upload/route.ts
│   │   │   ├── layout.tsx
│   │   │   └── globals.css
│   │   ├── components/
│   │   │   ├── ui/                   # shadcn primitives
│   │   │   ├── dashboard/
│   │   │   ├── pipeline/
│   │   │   ├── bom/
│   │   │   ├── projects/
│   │   │   └── shared/
│   │   ├── lib/
│   │   │   ├── auth.ts
│   │   │   ├── db/                   # Drizzle client
│   │   │   ├── supabase/             # Supabase clients (server, browser, admin)
│   │   │   ├── trpc/
│   │   │   └── utils.ts
│   │   ├── hooks/
│   │   ├── stores/                   # Zustand stores
│   │   ├── types/
│   │   ├── public/
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   └── package.json
│   │
│   └── workers/                      # Railway Python services
│       ├── dxf-parser/
│       │   ├── src/
│       │   │   ├── main.py           # FastAPI entrypoint
│       │   │   ├── parsers/
│       │   │   │   ├── ezdxf_extractor.py
│       │   │   │   ├── layer_classifier.py
│       │   │   │   ├── block_recognizer.py
│       │   │   │   └── area_calculator.py
│       │   │   ├── models/
│       │   │   ├── services/
│       │   │   └── utils/
│       │   ├── tests/
│       │   ├── Dockerfile
│       │   ├── pyproject.toml
│       │   └── railway.toml
│       │
│       └── rag-indexer/
│           ├── src/
│           │   ├── main.py
│           │   ├── chunkers/
│           │   ├── embedders/
│           │   └── indexers/
│           ├── Dockerfile
│           └── pyproject.toml
│
├── packages/
│   ├── database/                     # Shared Drizzle schema
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── tenants.ts
│   │   │   │   ├── users.ts
│   │   │   │   ├── projects.ts
│   │   │   │   ├── opportunities.ts
│   │   │   │   ├── scope-items.ts
│   │   │   │   ├── boms.ts
│   │   │   │   ├── documents.ts
│   │   │   │   ├── procurement.ts
│   │   │   │   ├── invoices.ts
│   │   │   │   ├── audit-log.ts
│   │   │   │   └── index.ts
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── package.json
│   │
│   ├── shared-types/                 # Zod schemas + TS types
│   │   ├── src/
│   │   │   ├── opportunities.ts
│   │   │   ├── scope.ts
│   │   │   ├── bom.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── ui/                           # Shared component library
│   ├── auth/                         # Auth helpers (server + client)
│   ├── ai/                           # LLM + RAG helpers
│   │   ├── src/
│   │   │   ├── providers/
│   │   │   │   ├── openai.ts
│   │   │   │   └── anthropic.ts
│   │   │   ├── rag/
│   │   │   │   ├── retrieve.ts
│   │   │   │   └── synthesize.ts
│   │   │   └── prompts/
│   │   └── package.json
│   │
│   └── config/                       # Shared eslint, tsconfig, tailwind
│
├── infra/
│   ├── github-actions/               # CI/CD workflows
│   ├── docker/
│   └── scripts/
│       ├── db-migrate.sh
│       ├── seed-dev.sh
│       └── deploy.sh
│
├── docs/
│   ├── architecture/
│   ├── runbooks/
│   ├── adrs/                         # Architecture Decision Records
│   └── api/
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── security-scan.yml
│       └── deploy.yml
│
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── README.md
```

---

## 10. Security & DevSecOps

### 10.1 Threat Model

| Threat | Mitigation |
|---|---|
| Tenant data leakage | RLS on every table; verified via automated tests |
| SQL injection | Drizzle parameterized queries; no string concatenation in SQL |
| XSS | React escapes by default; CSP headers; sanitize user-generated HTML in comments |
| CSRF | Same-site cookies; state tokens on mutations |
| Secrets in repo | gitleaks pre-commit + GitHub secret scanning |
| Dependency vulns | Dependabot + Snyk; weekly scan; auto-PR for patches |
| Compromised user account | Mandatory MFA for Owner/Admin; session revocation; suspicious login alerts |
| Insider threat | Append-only audit log with hash chain; no admin can modify history |
| File upload attacks | Magic byte validation; antivirus scan via ClamAV; sandboxed parser |
| Prompt injection (RAG) | Strict context boundaries; never let user input drive system prompts |

### 10.2 Defense in Depth

**Layer 1 — Network**
- Cloudflare in front of Vercel (DDoS, WAF)
- Rate limiting at edge: 100 req/min per IP unauthenticated, 1000 req/min authenticated
- Geofencing (PH + allowlist) for admin endpoints

**Layer 2 — Application**
- Helmet equivalent headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options)
- Input validation via Zod on every endpoint
- Output encoding by default (React)
- File upload limits enforced at edge

**Layer 3 — Data**
- RLS policies on every table
- Encryption at rest (Supabase default)
- Encryption in transit (TLS 1.3 minimum)
- PII fields (TIN, SSS, etc.) encrypted application-side using KMS
- Database backups encrypted, retained 30 days

**Layer 4 — Identity**
- Supabase Auth with JWT
- httpOnly, secure, sameSite=strict cookies for session
- MFA required for Owner/Admin/Compliance roles
- Session timeout: 12hrs idle, 7 days absolute
- Password policy: 12+ chars, breached password check via HIBP API

**Layer 5 — Audit**
- Every mutation logged with actor, timestamp, before/after diff, hash chain
- Audit log queryable by Compliance role, read-only
- Quarterly access review

### 10.3 CI/CD Pipeline

```yaml
# .github/workflows/ci.yml (conceptual)

on: [pull_request, push to main]

jobs:
  - lint: eslint + prettier --check
  - typecheck: tsc --noEmit (all packages)
  - test-unit: vitest run
  - test-integration: vitest with Supabase test instance
  - test-e2e: Playwright against preview deployment
  - security:
      - gitleaks (secret detection)
      - snyk test (dependency vulns)
      - semgrep (SAST rules)
      - trivy (Docker image scan)
  - build: turbo run build
  - preview-deploy: Vercel preview URL on PR
  - production-deploy: only on merge to main, requires 2 approvals
```

### 10.4 Secrets Management

- **Local dev:** `.env.local` in gitignore; provided via 1Password CLI
- **Staging/Prod:** Vercel Environment Variables (encrypted at rest)
- **Worker secrets:** Railway env vars
- **Rotation:** Quarterly mandatory; documented in runbook
- **Never:** API keys in client-side code; everything sensitive is server-only

### 10.5 Compliance Posture

| Framework | Status | Notes |
|---|---|---|
| RA 10173 (Data Privacy Act PH) | In scope | DPO assigned; privacy policy; data subject request workflow |
| BIR e-Invoice readiness | In scope | Invoice numbering, format compliance |
| SOC 2 Type II | Aspirational | Year 2 goal once enterprise customers ask |
| ISO 27001 | Future | When SEA expansion happens |

---

## 11. RAG & AI Systems

### 11.1 Architecture

```
DOCUMENT INGESTION
  DXF / PDF / Images uploaded
       ↓
  Inngest event: document.uploaded
       ↓
  rag-indexer worker pulls file
       ↓
  Extract text:
    - DXF: ezdxf annotation extraction
    - PDF: pdfplumber / unstructured.io
    - Images: GPT-4 Vision OCR
       ↓
  Chunk (semantic, ~512 tokens with 50-token overlap)
       ↓
  Embed via OpenAI text-embedding-3-small
       ↓
  Store in Supabase pgvector
    embeddings (id, tenant_id, source_id, source_type,
                chunk_text, embedding vector(1536),
                metadata JSONB)
       ↓
  Index ready for retrieval

QUERY TIME
  User asks question OR new project triggers similarity search
       ↓
  Embed query
       ↓
  pgvector cosine similarity (with tenant_id RLS)
       ↓
  Retrieve top-K chunks (K=8 default)
       ↓
  Re-rank with cross-encoder (optional, Phase 4.2+)
       ↓
  Construct prompt with retrieved context
       ↓
  LLM call (Claude Sonnet for accuracy, GPT-4o-mini for speed)
       ↓
  Stream response with source citations
       ↓
  Log query, retrieved sources, response (for audit + eval)
```

### 11.2 Retrieval Strategy

| Use Case | Retrieval Method | Top-K | LLM |
|---|---|---|---|
| "Find similar projects" | Hybrid (vector + metadata filter on project_type, area_range) | 5 | None — return projects directly |
| "What did we charge for X" | Vector over BOM line items + reranking | 10 → 3 | GPT-4o-mini |
| Conversational Q&A | Vector over all docs + reranking | 8 → 4 | Claude Sonnet |
| Auto-BOM suggestion | Vector over scope_items, filtered by similar project_type | 10 | None — direct line item suggestions |

### 11.3 Guardrails

**Never:**
- Send PII (TIN, SSS, addresses, salaries) to external LLMs without redaction
- Let user input override system prompts (template injection prevention)
- Auto-execute mutations based on LLM output without human approval
- Cite sources from other tenants

**Always:**
- Cite source documents with chunk IDs
- Log every prompt + response for audit
- Return confidence scores
- Provide "I don't know" path when retrieval is weak

### 11.4 Eval Harness

```
Maintain a labeled dataset of:
  - 50 representative queries
  - Expected retrieved sources
  - Expected answer keypoints

Run nightly:
  - Recall@K
  - Mean Reciprocal Rank
  - Answer faithfulness (LLM-as-judge against expected keypoints)
  - Latency p50/p95/p99

Block deploy if:
  - Recall@5 drops > 5% from baseline
  - Answer faithfulness drops > 3%
  - p95 latency > 4 seconds
```

### 11.5 Cost Controls

- Embedding cache (skip re-embedding unchanged chunks)
- Prompt caching (Anthropic, OpenAI)
- LLM tier routing (cheap model for simple, expensive for complex)
- Token budget per tenant per month with soft/hard limits
- Daily cost dashboard for ops review

---

## 12. UI/UX Layout

### 12.1 Design Principles

1. **Dense over sparse.** Construction professionals want information density, not whitespace luxury. We're not a consumer app.
2. **Tables are first-class.** Most workflows are list/table operations. Tables must be world-class — sortable, filterable, virtualized, sticky headers.
3. **Numbers right-aligned, labels left-aligned.** Always.
4. **No emojis in production UI.** Save them for casual contexts.
5. **One color of primary action per screen.** Avoid rainbow CTAs.
6. **Status by tone, not just color.** Success/warning/error must work in grayscale (icon + label, not just hue).
7. **Skeleton over spinner.** Loading states should preserve layout.
8. **Optimistic UI for low-risk mutations.** Don't make users wait for round-trips.

### 12.2 Design System

**Foundations:**
- **Type:** Inter (UI), JetBrains Mono (numbers, code)
- **Color tokens:**
  - Surface: white, neutral-50, neutral-100
  - Text: neutral-900 (primary), neutral-600 (secondary), neutral-400 (tertiary)
  - Brand: navy-700 (#1F3864) — primary action
  - Accent: blue-600
  - Semantic: green-700 (positive), red-700 (negative), amber-700 (warning)
- **Spacing:** 4px base, 8/12/16/24/32/48 scale
- **Radii:** 6px default, 8px cards, full for pills
- **Shadows:** subtle only — sm and md, no glow effects

**Components (built on shadcn/ui):**
- DataTable (with column resize, sort, filter, virtualization)
- KpiCard (label, value, delta, sparkline)
- StagePipeline (kanban-like, drag to advance)
- DocumentViewer (PDF, DXF preview)
- BomLineEditor (inline edit, autosave)
- AuditTrail (timeline component)
- CommandMenu (global ⌘K)

### 12.3 Layout Patterns

**Shell:**
```
┌────────────────────────────────────────────────────────┐
│ Top Bar: logo · search ⌘K · notifications · avatar    │
├──────┬─────────────────────────────────────────────────┤
│      │                                                  │
│ Side │  Main content area                              │
│ Nav  │  - max-width 1440px                             │
│      │  - 24px gutter                                  │
│      │                                                  │
│      │                                                  │
└──────┴─────────────────────────────────────────────────┘
```

**Side nav sections:**
- Dashboard
- Projects
- Pipeline (Coverage / Conversion)
- Procurement
- Reports
- Documents
- Settings

### 12.4 Key Screens

#### Dashboard (Landing)
- Top: 5 KPI cards (TCV, GP, Won, Active Deals, Coverage Leads)
- Mid: Per-rep scorecard table
- Mid: Stage distribution table
- Bottom: Recent activity feed
- Right rail: Alerts (GP erosion, stalled deals, overdue milestones)

#### Project Detail
- Tabs: Overview · Scope · BOM · Documents · Billing · Audit
- Header: project meta + status + quick actions
- Sticky right rail: AI assistant ("Ask anything about this project")

#### BOM Builder
- Three-pane layout:
  - Left: Scope tree (rooms, floors, systems)
  - Center: Line item editor (virtualized table)
  - Right: AI suggestions ("Similar past projects suggest these unit costs")
- Bottom bar: total TCV/GP, save state, version

#### Pipeline
- Kanban columns per stage OR table view (toggle)
- Drag to advance stage (with confirmation modal)
- Filter by rep, value range, age in stage

### 12.5 Accessibility

- WCAG 2.1 AA target
- Keyboard navigation everywhere (no mouse-only flows)
- ARIA labels on icon-only buttons
- Focus rings visible
- Screen reader tested with VoiceOver and NVDA
- Color contrast ratios verified (4.5:1 text, 3:1 large)

### 12.6 Responsive Behavior

- Desktop-first (1280px primary breakpoint)
- Tablet supported (1024px) — same layout, narrower
- Mobile: read-only views in v1; full mobile app in Phase 5

---

## 13. QA / Debugging / Observability

### 13.1 Testing Pyramid

```
                    /\
                   /E2E\        — Playwright, 20 critical user journeys
                  /─────\
                 /Integ. \      — vitest + Supabase test instance, ~200 tests
                /─────────\
               /   Unit    \    — vitest, 1000+ tests, 80% coverage gate
              /─────────────\
```

**Coverage gates (CI):**
- Unit: ≥ 80% lines, ≥ 70% branches
- Critical paths (auth, billing, BOM mutations, RLS): 100%

### 13.2 E2E Critical Paths

1. Sign up → onboard → create first project
2. Upload DXF → wait for parse → review draft BOM → approve
3. Move opportunity through all stages → close won
4. Generate PO from approved BOM → mark received
5. Create progress billing invoice → export to PDF
6. RAG query: "find similar past projects" → verify results
7. Tenant isolation: User A cannot see User B's data
8. Audit log: every mutation appears within 5 seconds

### 13.3 Observability Stack

**Errors:** Sentry
- Frontend + backend + workers
- Source maps uploaded on every deploy
- Issue assignment by code-owner mapping

**Logs:** Axiom (or Better Stack)
- Structured JSON logs
- Trace IDs propagated end-to-end
- Retention: 30 days hot, 1 year cold

**Metrics:** OpenTelemetry → Grafana Cloud
- API latency (p50, p95, p99) per route
- DB query latency per table
- Background job success/failure rates
- LLM token usage per tenant

**Uptime:** Better Stack
- 1-minute checks on /health
- Public status page
- PagerDuty integration

### 13.4 SLOs

| Service | SLO | Error Budget |
|---|---|---|
| Web app uptime | 99.9% | 43 min/month |
| API p95 latency | < 400ms | 5% of requests over budget |
| DXF parse success | > 95% | Drift triggers parser review |
| RAG p95 latency | < 4s | Drift triggers retrieval tuning |

### 13.5 Debugging Tooling

**Local dev:**
- Drizzle Studio (DB explorer)
- Supabase local dev with Docker
- Inngest dev server (local job runner)
- Storybook for components

**Production debugging:**
- Sentry Replay (frontend session replay on errors)
- Trace viewer (OTel-backed)
- Read-only DB role for support engineers
- Time-travel via audit log diffs

### 13.6 Runbooks

Located in `/docs/runbooks/`. Required for every production-impacting service.

Examples:
- `dxf-parser-crashloop.md`
- `rag-query-timeout.md`
- `billing-invoice-failure.md`
- `tenant-data-export.md`
- `incident-response.md`

### 13.7 Incident Response

**Severity tiers:**
- **SEV-1:** Production down, data loss, security breach. Page on-call immediately. War room within 15 min.
- **SEV-2:** Major feature broken, affecting > 25% of users. Respond within 1hr.
- **SEV-3:** Minor degradation. Respond within 4hr.
- **SEV-4:** Cosmetic. Backlog.

**Postmortem required:** all SEV-1 and SEV-2. Blameless. Published in `/docs/postmortems/`.

---

## 14. Compliance (Philippines)

### 14.1 BIR (Bureau of Internal Revenue)

- Sales invoice numbering: continuous, no gaps, BIR-registered series
- 12% VAT computation on taxable sales
- BIR Form 2307 generation for withholding tax on contractor payments
- Books of accounts: subsidiary sales journal, subsidiary purchases journal
- e-Invoice readiness for when BIR mandates it

### 14.2 PCAB (Philippine Contractors Accreditation Board)

- License number stored per tenant
- Project value tracking aligned with PCAB category limits
- Documentation export for license renewal

### 14.3 Data Privacy Act (RA 10173)

- DPO contact stored at tenant level
- Privacy policy and consent tracking
- Data subject requests workflow (access, rectification, deletion)
- Breach notification process (72-hour rule)

### 14.4 Industry Standard Practices

- Retention: 10% standard, configurable per project
- Progress billing: percentage of completion method
- Down payment / mobilization fee tracking
- Liquidated damages computation

---

## 15. Rollout Plan

### 15.1 Engineering Phases

| Phase | Duration | Deliverable | Validation |
|---|---|---|---|
| 0. Foundation | 2 weeks | Repo, CI/CD, schema, auth, RLS | Internal walkthrough |
| 1. Core ERP | 8 weeks | Projects, pipeline, dashboard, docs | Pilot with one client |
| 2. CAD Integration | 6 weeks | DXF parser, auto-scope, BOM | Pilot client + 2 design partners |
| 3. Execution | 8 weeks | Procurement, cost tracking, billing | 5 paying customers |
| 4. RAG / AI | 8 weeks | Embeddings, retrieval, AI assistant | Eval harness + customer feedback |
| 5. Mobile / Field | TBD | iOS + Android via Expo | Field PM testing |

### 15.2 Go-to-Market

- **Design partners (Phase 1–2):** Current Third Code Solutions construction
  client; 1–2 referrals; free in exchange for feedback + case study
- **Pilot pricing (Phase 3):** ₱45,000–80,000/month per firm based on user count
- **GA pricing (Phase 4):** Tiered by user count + project volume + AI usage
- **Sales motion:** Founder-led, ABM into mid-market PH construction (50–500 employees)

### 15.3 Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| DXF parser accuracy below acceptable | Medium | High | Manual review queue; estimator override; eval harness |
| Client AutoCAD files too messy to parse | High | Medium | Onboarding requires layer-naming standards; provide templates |
| Token cost spirals on RAG | Medium | Medium | Per-tenant budgets; aggressive caching; tier routing |
| Solo founder bottleneck | High | High | Document everything; hire when 5+ paying customers |
| Competitor (Procore, etc.) enters PH | Low | High | Move fast on PH compliance moat |
| Supabase pricing tier exceeded | Medium | Low | Monitor; migrate to dedicated Postgres if needed |

---

## 16. Open Questions

1. **Pricing model:** Per-user vs per-project vs flat tiered? Current lean: tiered with user + project caps.
2. **DXF format coverage:** Should we invest in DWG (proprietary) parsing, or hold to DXF only? Most clients can export DXF.
3. **Mobile in v1:** Read-only mobile dashboard via responsive web — sufficient, or push for native?
4. **Multi-language:** Tagalog UI option — required for adoption, or English fine?
5. **Accounting integration depth:** Full GL sync with QuickBooks/Xero, or just export-friendly?
6. **AI provider lock-in:** Single provider for simplicity, or always multi-provider?
7. **Open-source components:** Anything we'd commit to OSS for credibility? (e.g., DXF parser library)

---

## 17. Appendix

### 17.1 Glossary

- **TCV** — Total Contract Value
- **GP** — Gross Profit
- **BOM** — Bill of Materials
- **MEP** — Mechanical, Electrical, Plumbing
- **FCU** — Fan Coil Unit (HVAC)
- **PO** — Purchase Order
- **RLS** — Row-Level Security
- **RAG** — Retrieval-Augmented Generation
- **DXF** — Drawing Exchange Format (AutoCAD)
- **PCAB** — Philippine Contractors Accreditation Board
- **BIR** — Bureau of Internal Revenue
- **CSC** — Civil Service Commission

### 17.2 Reference Architecture Decisions (ADRs)

To be authored in `/docs/adrs/`:
- ADR-001: Why Drizzle over Prisma
- ADR-002: Why Inngest over BullMQ
- ADR-003: Why pgvector over Pinecone
- ADR-004: Why Railway for Python workers
- ADR-005: Multi-tenant pattern selection
- ADR-006: Audit log hash chain design

### 17.3 Out of Scope (Explicit)

- Replacing AutoCAD or Revit
- General accounting (we integrate, not replace)
- HR / Payroll (separate product line)
- Equipment rental tracking (Phase 5+)
- Subcontractor portal (Phase 5+)
- Client portal (Phase 5+)

---

**End of Document**

*This PRD is a living document. Material changes require sign-off from CTO and CEO.*
