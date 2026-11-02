# ERP repository turnover audit — five independent companies

Date: 11 October 2026. Source: `b3f8a9bc`, branch `agent-04/production-qa-remediation`. Working tree was clean before audit reporting.

## Decision

**Do not hand this revision over as an unrestricted, production-accepted ERP yet.** Substantial working implementation exists, but confirmed authorization and financial defects, seller-specific ownership/deployment constraints, and incomplete operational acceptance block that claim.

The assessment assumes five separate company installations, each buying the repository and using it internally. A white-label SaaS platform, subscription billing, public tenant switching, and automatic customer provisioning are **not prerequisites** for this sale. Independent ownership, correct company documents, reliable financial calculations, permissions, recoverability, and a reproducible installation are prerequisites.

This is a bounded source and local-execution audit, not a claim that every possible bug has been discovered. No buyer environment or production provider was changed. No application fixes, commits, pushes, or deployments were performed.

The register contains **26 findings: 13 P1 (including two conditional feature blockers), 11 P2, and two P3**. The most consequential are unauthorized tender/print access, inconsistent DUPA/BOM/invoice amounts, missing fractional quantities, and ownership/deployment still tied to the seller.

## Evidence and severity

- **Reproduced:** executed against this source or a disposable local database.
- **Source-confirmed:** traced through relevant callers, validation, persistence, or rendering; full hosted/browser exploit was not executed.
- **Acceptance gap:** evidence needed for turnover is absent or incomplete in the inspected material; not proof that an undocumented external process does not exist.
- **P1:** blocks the affected operational capability or independent installation. Conditional findings block only a feature included in the buyer's scope.
- **P2:** material reliability, setup, documentation, or support gap; resolve before the affected workflow is accepted.
- **P3:** lower-priority quality/policy gap. No confirmed P0 incident or cross-company production leak was established.

## Findings register

### 01 — P1 — Viewer can mutate tender records directly

**Reproduced.** Tender RLS checks tenant membership but not tender management/evaluation permission. In the disposable database, an authenticated Viewer successfully changed a tender from draft to submitted. Browser-facing Data API access can bypass the stricter Core endpoint guards when the corresponding table grants exist.

Evidence: [tender migration:190–192](../../supabase/migrations/20260910190000_tender_bid_mode.sql), [capabilities:104–105](../../packages/shared-types/src/authorization.ts), [CI grants:23–24](../../scripts/ci/supabase-system-bootstrap.sql). The five tender tables receive tenant-only mutation policies. The test used repository bootstrap grants; hosted grants were not inspected.

**Close:** prohibit direct client writes or enforce the same role/capability checks in RLS. Test Viewer insert/update/delete denial, authorized writes, and cross-tenant denial against the actual buyer database.

### 02 — P1 — Print routes bypass dashboard role restrictions

**Source-confirmed.** Invoice, PO, and BIR print pages check that a profile exists, then read tenant-filtered records. They sit outside the dashboard layout that enforces route roles. An authenticated user excluded from finance/procurement pages can request a known same-tenant document URL directly.

Evidence: [invoice print:24](../../apps/web/src/app/(print)/invoices/[id]/print/page.tsx), [PO print:24](../../apps/web/src/app/(print)/purchase-orders/[id]/print/page.tsx), [BIR print:38](../../apps/web/src/app/(print)/invoices/[id]/bir2307/page.tsx), [route policies:432,637,695](../../apps/web/src/lib/operations/nav-config.ts), [dashboard guard:35](../../apps/web/src/app/(dashboard)/layout.tsx). Tenant filters are present; this finding is an intra-company role leak, not an established cross-tenant leak.

**Close:** authorize companion documents before reads, using the intended shared capability policy. Exercise allowed and denied roles on all three URLs.

### 03 — P1 — DUPA edits leave parent BOM totals stale

**Reproduced and source-confirmed.** Saving a DUPA updates component totals and the BOM line, but does not roll up parent BOM cost, contract value, and margin. The UI refreshes and continues displaying the stored parent value. Signing, award, and invoice paths consume that stored value.

Local probe: initial stored BOM total `1,000` centavos; derived line total `12,700`. After changing material rate, line total became `25,400`; BOM total remained `1,000`. Values were synthetic and the transaction was rolled back.

Evidence: [DUPA action:520–705](../../apps/web/src/app/(dashboard)/projects/[id]/bom/actions.ts), [SQL recalculation:552–577](../../supabase/migrations/20260812180000_wo_06_dupa_engine.sql), [editor save:228–266](../../apps/web/src/components/bom/dupa-editor.tsx), [invoice draft:248](../../apps/api/src/finance/customer-invoice-draft-create.service.ts), [award:753,822](../../packages/operations/src/signed-bom-award.ts).

**Close:** recompute parent aggregates atomically for every component/shared-rate change; prove signed value, invoice base, award amount, and displayed totals agree.

### 04 — P1 — DUPA selling price is counted as raw cost

**Reproduced and source-confirmed.** DUPA's rate including OCM, profit, and VAT is written to `unit_cost_cents`. Parent recalculation treats that field as raw cost and subtracts it from selling value. An all-DUPA BOM therefore reports zero gross profit despite configured profit.

Local probe after rate change: direct cost `20,000`; alleged unit cost `25,400`; selling total `25,400`; application GP formula `0` centavos.

Evidence: [DUPA SQL:545–573](../../supabase/migrations/20260812180000_wo_06_dupa_engine.sql), [BOM rollup:2096–2111](../../apps/web/src/app/(dashboard)/projects/[id]/bom/actions.ts).

**Close:** define separate cost, selling, and tax bases. Verify pure DUPA and mixed manual/DUPA BOMs, discounts/overheads where applicable, and downstream margin reports.

### 05 — P1 — Invoice flow calculates VAT again on VAT-inclusive DUPA value

**Source-confirmed.** DUPA total already includes VAT. Once BOM totals are rolled up, invoice draft creation takes TCV as subtotal, deducts retention, then adds VAT again. The flow lacks an explicit tax-inclusive/exclusive monetary contract.

Example under current defaults: direct cost `10,000` centavos produces DUPA total `12,700`; 100% billing deducts `1,270` retention and calculates another `1,372` VAT. This demonstrates the arithmetic path; it is not a tax-law determination. Invoice calculation also hardcodes VAT/EWT and retention instead of consuming a buyer-approved tax profile.

Evidence: [DUPA calculation:259–263](../../packages/shared-types/src/bom/dupa.ts), [invoice calculation:42,248–258](../../apps/api/src/finance/customer-invoice-draft-create.service.ts), [VAT/EWT helpers:141–147](../../packages/shared-types/src/bom/calculations.ts).

**Close:** agree monetary and tax bases with each buyer's finance owner, snapshot applicable rates, and reconcile BOM, contract, partial bills, retention, tax, and ledger amounts using signed expected examples.

### 06 — P1 — Fractional construction quantities cannot complete BOM import/editing

**Source-confirmed; existing tests enforce the limitation.** BOM quantity validation and storage are integers. Takeoff import marks fractional quantities unresolved rather than committing them. Ordinary measurements such as `0.1 cu.m` or `12.5 sqm` cannot be represented faithfully despite decimal DUPA support.

Evidence: [BOM schema:21](../../packages/shared-types/src/bom/schemas.ts), [database field:50](../../packages/database/src/schema/bom-line-items.ts), [takeoff conversion:28–42](../../packages/shared-types/src/bom/takeoff.ts), [fractional rejection test:6–29](../../packages/shared-types/src/bom/__tests__/takeoff.test.ts).

**Close:** choose supported precision and rounding; migrate additively across import, editing, money calculation, PO conversion, and exports. Keep rejection until the full path is safe; do not silently round quantities.

### 07 — P1 — Buyer cannot independently assume platform ownership through configuration

**Source-confirmed turnover constraint.** Platform Control requires a hardcoded seller email in Web, Core, and database logic. Database checks and immutable identity binding prevent an ordinary configuration-only transfer. This was intentional under ADR-027; it does not satisfy independent full-system ownership.

Evidence: [owner guard:22,64,95](../../apps/api/src/auth/platform-owner.guard.ts), [shared identity:6](../../packages/shared-types/src/erp-api/platform-administration.ts), [middleware:465](../../apps/web/src/middleware.ts), [owner migration:169,414,459](../../supabase/migrations/20260904020000_platform_owner_administration_boundary.sql).

**Close:** implement a reviewed bootstrap/transfer process tied to the buyer's verified immutable identity; reconcile application and database enforcement. Verify recovery without the seller's personal account. Ordinary tenant-admin access is not equivalent to platform ownership.

### 08 — P1 — Production release workflow targets seller-owned resources

**Source-confirmed turnover constraint.** Production configuration embeds the existing Supabase project, Railway identifiers, Vercel scope/project, and health-test URLs. Self-hosted CI also depends on a particular actor/runner. Copying the repository does not create five independent deployment targets.

Evidence: [production workflow:33–43,125–150,191–198](../../.github/workflows/deploy-production.yml), [self-hosted workflow:16–17](../../.github/workflows/ci-self-hosted.yml), [runner registration:117](../../scripts/ci/run-transient-github-runner.ps1), [release identity defaults:53](../../scripts/release-identity-plan.mjs).

**Close:** buyer-specific, validated target configuration with separate accounts, projects, domains, secrets, backups, and release identities. Preserve exact-target safety checks. Prove a fresh buyer installation never connects to the seller's systems.

### 09 — P1 — Documented read-only credential is deployed as the runtime write credential

**Source-confirmed configuration contradiction.** Documentation describes `PRODUCTION_DATABASE_URL` as read-only for release checks. The deployment workflow installs that same value as Web's runtime `DATABASE_URL`; Web still performs direct writes. Following the read-only instruction breaks these mutations. Supplying a writer instead invalidates the documented read-only boundary.

Evidence: [environment contract:41](../ENVIRONMENT_VARIABLES.md), [deployment command:183](../../.github/workflows/deploy-production.yml), [CRM writes:96,179](../../apps/web/src/app/(dashboard)/crm/accounts/actions.ts), [DUPA writes:520](../../apps/web/src/app/(dashboard)/projects/[id]/bom/actions.ts). Actual hosted credential privilege was not queried.

**Close:** separate verification, runtime, and migration credentials with tested privileges; document the remaining direct-Web database boundary accurately.

### 10 — P1 — Documented fresh-start procedure does not configure the actual runtime

**Source-confirmed turnover gap.** README configures only Web's environment, starts Supabase, and says `pnpm dev` starts Web/workers. Core requires `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and Redis; Nest configuration does not explicitly load Web's environment. The environment guide claims five variables suffice and everything else safely no-ops. Core commands, including project creation, are now required paths. Python workers are not started by the workspace command as the comment implies.

Evidence: [README quick start:27–39](../../README.md), [environment minimum:536–548](../ENVIRONMENT_VARIABLES.md), [Core validation:28–35](../../apps/api/src/config/environment.ts), [Core configuration:47](../../apps/api/src/app.module.ts), [project creation:40](../../apps/web/src/app/(dashboard)/projects/new/actions.ts), [workspace definition](../../pnpm-workspace.yaml). Root `.env.example` does contain Core/Redis keys; the missing piece is a correct, verified installation procedure, not absence of every variable template.

**Close:** test clean checkout → dependencies → isolated services → migrations → buyer administrator → first project → first document on a fresh machine. Document environment loading per service and optional versus mandatory components.

### 11 — P1 — Current production dependency security gate fails

**Reproduced.** `pnpm audit --prod --audit-level low --json` reports seven advisories: two critical, two high, three moderate. This is dependency classification, not proof of seven exploitable application vulnerabilities. In particular, Express trust-proxy configuration and application use of `gel`/`shell-quote` were not established.

| Locked package | Severity | Advisory / minimum reported fix |
|---|---|---|
| `proxy-addr@2.0.7` | Critical | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h); `2.0.8` |
| `shell-quote@1.9.0` | Critical | [GHSA-pqg4-j6r4-53mv](https://github.com/advisories/GHSA-pqg4-j6r4-53mv); `1.11.0` |
| `source-map-js@1.2.1` | High | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q); `1.2.2` |
| `sharp@0.35.4` | High | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w); `0.35.5` |
| `next@15.5.25` | Moderate | [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676); `15.5.27` |
| `next@15.5.25` | Moderate | [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p); `15.5.27` |
| `sprintf-js@1.0.3` | Moderate | [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c); registry reported no patched version |

Paths include Express → proxy-addr; Drizzle → gel → shell-quote; Next → sharp; Tailwind/PostCSS → source-map-js; mammoth → argparse → sprintf-js. Workspace overrides pin some affected versions.

**Close:** update/remediate affected paths, verify advisory applicability, rerun the locked install, audit, build, and relevant image/document/server tests. Unpatched paths need a documented mitigation or replacement, not a disabled gate.

### 12 — P1 if statutory-form delivery is included — BIR 2307 is a draft with incomplete identity

**Source-confirmed.** The page permanently labels output draft, leaves registered-address data blank, hardcodes one TIN as `N/A`, and substitutes project location for a registered address. Current tenant/account data cannot supply all rendered legal-identity fields. A visible form is not proof of an issuable company-specific document.

Evidence: [BIR output:140,234,252–253,417–418](../../apps/web/src/app/(print)/invoices/[id]/bir2307/page.tsx), [tenant fields:20](../../packages/database/src/schema/tenants.ts).

**Close:** explicitly exclude issuance from the initial contract, or complete payer/payee data and rendering and obtain buyer finance/compliance acceptance against the applicable official form. Retain truthful draft labeling until accepted.

### 13 — P1 when reservation feature is enabled — Normal stock movements ignore reservations

**Source-confirmed; gated roadmap feature.** Reservation availability subtracts active reservations, but ordinary stock posting checks ledger stock without reservations. Reserving all ten units does not prevent an ordinary consumption/transfer of those ten units. Reservation consumption itself changes status without a linked ledger movement.

Evidence: [reservation flow:682–700](../../apps/api/src/roadmap/roadmap.service.ts), [stock posting:772–784](../../supabase/migrations/20260726245000_stock_movement_controls.sql). This does not establish that ordinary stock posting is broken when reservations remain disabled.

**Close:** one locked availability rule and atomic reservation-to-movement consumption; test simultaneous reserve/transfer/consume/release. Keep the feature excluded and disabled until proven.

### 14 — P2 — Customer emails identify the seller as the operating company

**Source-confirmed.** Shared transactional email HTML and text say messages are sent for Actuate Builders Inc. Changing sender credentials/address does not replace this body copy.

Evidence: [email wrapper:112–119](../../apps/web/src/lib/operations/integrations/resend.ts). Some reports also retain an `A` mark; PO/invoice print pages already read tenant name/TIN, so document identity is partially implemented, not wholly absent.

**Close:** supply buyer company identity to operational emails and documents. Keeping ABI OPS product branding is compatible with the user's non-white-label scope; falsely identifying the operating company is not.

### 15 — P2 — Storage quota can be bypassed through abandoned or mis-sized uploads

**Source-confirmed.** Upload signing sums completed document sizes without reserving capacity. Uploading then skipping completion leaves objects outside quota accounting; completion trusts caller-declared size. A reservation table exists but is disconnected from this path.

Evidence: [sign route:58–93](../../apps/web/src/app/api/upload/sign/route.ts), [completion persistence:152–161](../../apps/api/src/documents/document-intake.service.ts), [active client:75](../../apps/web/src/components/cad/use-cad-upload.ts).

**Close:** reserve capacity before signing; verify provider object size; reconcile/expire abandoned objects and concurrent requests. Hosted upload and provider-wide bucket limits were not tested.

### 16 — P2 — Tenant suspension does not stop existing customer portal links

**Source-confirmed.** Token resolution checks hash, expiry, and revocation but not tenant status. Suspension changes tenant state without revoking those tokens. Portal reads/downloads and warranty submissions can remain available to existing link holders.

Evidence: [token resolver:68–87](../../apps/web/src/lib/operations/customer-portal.ts), [suspension:311–341](../../apps/api/src/platform-admin/platform-administration.service.ts), [portal documents:70,119–153](../../apps/web/src/app/portal/project/[token]/documents/page.tsx), [warranty action:52–85](../../apps/web/src/app/portal/warranty/[token]/actions.ts).

**Close:** central active-tenant validation at token resolution and mutation boundaries; define and test suspend/resume behavior. No live tenant was suspended during this audit.

### 17 — P2 when roadmap delivery workers are enabled — Claimed outbox work has no crash recovery

**Source-confirmed.** SAP/email/SMS workers commit `processing` before calling the provider. Subsequent sweeps select only `pending`; no lease/reclaim path was found. A crash between claim and final update strands the item. Period close counts processing rows, so it can also remain blocked.

Evidence: [outbox claims:228–235,269–276](../../apps/api/src/roadmap/roadmap-integration.service.ts), [queue policy:24–28](../../apps/api/src/roadmap/roadmap-integration.queue.ts), [period close:1175–1176](../../apps/api/src/roadmap/roadmap.service.ts).

**Close:** expiring/fenced claims plus provider idempotency and reconciliation. Crash-test before, during, and after delivery; avoid duplicate postings on recovery. Applies only to enabled roadmap adapters.

### 18 — P2 — Approval configuration and roadmap adapters exceed proven operational scope

**Source-confirmed sales-scope gap.** Configured process rules return `mode: 'preview_only'`; delegated approval has no active evaluator. Roadmap UI describes guarded release, features require enablement, and the SAP adapter is a generic `/postings` contract rather than verified buyer-specific module integration.

Evidence: [process preview:426–430](../../apps/api/src/process/process.service.ts), [roadmap page:54–74](../../apps/web/src/app/(dashboard)/roadmap/page.tsx), [feature gate:189–214](../../apps/api/src/roadmap/roadmap.service.ts), [SAP adapter:130–154](../../apps/api/src/roadmap/roadmap-integration.service.ts); ADR-022 and ADR-038.

**Close:** approve a feature inclusion matrix for every buyer. Do not sell configurable delegation, SAP, currency, or statutory roadmap capabilities as operational solely because tables/endpoints/screens exist. Existing fixed workflow approvals are separate and were not found universally broken.

### 19 — P2 — Buyer initialization lacks a complete guided or documented operating path

**Source-confirmed setup gap.** Signup promises guided setup but redirects to dashboard; no dedicated onboarding route/completion state was found. Settings handles only a subset of company identity. This is acceptable only if a tested, documented operator-led installation supplies the missing steps.

Evidence: [signup:67,91](../../apps/web/src/app/(auth)/auth/signup/signup-form.tsx), [callback default:1](../../apps/web/src/app/api/auth/callback/redirect.ts), [settings input:14](../../apps/web/src/app/(dashboard)/settings/actions.ts).

**Close:** choose either guided onboarding or a buyer installation checklist covering verified admin, company identity, users/roles, finance policy, initial balances, vendors/items/UOM/warehouses, integrations, and opening acceptance. Self-service SaaS onboarding is not required.

### 20 — P2 — Documentation authority check fails; setup/release documentation has drifted

**Reproduced.** `verify-doc-authority.mjs` still expects PRD v1.4 while the current PRD is v1.5. The checker fails on this revision. Root agent stack instructions also describe older pnpm/tRPC/Postgres choices; actual source uses pnpm 10, Nest, and Postgres 17. Deployment prose describes migration application while the current production workflow is a code-only release requiring a current ledger.

Evidence: [authority checker](../../scripts/verify-doc-authority.mjs), [PRD](../PRD.md), [deployment guide](../DEPLOYMENT.md), [production workflow](../../.github/workflows/deploy-production.yml), [package contract](../../package.json).

**Close:** reconcile authority/version checks and operational instructions to the accepted implementation. Preserve intentional safety gates; do not simply remove a failing checker.

### 21 — P2 acceptance blocker — No current five-buyer production acceptance evidence

**Acceptance gap.** The inspected September 28 release blocker recorded failed/flaky browser acceptance and a skipped password-recovery proof. October 4 remediation records local fixes and says deployed validation remains necessary. Those are dated records, not proof of today's live state or of any buyer installation.

Evidence: [September release blocker](../blockers/2026-09-28-ten-company-production-release.md), [October remediation](../changesets/2026-10-04-production-qa-remediation.md). Current audit did not query deployed provider state, migration ledgers, jobs, or real delivery providers.

**Close:** pin one accepted release; verify exact Web/Core/database/worker versions in each buyer environment; run role-based UAT, auth recovery, critical financial/stock journeys, provider canaries, and error/retry tests. Record acceptance per company, not once for all five.

### 22 — P2 acceptance blocker — Backup documentation is not a demonstrated buyer recovery service

**Acceptance gap.** A database release/recovery runbook exists and explicitly separates database recovery from storage-object backup. The workflow still refers to code-only release while PITR is unavailable. No completed buyer-specific backup schedule, retention, RPO/RTO, storage recovery, or restore drill was established by this audit.

Evidence: [database release runbook:134–141](../runbooks/database-release.md), [production workflow:155–158](../../.github/workflows/deploy-production.yml). This is not a claim that no external backups exist.

**Close:** establish buyer-owned backup/recovery, include uploaded documents and signing artifacts, and restore into a separate environment with reconciled records and permissions before live financial use.

### 23 — P2 commercial/operating gap — Repository sale and support package need explicit acceptance

**Acceptance gap.** README calls the code proprietary to Actuate Builders Inc.; no root license defining buyer source rights was found. A repository alone does not specify modification rights, redistribution limits, update obligations, hosting costs, incident ownership, training, or support duration. This audit does not determine legal ownership or contractual validity.

Evidence: [README license section](../../README.md). Existing technical runbooks do not establish a signed buyer handover/support agreement.

**Close:** provide an agreed source-delivery/license scope, dependency notices, installation/recovery guide, role-based operating instructions, training/UAT sign-off, known limitations, support contacts, and an update policy. Deliver no seller credentials or existing company data. Keep one maintained source release with buyer configuration where practical; avoid five uncontrolled code forks.

### 24 — P3 — Route-specific loading/recovery policy is incompletely implemented

**Static inventory.** Of 149 App Router pages, 57 lack sibling `loading.tsx` and 110 lack sibling `error.tsx`. Parent boundaries cover many routes, so these counts are not 167 crashes. The dashboard parent loading skeleton is KPI-oriented and can be misleading on unrelated workflows. This also falls short of the repository's explicit per-route gate.

Evidence: [dashboard loading](../../apps/web/src/app/(dashboard)/loading.tsx), [dashboard error](../../apps/web/src/app/(dashboard)/error.tsx), Agent 03 quality gates in [AGENTS.md](../../AGENTS.md).

**Close:** use appropriate route-family recovery/loading boundaries for critical journeys and clarify the quality gate. Do not add duplicate files merely to satisfy a count.

### 25 — P3 — Release tests contain line-ending and manifest contract drift

**Reproduced.** The release-script test `CI runs document, role and smoke readiness regressions without production credentials` fails on this checkout because its literal backslash/newline expression does not accept CRLF. Normalizing the same workflow text to LF makes that expression match. This is a local verification portability defect, not evidence that the browser job is absent from CI.

The existing public browser test also fails at its manifest assertion: it expects `start_url: '/'`, while the checked-in manifest and rendered response use `/dashboard`. The browser test stops there, so its later responsive and interaction assertions did not execute in that run. A dashboard launch may be intentional; the mismatch is confirmed, not an established bad product decision.

Evidence: [test expression:210](../../scripts/verify-build-ops-invariants.test.mjs), [.gitattributes](../../.gitattributes), [CI workflow](../../.github/workflows/ci.yml), [browser assertion:74–77](../../apps/web/e2e/frontend-release-local.spec.ts), [manifest](../../apps/web/src/app/manifest.ts).

**Close:** normalize input or match both line endings; reconcile intended PWA startup behavior with its acceptance test. Verify the complete browser journey and Windows/Linux contract tests without suppressing real failures.

### 26 — P2 — Python workers are outside the routine build/test/security gates

**Source-confirmed coverage gap.** Python DXF/AI workers have their own tests, but the checked workflows do not run pytest or build those worker images. The workspace glob covers `apps/*`, not these nested Python projects. The security job scans the pnpm dependency graph and secrets; it does not audit Python dependencies or implement the SAST/container scanners named in Agent 12's policy. Worker dependency declarations use open lower bounds and their Dockerfiles install from those declarations, so rebuilding the same source can select different Python packages.

Evidence: [CI security job:529–549](../../.github/workflows/ci.yml), [workspace definition](../../pnpm-workspace.yaml), [DXF dependencies](../../apps/workers/dxf-parser/pyproject.toml), [AI dependencies](../../apps/workers/ai/pyproject.toml), [DXF Dockerfile](../../apps/workers/dxf-parser/Dockerfile).

**Close:** add reproducible worker dependency resolution, worker tests/image smoke checks, and reviewed cross-language/container security coverage to the release gate. A green JavaScript build must not be presented as verification of the entire delivered system.

## Verification ledger

Execution used Node `22.23.2`, pnpm `10.33.0`, and a disposable local Postgres `17.6` container. Real production database/Redis credentials were not supplied to the checks.

| Check | Result | Meaning / limitation |
|---|---|---|
| Configured source lint, `pnpm lint` | PASSED | Root configured scope; zero warnings allowed |
| `pnpm turbo typecheck --force` | PASSED | Six tasks, no cache; includes Web E2E TypeScript configurations |
| Ordered database replay + seed | PASSED | All 177 migrations; repository CI Supabase system bootstrap, not full hosted Auth/Storage emulation |
| Database Vitest suite with all database gates enabled | PASSED | 516 passed, 0 failed, 0 pending; disposable DB |
| Tender authorization probe | FAILED security expectation | Viewer update succeeded; rolled back |
| DUPA aggregate/cost probe | FAILED monetary consistency expectation | Parent total stale and calculated GP zero; rolled back |
| Production dependency audit | FAILED | Seven advisories, listed above |
| Gitleaks history scan | PASSED | 2,080 commits / approximately 58 MB scanned; no detected leaks, not a guarantee of absence |
| ABI branding / type-safety / App Router boundary scanners | PASSED | 3,479 text files / 2,051 source files / 149 pages respectively; narrow static checks |
| Build-ops invariant scanner | PASSED | Static invariant checks, not end-to-end operating proof |
| Managed Supabase parity-plan scanner | PASSED | Validated a dated manifest against source; did not query today's hosted migration state |
| Documentation authority scanner | FAILED | PRD v1.5 versus hardcoded v1.4 |
| Workspace test suite | FAILED | Shared-types: 561 passed; operations: 9 passed. API: 1,564 passed / 1 timed out / 0 skipped. Initial database run without DB: 318 passed / 198 skipped; all 516 later passed with DB. Root run stopped on API failure; separate Web result below |
| Separate Web test suite | PASSED with skips | 2,652 passed / 0 failed / 6 skipped. Skips: management-dashboard DB query (1), account/KYC transactional DB tests (4), proposal-change workflow DB test (1); no DB supplied to this run |
| API failed-file rerun | FAILED | Stock-movement creation controller: 2 passed / 1 failed; same first test exceeded its five-second timeout. No assertion proved that missing idempotency keys were accepted |
| Release-script tests | FAILED | 340 passed / 3 failed / 0 skipped initially. PRD authority and CRLF contract failures reproduced in a targeted rerun (9 passed / 2 failed). Third failure was a branding scan racing with the concurrent build's changing `.next` output; isolated branding recheck passed both tests |
| Fresh production build | PASSED | Web and Core, 2 tasks / 0 cached, 14m23s. Synthetic local service configuration; rebuild with buyer configuration for deployment. Python workers are not covered |
| Existing public browser release test | FAILED | Manifest expects `/`; current response is `/dashboard`. Test stopped before later assertions; original test was not modified |
| Independent public browser diagnostics | PASSED | Production Web build in Chrome: 1440/768/390px overflow, context control, quote navigation, FAQ, login render, anonymous print redirect, local DB readiness, liveness/deep-health behavior with unavailable Core; no public-page console/page errors |
| Full authenticated E2E, provider integrations, production load, recovery drill | NOT RUN | No buyer deployment/credentials or production acceptance exercise in this audit |
| Official Supabase CLI schema diff and migration rollback drill | NOT RUN | Forward replay alone does not prove every rollback or hosted managed-schema match |
| Python worker tests / container and cross-language security scans | NOT RUN | Local Python lacked worker test dependencies; no worker environment or image was built during this audit |

Passing tests do not invalidate reproduced defects. Some existing tests check SQL/source structure or expected limitations; the missing integrated cases are part of the corrective work.

The API failure is `inventory-stock-movement-creation.controller.spec.ts:70`, “requires an idempotency key before the command boundary.” Full run reported `Test timed out in 5000ms`; elapsed test duration was approximately 68.8 seconds, and the targeted rerun took approximately 26.7 seconds before failure. The next two tests passed. Cold initialization/resource contention remains a hypothesis, not an established product root cause. Timeout limits were not changed, and the failed run is not reported as green.

Audit cleanup: disposable database was removed. Automatic approval review rejected temporary-file deletion with `blocked by policy`; verification scripts/results remain outside the repository in `C:\Users\MSI\AppData\Local\Temp\erp-turnover-audit-20261011`. Only this report, its handoff note, and its changeset were added to the repository. Source SHA remained unchanged.

## Coverage and unverified areas

| Area | Evidence reviewed | Remaining acceptance |
|---|---|---|
| Identity, roles, tenancy | Guards, route policies, owner binding, tender RLS, portal/upload paths; DB suite | Hosted grants, real role browser matrix, password recovery and buyer owner bootstrap |
| CRM/projects/pipeline | Entry points, setup dependency, selected commands and shared tests | Each buyer's lead → opportunity → project journey and required approval policy |
| BOM/DUPA/takeoff/award | Calculation/storage flow, sign/invoice consumers, synthetic DB probes | Corrected decimal/monetary flows, import fixtures, signing and award E2E |
| Procurement/inventory | Command patterns, stock posting and reservation interaction | Concurrent operations, purchasing → receipt → stock → supplier bill reconciliation |
| Finance/accounting | Invoice draft and tax flow, database finance suites | Buyer-approved tax examples, ledger/cash/AR/AP reconciliation, opening balances and period close |
| Documents/portals/signing | Upload quotas, portal token resolution, print authorization | Actual storage, email, signature providers, expiry/retry and device tests |
| Site execution/quality/warranty | Selected route and offline source review | Field-device/offline replay, attachments, inspection/RFI/punchlist/turnover/warranty UAT |
| AI/CAD/OCR | Package/configuration and existing test coverage only | Python worker runtime, real drawings, retrieval evaluation, latency/cost and provider failure tests |
| Roadmap/SAP/delegation | Feature gates, preview rules, adapter/outbox source | Explicit scope exclusion or dedicated implementation and provider acceptance |
| Deployment/operations | Workflows, environment docs, release records, local forward replay | Five independent installs, live health/jobs, backups/restore, monitoring and support ownership |

## Recommended delivery sequence

1. **Agree the product being sold.** Write a one-page inclusion/exclusion matrix per buyer. Confirm internal single-company use, source rights, retained product branding, tax/forms scope, integrations, and support terms. Do not imply disabled roadmap features are complete.
2. **Fix shared release blockers once.** Address findings 01–11; address 12–13 if sold. Treat 03–05 as one monetary-contract repair, not three isolated display fixes. Add regression tests that reproduce the actual authorization and monetary failures. Resolve the dependency and documentation gates without weakening controls.
3. **Make installation transferable.** Buyer-owned identities, accounts, secrets, domains, service configuration, and company document profile. One versioned installation procedure, exercised from a clean checkout.
4. **Pilot one buyer environment.** Synthetic acceptance data first; import real opening data only through an approved migration/cutover plan. Reconcile financial and stock totals and conduct role-based UAT and restore drill.
5. **Repeat acceptance for the other four.** Reuse the accepted release; verify each company's configuration, identities, data, integrations, backups, and signed UAT independently.

Minimum turnover evidence for **each** company: accepted source SHA/tag; service and migration versions; buyer administrator/recovery control; signed feature/permission matrix; company identity and finance settings; reconciled opening data; critical workflow test results; provider and scheduled-job checks; backup/restore proof; operating guide and training; known-limitations register; support/update ownership. No need to build a white-label SaaS platform to satisfy this package.
