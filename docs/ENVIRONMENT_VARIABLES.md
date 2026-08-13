# Environment Variables

Every variable consumed by ABI OPS, grouped by service. Variables
marked `public` are exposed to the browser bundle (Next.js
`NEXT_PUBLIC_` prefix). Everything else is server-only.

Copy `.env.example` to `.env.local` for local development. In
production, set these in Vercel (web), Railway (workers), and Supabase
(edge functions) as appropriate.

---

## Supabase

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | public | `Settings → API → Project URL` | API base URL the browser hits |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | public | `Settings → API → anon public` | RLS-scoped client key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | server | `Settings → API → service_role` | Bypasses RLS; used by server actions, Inngest jobs, and storage admin |
| `SUPABASE_JWT_SECRET` | no | server | `Settings → API → JWT secret` | Only needed if verifying tokens outside Supabase SDK |

---

## Auth & Site

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | yes | public | Your configured production domain | Used to build portal links in emails and signed share URLs |
| `AUTH_TRUSTED_HOSTS` | no | server | Comma-separated host list | Adds extra hostnames the redirect allowlist accepts |

---

## ERP Core API

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `ERP_CORE_API_URL` | no | server | Railway/Nest ERP Core service URL | Server-to-server URL for typed process-health and migration-path commands; never exposed to the browser |
| `ERP_PROJECT_WRITES_VIA_API` | no | server | `false` by default | Exact `true` plus `ERP_PROJECT_WRITES_VIA_API_TENANT_IDS` selects the Nest Project writer |
| `ERP_RFQ_QUOTE_WRITES_VIA_API` | no | server | `false` by default | Exact `true` plus `ERP_RFQ_QUOTE_WRITES_VIA_API_TENANT_IDS` selects the Nest RFQ quote writer |
| `ERP_RFQ_TRANSITION_WRITES_VIA_API` | no | server | `false` by default | Exact `true` plus `ERP_RFQ_TRANSITION_WRITES_VIA_API_TENANT_IDS` selects the Nest RFQ complete/cancel writer |
| `ERP_RFQ_AWARD_WRITES_VIA_API` | no | server | `false` by default | Exact `true` plus `ERP_RFQ_AWARD_WRITES_VIA_API_TENANT_IDS` selects the Nest RFQ quote-award writer |

When unset or unavailable, the web app renders an explicit unavailable state and
does not substitute synthetic process metrics.

All migration-path flags fail closed when the tenant allowlist is empty,
malformed, or not an exact UUID match. Keep them disabled until the canary,
monitoring, and rollback gates are approved.

---

## OpenAI

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `OPENAI_API_KEY` | yes | server | `platform.openai.com → API keys` | Embeddings + chat completions for RAG suggestions and AI assistant |
| `OPENAI_EMBEDDING_MODEL` | no | server | Defaults to `text-embedding-3-small` | Override if you want to A/B another embedder |
| `OPENAI_CHAT_MODEL` | no | server | Defaults to `gpt-4o-mini` | Override for higher-quality answers (costlier) |
| `ANTHROPIC_API_KEY` | no | server | `console.anthropic.com` | Optional fallback provider for `packages/ai` |

---

## Inngest

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `INNGEST_EVENT_KEY` | yes | server | `app.inngest.com → Manage → Event Keys` | Sends events from server actions |
| `INNGEST_SIGNING_KEY` | yes | server | `app.inngest.com → Manage → Signing Key` | Verifies webhooks at `/api/webhooks/inngest` |
| `INNGEST_DEV` | no | server | `1` for local | Forces local dev server mode |
| `PROCESS_SLA_ENGINE_ENABLED` | no | server | Set to `1` only after M-06 hosted migration and rollout approval | Enables 15-minute process/SLA clock evaluation |
| `BUSINESS_CALENDAR_DB_ENABLED` | no | server | Set to `1` only after WO-02 calendar migration and verifier pass | Uses tenant-maintained holiday rows for business-day clocks |

---

## DXF Parser (Railway)

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `DXF_PARSER_URL` | no | server | Railway CAD worker public URL | When set, DWG uploads route through the evidence worker |
| `PARSER_SHARED_SECRET` | no | server | Generate a random server-side secret | HMAC secret between web and parser. Required when `DXF_PARSER_URL` is set |

If `DXF_PARSER_URL` is unset, DWG uploads remain stored and report that
server-side conversion is unavailable. DXF uploads use the in-process
extractor.

---

## DocuSeal (Optional)

When any of these are set, the BOM portal and turnover signing flows
swap the built-in canvas signing pad for a DocuSeal envelope.

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `DOCUSEAL_API_URL` | no | server | Your DocuSeal install URL | Switches signing strategy to DocuSeal envelopes |
| `DOCUSEAL_API_KEY` | no* | server | DocuSeal `Settings → API` | Auth header for envelope creation. Required when `DOCUSEAL_API_URL` is set |
| `DOCUSEAL_WEBHOOK_SECRET` | no* | server | DocuSeal `Settings → Webhooks` | Validates inbound completion webhooks. Required when `DOCUSEAL_API_URL` is set |

Optional — when unset, the built-in canvas signing pad is used. The
audit trail and signature bundle layout are identical either way.

---

## Resend (Optional)

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `RESEND_API_KEY` | no | server | `resend.com → API Keys` | Outbound transactional email |
| `RESEND_FROM_EMAIL` | no | server | Verified sender on Resend | Default `From:` address |

In non-production, unset credentials use explicit development stubs. In
production, missing credentials fail closed; no fake delivery is recorded.

---

## Semaphore SMS (Optional)

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `SEMAPHORE_API_KEY` | no | server | `semaphore.co → Account` | Outbound SMS for SLA breach + warranty alerts |
| `SEMAPHORE_SENDER_NAME` | no | server | Sender name approved by Semaphore | Branded SMS sender |

In non-production, unset credentials use explicit development stubs. In
production, missing credentials fail closed; no fake delivery is recorded.

---

## Local Development

The minimum to boot `pnpm dev`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Everything else can be omitted; the corresponding feature will either
no-op or log a stdout warning at first invocation.
