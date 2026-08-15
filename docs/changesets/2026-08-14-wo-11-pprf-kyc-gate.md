# BUILD OPS WO-11 — PPRF and KYC dual-track gate

## Status

PARTIALLY VERIFIED.

## Source-backed changes

- Kept the existing atomic PPRF intake that creates the tenant-scoped Client,
  Opportunity, versioned PPRF submission, and both Finance tracks.
- Replaced floating-point peso-to-centavo conversion in the new PPRF intake
  with exact decimal parsing and BigInt centavo arithmetic.
- Projected the opportunity's durable dual-track state onto the pipeline board
  so a cleared PPRF is not incorrectly blocked by the account summary, while
  flagged/rejected/incomplete tracks show their server-generated reason.
- Preserved the server-side gate: stages after Site Survey require both
  Financial Evaluation and Credit Investigation to be approved; legacy
  opportunities without tracks retain the existing account-KYC compatibility
  path.
- Added a static contract gate covering the additive RLS/audit migration,
  atomic intake, role checks, exact money conversion, server enforcement, and
  visible pipeline reason.

## Verification

- PASS — `pnpm test:wo-11-contract` (1/1).
- PASS — direct WO-11 invariant verifier.
- PASS — `git diff --check`.
- PASS — `package.json` JSON parse.
- NOT RUN — live PPRF creation, Finance recommendation/President approval,
  cross-tenant RLS replay, and authenticated drag-to-advance browser flow; the
  local PostgreSQL runtime and workspace dependencies are unavailable in this
  session.

## Remaining risk

The existing capability model uses the shared Finance/owner/admin roles; the
repository has no separate Finance-GA, Finance-AR, or President role identity.
Runtime role-matrix verification and hosted migration replay remain open. No
hosted migration, production data write, deployment, or provider mutation was
performed.
