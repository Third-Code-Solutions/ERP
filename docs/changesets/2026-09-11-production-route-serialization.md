# Production route serialization fix

## Change

- Removed server-created URL-builder function props from the client-side
  inspection, diary, quality, RFI, schedule, and submittal registers.
- Rebuilt pagination URLs inside each client register so filters and page
  limits remain shareable without crossing the Next.js server/client boundary.
- Removed stale type-only imports left by the boundary change.

## Verification

- Web typecheck: PASS (Node 24 workstation with pnpm engine check relaxed;
  CI remains pinned to Node 22).
- Focused ESLint on all changed route/register files: PASS.
- Web production build: PASS (103 routes generated).
- `git diff --check`: PASS.

## Boundary

The protected production workflow remains the only deployment path. The
merged fix must pass main CI and authenticated production E2E before the
promotion is considered complete.
