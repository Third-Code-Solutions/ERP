# AI chat audit fail-closed

- Date: 2026-09-03
- Owner: Agent 05 — API & Backend Logic
- Scope: `POST /api/ai/chat` audit boundary only
- Deployment: not performed

## Outcome

AI chat now stops before provider client construction when the append-only query audit
write fails. The existing redacted audit-failure log is retained, while the route's outer
error boundary returns the generic private/no-store JSON failure response. Successful
audits retain tenant, actor, project, message-count, and granted-domain metadata and still
precede provider invocation.

## Changed files

- `apps/web/src/app/api/ai/chat/route.ts`
- `apps/web/src/app/api/ai/chat/route.test.ts`

## Verification

- RED: focused route test produced 20 passes and 1 expected failure because audit
  rejection returned HTTP 200.
- GREEN: focused route test passed 21/21 under Node.js 22.23.2.
- `pnpm --filter @third-code-erp/web exec tsc --noEmit` passed under Node.js 22.23.2.
- Focused ESLint for `apps/web/src/app/api/ai/chat/route.ts` passed with zero warnings.

The regression test asserts HTTP 503, the existing typed generic payload, private/no-store
headers, no sensitive audit detail in response or logs, and zero provider construction or
completion calls. Neighboring exception coverage now also asserts that quota, context, and
provider details do not appear in responses.
