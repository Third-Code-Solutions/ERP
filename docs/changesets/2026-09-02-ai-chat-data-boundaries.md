# AI project-chat data boundaries

Date: 2026-09-02

## Outcome

Fixed the P1 legacy project-chat confidentiality defect. `POST /api/ai/chat`
now assembles project, BOM, invoice, and purchase-order context independently
from the repository's existing central policies. A denied role causes no query
for that domain and the denied data cannot enter the provider prompt.

The chat UI now advertises only universally permitted project-level questions;
authorized users may still ask domain questions, but the server includes only
the context their role is allowed to read.

## Implementation

- Replaced the hand-built user/tenant lookup with `getUserProfile`.
- Added strict Zod validation before configuration, quota, database, audit, or
  provider work: 1–20 messages, 1–4,000 trimmed characters per message, fixed
  roles, strict keys, and an optional UUID project identifier.
- Applied `project.read`, the universal-search BOM and PO policies, and
  `finance.read` without changing the shared capability registry.
- Retained tenant predicates on the project and every authorized domain query.
- Bounded database context to 20 records per domain and context fields to 500
  characters; normalized embedded newlines before prompt assembly.
- Added a neutral system prompt that treats project context as data and does
  not claim access to absent domains.
- Added private/no-store response headers and generic non-2xx failures.
- Audit attempts now contain metadata only: actor, tenant, project, message
  count, and granted context domains; provider work starts after that attempt.
- Added all-role policy and failure-path tests. No provider or database schema
  change and no new dependency were introduced.

## Verification

| Gate | Result | Evidence |
| --- | --- | --- |
| Focused route tests | PASSED | 21/21 tests including all 13 roles |
| Web TypeScript | PASSED | `pnpm --dir apps/web exec tsc --noEmit` |
| Web source lint | PASSED | `pnpm --dir apps/web lint` |
| Secret scan | PASSED | gitleaks 8.30.1; independent QA |
| Production build | PASSED | Next.js 15.5.23; 85/85 static pages |
| Unauthenticated API smoke | PASSED | 401 JSON with private/no-store headers |
| Authenticated malformed API smoke | PASSED | Viewer, Finance, Commercial each received 400 before provider work |
| Provider-disabled API smoke | PASSED | One viewer request received generic 503; no external provider request observed |
| Project-chat browser UI | PASSED | Viewer, Finance, Commercial: list/detail/direct/refresh and assistant open/close |
| Browser console | PASSED with note | Zero page errors; one transient redacted Realtime socket warning during rapid viewer navigation |
| Live provider response | NOT RUN | Provider key deliberately absent; no paid or data-bearing provider call was needed for this boundary fix |

## Independent QA notes

The project predicate is compiled in tests; remaining domain predicates were
verified statically rather than compiled individually. Database exception
coverage uses the project query, and a stream failure after HTTP 200 begins
cannot be converted into a pre-stream 503. These are non-blocking follow-ups;
no in-scope P0/P1 issue remains in this endpoint.
