# Controlled trial release-candidate handoff

## Delivery contract

- **Goal:** turn the current release-candidate branch into a locally verified
  YES-GO candidate for a controlled construction-company trial without
  weakening tenant isolation, audit immutability, or release gates.
- **In scope:** the known P0/P1/P2 release findings, including the intentional
  owner-console/demo-intake slice already present in the worktree.
- **Out of scope:** production data writes, real demo submissions, real user
  provisioning, provider configuration changes, and deployment without an
  explicit promotion authorization.
- **Release truth:** a local pass is reported as “release candidate verified
  locally; not deployed” until the protected release path and production checks
  have run against an explicitly approved target.

## Preserved worktree baseline

This branch is intentionally dirty. Before this handoff was added, the
owner-console/demo-intake slice contained changes under:

- `apps/web/src/app/book-demo/`
- `apps/web/src/app/owner/`
- `apps/web/src/components/marketing/abi-ops-landing.tsx` and its test
- `apps/web/src/lib/owner-admin.ts` and its test
- `apps/web/src/lib/owner-console-data.ts`
- `apps/web/src/lib/platform-audit.ts`
- `apps/web/src/lib/platform-demo-status.ts`
- `apps/web/src/lib/protected-route.ts` and its test
- `packages/database/src/schema/index.ts`
- `packages/database/src/schema/platform-owner.ts`
- `packages/database/src/__tests__/platform-owner-console.test.ts`
- `supabase/migrations/20260825190000_owner_console_and_demo_intake.sql`
- `docs/adrs/ADR-027-owner-console-and-demo-intake.md`
- `docs/changesets/2026-08-25-owner-console-and-demo-intake.md`
- `docs/handoffs/2026-08-25-owner-console.md`
- `docs/blockers/2026-08-25-github-actions-billing.md`

It is in scope for validation and repair. No receiving agent may reset, stash,
discard, overwrite, or silently rebase these changes. Establish the current
diff before editing a file in this list, preserve unrelated lines, and include
the final review evidence with the release candidate.

## Sequential ownership and handoffs

The required route is **Agent 01 → Agent 04 → Agent 12 → Agent 05 → Agent 03
→ Agent 13**. Agents 04 and 12 form one schema/security stage, but execute
sequentially and never edit the same file concurrently.

### 1. Agent 01 — Product/PRD Guardian

- **Inputs:** the release-audit finding, ADR-027, the owner-console migration
  and contract test, the current invariant checker, and the preserved-worktree
  baseline above.
- **Outputs:** ADR-028 and this handoff. ADR-028 fixes the exact global-table
  allowlist and the fail-closed verification contract.
- **Exit / handoff:** documentation is complete; no application, schema, or
  migration file is changed by Agent 01. → **Handoff to Agent 04.** Reason:
  validate that the existing global-table schema/migration exactly meets the
  newly recorded constraints. Inputs: ADR-027, ADR-028, preserved migration
  and database schema. Expected output: an additive, tenant-safe schema state
  with evidence for forced RLS, client-role denial, and append-only audit
  enforcement.

### 2. Agent 04 — Supabase/Drizzle Schema Lead

- **Inputs:** ADR-027, ADR-028, the uncommitted owner-console migration and
  Drizzle schema, plus the platform-owner migration contract test.
- **Outputs:** only the minimum necessary schema/migration/test correction,
  if direct evidence finds one. Both approved global tables retain forced RLS;
  neither gets `tenant_id` merely to appease the checker; the platform audit
  remains append-only. Any migration change remains additive and replayable.
- **Exit / handoff:** database-focused tests demonstrate the concrete contract
  and no cross-tenant policy is widened. → **Handoff to Agent 12.** Reason:
  implement and independently verify the release-gating security invariant.
  Inputs: Agent 04's resulting migration/schema and ADR-028. Expected output:
  a narrow checker exception with positive and negative test proof.

### 3. Agent 12 — Security / DevSecOps Agent

- **Inputs:** ADR-028; the resulting owner-console migration; the BUILD OPS
  invariant library and tests; the database migration contract test.
- **Outputs:** a fail-closed invariant implementation that accepts exactly
  `platform_demo_requests` and `platform_audit_log` only when their RLS,
  grants/policies, and audit-immutability evidence meets ADR-028. Add positive
  and synthetic negative tests for scope, missing forced RLS, direct client
  access, and a missing audit trigger. Verify no client-side database access or
  service-role exposure is introduced.
- **Exit / handoff:** focused security/invariant checks pass and the exception
  cannot be reused by a new table. → **Handoff to Agent 05.** Reason: the
  trusted server behaviors must be made atomic, tenant-bound, and auditable.
  Inputs: the validated database and invariant contracts. Expected output:
  backend regression coverage for invitations, demo persistence, owner actions,
  and immutable audit evidence.

### 4. Agent 05 — API & Backend Logic

- **Inputs:** the validated schema/security contracts; the existing signup
  trigger; owner-console server paths; role/capability contracts; and the P0
  invitation finding.
- **Outputs:** a database-backed, atomic invitation flow that joins an invitee
  to the inviter's tenant without creating an orphan tenant; server-derived
  tenant and role authority; all supported-role validation; mandatory immutable
  audit evidence; and isolated-test proof for self-signup, same-tenant invite,
  and rejected cross-tenant invite/role mutation. Keep public demo submission
  validated, rate-limited, server-only, and audited.
- **Exit / handoff:** API tests prove the security boundary and document the
  stable contracts that the routes consume. → **Handoff to Agent 03.** Reason:
  route guards, role navigation, and the public/owner user journeys need the
  finalized backend contracts. Inputs: Agent 05's contracts and tests.
  Expected output: guarded route behavior and browser-ready flows.

### 5. Agent 03 — Next.js App Router Engineer

- **Inputs:** Agent 05's server contracts; the preserved `/book-demo` and
  `/owner` implementations; role/capability matrix; and existing route tests.
- **Outputs:** protected `/owner` behavior, validated public `/book-demo`
  route, loading/error states, no browser database access, and an intentional
  13-role navigation/capability matrix. The matrix must cover visible
  navigation, direct forbidden URLs, mutations, persistence/audit effects, and
  explicit legacy-role mapping. Add a coverage assertion that fails when a
  persisted role or protected route is absent.
- **Exit / handoff:** route/unit/browser evidence is ready without adding new
  UI primitives or changing server authority. → **Handoff to Agent 13.**
  Reason: release gates, Node 22 reproducibility, and controlled-trial evidence
  must be assembled from the completed slices. Inputs: all prior test evidence
  and the complete diff. Expected output: reproducible CI/local release proof
  and an honest deployment status.

### 6. Agent 13 — CI/CD & Ops Agent

- **Inputs:** final release-candidate diff; all focused test evidence; CI and
  deployment definitions; Node 22 requirement; and the no-production-write
  boundary in this handoff.
- **Outputs:** an evidence ledger that reports lint, typecheck, all relevant
  unit/integration/database tests, invariant checks, no-skips enforcement,
  coverage thresholds, production build, migration reproducibility, and browser
  checks as PASSED, FAILED, NOT RUN, or BLOCKED. Diagnose the API inventory
  suite flake instead of masking it with a timeout. Reconcile README/CI status
  drift. Confirm the reviewed source route map includes `/book-demo` and
  `/owner`.
- **Exit:** issue a YES-GO only if every local gate is evidenced, no P0/P1
  defect remains, and the branch can be committed cleanly. Without explicit
  deployment authorization, report the verified candidate as not deployed and
  name any external blocker precisely.

## Release guardrails

- The platform-global exception is limited to ADR-028's two exact table names.
  Any other missing `tenant_id` is a release failure.
- No agent may replace tenant isolation, direct-client denial, or append-only
  audit evidence with an untested allowance, a test skip, or a service-role
  client path.
- If a new shared UI primitive, schema shape, or external provider decision is
  required, pause this chain and open the mandated agent handoff/ADR rather
  than expanding an owner's scope.
