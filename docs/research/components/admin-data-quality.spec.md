# Admin data-quality review

## Purpose

Give an administrator a calm, read-only view of tenant-scoped duplicate
Purchase Order numbers before the pending database uniqueness migration is
replayed. This is a review surface, not a repair workflow.

## Authority and safety

- The route is server-rendered at `/admin/data-quality`.
- `requireUserProfile()` establishes the authenticated profile and tenant;
  `admin.system_config` is checked before any report query.
- The query repeats `tenant_id` on both the duplicate-group and detail reads.
- No Server Action, API route, browser write, rename, delete, or canonical
  selection exists on this surface.
- The report caps groups at 25 and records per group at 100. Omitted records
  are called out explicitly so a capped view cannot look complete.
- Each detail link navigates to the existing authorized Purchase Order record;
  it does not approve or finalize a transaction.

## Acceptance evidence

- Authenticated admin sees the duplicate-group count, affected-record count,
  read-only authority, status counts, chronological candidates, and links to
  existing records.
- A tenant with no duplicate identifiers receives an explicit clear empty
  state.
- At 1440px and 390px the document has no horizontal overflow.
- The page exposes no repair, rename, or delete control.
- Query/report shaping is covered by pure Vitest tests, including the 100-row
  cap and omitted-record count.

## Release boundary

This slice changes only the Next.js read path and presentation. It does not
apply hosted SQL, touch Supabase data or Storage, alter migration history, or
trigger Vercel. The supported database reconciliation and owner-approved
duplicate repair remain prerequisites for the uniqueness migration.
