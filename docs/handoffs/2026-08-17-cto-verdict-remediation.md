# CTO verdict remediation program — 2026-08-17

## Status

**PARTIALLY VERIFIED.** The repository-safe hardening slices are implemented
and checked with scoped local evidence. This is not an enterprise-release
approval. The worktree contains unrelated user changes; this record preserves
them and separates source evidence from provider, commercial, and release
proof.

## Evidence reconciliation

The verdict audited `5b75ba28`; it is a historical baseline rather than a
description of this dirty worktree. Current evidence is:

1. The read-only managed-Supabase ledger shows 144 hosted migrations, while
   the repository has 147. The ordered, unapplied source suffix is
   `20260817090000_tenant_membership_delegation_foundation.sql`,
   `20260817100000_harden_function_search_paths.sql`, and
   `20260817110000_explicit_server_only_rls_policies.sql`. The parity plan is
   source evidence only; none of these migrations was applied to the hosted
   project.
2. The production dependency audit currently reports zero vulnerabilities.
   This does not replace SAST, container scanning, or provider-side security
   evidence.
3. Browser API routes now have zero direct database writes. The bounded
   takeoff/document/notification routes use ERP Core; a text inventory still
   finds 30 legacy Web mutation modules outside this bounded repair. That is
   an inventory, not a claim that all 30 have distinct semantics.
4. ADR-022 and a dormant membership/delegation foundation migration now exist.
   `users.tenant_id` remains the active runtime authority, so tenant switching
   and delegated approvals are not implemented or provider-verified.
5. Two function-search-path hardenings and 56 explicit server-only RLS policy
   definitions exist in source and pass disposable PostgreSQL checks. They are
   not live until the ordered migration suffix is reviewed and applied.
6. A full local Supabase CLI migration replay is currently a failed release
   gate. It reproduces in a clean, unlinked, one-migration fixture on this
   Windows/Docker host and is documented in
   `docs/blockers/2026-08-17-supabase-cli-local-migration-replay.md`.
7. The PRD's fractional `0.10` DUPA example conflicts with the active integer
   BOM quantity column. The import, Togal, CAD, and manual-entry paths now
   fail closed or preserve source evidence rather than rounding it. Exact
   fractional support remains blocked on an ADR and additive schema migration;
   see `docs/blockers/2026-08-17-bom-fractional-quantity-schema.md`.
8. The Core document-processing client signs exact JSON and calls the private
   `/parse-evidence` worker route. The worker source had lost that route while
   repository docs still described it. The source route is now restored with
   exact-body HMAC, a five-minute freshness window, request/body bounds,
   redirect-free signed URL download, and the shared evidence response shape.
   Full worker and Core/shared contract tests pass locally. No hosted worker
   deployment or authenticated external request was performed.

| Finding | Current evidence | Disposition |
| --- | --- | --- |
| Duplicate Web/API capability matrices | Canonical policy is in `packages/shared-types/src/authorization.ts`, consumed by Web and Core | Source remediation with regression tests; no provider assertion implied. |
| Command logs omit tenant/actor correlation | Request middleware emits redacted trace, tenant, actor, role, action, and outcome fields after guards | Source remediation with focused tests; centralized retention/alerts remain blocked. |
| API integration run can report skipped suites | CI writes Vitest JSON and rejects zero, pending, skipped, todo, and failed work | Source remediation. Hosted CI execution remains separate evidence. |
| Browser E2E may be green by omission | Trusted-PR workflow requires an isolated target and rejects zero/skipped/flaky/unexpected Playwright JSON | Blocked until operators configure a disposable origin, Supabase URL/key, dedicated users, and project ID. Fork PRs remain excluded because credentials cannot be safely exposed. |
| Direct Web/API mutation authority | Browser API static inventory reports zero direct database writes; Core owns the five previously identified API writes | Partially remediated. Legacy Server Actions, workers, and service modules still require a domain-by-domain authority migration. |
| Multi-tenant memberships/delegated approvals | ADR-022 plus a fail-closed, dormant foundation migration and schema tests | Foundation complete in source; hosted application and delegation-matrix adoption remain blocked. |
| Distributed rate limiting, central logs, Sentry, alerts, SLOs, backups | Opt-in Upstash adapter and local structured request correlation exist; no provider setup was created | Provider approval, budget, credentials, centralized telemetry/alerts, multi-instance proof, backup/Storage backup, and restore drill remain blocked. |
| RLS/function advisors | Read-only provider advisors report 56 no-policy infos, two mutable-search-path warnings, eight authenticated `SECURITY DEFINER` warnings, vector in `public`, and leaked-password protection disabled | Source migrations address the first 58 findings when reviewed/applied. Do not revoke the remaining helper functions or move `vector` blindly; provider API exposure and workload evidence are required. |
| VAT, delegation, Excel/Togal, rate ownership, retention, SAP, vendor portal | Open ABI/product decisions and no real sanitized templates | Blocked on accountable source material and sign-off. |
| Fractional BOM quantities | PRD worked example uses `0.10`; active BOM schema uses an integer | Lossy rounding removed; exact support blocked on ADR, schema migration, and real workbook evidence. |
| Core CAD private worker bridge | Core calls signed `/parse-evidence`; worker source previously returned 404 | Source route restored with exact-body HMAC and bounded evidence tests; hosted deployment and disposable signed-request proof remain not run. |
| Live deployment, hosted RLS, backups, restore, estimator acceptance | No hosted application schema/customer-tenant data mutation, deployment, authenticated E2E, or customer-tenant test was performed. One isolated public-page check emitted anonymous page-view telemetry. | Blocked on authorized external evidence. |
| Full Supabase migration reproducibility | `supabase start` and `db reset --local` fail at the first `CREATE` statement in both CLI 2.109.1 and current 2.114.0; a one-statement fixture reproduces it | Failed verification and third-party tooling blocker. Historical migrations were not rewritten to mask it. |

## Remaining handoff plan

1. **Agent 13 — CI/CD & Ops:** configure authenticated browser proof only for
   an authorized disposable target; add monitoring, alerting, backup/restore
   evidence, and SAST/container controls with approved provider accounts,
   budgets, and runbooks. Resolve or obtain an approved workaround for the
   local Supabase CLI replay defect before treating database reproducibility
   as green.
2. **Agent 01 — Product/PRD Guardian:** ratify ADR-022 adoption sequencing,
   the delegated-approval matrix, fractional BOM quantity representation, and
   the final transactional-write authority plan. Do not alter ABI policy
   defaults without accountable sign-off.
3. **Agent 04 + Agent 05:** apply the three-migration suffix only after
   reviewed backup/rollback evidence, then migrate legacy write domains in
   explicit, independently tested slices. Plan a separate, additive
   fractional-quantity migration only after its ADR is approved. Do not move
   FKs or change active tenant authority as part of the dormant foundation
   migration.
4. **Agent 12 + Agent 13:** confirm hosted Data API schema exposure before
   relocating/revoking the remaining `SECURITY DEFINER` helpers; obtain query
   evidence before adding the advisor-suggested indexes; test vector relocation
   as a dedicated compatibility change.
5. **Agent 14 + ABI commercial owner:** supply signed regulation/policy inputs
   and real sanitized templates before compliance/importer completion is
   represented as verified.

## Acceptance criteria for the completed repository-safe slices

- Canonical `ErpRole`/`ErpCapability` policy is consumed by Web and Core.
- Browser API write routes do not write directly to the database; the bounded
  routes have Core contracts and focused tests.
- BOM import/CAD/manual paths never silently round a fractional source quantity
  into an integer-priced line, and import mutations are draft-only.
- Distributed mode uses atomic Upstash REST accounting with salted identity
  digests and fails closed on selected-provider configuration or outage.
- The visual provider quota is consumed before Core document-intake state is
  created; visual extraction returns unpriced candidates without direct Web
  pricing or database writes.
- ADR-022, its additive dormant migration, and tests preserve the current
  active `users.tenant_id` authority until adoption is explicitly approved.
- Source migrations harden the two mutable search paths and define explicit
  deny policies for the 56 server-only tables; disposable PostgreSQL checks
  prove behavior before any hosted application.
- The Core CAD bridge and Python worker agree on the signed `/parse-evidence`
  request/response contract, without worker database or tenant authority.
- No hosted application schema, customer-tenant data, production deployment,
  credential, or ABI commercial policy was mutated.

## Completion and next handoff

Completed local handoffs: canonical Web/Core authorization, bounded Core
authority for the identified browser API writes, tenant/delegation Phase 0,
distributed rate-limit source adapter, provider quota, request correlation,
source security migrations, parity planning, and no-skip CI assertions.

→ Handoff to Agent 13. Reason: authenticated browser execution, backup/restore,
centralized telemetry, hosted configuration, and the CLI reproducibility gate
need authorized operational targets. Inputs: a disposable environment, protected
E2E credentials, provider runbooks, and an approved resolution for the local
Supabase CLI defect. Expected output: target-specific evidence, not inferred
production readiness.
