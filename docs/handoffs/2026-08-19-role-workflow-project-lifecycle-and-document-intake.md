# Role workflow, project lifecycle, and deterministic document intake handoff

- Status: In progress
- Date: 2026-08-19
- Request authority: ABI OPS workspace owner
- Scope: role-based workflow repair, tenant project visibility, project type
  correction, controlled manual project deletion, and non-generative document
  intake.

## Product outcome

Every seeded ABI OPS role must land in a clean, role-appropriate workspace,
see every project it is entitled to read in its tenant, and receive only the
commands it is entitled to perform. The `mixed` project type must be replaced
in the active product vocabulary by **Structural and Civil**. An authorized
workspace owner or admin must be able to manually remove a project from normal
operations without destroying accounting, procurement, drawing, or audit
evidence. Uploads must have a deterministic, tenant-safe intake path for CSV,
XLSX, PDF, image, DXF, and DWG inputs without silently depending on a
generative AI provider.

## Acceptance criteria

1. `project.read` roles, including Safety, CX, and Viewer, can navigate to
   `/projects` and see the tenant-scoped project list. A role never receives
   another tenant's project.
2. Web navigation, direct-route guards, and API/Core capabilities express the
   supplied ABI responsibilities separately from write authority. Viewer is
   read-only; hiding a route is not used as the only mutation control.
3. The visible project type is **Structural and Civil** and newly created or
   edited projects persist the new semantic value. Existing `mixed` records
   remain readable during the forward-compatible migration.
4. Manual project deletion is an audited, idempotent, owner/admin-only
   logical deletion with a confirmation reason. It never cascades through
   financial, procurement, drawing, document, or audit evidence.
5. Deterministic extraction is cacheable by tenant, content hash, extractor
   kind, and parser version. A parser failure is explicit; no hidden AI
   fallback is allowed. Extracted candidates remain reviewable and unpriced.
6. Relevant unit, contract, tenant-negative, role-negative, build/type, and
   browser checks provide evidence. Hosted database changes, demo-data writes,
   or deployment are out of scope unless separately authorized.

## Required sequence and ownership boundaries

1. **Agent 01 — Product and architecture record.** Record the controlled
   deletion and deterministic-intake decisions in ADRs before a schema or
   dependency change.
2. **Agent 12 — Authorization review.** Reconcile the shared role/capability
   policy with each supplied responsibility, add explicit negative tests, and
   avoid client-only access enforcement.
3. **Agent 05 — Core/API commands.** Add typed, validated, audited, and
   idempotent project-retirement and document-intake contracts. No direct
   browser database mutation.
4. **Agent 04 — Schema/migration.** Add only forward-compatible database
   fields, enum values, indexes, RLS/grants, and rollback notes. Do not apply
   a hosted migration in this work item.
5. **Agent 03 — App Router and navigation.** Make route guards reflect read
   authority, show commands only when capabilities allow them, and make the
   project experience responsive and accessible.
6. **Agent 06 — Deterministic file intake.** Keep the existing isolated
   DXF/DWG worker, add the non-generative parser/cache path, and never replace
   or silently route the retained optional AI-CAD evidence feature.
7. **QA/Operations — Evidence.** Run source checks first; use authenticated
   browser checks only against the explicitly configured isolated demo tenant.
   Production is not a test fixture.

## Explicit decisions and safety boundaries

- "Delete project" is a manual **logical deletion**, not a physical cascade.
  The visible action removes the project from normal lists after confirmation;
  restricted restore and retention behavior are defined in ADR-025.
- The role name persisted for `sd@abi.demo.ph` remains `sd_pm_pe`. The email
  address is not a reason to create an unrecognized role identifier.
- `owner` remains above `admin` in the rank hierarchy. Navigation aliases do
  not replace server-side capability checks.
- An old persisted `mixed` enum value cannot be removed safely while live
  rows or mixed-version deployments may exist. ADR-026 defines the compatible
  migration to `structural_civil`.
- "Without AI" means no hidden generative-provider call or quota consumption
  in deterministic intake. Local OCR, if configured, is treated as a local
  parser and must fail explicitly when unavailable; it must not fall back to a
  remote model.
- The PRD's retained AI CAD auto-draft remains an explicitly separate,
  review-gated evidence producer under WO-08a. It is not deleted or promoted
  into the deterministic path.

## Handoff status

→ Handoff to Agent 12. Reason: navigation currently makes `/projects` less
visible than the canonical `project.read` capability allows. Inputs:
`packages/shared-types/src/authorization.ts`, Web navigation/route guards, and
the supplied ABI role responsibilities. Expected output: an explicit read vs
write policy and regression coverage.

→ Handoff to Agent 04/05. Reason: project retirement and project-type
normalization cross API and schema boundaries. Inputs: ADR-025 and ADR-026.
Expected output: additive migration plus audited Core command; no hosted apply.

→ Handoff to Agent 03/06. Reason: role-specific UX and deterministic parser
availability must use the contracts above without a client-side privilege or
AI-provider fallback.
