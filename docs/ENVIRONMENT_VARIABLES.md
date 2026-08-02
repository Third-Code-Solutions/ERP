# Environment Variables

Every variable consumed by Third Code ERP, grouped by service. Variables
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
| `NEXT_PUBLIC_SITE_URL` | yes | public | Your production domain (e.g. `https://thirdcode-erp.vercel.app`) | Used to build portal links in emails and signed share URLs |
| `AUTH_TRUSTED_HOSTS` | no | server | Comma-separated host list | Adds extra hostnames the redirect allowlist accepts |

---

## OpenAI

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `OPENAI_API_KEY` | yes | server | `platform.openai.com → API keys` | Embeddings + chat completions for RAG suggestions and AI assistant |
| `OPENAI_EMBEDDING_MODEL` | no | server | Defaults to `text-embedding-3-small` | Override if you want to A/B another embedder |
| `OPENAI_CHAT_MODEL` | no | server | Defaults to `gpt-4o-mini` | Override for higher-quality answers (costlier) |
| `ANTHROPIC_API_KEY` | no | server | `console.anthropic.com` | Optional fallback provider for `packages/ai` |

## Python AI Worker (incremental, optional)

When `AI_WORKER_URL` is set, embedding calls use the private Python worker;
TypeScript OpenAI embeddings are no longer called. Keep the worker URL and
secret server-only. Omit both variables to retain the current compatibility
provider during migration.

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `AI_WORKER_URL` | no | server | Private Railway worker URL | Selects Python-owned advisory embeddings |
| `AI_WORKER_SHARED_SECRET` | no* | server | Generate a random 32-byte secret | Bearer secret between server callers and worker |
| `AI_WORKER_TIMEOUT_MS` | no | server | Defaults to 15000 | Bounds each worker request |

Worker-only variables belong on the Python service, never in the browser:
`AI_WORKER_SHARED_SECRET`, `AI_PROVIDER_API_KEY`, `AI_PROVIDER_URL`,
`AI_EMBEDDING_MODEL`, `AI_EMBEDDING_DIMENSIONS`, `AI_MAX_TEXTS`,
`AI_MAX_CHARS`, and `AI_PROVIDER_TIMEOUT_SECONDS`.

`OPENAI_API_KEY` remains required for Cortex/chat completions. It is not needed
for embeddings when a correctly authenticated `AI_WORKER_URL` is configured.

---

## Inngest

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `INNGEST_EVENT_KEY` | yes | server | `app.inngest.com → Manage → Event Keys` | Sends events from server actions |
| `INNGEST_SIGNING_KEY` | yes | server | `app.inngest.com → Manage → Signing Key` | Verifies webhooks at `/api/webhooks/inngest` |
| `INNGEST_DEV` | no | server | `1` for local | Forces local dev server mode |

---

## DXF Parser (Railway)

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `PARSER_URL` | no | server | Railway service public URL | When set, BOM uploads route DXF + Togal jobs to the worker |
| `PARSER_SHARED_SECRET` | no | server | Generate (32-byte hex) | HMAC secret between web and parser. Required when `PARSER_URL` is set |

If `PARSER_URL` is unset, the BOM editor falls back to manual line
entry only — parsing is skipped.

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

Optional — when unset, notifications log to stdout instead of sending.
Useful in staging so we don't email real customers.

---

## Semaphore SMS (Optional)

| Variable | Required | Scope | Where to get | Controls |
|---|---|---|---|---|
| `SEMAPHORE_API_KEY` | no | server | `semaphore.co → Account` | Outbound SMS for SLA breach + warranty alerts |
| `SEMAPHORE_SENDER_NAME` | no | server | Sender name approved by Semaphore | Branded SMS sender |

Optional — when unset, notifications log to stdout instead of sending.

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

## Nest API document-processing bridge (disabled by default)

The incremental signed worker path is server-only. Keep every processing flag
false and tenant list empty until the controlled release gate is clear.

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `DXF_PARSER_URL` | no | API server | Private parser `/parse-evidence` base URL |
| `SUPABASE_SERVICE_ROLE_KEY` | no* | API server | Issues a 120-second exact-object Storage URL; never sent to Python |
| `ERP_DOCUMENT_PROCESSING_JOBS_ENABLED` | no | API server | Processing intake gate; default false |
| `ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS` | no | API server | Explicit processing tenant allowlist; default empty |
| `ERP_DOCUMENT_PROCESSING_RECOVERY_ENABLED` | no | API server | BullMQ recovery scheduler gate; default false |
| `ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS` | no | API server | Recovery tenant allowlist; must intersect processing and commit allowlists |
| `ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED` | no | API server | Signed Nest-to-Python bridge gate; default false |
| `ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED` | no | API server | Idempotent CAD draft-BOM gate; default false |
| `ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS` | no | API server | Explicit draft-BOM tenant allowlist; default empty |
| `ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED` | no | API server | Nest scope commit gate; default false |
| `ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS` | no | API server | Explicit commit tenant allowlist; default empty |

The Next.js upload compatibility selector is separate from the API-side gates:

| Variable | Required | Scope | Controls |
|---|---|---|---|
| `ERP_DOCUMENT_PROCESSING_VIA_API` | no | Next server | Selects the binary-DWG Next-to-Nest handoff; default false |
| `ERP_DOCUMENT_PROCESSING_TENANT_IDS` | no | Next server | Strict UUID allowlist for the handoff; default empty |
| `ERP_INVENTORY_RECEIPT_CREATE_VIA_API` | no | Next server | Selects the Stock Receipt Next-to-Nest handoff; default false |
| `ERP_INVENTORY_RECEIPT_CREATE_TENANT_IDS` | no | Next server | Strict UUID allowlist for Stock Receipt creation; default empty |
| `ERP_INVENTORY_RECEIPT_POST_VIA_API` | no | Next server | Selects the Stock Receipt post Next-to-Nest handoff; default false |
| `ERP_INVENTORY_RECEIPT_POST_TENANT_IDS` | no | Next server | Strict UUID allowlist for Stock Receipt posting; default empty |
| `ERP_INVENTORY_RECEIPT_REVERSE_VIA_API` | no | Next server | Selects the Stock Receipt reverse Next-to-Nest handoff; default false |
| `ERP_INVENTORY_RECEIPT_REVERSE_TENANT_IDS` | no | Next server | Strict UUID allowlist for Stock Receipt reversal; default empty |

Keep all frontend canary variables false/empty unless a controlled demo-tenant
cutover is approved. Selecting any core path is fail-closed and never falls
back to a direct legacy write after the command is selected.

`PARSER_SHARED_SECRET` must be at least 20 characters when the private bridge
is activated. Missing URL, secret, service-role key, or matching allowlists
fail closed; no processing job is accepted.

## Python AI worker boundary (source candidate)

`apps/workers/ai` is an advisory-only FastAPI service. It has no database or
tenant credentials and cannot approve or commit ERP state. Its `/health` route
is public; `/v1/embeddings` requires the shared bearer secret and bounds input.
Deployment is separately controlled and is not part of a routine Vercel build.
