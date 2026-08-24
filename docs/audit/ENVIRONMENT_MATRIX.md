# Environment Contract Matrix

- Generated: 2026-08-24 Asia/Singapore
- Generator: `scripts/audit/generate-environment-matrix.mjs`
- Root example names: 261
- Web example names: 128
- Distinct names across examples/runtime/workflows: 456

This is a name-only static inventory. It never reads local or provider values.
Required/optional semantics still need an explicit owner contract; source presence
alone cannot safely infer whether a variable must exist in every environment.

## Summary

| Classification | Names |
| --- | ---: |
| DOCUMENTED RUNTIME | 263 |
| EXAMPLE ONLY | 33 |
| UNDOCUMENTED RUNTIME | 152 |
| WORKFLOW ONLY | 8 |

## Current provider-name evidence

- GitHub repository secrets: E2E authentication/bypass names only.
- GitHub environment `production`: database, Supabase, Railway and Vercel
  credential names required by the promotion workflow.
- Vercel production: database/Core routing, application URLs, CAD, OpenAI and
  Supabase names are present.
- Railway variable names and Supabase advisor/config state are not recorded: the
  available CLI surfaces would expose values or require an unavailable access
  token. They remain blocked rather than inferred.
- No GitHub `SNYK_TOKEN` name is present, so a fail-closed Snyk job cannot be
  added without establishing that credential or revising the scanner policy.

## Matrix

| Name | Static status | Sensitivity | Root example | Web example | Runtime files | Workflow binding | Representative runtime references |
| --- | --- | --- | --- | --- | ---: | --- | --- |
| `AI_WORKER_SHARED_SECRET` | DOCUMENTED RUNTIME | SECRET | yes | no | 1 | — | `packages/ai/src/python-worker.ts` |
| `AI_WORKER_TIMEOUT_MS` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `packages/ai/src/python-worker.ts` |
| `AI_WORKER_URL` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 2 | — | `packages/ai/src/embed.ts`<br>`packages/ai/src/python-worker.ts` |
| `APP_REVISION` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/deployment-revision.ts` |
| `AUDIT_RECOVERY_TENANT_ID` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 3 | — | `scripts/plan-audit-recovery.mjs`<br>`scripts/plan-controlled-release.mjs`<br>`scripts/verify-audit-hash-profiles.mjs` |
| `BUILD_OPS_DEMO_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `scripts/lib/build-ops-invariants.mjs` |
| `BUILD_OPS_DEMO_TENANT_SLUGS` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `scripts/lib/build-ops-invariants.mjs` |
| `BUSINESS_CALENDAR_DB_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 2 | — | `apps/api/src/process/process.service.ts`<br>`apps/web/src/lib/operations/business-calendar.ts` |
| `CANARY_ACTOR_ID` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `scripts/plan-project-cutover.mjs` |
| `CANARY_PROJECT_ID` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `scripts/plan-project-cutover.mjs` |
| `CANARY_TENANT_ID` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `scripts/plan-project-cutover.mjs` |
| `CI` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/playwright.config.ts` |
| `DATABASE_EXPORT_URL` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `scripts/lib/database-export-plan.mjs` |
| `DATABASE_URL` | DOCUMENTED RUNTIME | SECRET | yes | yes | 29 | secret | `apps/web/src/lib/env.ts`<br>`packages/database/drizzle.config.ts`<br>`packages/database/scripts/embed-cortex.mjs`<br>+26 more |
| `DEMO_SEED_ALLOW_MUTATION` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `scripts/seed-role-accounts.mjs` |
| `DEMO_SHARED_PASSWORD` | UNDOCUMENTED RUNTIME | SECRET | no | no | 1 | — | `scripts/seed-role-accounts.mjs` |
| `DOCUSEAL_API_TOKEN` | DOCUMENTED RUNTIME | SECRET | yes | yes | 2 | — | `apps/api/src/documents/docuseal-provider.service.ts`<br>`apps/web/src/lib/operations/integrations/docuseal.ts` |
| `DOCUSEAL_API_URL` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 2 | — | `apps/api/src/documents/docuseal-provider.service.ts`<br>`apps/web/src/lib/operations/integrations/docuseal.ts` |
| `DOCUSEAL_BOM_TEMPLATE_ID` | EXAMPLE ONLY | SERVER CONFIG | yes | yes | 0 | — | — |
| `DOCUSEAL_COC_TEMPLATE_ID` | EXAMPLE ONLY | SERVER CONFIG | yes | yes | 0 | — | — |
| `DOCUSEAL_CONTRACT_TEMPLATE_ID` | EXAMPLE ONLY | SERVER CONFIG | yes | yes | 0 | — | — |
| `DOCUSEAL_DOCUMENT_HOSTS` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/documents/docuseal-provider.service.ts` |
| `DOCUSEAL_VO_TEMPLATE_ID` | EXAMPLE ONLY | SERVER CONFIG | yes | yes | 0 | — | — |
| `DOCUSEAL_WEBHOOK_SECRET` | DOCUMENTED RUNTIME | SECRET | yes | yes | 1 | — | `apps/web/src/app/api/webhooks/docuseal/route.ts` |
| `DXF_PARSER_URL` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 3 | — | `apps/api/src/cad/document-processing.worker.ts`<br>`apps/web/src/app/(dashboard)/projects/[id]/bom/page.tsx`<br>`apps/web/src/lib/cad/parse-and-store.ts` |
| `E2E_BASE_URL` | WORKFLOW ONLY | SERVER CONFIG | no | no | 0 | variable | — |
| `E2E_CHROME_PATH` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 19 | — | `apps/web/playwright.bank-statement-storage.config.ts`<br>`apps/web/playwright.config.ts`<br>`apps/web/playwright.controlled-upload.config.ts`<br>+16 more |
| `E2E_NOTIFICATIONS_ALLOW_ISOLATED_HOSTED_DATABASE` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/e2e/notifications-loopback-harness.mjs` |
| `E2E_NOTIFICATIONS_DATABASE_URL` | UNDOCUMENTED RUNTIME | SECRET | no | no | 1 | — | `apps/web/e2e/notifications-loopback-harness.mjs` |
| `E2E_NOTIFICATIONS_EXPECTED_DATABASE_HOST` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/e2e/notifications-loopback-harness.mjs` |
| `E2E_NOTIFICATIONS_EXPECTED_DATABASE_USER` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/e2e/notifications-loopback-harness.mjs` |
| `E2E_NOTIFICATIONS_REDIS_URL` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/e2e/notifications-loopback-harness.mjs` |
| `E2E_PROJECT_ID` | WORKFLOW ONLY | IDENTIFIER / CONFIG | no | no | 0 | variable | — |
| `E2E_SUPABASE_ANON_KEY` | WORKFLOW ONLY | PUBLIC API CONFIG | no | no | 0 | secret | — |
| `E2E_SUPABASE_URL` | WORKFLOW ONLY | SERVER CONFIG | no | no | 0 | variable | — |
| `E2E_USER_EMAIL` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | secret | `apps/web/e2e/helpers/auth.ts` |
| `E2E_USER_PASSWORD` | UNDOCUMENTED RUNTIME | SECRET | no | no | 1 | secret | `apps/web/e2e/helpers/auth.ts` |
| `E2E_VERCEL_PROTECTION_BYPASS_SECRET` | UNDOCUMENTED RUNTIME | SECRET | no | no | 1 | secret | `apps/web/playwright.config.ts` |
| `EMAIL_FROM` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 2 | — | `apps/api/src/procurement/notification-email.service.ts`<br>`apps/web/src/lib/operations/integrations/resend.ts` |
| `ERP_ACCOUNT_KYC_QUEUE_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_ACCOUNT_KYC_QUEUE_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_ACCOUNT_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_ACCOUNT_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_ENABLED` | EXAMPLE ONLY | SERVER CONFIG | yes | no | 0 | — | — |
| `ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_TENANT_IDS` | EXAMPLE ONLY | IDENTIFIER / CONFIG | yes | no | 0 | — | — |
| `ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_ADMIN_USER_ROLE_ASSIGNMENT_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_API_CORS_ORIGINS` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/main.ts` |
| `ERP_ASSET_MAINTENANCE_CREATE_WRITES_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/assets/asset-maintenance.service.ts` |
| `ERP_ASSET_MAINTENANCE_CREATE_WRITES_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/assets/asset-maintenance.service.ts` |
| `ERP_ASSET_MAINTENANCE_CREATE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_ASSET_MAINTENANCE_CREATE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_ASSET_MAINTENANCE_READS_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/assets/asset-maintenance.service.ts` |
| `ERP_ASSET_MAINTENANCE_READS_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/assets/asset-maintenance.service.ts` |
| `ERP_ASSET_MAINTENANCE_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_ASSET_MAINTENANCE_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_ASSET_READS_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/assets/assets.service.ts` |
| `ERP_ASSET_READS_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/assets/assets.service.ts` |
| `ERP_ASSET_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_ASSET_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_AUDIT_ACTIVITY_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_AUDIT_ACTIVITY_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_BOM_TOGAL_COMMIT_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_BOM_TOGAL_COMMIT_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_BOM_TOGAL_COMMIT_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/togal-bom-commit.service.ts` |
| `ERP_BOM_TOGAL_COMMIT_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/togal-bom-commit.service.ts` |
| `ERP_CAD_EVIDENCE_COMMIT_WRITES_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 3 | — | `apps/api/src/cad/cad-evidence-commit.service.ts`<br>`apps/api/src/cad/document-processing.processor.ts`<br>`apps/api/src/cad/document-processing.service.ts` |
| `ERP_CAD_EVIDENCE_COMMIT_WRITES_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 4 | — | `apps/api/src/cad/cad-evidence-commit.service.ts`<br>`apps/api/src/cad/document-processing.processor.ts`<br>`apps/api/src/cad/document-processing.queue.ts`<br>+1 more |
| `ERP_CHANGE_REQUEST_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/crm/change-request-creation.service.ts` |
| `ERP_CHANGE_REQUEST_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/crm/change-request-creation.service.ts` |
| `ERP_CHANGE_REQUEST_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CHANGE_REQUEST_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORE_API_URL` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 2 | — | `apps/web/src/lib/erp-core-client.ts`<br>`apps/web/src/lib/vendor-confirmation-client.ts` |
| `ERP_CORE_WEBHOOK_TOKEN` | DOCUMENTED RUNTIME | SECRET | yes | yes | 2 | — | `apps/api/src/documents/docuseal-webhook.controller.ts`<br>`apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_ASSISTANT_GENERATION_JOBS_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 3 | — | `apps/api/src/cortex/cortex-assistant-generation.processor.ts`<br>`apps/api/src/cortex/cortex-assistant-generation.service.ts`<br>`apps/api/src/cortex/cortex-assistant-provider-execution.service.ts` |
| `ERP_CORTEX_ASSISTANT_GENERATION_JOBS_TENANT_IDS` | EXAMPLE ONLY | IDENTIFIER / CONFIG | yes | no | 0 | — | — |
| `ERP_CORTEX_ASSISTANT_GENERATION_JOBS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_ASSISTANT_GENERATION_JOBS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-assistant-generation.queue.ts` |
| `ERP_CORTEX_ASSISTANT_GENERATION_RECOVERY_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-assistant-generation.queue.ts` |
| `ERP_CORTEX_ASSISTANT_GENERATION_WORKER_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-assistant-generation.processor.ts` |
| `ERP_CORTEX_ASSISTANT_GENERATION_WORKER_TENANT_IDS` | EXAMPLE ONLY | IDENTIFIER / CONFIG | yes | no | 0 | — | — |
| `ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 2 | — | `apps/api/src/cortex/cortex-assistant-provider-budget.service.ts`<br>`apps/api/src/cortex/cortex-assistant-provider-execution.service.ts` |
| `ERP_CORTEX_ASSISTANT_PROVIDER_BUDGET_TENANT_IDS` | EXAMPLE ONLY | IDENTIFIER / CONFIG | yes | no | 0 | — | — |
| `ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/cortex/cortex-assistant-provider-circuit-alert.queue.ts` |
| `ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_JOBS_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/cortex/cortex-assistant-provider-circuit-alert.queue.ts` |
| `ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/cortex/cortex-assistant-provider-circuit-alert.queue.ts` |
| `ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_RECOVERY_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/cortex/cortex-assistant-provider-circuit-alert.queue.ts` |
| `ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 2 | — | `apps/api/src/cortex/cortex-assistant-provider-circuit-alert-router.ts`<br>`apps/api/src/cortex/cortex-assistant-provider-circuit-alert.queue.ts` |
| `ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_ROUTING_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/cortex/cortex-assistant-provider-circuit-alert.queue.ts` |
| `ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/cortex/cortex-assistant-provider-circuit-alert.queue.ts` |
| `ERP_CORTEX_ASSISTANT_PROVIDER_CIRCUIT_ALERT_WORKER_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/cortex/cortex-assistant-provider-circuit-alert.queue.ts` |
| `ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-assistant-provider-execution.service.ts` |
| `ERP_CORTEX_ASSISTANT_PROVIDER_EXECUTION_TENANT_IDS` | EXAMPLE ONLY | IDENTIFIER / CONFIG | yes | no | 0 | — | — |
| `ERP_CORTEX_ASSISTANT_TURN_HMAC_SECRET` | DOCUMENTED RUNTIME | SECRET | yes | yes | 2 | — | `apps/api/src/cortex/cortex-assistant-turns.service.ts`<br>`apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_BRIEF_READS_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/cortex/cortex-brief.service.ts` |
| `ERP_CORTEX_BRIEF_READS_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/cortex/cortex-brief.service.ts` |
| `ERP_CORTEX_BRIEF_READS_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_BRIEF_READS_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_CHAT_RETRIEVAL_READS_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-chat-retrieval.service.ts` |
| `ERP_CORTEX_CHAT_RETRIEVAL_READS_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-chat-retrieval.service.ts` |
| `ERP_CORTEX_CHAT_RETRIEVAL_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_CHAT_RETRIEVAL_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-assistant-turns.service.ts` |
| `ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-assistant-turns.service.ts` |
| `ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_CONVERSATION_ASSISTANT_TURN_WRITES_VIA_API_TENANT_IDS` | EXAMPLE ONLY | IDENTIFIER / CONFIG | yes | yes | 0 | — | — |
| `ERP_CORTEX_CONVERSATION_CONTEXT_READS_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-conversation-context.service.ts` |
| `ERP_CORTEX_CONVERSATION_CONTEXT_READS_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-conversation-context.service.ts` |
| `ERP_CORTEX_CONVERSATION_CONTEXT_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_CONVERSATION_CONTEXT_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_CONVERSATION_READS_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-conversations.service.ts` |
| `ERP_CORTEX_CONVERSATION_READS_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-conversations.service.ts` |
| `ERP_CORTEX_CONVERSATION_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_CONVERSATION_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_ENABLED` | EXAMPLE ONLY | SERVER CONFIG | yes | no | 0 | — | — |
| `ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_TENANT_IDS` | EXAMPLE ONLY | IDENTIFIER / CONFIG | yes | no | 0 | — | — |
| `ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_CONVERSATION_USER_TURN_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_ENTITY_READS_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-entity.service.ts` |
| `ERP_CORTEX_ENTITY_READS_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-entity.service.ts` |
| `ERP_CORTEX_ENTITY_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_ENTITY_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_GRAPH_READS_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-graph.service.ts` |
| `ERP_CORTEX_GRAPH_READS_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-graph.service.ts` |
| `ERP_CORTEX_GRAPH_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_GRAPH_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_LEGACY_EMBED_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/web/src/app/api/cortex/embed/route.ts` |
| `ERP_CORTEX_LEGACY_EMBED_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/web/src/app/api/cortex/embed/route.ts` |
| `ERP_CORTEX_SEARCH_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/cortex/cortex-search.service.ts` |
| `ERP_CORTEX_SEARCH_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/cortex/cortex-search.service.ts` |
| `ERP_CORTEX_SEARCH_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_SEARCH_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_SEMANTIC_INDEX_JOBS_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 2 | — | `apps/api/src/cortex/cortex-semantic-index.processor.ts`<br>`apps/api/src/cortex/cortex-semantic-index.service.ts` |
| `ERP_CORTEX_SEMANTIC_INDEX_JOBS_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-semantic-index.queue.ts` |
| `ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_SEMANTIC_INDEX_JOBS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_ENABLED` | EXAMPLE ONLY | SERVER CONFIG | yes | no | 0 | — | — |
| `ERP_CORTEX_SEMANTIC_INDEX_RECOVERY_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-semantic-index.queue.ts` |
| `ERP_CORTEX_SEMANTIC_INDEX_WORKER_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 2 | — | `apps/api/src/cortex/cortex-semantic-index.processor.ts`<br>`apps/api/src/cortex/cortex-semantic-index.service.ts` |
| `ERP_CORTEX_SEMANTIC_INDEX_WORKER_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/cortex/cortex-semantic-index.queue.ts` |
| `ERP_COST_ENTRY_CREATE_WRITES_ENABLED` | EXAMPLE ONLY | SERVER CONFIG | yes | no | 0 | — | — |
| `ERP_COST_ENTRY_CREATE_WRITES_TENANT_IDS` | EXAMPLE ONLY | IDENTIFIER / CONFIG | yes | no | 0 | — | — |
| `ERP_COST_ENTRY_DELETE_WRITES_ENABLED` | EXAMPLE ONLY | SERVER CONFIG | yes | no | 0 | — | — |
| `ERP_COST_ENTRY_DELETE_WRITES_TENANT_IDS` | EXAMPLE ONLY | IDENTIFIER / CONFIG | yes | no | 0 | — | — |
| `ERP_COST_ENTRY_RESTORE_WRITES_ENABLED` | EXAMPLE ONLY | SERVER CONFIG | yes | no | 0 | — | — |
| `ERP_COST_ENTRY_RESTORE_WRITES_TENANT_IDS` | EXAMPLE ONLY | IDENTIFIER / CONFIG | yes | no | 0 | — | — |
| `ERP_DELIVERY_CANCEL_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_CANCEL_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_CANCEL_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_CANCEL_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_INSPECTION_COMPLETE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_INSPECTION_START_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_INSPECTION_START_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_INSPECTION_START_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_MARK_IN_TRANSIT_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_RECEIPT_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_RECEIPT_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_RECEIPT_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_RECEIPT_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_SCHEDULE_CREATE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_SCHEDULE_CREATE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_SCHEDULE_CREATE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_SCHEDULE_CREATE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_SITE_PREPARATION_COMPLETE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_SITE_PREPARATION_START_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_SITE_PREPARATION_START_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/delivery-workflow.service.ts` |
| `ERP_DELIVERY_SITE_PREPARATION_START_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DELIVERY_SITE_PREPARATION_START_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DISTRIBUTED_RATE_LIMIT_ENABLED` | EXAMPLE ONLY | SERVER CONFIG | yes | no | 0 | — | — |
| `ERP_DOCUMENT_DELETE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/documents/document-delete.service.ts` |
| `ERP_DOCUMENT_DELETE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/documents/document-delete.service.ts` |
| `ERP_DOCUMENT_DELETE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DOCUMENT_DELETE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DOCUMENT_PROCESSING_DRAFT_BOM_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 2 | — | `apps/api/src/cad/document-processing.processor.ts`<br>`apps/api/src/cad/document-processing.service.ts` |
| `ERP_DOCUMENT_PROCESSING_DRAFT_BOM_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/cad/document-processing.service.ts` |
| `ERP_DOCUMENT_PROCESSING_JOBS_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 2 | — | `apps/api/src/cad/document-processing.processor.ts`<br>`apps/api/src/cad/document-processing.service.ts` |
| `ERP_DOCUMENT_PROCESSING_JOBS_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 3 | — | `apps/api/src/cad/document-processing.processor.ts`<br>`apps/api/src/cad/document-processing.queue.ts`<br>`apps/api/src/cad/document-processing.service.ts` |
| `ERP_DOCUMENT_PROCESSING_RECOVERY_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/cad/document-processing.processor.ts` |
| `ERP_DOCUMENT_PROCESSING_RECOVERY_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 2 | — | `apps/api/src/cad/document-processing.processor.ts`<br>`apps/api/src/cad/document-processing.queue.ts` |
| `ERP_DOCUMENT_PROCESSING_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DOCUMENT_PROCESSING_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_DOCUMENT_PROCESSING_WORKER_BRIDGE_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 2 | — | `apps/api/src/cad/document-processing.processor.ts`<br>`apps/api/src/cad/document-processing.service.ts` |
| `ERP_FINANCE_CASH_DRAFT_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/finance/cash-draft.service.ts` |
| `ERP_FINANCE_CASH_DRAFT_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/finance/cash-draft.service.ts` |
| `ERP_FINANCE_CASH_DRAFT_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_CASH_DRAFT_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_CASH_READS_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-cash.service.ts` |
| `ERP_FINANCE_CASH_READS_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-cash.service.ts` |
| `ERP_FINANCE_CASH_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_CASH_READS_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_CASH_WORKFLOW_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/finance/cash-transaction-workflow.service.ts` |
| `ERP_FINANCE_CASH_WORKFLOW_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/finance/cash-transaction-workflow.service.ts` |
| `ERP_FINANCE_CASH_WORKFLOW_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_CASH_WORKFLOW_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/finance/customer-invoice-cancel.service.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/finance/customer-invoice-cancel.service.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_CANCEL_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/finance/customer-invoice-draft-create.service.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/finance/customer-invoice-draft-create.service.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_DRAFT_CREATE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/finance/customer-invoice-issue.service.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/finance/customer-invoice-issue.service.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_ISSUE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/finance/customer-invoice-reverse.service.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/finance/customer-invoice-reverse.service.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_CUSTOMER_INVOICE_REVERSE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_JOURNAL_POST_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/finance/journal-post.service.ts` |
| `ERP_FINANCE_JOURNAL_POST_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/finance/journal-post.service.ts` |
| `ERP_FINANCE_JOURNAL_POST_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_JOURNAL_POST_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_JOURNAL_REVERSE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/finance/journal-reverse.service.ts` |
| `ERP_FINANCE_JOURNAL_REVERSE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/finance/journal-reverse.service.ts` |
| `ERP_FINANCE_JOURNAL_REVERSE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_JOURNAL_REVERSE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_LEDGER_READS_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-ledger.service.ts` |
| `ERP_FINANCE_LEDGER_READS_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-ledger.service.ts` |
| `ERP_FINANCE_LEDGER_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_LEDGER_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_PAYABLES_READS_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-payables.service.ts` |
| `ERP_FINANCE_PAYABLES_READS_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-payables.service.ts` |
| `ERP_FINANCE_PAYABLES_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_PAYABLES_READS_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECEIVABLES_READS_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-receivables.service.ts` |
| `ERP_FINANCE_RECEIVABLES_READS_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-receivables.service.ts` |
| `ERP_FINANCE_RECEIVABLES_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECEIVABLES_READS_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-reconciliation-workflow.service.ts` |
| `ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-reconciliation-workflow.service.ts` |
| `ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_AUTO_MATCH_WRITES_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/finance/bank-statement-import-storage-authority.service.ts` |
| `ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 2 | — | `apps/api/src/finance/bank-statement-import-storage-authority.service.ts`<br>`apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_IMPORT_STORAGE_UPLOADS_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-reconciliation-workflow.service.ts` |
| `ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-reconciliation-workflow.service.ts` |
| `ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_IMPORT_WRITES_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-reconciliation-workflow.service.ts` |
| `ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-reconciliation-workflow.service.ts` |
| `ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_LINE_MATCH_WRITES_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_READS_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-reconciliation.service.ts` |
| `ERP_FINANCE_RECONCILIATION_READS_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-reconciliation.service.ts` |
| `ERP_FINANCE_RECONCILIATION_READS_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_READS_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-reconciliation-workflow.service.ts` |
| `ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-reconciliation-workflow.service.ts` |
| `ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_RECONCILE_WRITES_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_VOID_WRITES_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-reconciliation-workflow.service.ts` |
| `ERP_FINANCE_RECONCILIATION_VOID_WRITES_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/finance/finance-reconciliation-workflow.service.ts` |
| `ERP_FINANCE_RECONCILIATION_VOID_WRITES_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_RECONCILIATION_VOID_WRITES_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/finance/supplier-bill-post.service.ts` |
| `ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/finance/supplier-bill-post.service.ts` |
| `ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_SUPPLIER_BILL_POST_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/finance/supplier-bill-reverse.service.ts` |
| `ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/finance/supplier-bill-reverse.service.ts` |
| `ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_FINANCE_SUPPLIER_BILL_REVERSE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_ITEM_CONFIG_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_ITEM_CONFIG_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_ITEM_CONFIG_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/inventory/inventory-item-configuration.service.ts` |
| `ERP_INVENTORY_ITEM_CONFIG_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/inventory/inventory-item-configuration.service.ts` |
| `ERP_INVENTORY_RECEIPT_CREATE_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_RECEIPT_CREATE_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_RECEIPT_CREATE_WRITES_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/inventory/stock-receipt-creation.service.ts` |
| `ERP_INVENTORY_RECEIPT_CREATE_WRITES_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/inventory/stock-receipt-creation.service.ts` |
| `ERP_INVENTORY_RECEIPT_POST_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_RECEIPT_POST_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_RECEIPT_POST_WRITES_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/inventory/stock-receipt-workflow.service.ts` |
| `ERP_INVENTORY_RECEIPT_POST_WRITES_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/inventory/stock-receipt-workflow.service.ts` |
| `ERP_INVENTORY_RECEIPT_REVERSE_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_RECEIPT_REVERSE_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_RECEIPT_REVERSE_WRITES_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/inventory/stock-receipt-workflow.service.ts` |
| `ERP_INVENTORY_RECEIPT_REVERSE_WRITES_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/inventory/stock-receipt-workflow.service.ts` |
| `ERP_INVENTORY_STOCK_MOVEMENT_CREATE_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_STOCK_MOVEMENT_CREATE_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/inventory/inventory-stock-movement-creation.service.ts` |
| `ERP_INVENTORY_STOCK_MOVEMENT_CREATE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/inventory/inventory-stock-movement-creation.service.ts` |
| `ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_STOCK_MOVEMENT_DETAIL_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_STOCK_MOVEMENT_READS_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_STOCK_MOVEMENT_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/inventory/inventory-stock-movement-workflow.service.ts` |
| `ERP_INVENTORY_STOCK_MOVEMENT_WORKFLOW_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/inventory/inventory-stock-movement-workflow.service.ts` |
| `ERP_INVENTORY_SUMMARY_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_SUMMARY_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_UOM_CREATE_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_UOM_CREATE_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_UOM_CREATE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/inventory/inventory-uom-creation.service.ts` |
| `ERP_INVENTORY_UOM_CREATE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/inventory/inventory-uom-creation.service.ts` |
| `ERP_INVENTORY_UOM_UPDATE_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_UOM_UPDATE_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_UOM_UPDATE_WRITES_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/inventory/inventory-uom-update.service.ts` |
| `ERP_INVENTORY_UOM_UPDATE_WRITES_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/inventory/inventory-uom-update.service.ts` |
| `ERP_INVENTORY_WAREHOUSE_CLOSEOUT_READS_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_WAREHOUSE_CLOSEOUT_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_WAREHOUSE_CREATE_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_WAREHOUSE_CREATE_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_WAREHOUSE_CREATE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/inventory/inventory-warehouse-creation.service.ts` |
| `ERP_INVENTORY_WAREHOUSE_CREATE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/inventory/inventory-warehouse-creation.service.ts` |
| `ERP_INVENTORY_WAREHOUSE_UPDATE_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_WAREHOUSE_UPDATE_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_INVENTORY_WAREHOUSE_UPDATE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/inventory/inventory-warehouse-update.service.ts` |
| `ERP_INVENTORY_WAREHOUSE_UPDATE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/inventory/inventory-warehouse-update.service.ts` |
| `ERP_LOOPBACK_PO_BOM_FIXTURES` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/e2e/notifications-loopback-harness.mjs` |
| `ERP_LOOPBACK_WORKFLOW_FIXTURES` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/e2e/notifications-loopback-harness.mjs` |
| `ERP_NOTIFICATION_SWEEP_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/procurement/notification-delivery.queue.ts` |
| `ERP_OPPORTUNITY_CONVERT_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 2 | — | `apps/api/src/crm/opportunity-project-conversion.service.ts`<br>`apps/api/src/crm/opportunity-stage-transition.service.ts` |
| `ERP_OPPORTUNITY_CONVERT_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/crm/opportunity-project-conversion.service.ts` |
| `ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_OPPORTUNITY_CONVERT_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_OPPORTUNITY_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_OPPORTUNITY_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_OPPORTUNITY_STAGE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/crm/opportunity-stage-transition.service.ts` |
| `ERP_OPPORTUNITY_STAGE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/crm/opportunity-stage-transition.service.ts` |
| `ERP_OPPORTUNITY_STAGE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_OPPORTUNITY_STAGE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PARITY_REPLAY_MAPPING_MODE` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `scripts/verify-managed-supabase-parity-replay.mjs` |
| `ERP_PO_BOM_CREATE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/purchase-order-creation.service.ts` |
| `ERP_PO_BOM_CREATE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/purchase-order-creation.service.ts` |
| `ERP_PO_BOM_CREATE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PO_BOM_CREATE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PO_BOM_GROUPED_CREATE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/purchase-order-creation.service.ts` |
| `ERP_PO_BOM_GROUPED_CREATE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/purchase-order-creation.service.ts` |
| `ERP_PO_BOM_GROUPED_CREATE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PO_BOM_GROUPED_CREATE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PO_CREATE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/purchase-order-creation.service.ts` |
| `ERP_PO_CREATE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/purchase-order-creation.service.ts` |
| `ERP_PO_CREATE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PO_CREATE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PO_WORKFLOW_NOTIFICATIONS_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/purchase-order-workflow.service.ts` |
| `ERP_PO_WORKFLOW_NOTIFICATIONS_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/purchase-order-workflow.service.ts` |
| `ERP_PO_WORKFLOW_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/purchase-order-workflow.service.ts` |
| `ERP_PO_WORKFLOW_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/purchase-order-workflow.service.ts` |
| `ERP_PO_WORKFLOW_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PO_WORKFLOW_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PROJECT_COMMAND_CENTER_READS_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PROJECT_COMMAND_CENTER_READS_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PROJECT_COMMENT_CREATE_WRITES_ENABLED` | EXAMPLE ONLY | SERVER CONFIG | yes | no | 0 | — | — |
| `ERP_PROJECT_COMMENT_CREATE_WRITES_TENANT_IDS` | EXAMPLE ONLY | IDENTIFIER / CONFIG | yes | no | 0 | — | — |
| `ERP_PROJECT_COMMENT_CREATE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PROJECT_COMMENT_CREATE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PROJECT_COMMENT_DELETE_WRITES_ENABLED` | EXAMPLE ONLY | SERVER CONFIG | yes | no | 0 | — | — |
| `ERP_PROJECT_COMMENT_DELETE_WRITES_TENANT_IDS` | EXAMPLE ONLY | IDENTIFIER / CONFIG | yes | no | 0 | — | — |
| `ERP_PROJECT_COMMENT_DELETE_WRITES_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PROJECT_COMMENT_DELETE_WRITES_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PROJECT_COMMENT_READS_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PROJECT_COMMENT_READS_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PROJECT_CREATE_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/projects/projects.service.ts` |
| `ERP_PROJECT_CREATE_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/projects/projects.service.ts` |
| `ERP_PROJECT_DELETE_WRITES_ENABLED` | EXAMPLE ONLY | SERVER CONFIG | yes | no | 0 | — | — |
| `ERP_PROJECT_DELETE_WRITES_TENANT_IDS` | EXAMPLE ONLY | IDENTIFIER / CONFIG | yes | no | 0 | — | — |
| `ERP_PROJECT_LISTS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PROJECT_LISTS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PROJECT_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PROJECT_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PROVIDER_QUOTA_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PROVIDER_QUOTA_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PUBLIC_SIGNING_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PUBLIC_SIGNING_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_PUBLIC_SIGNING_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/documents/public-signing.service.ts` |
| `ERP_PUBLIC_SIGNING_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/documents/public-signing.service.ts` |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_BASE_URL` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/vendor-confirmation-link.service.ts` |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/vendor-confirmation-link.service.ts` |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_LINK_DELIVERY_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/vendor-confirmation-link.service.ts` |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_READ_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/public-vendor-confirmation.service.ts` |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_READ_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/public-vendor-confirmation.service.ts` |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/vendor-confirmation-session-minting.service.ts` |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_MINTING_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 1 | — | `apps/api/src/procurement/vendor-confirmation-session-minting.service.ts` |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_SESSION_TTL_HOURS` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 1 | — | `apps/api/src/procurement/vendor-confirmation-session-minting.service.ts` |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_TOKEN_SECRET` | DOCUMENTED RUNTIME | SECRET | yes | no | 2 | — | `apps/api/src/procurement/vendor-confirmation-link.service.ts`<br>`apps/api/src/procurement/vendor-confirmation-session-minting.service.ts` |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_ENABLED` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 2 | — | `apps/api/src/procurement/public-vendor-confirmation.service.ts`<br>`apps/api/src/procurement/vendor-confirmation-link.service.ts` |
| `ERP_PUBLIC_VENDOR_CONFIRMATION_WRITES_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | no | 2 | — | `apps/api/src/procurement/public-vendor-confirmation.service.ts`<br>`apps/api/src/procurement/vendor-confirmation-link.service.ts` |
| `ERP_RATE_LIMIT_KEY_SALT` | EXAMPLE ONLY | SERVER CONFIG | yes | no | 0 | — | — |
| `ERP_RFQ_AUTO_DISPATCH_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_RFQ_AUTO_DISPATCH_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_RFQ_CREATE_WRITES_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_RFQ_CREATE_WRITES_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_RFQ_QUOTE_WRITES_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_RFQ_QUOTE_WRITES_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_RFQ_TERMINAL_WRITES_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_RFQ_TERMINAL_WRITES_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_TODAY_READS_VIA_API` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_TODAY_READS_VIA_API_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_UNIVERSAL_SEARCH_READS_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/search/universal-search.service.ts` |
| `ERP_UNIVERSAL_SEARCH_READS_TENANT_IDS` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `apps/api/src/search/universal-search.service.ts` |
| `ERP_UNIVERSAL_SEARCH_READS_VIA_API` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_UNIVERSAL_SEARCH_READS_VIA_API_TENANT_IDS` | DOCUMENTED RUNTIME | IDENTIFIER / CONFIG | yes | yes | 1 | — | `apps/web/src/lib/erp-core-client.ts` |
| `ERP_WEB_BASE_URL` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/procurement/notification-email.service.ts` |
| `INNGEST_EVENT_KEY` | EXAMPLE ONLY | SERVER CONFIG | yes | no | 0 | — | — |
| `INNGEST_SIGNING_KEY` | EXAMPLE ONLY | SECRET | yes | no | 0 | — | — |
| `NEXT_OUTPUT_MODE` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/next.config.ts` |
| `NEXT_PHASE` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/env.ts` |
| `NEXT_PUBLIC_SITE_URL` | DOCUMENTED RUNTIME | PUBLIC CLIENT CONFIG | yes | yes | 7 | — | `apps/web/src/app/(dashboard)/warranty/actions.ts`<br>`apps/web/src/lib/inngest-permits.ts`<br>`apps/web/src/lib/inngest-sla.ts`<br>+4 more |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | DOCUMENTED RUNTIME | PUBLIC CLIENT CONFIG | yes | yes | 5 | secret | `apps/web/src/app/api/auth/callback/route.ts`<br>`apps/web/src/lib/env.ts`<br>`apps/web/src/middleware.ts`<br>+2 more |
| `NEXT_PUBLIC_SUPABASE_URL` | DOCUMENTED RUNTIME | PUBLIC CLIENT CONFIG | yes | yes | 7 | secret | `apps/web/src/app/api/auth/callback/route.ts`<br>`apps/web/src/lib/env.ts`<br>`apps/web/src/middleware.ts`<br>+4 more |
| `NODE_ENV` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 5 | — | `apps/api/src/documents/docuseal-provider.service.ts`<br>`apps/web/src/lib/operations/integrations/docuseal.ts`<br>`apps/web/src/lib/operations/integrations/resend.ts`<br>+2 more |
| `OPENAI_API_KEY` | DOCUMENTED RUNTIME | SECRET | yes | no | 7 | — | `apps/web/src/app/(dashboard)/projects/[id]/bom/page.tsx`<br>`apps/web/src/app/api/ai/chat/route.ts`<br>`apps/web/src/app/api/cortex/chat/route.ts`<br>+4 more |
| `PARSER_SHARED_SECRET` | UNDOCUMENTED RUNTIME | SECRET | no | no | 2 | — | `apps/api/src/cad/document-processing.worker.ts`<br>`apps/web/src/lib/cad/parse-and-store.ts` |
| `PG_DUMPALL_PATH` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `scripts/lib/database-export-plan.mjs` |
| `PG_DUMP_PATH` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `scripts/lib/database-export-plan.mjs` |
| `PLAYWRIGHT_BASE_URL` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 2 | — | `apps/web/playwright.config.ts`<br>`apps/web/scripts/warm-routes.mjs` |
| `PORT` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/api/src/main.ts` |
| `PROCESS_SLA_ENGINE_ENABLED` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/inngest-process-sla.ts` |
| `PRODUCTION_DATABASE_URL` | WORKFLOW ONLY | SECRET | no | no | 0 | secret | — |
| `PRODUCTION_URL` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `scripts/verify-production-surface.mjs` |
| `PUBLIC_APP_URL` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `supabase/functions/cnps-survey-sender/index.ts` |
| `PUBLIC_CNPS_BASE_URL` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `supabase/functions/cnps-survey-sender/index.ts` |
| `RAILWAY_API_TOKEN` | WORKFLOW ONLY | SECRET | no | no | 0 | secret | — |
| `RAILWAY_GIT_COMMIT_SHA` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/deployment-revision.ts` |
| `RAILWAY_READY_URL` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `scripts/plan-controlled-release.mjs` |
| `REDIS_URL` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 2 | — | `apps/api/src/app.module.ts`<br>`apps/api/src/observability/redis.module.ts` |
| `REPLAY_DATABASE_URL` | UNDOCUMENTED RUNTIME | SECRET | no | no | 1 | — | `scripts/reconcile-database-clones.mjs` |
| `RESEND_API_KEY` | UNDOCUMENTED RUNTIME | SECRET | no | no | 3 | — | `apps/api/src/procurement/notification-email.service.ts`<br>`apps/web/src/lib/operations/integrations/resend.ts`<br>`supabase/functions/_shared/email.ts` |
| `RESEND_FROM_EMAIL` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `supabase/functions/_shared/email.ts` |
| `SEED_ADMIN_EMAIL` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `packages/database/src/seed.ts` |
| `SEED_USER_ID` | UNDOCUMENTED RUNTIME | IDENTIFIER / CONFIG | no | no | 1 | — | `packages/database/src/seed.ts` |
| `SEMAPHORE_API_KEY` | UNDOCUMENTED RUNTIME | SECRET | no | no | 1 | — | `apps/web/src/lib/operations/integrations/semaphore.ts` |
| `SEMAPHORE_SENDER_NAME` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/operations/integrations/semaphore.ts` |
| `SITE_URL` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 6 | — | `apps/web/src/app/(dashboard)/warranty/actions.ts`<br>`apps/web/src/lib/inngest-permits.ts`<br>`apps/web/src/lib/inngest-sla.ts`<br>+3 more |
| `SKIP_ENV_VALIDATION` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/env.ts` |
| `SUPABASE_ANON_KEY` | DOCUMENTED RUNTIME | PUBLIC API CONFIG | yes | no | 1 | — | `apps/api/src/auth/supabase-identity.service.ts` |
| `SUPABASE_MIGRATION_DATABASE_URL` | WORKFLOW ONLY | SECRET | no | no | 0 | secret | — |
| `SUPABASE_SERVICE_ROLE_KEY` | DOCUMENTED RUNTIME | SECRET | yes | yes | 10 | secret | `apps/api/src/cad/document-processing.storage.ts`<br>`apps/api/src/documents/docuseal-artifact.storage.ts`<br>`apps/api/src/documents/public-signing.storage.ts`<br>+7 more |
| `SUPABASE_STORAGE_BUCKET` | EXAMPLE ONLY | SERVER CONFIG | yes | no | 0 | — | — |
| `SUPABASE_URL` | DOCUMENTED RUNTIME | SERVER CONFIG | yes | no | 7 | — | `apps/api/src/auth/supabase-identity.service.ts`<br>`apps/api/src/cad/document-processing.storage.ts`<br>`apps/api/src/documents/docuseal-artifact.storage.ts`<br>+4 more |
| `UPSTASH_REDIS_REST_TOKEN` | EXAMPLE ONLY | SECRET | yes | no | 0 | — | — |
| `UPSTASH_REDIS_REST_URL` | EXAMPLE ONLY | SERVER CONFIG | yes | no | 0 | — | — |
| `VERCEL` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/app/layout.tsx` |
| `VERCEL_DEPLOYMENT_ID` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/deployment-revision.ts` |
| `VERCEL_GIT_COMMIT_SHA` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/deployment-revision.ts` |
| `VERCEL_PROJECT_PRODUCTION_URL` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 3 | — | `apps/web/src/lib/operations/customer-portal.ts`<br>`apps/web/src/lib/operations/integrations/canvas-sign.ts`<br>`apps/web/src/lib/public-origin.ts` |
| `VERCEL_READY_URL` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `scripts/plan-controlled-release.mjs` |
| `VERCEL_TOKEN` | WORKFLOW ONLY | SECRET | no | no | 0 | secret | — |
| `VERCEL_URL` | UNDOCUMENTED RUNTIME | SERVER CONFIG | no | no | 1 | — | `apps/web/src/lib/deployment-revision.ts` |
