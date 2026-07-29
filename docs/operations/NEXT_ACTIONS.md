# Next Actions

## Exact next action

Complete remaining M1 controls without enabling production writes:

1. Treat hosted Supabase migration `20260729054456` as the current 50/50
   baseline. Do not replay it or edit applied migration history.
2. Treat organization type as constrained tenant profile data only. Never use
   it for roles, capabilities, memberships, approvals, or tenant access.
3. Keep deployed tenant-canary source at
   `ERP_PROJECT_WRITES_VIA_API=false`; leave the tenant allowlist empty.
4. Obtain explicit approval for one unused user-controlled email identity.
   Through live `/auth/signup`, create and confirm the account; do not use
   direct SQL or a service-role provisioning script.
5. As that new Admin, create one non-critical reversible E2E Project through
   `/projects/new`. Do not repair or waive existing tenants' historical audit
   mismatches.
6. Run `pnpm plan:project-cutover -- --require-ready` against that exact target.
   Capture the complete mutable Project baseline in a restricted release
   artifact; keep identifiers and business values out of Git and logs.
7. Before any paid frontend build, confirm the exact expected Vercel charge
   and obtain user approval. Do not reconnect Git or create a duplicate
   preview.
8. After approval, perform the provider-level enable/rollback drill for the
   controlled tenant:
   capture provider configuration, enable exact `true`, prove one compatible
   Web-to-Nest demo command and reconciliation, restore exact `false`, and
   prove the legacy branch is selected.
9. Record provider release IDs, runtime logs, final data reconciliation, and
   the tested rollback procedure before starting M2.
10. Retry physical deletion of credential-free runner work directories after
   Windows releases their transient file handles.
11. Before M2 code, obtain owner sign-off for a dedicated `AGENTS.md`
    reconciliation: remove the missing PRD bootstrap dependency and replace
    obsolete pnpm 9, PostgreSQL 16, tRPC, and Inngest target rules with the
    approved architecture. Do not mix that governance rewrite into canary work.

## Prepared frontend release candidate

- Landing mobile QA correction is source-only. Keep Vercel Git disconnected.
- Before any frontend deployment, re-confirm zero new deployments, disclose the
  exact provider charge, and obtain explicit user approval.
- If approved, deploy the single reviewed green SHA once. Do not create a
  duplicate preview and production build.
- After deployment, repeat 1440/768/390 browser checks, metadata/JSON-LD,
  interactions, analytics, health/readiness, console, and exact release
  identity before calling the frontend slice complete.

## Following milestone

M2: remove the Python `scope_items` direct-write path. Python returns immutable
processing evidence; BullMQ transports it; a new Nest command authorizes,
idempotently validates, and commits accepted changes.

Design is ready at
`docs/architecture/M2_DOCUMENT_PROCESSING_EVIDENCE_CONTRACT.md`. First code
slice is inert M2.1: contracts, composite tenant constraints, durable
job/evidence state, explicit capabilities, and a Nest BullMQ processor with no
caller. Do not begin it until M1 canary and separate `AGENTS.md`
reconciliation gates pass.

## Do not start yet

- No finance migration before M1 integration evidence.
- No broad Server Action replacement.
- No production feature-flag enablement.
- No new microservices.
- No external ERP source, schema, UI, or wording reuse.
