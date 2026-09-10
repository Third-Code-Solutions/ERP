# Inspection RFI direct-write authority

Agent 04/12; PRD WO-12 and the inspection RFI resolution handoff.

## Changes

- Added `20260910100000_inspection_rfi_resolution_authority.sql`: revoke table and explicit column UPDATE privileges from public, anon and authenticated on `site_inspection_rfis`, with a restrictive client UPDATE denial as defense against later broad grants.
- Added a restrictive authenticated INSERT policy requiring the caller's tenant and null `resolved_at`/`resolved_by`. Existing permissive tenant policies remain in place. Open RFI creation stays available; callers cannot forge resolution on INSERT.
- Retained forced RLS, existing composite inspection/tenant foreign key and append-only row-change audit trigger. Inspection and photo table privileges are unchanged.
- Current legacy `addInspectionRfi` only inserts an open RFI and does not require UPDATE. No API/UI changes are required for this boundary fix.
- Policies target actual database roles. Core's actor stamping writes authenticated JWT claims, so claims are deliberately not used to identify a direct client.

## Verification

- PASSED: `pnpm --config.engine-strict=false --filter @third-code-erp/database exec vitest run src/__tests__/inspection-rfi-resolution-authority.test.ts src/__tests__/site-inspection-access.test.ts` (2 files, 5 tests).
- Static tests follow the existing migration assertion pattern. They check explicit table/column revocation, restrictive UPDATE denial, tenant/open INSERT policy and preservation of neighboring tables and audit infrastructure; they do not execute SQL.
- NOT RUN: disposable PostgreSQL forward/rollback replay, authenticated privilege/RLS probes, Core resolution transactions, audit actor/hash checks or browser journeys. Before deployment, prove same-tenant open insertion succeeds; resolution/reopen/actor-forgery UPDATE and resolved INSERT fail; cross-tenant reads/inserts remain blocked; Core resolve/reopen succeeds with stamped authenticated claims; legacy inspection/photo writes remain usable.
- Environment: Node 24.16.0 and pnpm 10.33.0; repository declares Node 22. The focused check used the existing engine override.
- No deployment, hosted data mutation or migration application was performed.

## Recovery and limits

No data is changed by the migration. Before deployment, capture effective table/column ACLs, policy definitions and the actual Core database role. Both Web and Core currently use the shared DATABASE_URL client: this boundary blocks untrusted Data API authenticated writes, but does not separate trusted Web authority from trusted Core authority. Verify the Core role is not the restricted authenticated database role.

Preferred operational recovery is to disable the resolution UI while retaining these restrictions. Reverting the policies and restoring the historical grant reopens the direct-write vulnerability and requires an explicit security decision. For a disposable replay, the reverse statements for the repository's known prior state are:

```sql
begin;
drop policy site_inspection_rfis_deny_client_update
  on public.site_inspection_rfis;
drop policy site_inspection_rfis_client_insert_open
  on public.site_inspection_rfis;
grant update on table public.site_inspection_rfis to authenticated;
commit;
```

Do not restore anonymous/public UPDATE or invent column grants. If the target's captured ACL differs from the known migration state, reconcile that evidence before release. Recovery never rewrites rows, drops columns/tables, changes foreign keys or edits audit history.
