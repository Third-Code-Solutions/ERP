# Legacy project-chat data-boundary handoff

## Finding and impact

`POST /api/ai/chat` currently authenticates and tenant-scopes the project, then
loads BOM cost/margin, invoice, and purchase-order data for every authenticated
role. The central capability registry intentionally restricts those domains.
This is a P1 confidentiality defect because a user can ask the model to repeat
data that the corresponding Finance, BOM, or Procurement surfaces do not permit.

## Existing policy authority

Do not add or reinterpret roles or capabilities in this workflow.

- Project identity/context: `project.read`.
- BOM and detailed commercial context: existing universal-search `bom` policy.
- Invoice/billing context: `finance.read`.
- Purchase-order context: existing universal-search `po` policy.
- Tenant boundary: authenticated profile `tenantId` on every query.

The current viewer breadth conflict remains `NEEDS DECISION`; fail closed to the
checked-in central policies until the product owner changes those policies.

## Acceptance criteria

1. The route uses `getUserProfile`; no hand-built user-role lookup is used.
2. The request body is parsed from `unknown` with a strict Zod schema before
   quota or provider work. Message count/content and project identifier are
   bounded.
3. Unauthenticated requests return 401; malformed requests return 400; provider
   configuration and quota failures preserve typed non-2xx behavior.
4. Project context remains tenant-scoped. A missing or foreign-tenant project
   contributes no domain context.
5. BOM, invoice, and PO database calls are skipped entirely when the caller
   lacks their existing policy grant. The system prompt never claims access to
   a denied domain.
6. Authorized roles retain the domain context currently granted by policy.
7. Private/no-store response headers are returned on success and failure.
8. Every valid provider-bound query attempts an append-only audit record with
   actor, tenant, project, message count, and the granted context domains.
9. Focused tests cover all thirteen roles, invalid input, unauthorized access,
   cross-tenant/missing projects, quota short-circuiting, audit metadata, and
   the absence of denied-domain data in the provider prompt.

## Sequential ownership

1. Agent 05 scope — API/backend contract and policy-gated data assembly in
   `apps/web/src/app/api/ai/chat/`; write tests first and change no schema.
2. Agent 08 review — verify the generated prompt cannot claim or contain denied
   domains and that provider input is bounded. Read-only unless a separate
   prompt-scope handoff becomes necessary.
3. Agent 12 review — independently verify direct API denial, tenant isolation,
   private caching, audit attempt, and provider/quota ordering.

The user's Principal Agent 3 is the sole application-source editor. Principal
Agent 4 performs independent QA, and Principal Agent 5 performs browser/API
verification only after local gates pass.

## Closeout

- Principal Agent 3 changed only the chat route, its focused test, and the
  project-generic assistant copy.
- Principal Agent 4 returned `GO`: 21/21 tests, all thirteen central role-policy
  cases, TypeScript, source lint, and gitleaks passed.
- Principal Agent 5 returned `PASS` for private 401/400/503 API boundaries and
  viewer/finance/commercial project-list, detail, refresh, direct-route, and
  assistant rendering. No live AI provider request or ERP mutation occurred.
- Production build passed with 85/85 static pages.

→ Handoff to the next project-detail authorization workflow. Reason: the
project detail page itself still queries and renders commercial/financial
summary data without applying the same domain policy. Inputs: this route's
policy mapping and tests. Expected output: independently gated project cards,
tabs, and database reads with all thirteen roles covered.
