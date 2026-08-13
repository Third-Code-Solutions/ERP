# M3.1 — Change Request web cutover seam

Date: 2026-08-02
Source commit: `d5ee498`

## Scope

- Add capability parity for `change_request.create`.
- Route only explicitly allowlisted tenant writes from the existing Server
  Action to Nest core.
- Preserve the legacy direct-write path while the flag is closed.
- Carry one browser retry token per submission for Nest idempotency.
- Cover gated routing, token propagation, and UUID fallback.

## Verification

- Web tests: 53 files / 320 tests passed.
- Workspace lint passed.
- Production build passed: 78/78 routes.
- Actionlint, gitleaks, workflow action-reference checks, and diff checks passed.

## Release boundary

Source-only. No hosted Supabase SQL, Railway/Vercel deployment, provider
setting, feature flag, queue, or business-data mutation was performed. The
controlled release planner remains `review_required` because the hosted
migration ledger, Purchase Order duplicate group, and audit-recovery tenant
input are unresolved.
