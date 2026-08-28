# Agent 03 owner-route brand repair

## Scope and outcome

The authenticated `/owner` route now identifies the platform surface as
`ABI OPS · platform control` instead of the legacy product name.

The change is isolated to the existing eyebrow copy in
`apps/web/src/app/owner/page.tsx`. The `requireOwnerAdmin` call, non-indexing
metadata, platform data read, route layout guard, links, forms, and controls
are unchanged. No public route, database code, provider, production target,
brand-verifier policy, or generated artifact was modified or committed.

## Node 22 verification

All commands used Node `v22.23.2` and pnpm `10.33.0`.

| Command | Result |
| --- | --- |
| `git diff --check` | **PASS**. |
| `pnpm exec eslint --max-warnings=0 apps/web/src/app/owner/page.tsx` | **PASS**. |
| Focused `findLegacyBrandViolations` assertion over `apps/web/src/app/owner/page.tsx` | **PASS** — zero legacy-brand violations and the ABI OPS platform-control identity is present. |
| `pnpm --filter @third-code-erp/web exec vitest run src/app/owner/actions.test.ts src/lib/owner-admin.test.ts src/lib/protected-route.test.ts` | **PASS** — 3 files, 11 tests, zero failures or skips. The denied-owner mutation and protected-route assertions remain green. |
| `pnpm --filter @third-code-erp/web run typecheck` | **PASS**. |
| `pnpm --filter @third-code-erp/web run build` | **PASS** — optimized Next.js build compiled, type-checked, generated 87 pages, and retained `/owner` as a dynamic route. |
| `pnpm test:abi-ops-brand` | **PASS** — 2/2 contract tests. |
| `pnpm verify:abi-ops-brand` | **PASS** — 2,641 text files scanned with zero violations after a normal ignored build regeneration. |

The build regenerated ignored `apps/web/.next` output only. It remains
untracked and is not part of this changeset.

## Handoff

→ Handoff to Agent 12. Reason: the database Auth-lane selection and both
public/owner source branding repairs are complete and now require security and
workflow-contract revalidation. Inputs: Agent 04, Agent 15, and this Agent 03
changeset; the dedicated Auth report; the isolated diffs; and current workflow
references. Expected output: confirm that the Auth proof remains mandatory and
secret-safe, public consent and owner authorization are unchanged, and record a
dated security PASS or named release blocker. Production remains **NO-GO**.
