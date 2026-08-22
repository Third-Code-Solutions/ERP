# 2026-08-19 Role workflow, project lifecycle, and document intake plan

## Outcome

Deliver safe role-specific workspaces, universal tenant project visibility for
read roles, Structural and Civil project typing, controlled manual project
retirement, and deterministic no-provider document extraction.

## Ordered work

1. Record the architecture/handoff decisions and audit the current role,
   route, API, schema, upload, and test paths.
2. Repair the `project.read` navigation/route/UI mismatch and add explicit
   role-negative and viewer read-only regression coverage.
3. Introduce the compatible `structural_civil` project type contract and
   additive migration, preserving legacy reads until deployment parity exists.
4. Add a Core-authoritative, audited logical project-delete command with an
   owner/admin confirmation UI and no child-data cascade.
5. Replace non-CAD generative extraction with deterministic parser adapters,
   a tenant-safe cache, and explicit parser failure states; retain optional AI
   CAD evidence separately.
6. Audit the remaining role pages and action affordances, then run targeted
   tests, type/lint/build, and an isolated authenticated browser matrix where
   configured.

## Constraints

- No production database mutation, demo-data write, credential output, or
  deployment is authorized by this plan.
- No code change may assume the local Node 24 runtime is equivalent to the
  repository-required Node 22 runtime.
- Existing unrelated files remain untouched.
