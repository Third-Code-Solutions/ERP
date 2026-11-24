# 2026-11-04 — Dependency audit remediation (PR #129)

## Fixed
- `next` 15.5.27 → 15.5.28 in `apps/web`, `packages/auth` and `eslint-config-next`:
  GHSA-p3m5-59mp-jv5r (Server Actions DoS). GHSA-2464-fhr4-w9xw (image optimizer
  RCE with SVG) was already mitigated on `main` by `sharp` 0.35.5 and the absence
  of `dangerouslyAllowSVG`/`remotePatterns`; the bump removes it from the graph.
- Overrides: `body-parser` 2.4.0 (GHSA-27r3-jxmh-p828, Core API crash),
  `multer` 2.5.0, `qs` 6.16.1, `systeminformation` 5.33.16, `fast-uri` 3.1.9,
  `@nestjs/cli>glob` 14.0.2. Dev graph: `vite` 7.3.7, `vitest` ^4.1.12.
- Playwright jobs pinned to `ubuntu-24.04` (Playwright refuses `ubuntu-26.04`,
  which `ubuntu-latest` now resolves to).
- Core API rejects JSON bodies with more than 20,000 array elements
  (`apps/api/src/common/json-array-budget.ts`), and the public DocuSeal webhook
  checks its token before validating the payload.

## Audit evidence
- Before (`main` @ `90c48866`): `pnpm audit --prod` 1 critical, 5 high,
  4 moderate, 1 low; full graph 1 critical, 6 high, 13 moderate, 5 low. Both CI
  audit gates failed.
- After: `pnpm audit --prod --audit-level low` and `pnpm audit --audit-level low`
  both exit 0 with the three waivers below; without them exactly those three
  advisories remain.

## Time-boxed waivers (expire 2026-12-04)
Recorded in `pnpm-workspace.yaml` `auditConfig.ignoreGhsas` with dependency paths
and reasoning. On 2026-12-04, re-run `pnpm audit` without the waivers; extend one
only with a new written justification.

| Advisory | Package | Why waived | Remove when |
|---|---|---|---|
| ~~GHSA-mrhx-c7xc-m3w5~~ | zod 3.25.76 | Removed: the workspace is on zod 4.6.7, so no zod 3 remains in the graph. The Core API array budget stays as a request cap. | done (zod 4 migration) |
| GHSA-g3hv-75wg-m249 | minimatch 3.x/5.x | Patch is 11.0.1, incompatible with archiver's glob 7/8; patterns are library-fixed | exceljs/archiver upgrade |
| GHSA-gcqx-w48m-w2h4 | deepmerge | No patched release; build-time only (`@nestjs/cli`) | upstream patch |

## Follow-ups
- Takeoff import `raw` (`packages/shared-types/src/erp-api/takeoff-import.ts`)
  is a `z.record` of a 3-way union whose 64-column cap runs after parsing; an
  authenticated 2.4 MB body of failing keys costs ~0.9 GB of Core API heap.
  Pre-check the key count before parsing and use a single-issue value check, or
  land the zod 4 migration first.
- `ignoreGhsas` has no expiry field; the 2026-12-04 date is enforced by the ERP
  state file and this changeset, not by tooling.
