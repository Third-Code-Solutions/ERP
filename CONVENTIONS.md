# ABI OPS Engineering Conventions

## Monorepo Layout

```
apps/web/           Next.js 15 App Router frontend
apps/workers/       Python services (DXF parser, RAG indexer)
packages/auth/      Supabase client factories (server, browser, admin)
packages/database/  Drizzle schema + client; SQL for RLS and triggers
packages/shared-types/  Zod schemas, TypeScript types, pure domain logic
packages/config/    Shared tsconfig, eslint config
```

## Package Names

All packages use `@third-code-erp/` scope. Import paths:

```typescript
import { db } from '@third-code-erp/database'
import { opportunities } from '@third-code-erp/database/schema'
import { computeTCV, formatCents } from '@third-code-erp/shared-types'
import { getUser, requireUser } from '@third-code-erp/auth'
```

## Money

All monetary values are stored and computed as **integer centavos** (PHP cents).
Never use `float` or `Decimal` for money.

```typescript
// Good
const tcvCents = 5_000_000_00  // ₱5,000,000.00

// Bad
const tcv = 5000000.00  // floating-point money
```

Percentages use **basis points** (0–10000 = 0%–100%):
```typescript
const marginBps = 2000  // 20% margin
const retentionBps = 1000  // 10% retention
```

Display money with `formatCents()` or `formatCentsCompact()` from `@third-code-erp/shared-types`.

## Database

- Every table has `tenant_id UUID NOT NULL` as the second column.
- Every table has `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` as the first column, except `audit_log` which uses `bigserial`.
- No hard deletes — use a `status` enum or `archived_at` timestamp instead.
- All timestamps use `TIMESTAMPTZ` (`withTimezone: true` in Drizzle).
- Drizzle is the only way to write queries. No raw SQL in application code.
- RLS is always on. All queries run as the authenticated user unless using the admin client.

## Auth

Use the correct Supabase client per context:

| Context | Import | When |
|---------|--------|------|
| Server Component / Route Handler | `createSupabaseServerClient()` from `@third-code-erp/auth` | All server-side reads |
| Server Action | `requireUser()` from `@third-code-erp/auth` | Mutations that need the user |
| Client Component | `createSupabaseBrowserClient()` from `@third-code-erp/auth/client` | Auth UI, real-time subscriptions |
| Admin / Background Jobs | `createSupabaseAdminClient()` from `@third-code-erp/auth/admin` | Service role, bypasses RLS |

Never use the admin client in route handlers or server actions that accept user input.

## Audit Log

Every state-changing server action must call `writeAuditLog()`:

```typescript
import { writeAuditLog, computeDiff } from '@/lib/audit'

// In a server action:
await writeAuditLog({
  tenantId,
  actorId: user.id,
  entityType: 'opportunities',
  entityId: opportunity.id,
  action: 'stage_change',
  diff: computeDiff(oldState, newState),
})
```

The audit log is append-only. The hash chain is verified via `verifyHashChain()` in `@third-code-erp/shared-types/audit`.

## Server Actions

Always validate input with Zod at the top of every server action:

```typescript
'use server'
import { requireUser } from '@third-code-erp/auth'
import { z } from 'zod'

const schema = z.object({ ... })

export async function myAction(formData: FormData) {
  const user = await requireUser()           // throws if unauthenticated
  const input = schema.parse({ ... })        // throws ZodError if invalid
  // ... perform mutation
}
```

## UI Conventions

- Numbers in tables: always `text-align: right`, `font-variant-numeric: tabular-nums`
- Currency cells: `font-family: var(--font-mono)`, right-aligned
- Status indicators: color + text (not color alone)
- Skeleton loaders: use the `.skeleton` CSS class, not spinners
- Loading state: `useTransition` in client components; `loading.tsx` files for route segments
- Navigation: active state via `usePathname()` matching with `startsWith()`

## CSS

Design tokens live in `:root` in `globals.css`. Never hardcode colors or spacing.

Key tokens:
- `--color-navy-700`: primary brand color (#1f3864)
- `--color-border`: subtle divider (#e5e5e5)
- `--color-neutral-*`: grayscale scale
- `--font-sans` / `--font-mono`
- `--sidebar-width` / `--topbar-height`

## TypeScript

- `strict: true` everywhere, including `noUncheckedIndexedAccess`
- No `any` — use `unknown` and narrow
- No `!` non-null assertions on data from DB or network — null-check explicitly
- Zod schemas are the source of truth for input types; infer with `z.infer<>`

## Testing

- Test files: `src/**/__tests__/*.test.ts`
- Framework: `vitest`
- Unit tests only in `packages/shared-types` (pure logic, no DB)
- Integration tests (with real Supabase test instance) go in `apps/web/src/__tests__/`
- E2E tests in `apps/web/e2e/` via Playwright
- Coverage gate: 80% lines, 100% on auth + billing + audit paths

## Git

Commit format: `type: description`

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`

Examples:
```
feat: add BOM line item group hierarchy
fix: prevent negative GP on zero-cost lines
chore: add RLS policies for vendors table
```

No PR merges without passing CI (typecheck + tests + build).
