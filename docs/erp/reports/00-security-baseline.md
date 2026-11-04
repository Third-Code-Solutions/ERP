# 00 — Security baseline

| Field | Value |
|---|---|
| Mode | `baseline` (whole repo) |
| Worktree / branch | `D:\thirdcode\ERP-baseline` · `chore/erp-baseline` (= `main` @ `90c48866` + swarm docs) |
| Date | 2026-11-04 |
| Auditor | erp-security-auditor |
| Verdict | **BLOCK**: 6 High findings, all confirmed |

Threat model: a logged-in user of tenant A with the lowest role (`viewer`), who holds their own Supabase JWT and the public anon key. Also an unauthenticated internet caller.

## Summary

| Severity | Confirmed | Suspected | Total |
|---|---|---|---|
| Critical | 0 | 0 | 0 |
| High | 6 | 0 | 6 |
| Medium | 3 | 3 | 6 |
| Low | 9 | 1 | 10 |
| **Total** | **18** | **4** | **22** |

"Confirmed" means a static end-to-end trace through code and the final migration state, or tool output (`pnpm audit`). Nothing was exploited against a live system. No production or remote database was contacted. One lead was rejected as a false positive (see Rejected leads).

**Root cause of the top issues.** The Core API and server actions carry the real authorization: capabilities, approval lanes and tenant checks. The Supabase Data API (`/rest/v1`) is still open for writes on many legacy tables. Those tables only have RLS policies of the form `tenant_id = auth_tenant_id()`, and the `authenticated` role keeps Supabase's default table grants. Any tenant member can therefore skip every server-side control within their own tenant. In one case (SEC-03) that also leads to reading another tenant's files.

Top findings: SEC-01, SEC-03, SEC-02, SEC-04, SEC-06, SEC-05.

---

## High

### SEC-01 — Browser Data API writes bypass all Core API authorization on ~75 legacy tenant tables
- **Status:** confirmed (static trace of the final migration state)
- **Where:**
  - `supabase/migrations/20260509164537_rls_policies.sql:191-199` (`purchase_orders` insert/update), `:75-85` (opportunities), `:94-101` (documents), `:123-136` (boms)
  - `20260512110000_third_code_erp_ops_phase_2_to_8.sql:570-597` (contracts, change_requests, variation_orders, bom_portal_tokens, warranty_*, daily_tasks …)
  - `20260513100000_rework_alignment.sql:178-198` (progress_claims, customer_portal_sessions, weekly_reports, delivery_*)
  - `20260512140000_signature_sessions.sql:49-52`
  - `20260910190000_tender_bid_mode.sql:175-190` (tender_* FOR ALL), `:234-244` (embeddings)
  - `20260806160000_security_role_baseline.sql:8-14` revokes table privileges from `anon` only and re-targets these policies `TO authenticated`.
  - `20260912131004_claim_document_parent_delete_authority.sql:1-3,17-18` revokes only DELETE on `documents`/`progress_claims` and states it is "preserving all existing SELECT, INSERT and UPDATE semantics".
  - No migration revokes INSERT/UPDATE from `authenticated` on `purchase_orders`, `progress_claims`, `variation_orders`, `customer_portal_sessions`, `tender_*`, `bom_portal_tokens`, `signature_sessions` or `embeddings`. The repo does this table by table elsewhere: `projects` at `20260819110000:131`, `invoices` at `20260807130000:103`, `cost_entries` at `20260807110000:141`, `users` at `20260807150000:82`.
  - The only trigger on `purchase_orders.status` is `enforce_project_budget_commitment` (`20260814130000:12-52`), a budget check with no role check. `progress_claims` has no guard trigger at all (only the cortex mirror).
- **Attack:** a tenant-A viewer calls `PATCH /rest/v1/<table>` with their own JWT. They can:
  - set `purchase_orders.status='issued'` and stamp `pm_approved_by` / `commercial_approved_by`;
  - move `progress_claims` status and amounts;
  - walk `variation_orders` to `signed` (`guard_variation_order_transition` only checks state order);
  - rewrite tender evaluation scores;
  - insert `customer_portal_sessions` or `bom_portal_tokens` rows with a token hash they choose, minting external links that outlive their own access;
  - poison `embeddings` used by RAG.
- **Fix:** for every legacy tenant table whose writes the Core API or server actions own, apply `revoke insert, update, delete, truncate on table … from anon, authenticated`. Add `as restrictive … for insert/update to anon, authenticated with check (false)` as a regrant guard, following `20260912130031`. Before revoking, inventory the browser-session writers that still depend on these grants (e.g. the VO comment at `20260910180000:1-3`). The change is additive and policy-only, so it is safe under the expand/contract rule.
- **Test:** in `scripts/verify-database-repro.mjs`, assert `has_table_privilege('authenticated', t, 'INSERT') = false` and the same for `'UPDATE'` for each table in the list. Add a rollback probe: as a tenant-A viewer, `update purchase_orders set status='issued'` and `insert into customer_portal_sessions …` both raise 42501.

### SEC-02 — Roadmap foundation lets any tenant member enqueue outbound email/SMS, SAP postings and active price lists
- **Status:** confirmed (grant, policy and consumer traced). Real-world impact depends on this migration being applied in production and on `RESEND_API_KEY`/`EMAIL_FROM` (or `SAP_API_URL`/`SAP_API_TOKEN`) being configured.
- **Where:**
  - `supabase/migrations/20260921181036_roadmap_integrations_foundation.sql:876-910` creates tenant-only `FOR INSERT` policies.
  - `:943-960` grants `select, insert, update, delete` to `authenticated` on `tenant_feature_flags`, `provider_delivery_outbox`, `sap_posting_outbox`, `price_lists`, `exchange_rates`, `tax_profiles`, `fiscal_period_close_runs`, and others.
  - This is the latest migration; nothing later narrows it.
  - Consumer: `apps/api/src/roadmap/roadmap-integration.service.ts:170-230`. The sweeper sends any `pending` outbox row whose tenant has the `provider_delivery` flag enabled.
  - `price_lists.status` accepts `'active'` on insert (`:530,539`).
- **Attack:** a viewer makes these REST inserts:
  1. `tenant_feature_flags(feature_key='provider_delivery', enabled=true, …)`
  2. `provider_delivery_outbox(recipient=<anyone>, subject, body, provider='resend'|'semaphore')`
  
  The worker then sends that message from the company's verified sender, which makes it a phishing relay. The same pattern can post an attacker-chosen `payload` to SAP, or insert an `active` supplier price list that `resolvePrice` serves to buyers.
- **Fix:** revoke `insert, update, delete` from `authenticated` on all outbox/attempt/flag tables and on reference-data tables (price lists, FX, tax, fiscal close). Add `deny_direct_client_access` policies so only Core API commands enqueue or activate.
- **Test:** as a viewer, `insert into provider_delivery_outbox …` and `insert into tenant_feature_flags …` raise 42501. Add the matching repro-harness privilege assertions.

### SEC-03 — Cross-tenant file read by forging `documents.storage_path`
- **Status:** confirmed (static chain). Precondition: the attacker knows the target object path, e.g. from any signed URL ever issued, a shared link, a forwarded portal page, or a past membership.
- **Where:**
  - `documents.storage_path` has no prefix constraint (`20260509164536_initial_schema.sql:73-86`).
  - UPDATE/INSERT policies are tenant-only and the grants are preserved (SEC-01; `20260912131004:17-18`).
  - `apps/web/src/app/api/documents/[id]/route.ts:39-75` selects by `id + tenant_id`, then calls the service-role `createSignedUrl(doc.storage_path)` without checking that the path starts with `${tenantId}/`.
  - Same at `apps/web/src/app/portal/project/[token]/documents/page.tsx:120-144`.
  - Paths look like `${tenantId}/${projectId}/${uuid}-${name}` (`apps/web/src/app/api/upload/sign/route.ts:88`). A signed URL discloses the full path.
- **Attack:** a tenant-A user PATCHes the `storage_path` of one of their own document rows to a tenant-B path, then opens `/api/documents/<ownDocId>` and is redirected to tenant B's file. A 60-second signed URL thereby becomes permanent cross-tenant access for anyone who has seen it.
- **Fix:**
  - In both signers, refuse unless `storage_path.startsWith(tenantId + '/')` and the path has no `..`.
  - Add `check (split_part(storage_path,'/',1) = tenant_id::text) not valid`, then `validate`.
  - Revoke INSERT/UPDATE on `documents` from `authenticated` (SEC-01).
- **Test:**
  - DB probe: an update to a foreign prefix fails the check.
  - Route test: a document row whose path has a foreign tenant prefix returns 404, and `createSignedUrl` is never called.

### SEC-04 — Purchase-order two-lane approval collapses to one person (self-approval)
- **Status:** confirmed
- **Where:**
  - `apps/api/src/procurement/purchase-order-workflow.service.ts:103-139`: `canPerform`. `pm_approve` needs only `po.create`; `commercial_approve` needs `po.approve`.
  - `:372-391` writes `pm_approved_by` / `commercial_approved_by` with no comparison against `created_by` or the other approver.
  - `commercial` holds both `po.create` and `po.approve` (`packages/shared-types/src/authorization.ts:173-174`).
  - No database trigger enforces distinct approvers. Budget revisions do (`20260726243000_project_budget_controls.sql:646`), so segregation of duties is clearly intended.
- **Attack:** a single `commercial` user runs create → submit → `pm_approve` → `commercial_approve` on their own PO. A `pm` or `procurement` user can PM-approve a PO they created.
- **Fix:** inside the transaction, reject `pm_approve` when `actor = created_by`, and reject `commercial_approve` when `actor ∈ {created_by, pm_approved_by}`. Back it with a `BEFORE UPDATE OF status` trigger that enforces distinct actors. That trigger also closes the SEC-01 path for this table.
- **Test:** service spec where one principal creates and approves: expect `ForbiddenException` at `pm_approve` and at `commercial_approve`. The same flow with three distinct users succeeds.

### SEC-05 — Next.js 15.5.27: unauthenticated Server Actions DoS; image-optimizer RCE advisory
- **Status:** confirmed (`pnpm audit --prod`)
- **Where:** `apps/web/package.json:65` (`"next": "15.5.27"`).
  - GHSA-p3m5-59mp-jv5r (High, CVE-2026-94482): crafted requests to any App Router app with a Server Action cause CPU exhaustion. The app has 68 `'use server'` modules, and no workaround exists.
  - GHSA-2464-fhr4-w9xw (Critical, RCE via image optimization when SVG is used) is mitigated in this tree: the lockfile resolves `sharp@0.35.5`, the advisory's fixed floor, and `next.config.ts` sets neither `dangerouslyAllowSVG` nor `remotePatterns`.
  - CI runs `pnpm audit --prod --audit-level low` (`.github/workflows/ci.yml:545`), so CI is currently red for every PR.
- **Attack:** an unauthenticated caller sends crafted Server Action requests, pins function CPU, degrades the web tier and drives up cost.
- **Fix:** bump `next` to `>=15.5.28` (and matching `eslint-config-next`), then regenerate the lockfile.
- **Test:** `pnpm audit --prod --audit-level low` exits 0, plus CI green.

### SEC-06 — Core API: a single unauthenticated request can crash the process (body-parser); Zod memory DoS
- **Status:** confirmed (`pnpm audit --prod` and reachability)
- **Where:**
  - `apps/api` resolves `express > body-parser@2.3.0`. GHSA-27r3-jxmh-p828: a compressed body followed by trailing bytes raises an unhandled stream error and the process exits.
  - Reachable before any guard: `apps/api/src/main.ts:21` `app.use(json({ limit: '4mb' }))`, with inflate on by default.
  - `zod@3.25.76` (GHSA-mrhx-c7xc-m3w5, fixed only in `>=4.6.6`): an unbounded array schema accumulates one issue per failing element, so a 4 MB body can exhaust memory. This is reachable on authenticated routes.
  - `multer@2.4.0` (GHSA-q7qp-rjg7-q26m) is present but not reachable: there is no `FileInterceptor` in `apps/api/src`.
- **Attack:** a repeated one-packet request from the internet crash-loops the Railway Core API. Every web feature that delegates to Core goes down with it.
- **Fix:**
  - Bump `express`/`body-parser` to `>=2.4.0` and `qs` to `>=6.16.1` (pnpm override if needed).
  - Either upgrade Zod to `>=4.6.6` or add `.max()` to every array schema on request bodies. Add a lint/test that rejects unbounded body arrays.
- **Test:** `pnpm audit --prod` is clean. Add an e2e test that posts a gzip body with trailing garbage to `/health` and expects a 4xx with the process still serving.

## Medium

### SEC-07 — Viewer can activate or retire supplier price lists through the Core API
- **Status:** confirmed
- **Where:** `apps/api/src/roadmap/roadmap.controller.ts:140-150`. `POST …/price-lists/:priceListId/workflow` is gated by `@RequireCapabilities('procurement.read')`, which includes `viewer` (`authorization.ts:145`). `roadmap.service.ts:835-886` re-checks only the feature flag and membership, then writes `approved_by = principal.userId`. This breaks the repo's own rule that Viewer is denied every mutation (`ERP_MUTATION_CAPABILITIES`).
- **Attack:** a Viewer activates a draft price list or retires the live one and is recorded as the approver. Reachable where the `price_lists` flag is on.
- **Fix:** gate with `po.approve`, or with a new `price_list.approve` capability.
- **Test:**
  - A controller-metadata spec: no `@Post`/`@Patch`/`@Put`/`@Delete` route carries only `ERP_READ_CAPABILITIES`.
  - The viewer gets 403 and the status is unchanged.

### SEC-08 — Customer portal exposes internal project files typed `other` or `po`
- **Status:** confirmed
- **Where:**
  - `apps/web/src/app/portal/project/[token]/documents/page.tsx:19,120-144` lists every project document whose type is in `['contract','bom','invoice','po','other']` and signs each one.
  - `apps/api/src/documents/document-intake.service.ts:69-82` classifies every non-PDF/image/CAD upload as `other`: xlsx, docx and csv cost sheets, supplier quotes.
- **Attack:** a client holding a portal link (tokens can live up to 10 years) downloads the contractor's internal cost workbooks and supplier quotes, exposing margins. If SEC-01 is unfixed, any tenant viewer can also mint such a link.
- **Fix:** add an explicit `shared_with_client` flag set by an authorized user, or list only Core-produced client documents. Drop `other` and `po` from the portal allowlist.
- **Test:** upload an xlsx to a project, open the portal documents page, and assert the file is absent.

### SEC-09 — Any operator role can hard-delete documents behind signed contracts and VOs, cascading permits and design versions
- **Status:** confirmed. Gated by `ERP_DOCUMENT_DELETE_WRITES_ENABLED` plus a tenant allow-list.
- **Where:**
  - `apps/api/src/documents/document-delete.service.ts:120-205`. The route needs `document.manage`, which is held by all operators: `cx`, `safety`, `sales`, `design`.
  - The service blocks deletion only for claim, KYC, inspection and processing links. It does not check:
    - `contracts`, `variation_orders` and `certificates_of_completion` `.signed_document_id` (`ON DELETE SET NULL`, `20260512110000:321,363,452`);
    - `signature_sessions.signature_document_id`;
    - tender TOR/BOQ links;
    - `design_file_versions`, `permit_documents`, `punchlist_photos` (`ON DELETE CASCADE`, `:128,306,426`).
- **Attack:** a `cx` user deletes the document behind a signed contract. The signed-evidence link silently becomes NULL and dependent design and permit rows are cascade-deleted.
- **Fix:** refuse deletion while any contractual or signature reference exists, and restrict deletion to the uploader or `admin`/`owner`.
- **Test:** seed a contract with `signed_document_id = D`. A `cx` delete of D returns 409 and the link is preserved.

### SEC-10 — Unauthenticated `'use server'` exports take `tenantId` from the caller
- **Status:** suspected. The actions are registered and unauthenticated, but exploiting them needs the action ID.
- **Where:**
  - `apps/web/src/app/(dashboard)/projects/[id]/vos/actions.ts:352` `listProjectVos(projectId, tenantId)` and `:375` `getVoById(voId, tenantId)`
  - `…/projects/[id]/progress/actions.ts:292` `loadProgressContext`
  - `…/crm/opportunities/[id]/proposal/actions.ts:1080` `getLatestPprf(tenantId, opportunityId)`
  - `apps/web/src/app/portal/project/[token]/actions.ts:16` `logView(sessionId, tenantId)`
  - All five are present in `.next/server/server-reference-manifest.json`; `getLatestPprf` is in the `action-browser` layer. Their IDs are not in `.next/static` today.
- **Attack:** anyone who learns an action ID can POST `Next-Action: <id>` with a victim tenant's UUID and read that tenant's variation orders (cost impact), progress or PPRF. This would be cross-tenant and unauthenticated. A future client import, or a stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY`, makes the IDs discoverable.
- **Fix:** move these readers to a non-`'use server'` module with `import 'server-only'`, or derive the tenant inside each function from `requireUserProfile()`.
- **Test:**
  - An invariant script that fails when any export of a `'use server'` file has a parameter named `tenantId`, `actorId`, `userId` or `role`.
  - A unit test: `getVoById` with a foreign tenant returns null.

### SEC-11 — A pending invitation binds to any self-signup with the invitee's email
- **Status:** suspected. Escalation needs production email confirmation off, or a pending invitation without an auth user.
- **Where:**
  - `supabase/migrations/20260904020000_platform_owner_administration_boundary.sql:291-340`: `provision_platform_invited_user` binds any new `auth.users` row with a matching email to a `pending` invitation.
  - `:342-376`: activation requires only `email_confirmed_at`.
  - `supabase/config.toml:198,203` (local): `enable_signup = true`, `enable_confirmations = false`.
- **Attack:** while an invitation is pending, an attacker signs up with the invitee's email. With confirmations off, they activate into the inviting tenant with the invited role. With confirmations on, they still hijack the binding, which blocks the real invite.
- **Fix:** bind only on admin-invite-created users, e.g. `new.invited_at is not null`, or a server nonce in `raw_app_meta_data`. Verify that production has confirmations on.
- **Test:** pending invitation, then an `auth.users` insert with that email and `invited_at` null: expect no `public.users` row in the inviting tenant.

### SEC-12 — Single-column foreign keys on legacy tables allow cross-tenant references
- **Status:** suspected (impact). The existence oracle is confirmed statically when combined with SEC-01.
- **Where:** `supabase/migrations/20260509164536_initial_schema.sql:246-290`, e.g. `purchase_orders.project_id → projects.id`, `vendor_id`, `boms.approved_by`, `opportunities.project_id`.
- **Attack:** via SEC-01, tenant A points its own rows at tenant-B UUIDs. FK success or failure leaks whether those UUIDs exist. Any server join on such a column that filters only by the parent row's tenant would return tenant-B fields. A tenant-B delete can also cascade into tenant-A rows.
- **Fix:** composite `(tenant_id, x_id)` FKs, as later migrations already use (e.g. `20260910180000:9-16`). Add them as `not valid`, then `validate`.
- **Test:** inserting a tenant-A PO with a tenant-B `project_id` raises an FK violation.

## Low

### SEC-13 — Upload size and type are taken from the client's declaration
- **Status:** confirmed
- **Where:**
  - `apps/web/src/app/api/upload/sign/route.ts:22,74,93`: the quota is checked against the declared `sizeBytes`, and `createSignedUploadUrl` has no size bound.
  - `apps/web/src/app/api/upload/complete/route.ts:25,132`: the declared size and mime type are trusted.
  - Core stores the declared size (`document-intake.service.ts:159`).
  - Only inspection photos are magic-byte checked.
- **Attack:** an operator declares 1 KB and uploads up to the bucket limit. This bypasses the 100 MB and per-project quotas and feeds oversized files to the CAD path, which buffers whole objects.
- **Fix:** in `complete`/Core, read the real object metadata, reject a size mismatch or an over-cap file, and sniff magic bytes per declared kind.
- **Test:** declare a small size, upload a larger object, call `complete`: expect 413 and no document row.

### SEC-14 — Auth cookies rewritten without `Secure`
- **Status:** confirmed
- **Where:** `apps/web/src/middleware.ts:287-306` (every token refresh) and `apps/web/src/app/api/auth/callback/route.ts:40-54` call `createServerClient` without `cookieOptions`. The `@supabase/ssr@0.6.1` defaults have no `secure`. Only `packages/auth/src/server.ts:34` and `client.ts:18-22` set it. Mitigated by HSTS `includeSubDomains`, which is not preloaded.
- **Fix:** pass `{ path: '/', sameSite: 'lax', secure: NODE_ENV === 'production' }` in both places.
- **Test:** a middleware test asserting that refreshed `Set-Cookie` headers include `Secure` in production.

### SEC-15 — `authenticated` keeps TRUNCATE/REFERENCES/TRIGGER and default ALL on new tables
- **Status:** confirmed
- **Where:** `20260806160000_security_role_baseline.sql:8-14` revokes from `anon` only. TRUNCATE on `audit_log` would bypass the append-only rules (`20260509164538:141-142`). PostgREST does not expose TRUNCATE, so this is defense-in-depth only.
- **Fix:** `revoke truncate, references, trigger on all tables in schema public from authenticated`, plus `alter default privileges … revoke all on tables from authenticated`, with explicit grants per table.
- **Test:** `has_table_privilege('authenticated','public.audit_log','TRUNCATE') = false`.

### SEC-16 — `auth_can_read_cortex_subject` is a cross-tenant existence oracle
- **Status:** confirmed
- **Where:** `20260726201606_accounting_ledger_foundation.sql:1088-1127`. The function is callable by `authenticated` and looks up node/edge ids with no tenant predicate.
- **Fix:** add `and tenant_id = public.auth_tenant_id()` to both lookups.
- **Test:** calling the RPC with a tenant-B id returns false.

### SEC-17 — No throttle or active-job cap on CAD processing jobs
- **Status:** suspected
- **Where:** `apps/api/src/cad/document-processing.service.ts:233-251`. Each fresh `Idempotency-Key` creates a new job, and no Nest throttler is configured.
- **Attack:** an estimator floods the shared CAD worker queue, which degrades other tenants.
- **Fix:** a unique partial index on `(tenant_id, document_id) where status in ('queued','processing')`, or a quota through `ProviderQuotaService`.
- **Test:** a second create while a job is active returns the existing job or 409.

### SEC-18 — Non-admin roles define the approval rules they later decide
- **Status:** confirmed. Impact is limited today: routing is `preview_only`.
- **Where:** `apps/api/src/process/process.controller.ts:124-145`, `process.service.ts:436-466`. `process.approval.manage` (commercial, sd_pm_pe, pm) can create rules with any `approverRole`.
- **Fix:** gate `POST approval-rules` with `admin.system_config`.
- **Test:** a `pm` calling `POST approval-rules` gets 403.

### SEC-19 — `/api/health` and `/api/ready` skip rate limiting and fan out to Core and the DB
- **Status:** confirmed
- **Where:** `apps/web/src/middleware.ts:263-265`. `apps/web/src/app/api/health/route.ts:24` fetches Core `/ready` on every hit.
- **Fix:** a coarse per-IP limit, or cache the probe result for about 5 seconds.
- **Test:** the N+1th request in the window is served from cache or returns 429, with no extra Core fetch.

### SEC-20 — CAD worker legacy `/parse` fetches any URL for secret holders
- **Status:** confirmed
- **Where:** `apps/workers/dxf-parser/src/main.py:185-207` and `storage.py:24-25`. `source_url: AnyHttpUrl` has no host allowlist, so this is a blind internal SSRF. The only web caller sends an incompatible body (dead route).
- **Fix:** delete `/parse`, or allowlist the Supabase Storage host.
- **Test:** POST `/parse` with an internal `source_url` returns 404 or 422.

### SEC-21 — AI worker auth compare raises on non-ASCII input; DXF parsed in full before the item cap
- **Status:** confirmed
- **Where:** `apps/workers/ai/src/main.py:54` calls `hmac.compare_digest(str, str)`, which raises `TypeError` and returns 500 instead of 401. `apps/workers/dxf-parser/src/parsers/ezdxf_extractor.py:105-111` parses up to 100 MB before enforcing `max_items`.
- **Fix:** compare encoded bytes inside try/except, as `dxf-parser/src/main.py:57-62` already does, and cap entities during iteration.
- **Test:** a non-ASCII bearer header returns 401.

### SEC-22 — Dependency hygiene (non-reachable or moderate)
- **Status:** confirmed (`pnpm audit --prod`)
- **Where:**
  - `systeminformation@5.33.1` via `inngest > @opentelemetry/...`: High command injection is Windows-only, and the deploy target is Linux. Two lower-severity advisories also apply.
  - `minimatch` 3.1.5 / 5.1.9 via `exceljs > archiver`, Moderate ReDoS. Build-time path only.
  - `qs@6.16.0` (Moderate) is covered by SEC-06.
- **Fix:** add pnpm overrides, or bump the parent packages.
- **Test:** `pnpm audit --prod --audit-level low` exits 0.

---

## Rejected leads (verified false)
- **Bank-statement source DELETE missing tenant prefix:** false. `apps/web/src/app/api/finance/reconciliation/import/sign/route.ts:146-152` enforces `startsWith(`${profile.tenantId}/bank-statements/`)` and rejects `..` before the service-role `remove`.
- **CI build job leaking the service-role key and DB URL to PRs:** false. `gh secret list` shows no repo-level `SUPABASE_SERVICE_ROLE_KEY` or `DATABASE_URL`, so the build uses placeholders. Deploy secrets are environment-scoped. The `main`-only condition is an `if:` in the workflow file (`deploy-production.yml:3-31`), not an access control: the `production` environment has no protection rules, because the GitHub plan blocks them (accepted risk, `docs/erp/RUNBOOK.md` section 5).

## Clean checks (evidence)
- **Core API guards.** `SupabaseJwtGuard` and `CapabilityGuard` are global `APP_GUARD`s (`apps/api/src/app.module.ts:83-88`). A route with no capability metadata is rejected (`capability.guard.ts`). Tenant and role come from the `users` row of the verified JWT `sub`, with active account and tenant required (`supabase-jwt.guard.ts:51-89`). No body, query or header source was found.
- **Public Core routes.** DocuSeal uses a timing-safe secret. Public signing and vendor confirmation use hashed 256-bit tokens with expiry and revocation. `PlatformOwnerGuard` requires confirmed email, a single active assignment, and recent authentication for writes.
- **Core queries.** 195 `.where(` clauses and 9 joins without `tenant` were reviewed: all are server-generated ids, queues or platform scope. Composite `(tenant_id, x_id)` FKs are used in 102+ newer sites. No `sql.raw` or `sql.identifier`; sort keys map from enums; ILIKE input is escaped.
- **Role administration.** Owner-only for granting or editing owner, last-admin protection, row locks (`admin/user-role-assignment.service.ts`).
- **`users` table.** `authenticated` has no INSERT, UPDATE, DELETE or column grants and no write policy (`20260807150000:81-86`, `20260814150000:7-12`), so there is no self-escalation through `role`, `tenant_id` or `account_status`. Signup always creates a new tenant and ignores metadata (`20260729054456:28-160`).
- **SECURITY DEFINER.** All 106 functions pin `search_path`. The 10 client-callable ones derive identity from `auth.uid()`. Posting RPCs that take a tenant or actor are service_role-only. Cortex functions are revoked through the `pg_proc` loop (`20260726192929:603-627`).
- **RLS coverage.** RLS is on for all 214 public tables. No `using (true)` or `with check (true)`. No views, materialized views or Realtime publication changes in migrations.
- **Storage.** The single `documents` bucket is private, and client `storage.objects` policies were dropped (`20260825102000`). Signed-upload paths are built server-side from the tenant, and `complete` checks the prefix and rejects `..`.
- **Web route handlers.** Id-addressed routes (`documents/[id]`, `inspection/[id]/report`, `weekly-report/[id]`, `crm/opportunities/[id]/*`, `cortex/entity`, `cortex/conversations/[id]`) all add the session `tenant_id` predicate and return a uniform 404. No GET handler mutates.
- **Service role.** Server-only, never imported in a `'use client'` file. `NEXT_PUBLIC_*` holds only the Supabase URL, the anon key, `SITE_URL` and `APP_URL`.
- **Webhooks.** DocuSeal compares its secret in constant time and deduplicates. Inngest `serve` signs in production.
- **CSV export.** `exports/opportunities-csv` neutralises `= + - @ \t \r`, tenant-scopes every join, and caps output at 10k rows.
- **XSS.** The only `dangerouslySetInnerHTML` is JSON-LD with `<` escaped. Report and email HTML builders escape values. The CSP is nonce plus `strict-dynamic`, with no bare `https:` (`middleware.ts:112-171`).
- **XML and SSRF.** The MS Project XML parser rejects DOCTYPE/ENTITY. No web-side fetch of a user-derived URL. Core outbound hosts are fixed, and the Storage URL is prefix-checked.
- **Auth flows.** Callback `next` is allowlisted. Recovery uses an HttpOnly bound marker. Platform-admin pages are double-gated (`middleware.ts:463-479`, plus the Core guard).
- **CORS and errors.** CORS is an explicit origin list with bearer auth (`apps/api/src/main.ts:24-29`). The `/api/health` transport detail is token-gated.
- **Secrets.**
  - Pinned gitleaks 8.30.1 (sha256-verified) scanned 2,085 commits and reported "no leaks found". The `.gitleaks.toml` allowlists are narrow, path-scoped fixtures.
  - No tracked `.env*` files.
  - No secrets in logs (grep across `apps`, `packages` and the workers).
  - `scripts/seed-role-accounts.mjs` reads its password from env.
- **Repo guards.**
  - `verify-app-router-boundaries`: PASS (149 pages)
  - `verify-build-ops-invariants`: PASS
  - `verify-type-safety`: PASS (2,051 files)

## Tooling run
| Tool | Result |
|---|---|
| `corepack pnpm --config.engine-strict=false audit --prod` | 11 advisories: 1 critical (mitigated, SEC-05), 5 high, 4 moderate, 1 low |
| `… audit` (all deps) | 25 advisories: 1 critical, 6 high, 13 moderate, 5 low |
| `node scripts/run-gitleaks.mjs` (pinned 8.30.1) | no leaks, 2,085 commits |
| `scripts/verify-*.mjs` (3 guards) | all PASS |
| semgrep | not installed; not run |

## Not covered / limits
- No live replay of the migrations: the Docker daemon was off. Production state that exists outside migrations was not inspected: dashboard-added policies, actual default ACLs, the email-confirmation setting, bucket size limits, and Realtime tables. SEC-01, SEC-02 and SEC-03 assume Supabase's standard default grants to `authenticated`, which the repo's own hardening migrations also assume. A live `has_table_privilege` query on production would settle this.
- `supabase/functions` (edge functions) were not reviewed.
- About 60 server-action files were covered by automated scan plus spot checks, not line by line. Large `roadmap` and `delivery-workflow` services were sampled.
- Finance posting segregation of duties (draft and post by the same finance user) was not judged.
- Whether `20260921181036` (SEC-02) is applied in production, and whether provider keys are set, was not checked: no production access.

## Merge verdict
**BLOCK.** SEC-01 to SEC-06 are High and confirmed. Fix order:
1. SEC-01 and SEC-02, in one additive grant/policy migration.
2. SEC-03 (prefix check in both signers).
3. SEC-05 and SEC-06 (dependency bumps; these also unblock the red CI audit gate).
4. SEC-04 (PO segregation of duties).
